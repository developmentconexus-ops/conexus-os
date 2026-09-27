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
  factory_project_id: 'factory-project-322',
  project_repository_id: 'project-repository-322',
  repository_id: 'repository-322',
  completed_at: null,
  ...overrides,
})

// A fake commandPool.connect() that answers begin/purge/complete the way the real functions do:
// begin_project_deletion can be told to throw, purge_project and complete_project_deletion always
// succeed unless told otherwise. Every statement is recorded so a test can assert on the sequence.
const fakePool = ({ beginResult = () => tombstone(), beginThrows = null, purgeThrows = null } = {}) => {
  const statements = []
  return {
    statements,
    connect: async () => ({
      query: async (statement, values = []) => {
        statements.push(statement)
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

const fakePorts = (overrides = {}) => {
  const calls = []
  return {
    calls,
    ports: {
      teardownFactoryProject: async (binding) => { calls.push(['teardownFactoryProject', binding]); if (overrides.teardownFactoryProject) await overrides.teardownFactoryProject() },
      releaseApplicationData: async (id) => { calls.push(['releaseApplicationData', id]); if (overrides.releaseApplicationData) await overrides.releaseApplicationData() },
      deleteGithubRepository: async (id) => { calls.push(['deleteGithubRepository', id]); if (overrides.deleteGithubRepository) await overrides.deleteGithubRepository() },
    },
  }
}

test('#322 orchestrator refuses a non-administrator before touching any port', async () => {
  await refuseProtectedCluster()
  const { createProjectDeletionOrchestrator } = await import(hubModuleUrl('project/deletion.js'))
  const { ProjectError } = await import(hubModuleUrl('project/errors.js'))
  const commandPool = fakePool({ beginThrows: Object.assign(new Error('NOT_ADMITTED'), { code: '42501' }) })
  const { ports, calls } = fakePorts()
  const orchestrator = createProjectDeletionOrchestrator({ commandPool, ports })

  await assert.rejects(orchestrator.deleteProject(input), (error) => error instanceof ProjectError && error.code === 'AUTHORIZATION_DENIED')
  assert.deepEqual(calls, [])
})

test('#322 orchestrator refuses the wrong confirmation name before touching any port', async () => {
  const { createProjectDeletionOrchestrator } = await import(hubModuleUrl('project/deletion.js'))
  const { ProjectError } = await import(hubModuleUrl('project/errors.js'))
  const commandPool = fakePool({ beginThrows: new Error('PROJECT_NAME_MISMATCH') })
  const { ports, calls } = fakePorts()
  const orchestrator = createProjectDeletionOrchestrator({ commandPool, ports })

  await assert.rejects(orchestrator.deleteProject(input), (error) => error instanceof ProjectError && error.code === 'PROJECT_NAME_MISMATCH')
  assert.deepEqual(calls, [])
})

test('#322 orchestrator refuses a Project with a run still building before touching any port', async () => {
  const { createProjectDeletionOrchestrator } = await import(hubModuleUrl('project/deletion.js'))
  const { ProjectError } = await import(hubModuleUrl('project/errors.js'))
  const commandPool = fakePool({ beginThrows: new Error('PROJECT_BUSY') })
  const { ports, calls } = fakePorts()
  const orchestrator = createProjectDeletionOrchestrator({ commandPool, ports })

  await assert.rejects(orchestrator.deleteProject(input), (error) => error instanceof ProjectError && error.code === 'PROJECT_BUSY')
  assert.deepEqual(calls, [])
})

test('#322 a GitHub failure after the database purge leaves a tombstoned, hidden Project that a rerun completes', async () => {
  const { createProjectDeletionOrchestrator } = await import(hubModuleUrl('project/deletion.js'))
  const { ProjectError } = await import(hubModuleUrl('project/errors.js'))

  // First attempt: Mastra teardown and the database purge both succeed, then GitHub refuses.
  const firstAttempt = fakePool()
  const failing = fakePorts({ deleteGithubRepository: async () => { throw new Error('FACTORY_GITHUB_REQUEST_FAILED:503') } })
  const firstOrchestrator = createProjectDeletionOrchestrator({ commandPool: firstAttempt, ports: failing.ports })

  await assert.rejects(firstOrchestrator.deleteProject(input), (error) => error instanceof ProjectError && error.code === 'DELETION_INCOMPLETE')
  assert.deepEqual(failing.calls.map(([name]) => name), ['teardownFactoryProject', 'releaseApplicationData', 'deleteGithubRepository'])
  assert.equal(firstAttempt.statements.some((statement) => statement.includes('project.purge_project')), true)
  assert.equal(firstAttempt.statements.some((statement) => statement.includes('complete_project_deletion')), false)

  // A rerun on the same tombstone (still completed_at: null) repeats every step for free — the
  // teardown and the purge are idempotent — and this time GitHub succeeds, so the tombstone completes.
  const rerunPool = fakePool()
  const rerunPorts = fakePorts()
  const rerunOrchestrator = createProjectDeletionOrchestrator({ commandPool: rerunPool, ports: rerunPorts.ports })

  await rerunOrchestrator.deleteProject(input)
  assert.deepEqual(rerunPorts.calls.map(([name]) => name), ['teardownFactoryProject', 'releaseApplicationData', 'deleteGithubRepository'])
  assert.equal(rerunPool.statements.some((statement) => statement.includes('complete_project_deletion')), true)
})

test('#322 orchestrator skips every port once the tombstone is already complete', async () => {
  const { createProjectDeletionOrchestrator } = await import(hubModuleUrl('project/deletion.js'))
  const commandPool = fakePool({ beginResult: () => tombstone({ completed_at: '2026-09-27T00:00:00Z' }) })
  const { ports, calls } = fakePorts()
  const orchestrator = createProjectDeletionOrchestrator({ commandPool, ports })

  await orchestrator.deleteProject(input)
  assert.deepEqual(calls, [])
  assert.equal(commandPool.statements.some((statement) => statement.includes('project.purge_project')), false)
})
