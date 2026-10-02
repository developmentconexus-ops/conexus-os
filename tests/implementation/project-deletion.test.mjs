import assert from 'node:assert/strict'
import test from 'node:test'
import { refuseProtectedCluster } from './protected-cluster.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const projectId = '30000000-0000-8000-8000-000000000322'
const accountId = '10000000-0000-4000-8000-000000000322'
const input = { accountId, projectId, confirmName: 'Deletable Project' }

const tombstone = (overrides = {}) => ({
  project_id: projectId,
  workspace_id: '20000000-0000-4000-8000-000000000322',
  name: 'Deletable Project',
  completed_at: null,
  ...overrides,
})

// A fake commandPool.connect() that answers begin/purge/complete the way the real functions do:
// begin_project_deletion can be told to throw the same refusals, purge_project and
// complete_project_deletion always succeed unless told otherwise. Every statement is recorded so a
// test can assert on the sequence.
const fakePool = ({
  beginResult = () => tombstone(),
  beginThrows = null,
  purgeThrows = null,
} = {}) => {
  const statements = []
  return {
    statements,
    connect: async () => ({
      query: async (statement) => {
        if (statement !== 'BEGIN' && statement !== 'COMMIT' && statement !== 'ROLLBACK') statements.push(statement)
        if (statement === 'BEGIN' || statement === 'COMMIT' || statement === 'ROLLBACK') return { rows: [] }
        if (statement.includes('begin_project_deletion')) {
          if (beginThrows) throw beginThrows
          return { rows: [beginResult()] }
        }
        if (statement.includes('project.purge_project')) {
          if (purgeThrows) throw purgeThrows
          return { rows: [] }
        }
        if (statement.includes('complete_project_deletion')) return { rows: [] }
        throw new Error(`UNEXPECTED_STATEMENT:${statement}`)
      },
      release() {},
    }),
  }
}

// Each port call is also written to the pool's statements, so one timeline shows the order across both.
const fakePorts = (pool, overrides = {}) => {
  const calls = []
  const step = (name) => async (id) => {
    calls.push([name, id])
    pool.statements.push(`port:${name}`)
    if (overrides[name]) await overrides[name]()
  }
  return {
    calls,
    ports: { releaseApplicationData: step('releaseApplicationData'), killSandboxes: step('killSandboxes'), deleteRepository: step('deleteRepository') },
  }
}

test('#322 orchestrator refuses a non-administrator before touching any port', async () => {
  await refuseProtectedCluster()
  const { createProjectDeletionOrchestrator } = await import(hubModuleUrl('project/deletion.js'))
  const { ProjectError } = await import(hubModuleUrl('project/errors.js'))
  const commandPool = fakePool({ beginThrows: Object.assign(new Error('NOT_ADMITTED'), { code: '42501' }) })
  const { ports, calls } = fakePorts(commandPool)
  const orchestrator = createProjectDeletionOrchestrator({ commandPool, ports })

  await assert.rejects(orchestrator.deleteProject(input), (error) => error instanceof ProjectError && error.code === 'AUTHORIZATION_DENIED')
  assert.deepEqual(calls, [])
})

test('#322 orchestrator refuses the wrong confirmation name and a busy Project before touching any port', async () => {
  const { createProjectDeletionOrchestrator } = await import(hubModuleUrl('project/deletion.js'))
  const { ProjectError } = await import(hubModuleUrl('project/errors.js'))
  for (const refusal of ['PROJECT_NAME_MISMATCH', 'PROJECT_BUSY', 'PROJECT_NOT_FOUND']) {
    const commandPool = fakePool({ beginThrows: new Error(refusal) })
    const { ports, calls } = fakePorts(commandPool)
    const orchestrator = createProjectDeletionOrchestrator({ commandPool, ports })
    await assert.rejects(orchestrator.deleteProject(input), (error) => error instanceof ProjectError && error.code === refusal)
    assert.deepEqual(calls, [], refusal)
  }
})

test('#322 deletion releases the application data, kills the VMs before the purge, deletes the repository, then completes', async () => {
  const { createProjectDeletionOrchestrator } = await import(hubModuleUrl('project/deletion.js'))
  const commandPool = fakePool()
  const { ports, calls } = fakePorts(commandPool)

  await createProjectDeletionOrchestrator({ commandPool, ports }).deleteProject(input)
  assert.deepEqual(calls, [['releaseApplicationData', projectId], ['killSandboxes', projectId], ['deleteRepository', projectId]])
  assert.deepEqual(commandPool.statements.map((statement) => statement.match(/port:\w+|\w+_project(?:_deletion)?/)[0]),
    ['begin_project_deletion', 'port:releaseApplicationData', 'port:killSandboxes', 'purge_project', 'port:deleteRepository', 'complete_project_deletion'])
})

