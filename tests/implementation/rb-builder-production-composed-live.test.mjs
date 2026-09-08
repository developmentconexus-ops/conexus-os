import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import pg from 'pg'

import { runCurrentHubMigrations } from '../../scripts/run-hub-migrations.mjs'

process.env.MASTRA_TELEMETRY_DISABLED = '1'
const repositoryRoot = resolve(import.meta.dirname, '../..')
const live = process.env.CONEXUS_RB_COMPOSED_LIVE === 'true'
const requiredConfiguration = [
  'CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME',
  'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD',
  'CONEXUS_BUILDER_E2B_API_KEY_FILE', 'CONEXUS_BUILDER_E2B_TEMPLATE_ID',
  'CONEXUS_PROJECT_MODEL_CATALOG_FILE', 'CONEXUS_GIT_EXTERNAL_FILE_SLOTS_FILE',
  'CONEXUS_BUILDER_MODEL_ADMISSION_ID',
]

const quoteIdentifier = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('UNSAFE_TEST_IDENTIFIER')
  return `"${value}"`
}
const connectionString = (connection) => {
  const url = new URL('postgresql://localhost')
  url.hostname = connection.host
  url.port = String(connection.port)
  url.pathname = `/${connection.database}`
  url.username = connection.user
  url.password = connection.password
  return url.toString()
}
const query = async (connection, statement, values = []) => {
  const client = new pg.Client(connection)
  await client.connect()
  try { return await client.query(statement, values) } finally { await client.end() }
}
const gitEnvironment = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'Conexus composed proof',
  GIT_AUTHOR_EMAIL: 'builder-proof@conexus.invalid',
  GIT_COMMITTER_NAME: 'Conexus composed proof',
  GIT_COMMITTER_EMAIL: 'builder-proof@conexus.invalid',
}
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: gitEnvironment }).trim()
const gitBytes = (cwd, ...args) => execFileSync('git', args, { cwd, env: gitEnvironment })