test('#413 a VM read that fails stops the deletion before the purge, so a rerun still finds the VMs to kill', async () => {
  const { createProjectDeletionOrchestrator } = await import(hubModuleUrl('project/deletion.js'))
  const { ProjectError } = await import(hubModuleUrl('project/errors.js'))
  const firstAttempt = fakePool()
  const failing = fakePorts(firstAttempt, { killSandboxes: async () => { throw new Error('BUILDER_READ_FAILED') } })
  await assert.rejects(createProjectDeletionOrchestrator({ commandPool: firstAttempt, ports: failing.ports }).deleteProject(input),
    (error) => error instanceof ProjectError && error.code === 'DELETION_INCOMPLETE')
  assert.equal(firstAttempt.statements.some((statement) => statement.includes('project.purge_project')), false)

  const rerunPool = fakePool()
  const rerun = fakePorts(rerunPool)
  await createProjectDeletionOrchestrator({ commandPool: rerunPool, ports: rerun.ports }).deleteProject(input)
  assert.deepEqual(rerun.calls.map(([name]) => name), ['releaseApplicationData', 'killSandboxes', 'deleteRepository'])
})

test('#322 a repository failure after the database purge leaves a tombstoned Project that a rerun completes', async () => {
  const { createProjectDeletionOrchestrator } = await import(hubModuleUrl('project/deletion.js'))
  const { ProjectError } = await import(hubModuleUrl('project/errors.js'))

  const firstAttempt = fakePool()
  const failing = fakePorts(firstAttempt, { deleteRepository: async () => { throw new Error('CONEXUS_GIT_FAILED') } })
  await assert.rejects(createProjectDeletionOrchestrator({ commandPool: firstAttempt, ports: failing.ports }).deleteProject(input),
    (error) => error instanceof ProjectError && error.code === 'DELETION_INCOMPLETE')
  assert.deepEqual(failing.calls.map(([name]) => name), ['releaseApplicationData', 'killSandboxes', 'deleteRepository'])
  assert.equal(firstAttempt.statements.some((statement) => statement.includes('project.purge_project')), true)
  assert.equal(firstAttempt.statements.some((statement) => statement.includes('complete_project_deletion')), false)

  // The tombstone is still open, so a rerun repeats every idempotent step and completes.
  const rerunPool = fakePool()
  const rerun = fakePorts(rerunPool)
  await createProjectDeletionOrchestrator({ commandPool: rerunPool, ports: rerun.ports }).deleteProject(input)
  assert.deepEqual(rerun.calls.map(([name]) => name), ['releaseApplicationData', 'killSandboxes', 'deleteRepository'])
  assert.equal(rerunPool.statements.some((statement) => statement.includes('complete_project_deletion')), true)
})

test('#322 orchestrator skips every port once the tombstone is already complete', async () => {
  const { createProjectDeletionOrchestrator } = await import(hubModuleUrl('project/deletion.js'))
  const commandPool = fakePool({ beginResult: () => tombstone({ completed_at: '2026-09-27T00:00:00Z' }) })
  const { ports, calls } = fakePorts(commandPool)

  await createProjectDeletionOrchestrator({ commandPool, ports }).deleteProject(input)
  assert.deepEqual(calls, [])
  assert.equal(commandPool.statements.some((statement) => statement.includes('project.purge_project')), false)
})

test('a failing step is logged with its real error before it becomes DELETION_INCOMPLETE', async (t) => {
  const { createProjectDeletionOrchestrator } = await import(hubModuleUrl('project/deletion.js'))
  const { ProjectError } = await import(hubModuleUrl('project/errors.js'))
  const { logger } = await import(hubModuleUrl('platform/logger.js'))
  const logged = []
  t.mock.method(logger, 'error', (...args) => { logged.push(args) })
  const commandPool = fakePool()
  const { ports } = fakePorts(commandPool, { releaseApplicationData: async () => { throw new Error('APPLICATION_RUNNER_RELEASE_REFUSED') } })

  await assert.rejects(createProjectDeletionOrchestrator({ commandPool, ports }).deleteProject(input),
    (error) => error instanceof ProjectError && error.code === 'DELETION_INCOMPLETE')
  assert.equal(logged.length, 1)
  const [fields, message] = logged[0]
  assert.equal(message, 'PROJECT_DELETION_INCOMPLETE')
  assert.match(fields['exception.stacktrace'], /^Error: APPLICATION_RUNNER_RELEASE_REFUSED\n\s+at /)
  assert.deepEqual({ ...fields, 'exception.stacktrace': 'checked above' }, {
    'conexus.project_id': projectId,
    'error.type': 'Error',
    'exception.type': 'Error',
    'exception.message': 'APPLICATION_RUNNER_RELEASE_REFUSED',
    'exception.stacktrace': 'checked above',
  })
})