test('RB production composition executes one governed Change through HTTP, PostgreSQL, Git, Mastra and E2B', {
  skip: live ? false : 'requires explicit CONEXUS_RB_COMPOSED_LIVE=true authority and complete live Builder/PostgreSQL configuration',
  timeout: 20 * 60_000,
}, async (t) => {
  for (const name of requiredConfiguration) {
    if (!process.env[name]) throw new Error(`CONEXUS_RB_COMPOSED_LIVE_CONFIG_${name}_REQUIRED`)
  }
  const admin = {
    host: process.env.CONEXUS_TEST_DB_HOST,
    port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME,
    user: process.env.CONEXUS_TEST_DB_USER,
    password: process.env.CONEXUS_TEST_DB_PASSWORD,
  }
  const database = `conexus_rb_composed_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  const proofRoot = mkdtempSync(resolve(tmpdir(), 'conexus-rb-composed-live-'))
  const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/rb-composed-live-build-'))
  const storageRoot = resolve(proofRoot, 'storage')
  const workRoot = resolve(proofRoot, 'work')
  const ingressPasswordFile = resolve(proofRoot, 'rb-ingress-password')
  const executorPasswordFile = resolve(proofRoot, 'rb-executor-password')
  const ingressPassword = `rb-ingress-${randomUUID()}`
  const executorPassword = `rb-executor-${randomUUID()}`
  let module
  let app
  await query(admin, `CREATE DATABASE ${quoteIdentifier(database)}`)
  t.after(async () => {
    await app?.close().catch(() => undefined)
    await module?.close().catch(() => undefined)
    await query(admin, `DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`)
    rmSync(proofRoot, { recursive: true, force: true })
    rmSync(buildRoot, { recursive: true, force: true })
  })

  const current = { ...admin, database }
  assert.equal((await query(current, 'SHOW server_version_num')).rows[0].server_version_num, '170010')
  const migration = await runCurrentHubMigrations({ connectionString: connectionString(current) })
  assert.equal(migration.versions.at(-1), '019')
  await query(current, `ALTER ROLE hub_rb_ingress PASSWORD '${ingressPassword}'`)
  await query(current, `ALTER ROLE hub_rb_executor PASSWORD '${executorPassword}'`)
  writeFileSync(ingressPasswordFile, `${ingressPassword}\n`, { mode: 0o400 })
  writeFileSync(executorPasswordFile, `${executorPassword}\n`, { mode: 0o400 })
  chmodSync(ingressPasswordFile, 0o400)
  chmodSync(executorPasswordFile, 0o400)

  const accountId = randomUUID()
  const workspaceId = randomUUID()
  const projectId = randomUUID()
  mkdirSync(resolve(storageRoot, 'projects'), { recursive: true, mode: 0o700 })
  mkdirSync(resolve(storageRoot, 'staging', projectId), { recursive: true, mode: 0o700 })
  mkdirSync(workRoot, { mode: 0o700 })
  git(workRoot, 'init', '--initial-branch=main')
  writeFileSync(resolve(workRoot, 'README.md'), '# Governed composed Builder proof\n')
  git(workRoot, 'add', 'README.md')
  git(workRoot, 'commit', '-m', 'Exact accepted base')
  const baseSourceRevision = git(workRoot, 'rev-parse', 'HEAD')
  const canonicalRepository = resolve(storageRoot, 'projects', projectId)
  git(proofRoot, 'clone', '--bare', workRoot, canonicalRepository)
  writeFileSync(resolve(canonicalRepository, 'refs', 'heads', 'main'), `${baseSourceRevision}\n`, { mode: 0o644 })
  git(proofRoot, '--git-dir', canonicalRepository, 'remote', 'remove', 'origin')

  const baselineDigest = 'b'.repeat(64)
  await query(current, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://issuer.test', $2, 'RB composed operator')", [accountId, `rb-composed-${accountId}`])
  await query(current, "INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'RB composed workspace')", [workspaceId])
  await query(current, 'INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project) VALUES ($1, $2, true)', [accountId, workspaceId])
  await query(current, "INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, 'RB composed project', 'NEW', $3, 'rb-composed-revision')", [projectId, workspaceId, baseSourceRevision])
  await query(current, 'INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage) VALUES ($1, $2, true, true)', [accountId, projectId])
  await query(current, `INSERT INTO project.operation_idempotency(operation_id, account_id, workspace_id, key_digest, request_digest,
    reserved_project_id, outcome, response_status, response_digest, response_body, completed_at)
    VALUES ('PRJ-03', $1, $2, $3, $3, $4, 'SUCCEEDED', 201, $3, '{}'::jsonb, clock_timestamp())`, [accountId, workspaceId, 'a'.repeat(64), projectId])
  await query(current, "INSERT INTO project.baseline_candidate(project_id, candidate_digest, source_revision, source_text, application_runtime_profile) VALUES ($1, $2, $3, 'Accepted composed baseline', 'MANAGED')", [projectId, baselineDigest, baseSourceRevision])
  await query(current, 'INSERT INTO project.baseline_state(project_id, current_candidate_digest, approved_candidate_digest, approval_revision) VALUES ($1, $2, $2, $3)', [projectId, baselineDigest, randomUUID()])

  const compiled = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
    '--noEmit', 'false', '--outDir', buildRoot,
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
  const built = (path) => pathToFileURL(resolve(buildRoot, path)).href
  const [{ createHttpApp }, { createConfiguredBuilderModule }, {
    createBuilderProjectGitCapability, resolveProjectModelAdmission,
  }] = await Promise.all([
    import(built('http/app.js')),
    import(built('builder/module.js')),
    import(built('project/module.js')),
  ])
  const admission = resolveProjectModelAdmission({
    catalogFile: process.env.CONEXUS_PROJECT_MODEL_CATALOG_FILE,
    credentialSlotsFile: process.env.CONEXUS_GIT_EXTERNAL_FILE_SLOTS_FILE,
    admissionId: process.env.CONEXUS_BUILDER_MODEL_ADMISSION_ID,
    requiredCapabilities: ['BUILDER_CODING'],
  })
  const origin = 'https://control.example.test'
  module = createConfiguredBuilderModule({
    database: { host: current.host, port: current.port, database },
    builder: {
      ingressPasswordFile,
      executorPasswordFile,
      e2bApiKeyFile: process.env.CONEXUS_BUILDER_E2B_API_KEY_FILE,
      e2bTemplateId: process.env.CONEXUS_BUILDER_E2B_TEMPLATE_ID,
      modelAdmissionId: admission.admissionId,
    },
    projectSource: {
      storageRoot,
      ownership: { 'README.md': 'APP-OWNED' },
      git: createBuilderProjectGitCapability(storageRoot),
    },
    model: admission.model,
    modelIdentity: { admissionId: admission.admissionId, providerId: admission.providerId, modelId: admission.modelId },
    validateModelCredential: admission.validateCredential,
    origin,
    resolveCurrentSession: async () => ({ account: { accountId } }),
  })
  app = await createHttpApp({ registerRoutes: module.registerBuilderRoutes })

  const csrf = 'rb-composed-csrf'
  const intent = 'Create exactly one file named BUILDER_COMPOSED_RESULT.txt containing exactly composed-governed-by-conexus followed by a newline. Do not modify any other file.'
  const created = await app.inject({
    method: 'POST',
    url: `/api/control/projects/${projectId}/changes`,
    headers: {
      origin,
      cookie: `__Host-conexus_csrf=${csrf}`,
      'x-conexus-csrf': csrf,
      'idempotency-key': randomUUID(),
    },
    payload: { intent },
  })
  assert.equal(created.statusCode, 201, created.body)
  const change = JSON.parse(created.body)
  assert.equal(change.projectId, projectId)
  assert.equal(change.state, 'QUEUED')

  let currentChange
  const deadline = Date.now() + 15 * 60_000
  while (Date.now() < deadline) {
    const response = await app.inject({ method: 'GET', url: `/api/control/projects/${projectId}/changes/${change.changeId}` })
    assert.equal(response.statusCode, 200, response.body)
    currentChange = JSON.parse(response.body)
    if (currentChange.state === 'RESULT_READY' || currentChange.state === 'FAILED') break
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
  }
  if (currentChange?.state !== 'RESULT_READY') {
    const diagnostic = await query(current, `SELECT change_row.state AS change_state, run.state AS actor_state, run.sandbox_id
      FROM builder.change AS change_row LEFT JOIN builder.actor_run AS run ON run.change_id = change_row.change_id
      WHERE change_row.change_id = $1`, [change.changeId])
    assert.fail(`BUILDER_COMPOSED_RESULT_NOT_READY ${JSON.stringify(diagnostic.rows)}`)
  }

  const [plan, progress, diff, execution] = await Promise.all([
    app.inject({ method: 'GET', url: `/api/control/projects/${projectId}/changes/${change.changeId}/plan` }),
    app.inject({ method: 'GET', url: `/api/control/projects/${projectId}/changes/${change.changeId}/progress` }),
    app.inject({ method: 'GET', url: `/api/control/projects/${projectId}/changes/${change.changeId}/diff` }),
    app.inject({ method: 'GET', url: `/api/control/projects/${projectId}/changes/${change.changeId}/execution-detail` }),
  ])
  for (const response of [plan, progress, diff, execution]) assert.equal(response.statusCode, 200, response.body)
  assert.equal(JSON.parse(plan.body).progress, 'RESULT_READY')
  assert.equal(JSON.parse(progress.body).overallState, 'RESULT_READY')
  const exactDiff = JSON.parse(diff.body)
  assert.equal(exactDiff.baseSourceRevision, baseSourceRevision)
  assert.match(exactDiff.patch, /BUILDER_COMPOSED_RESULT\.txt/)
  assert.match(exactDiff.patch, /composed-governed-by-conexus/)
  const exactExecution = JSON.parse(execution.body)
  assert.deepEqual(exactExecution.workUnits.map((unit) => unit.state), ['COMPLETED'])
  assert.deepEqual(exactExecution.actorRuns.map((run) => run.state), ['COMPLETED'])

  const repository = resolve(storageRoot, 'projects', projectId)
  assert.equal(git(proofRoot, '--git-dir', repository, 'rev-parse', 'refs/heads/main'), baseSourceRevision)
  assert.equal(git(proofRoot, '--git-dir', repository, 'rev-parse', `refs/conexus/changes/${change.changeId}`), exactDiff.candidateSourceRevision)
  assert.equal(git(proofRoot, '--git-dir', repository, 'rev-parse', `${exactDiff.candidateSourceRevision}^`), baseSourceRevision)
  assert.deepEqual(gitBytes(proofRoot, '--git-dir', repository, 'diff', '--no-renames', '--name-only', '-z', baseSourceRevision, exactDiff.candidateSourceRevision), Buffer.from('BUILDER_COMPOSED_RESULT.txt\0'))
  assert.deepEqual(gitBytes(proofRoot, '--git-dir', repository, 'show', `${exactDiff.candidateSourceRevision}:BUILDER_COMPOSED_RESULT.txt`), Buffer.from('composed-governed-by-conexus\n'))
})
