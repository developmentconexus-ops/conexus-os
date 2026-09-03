import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import pg from 'pg'
import { runHubMigrations } from '../../scripts/run-hub-migrations.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const identityPath = resolve(repositoryRoot, 'apps/hub/src/project/identity.ts')
const migrationPath = resolve(repositoryRoot, 'apps/hub/migrations/006_project_create_authorization.sql')
const generatedRoutePath = resolve(repositoryRoot, 'apps/hub/src/generated/s3-routes.ts')
const projectStorePath = resolve(repositoryRoot, 'apps/hub/src/project/store.ts')

const compileHub = (t) => {
  const build = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r1-s3-project-build-'))
  t.after(() => rmSync(build, { recursive: true, force: true }))
  const compiled = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
    '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
    '--noEmit', 'false', '--outDir', build,
  ], { encoding: 'utf8' })
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
  return (path) => pathToFileURL(resolve(build, path)).href
}

test('S3-P5 centralizes one Project identity law for UUID versions 1 through 8', async (t) => {
  assert.equal(existsSync(identityPath), true)
  const gitSource = readFileSync(resolve(repositoryRoot, 'apps/hub/src/project/git-execution.ts'), 'utf8')
  const recoverySource = readFileSync(resolve(repositoryRoot, 'apps/hub/src/project/source-recovery.ts'), 'utf8')
  assert.match(gitSource, /import \{ isProjectIdentity \} from '\.\/identity\.js'/)
  assert.match(recoverySource, /import \{ isProjectIdentity \} from '\.\/identity\.js'/)
  assert.doesNotMatch(gitSource, /const UUID\s*=/)
  assert.doesNotMatch(recoverySource, /const UUID\s*=/)

  const built = compileHub(t)
  const { isProjectIdentity } = await import(built('project/identity.js'))
  for (let version = 1; version <= 8; version += 1) {
    assert.equal(isProjectIdentity(`30000000-0000-${version}000-8000-000000000051`), true)
  }
  assert.equal(isProjectIdentity('30000000-0000-9000-8000-000000000051'), false)
  assert.equal(isProjectIdentity('../project'), false)
})

test('S3-P5 migration 006 makes project.create authorization internal and current', () => {
  assert.equal(existsSync(migrationPath), true)
  const source = readFileSync(migrationPath, 'utf8')
  assert.match(source, /CREATE FUNCTION iam\.can_create_project\(p_account_id uuid, p_workspace_id uuid\)/)
  assert.match(source, /membership\.can_create_project/)
  assert.match(source, /CREATE OR REPLACE FUNCTION project\.reserve_or_replay_create_project/)
  assert.match(source, /CREATE OR REPLACE FUNCTION project\.lock_create_project_receipt/)
  assert.equal((source.match(/IF NOT iam\.can_create_project\(/g) ?? []).length, 2)
  assert.match(source, /GRANT EXECUTE ON FUNCTION iam\.can_create_project\(uuid, uuid\) TO project_owner/)
  assert.doesNotMatch(source, /GRANT EXECUTE ON FUNCTION iam\.can_create_project\(uuid, uuid\) TO hub_prj03_command/)
  assert.match(source, /REVOKE EXECUTE ON FUNCTION iam\.can_create_project\(uuid, uuid\) FROM PUBLIC/)
})

test('S3-P5 preserves generated PRJ-03 inside the bounded S3 projection', () => {
  assert.equal(existsSync(generatedRoutePath), true)
  const source = readFileSync(generatedRoutePath, 'utf8')
  assert.match(source, /export type S3OwnerId = 'PRJ-01' \| 'PRJ-02' \| 'PRJ-03'/)
  assert.match(source, /CreateProject/)
  assert.match(source, /\/api\/control\/workspaces\/:workspaceId\/projects/)
  assert.doesNotMatch(source, /workspace-client/)
})

test('S3-P5 store binds recovery claims, fixed cutoff and source-complete settlement', () => {
  assert.equal(existsSync(projectStorePath), true)
  const source = readFileSync(projectStorePath, 'utf8')
  assert.match(source, /const ABANDONED_ATTEMPT_AGE_MS = 60 \* 60 \* 1_000/)
  assert.match(source, /claim_abandoned_create_project_attempt\(\$1, \$2\)/)
  assert.match(source, /cleanupClaimedProjectSource/)
  assert.match(source, /lock_create_project_receipt/)
  assert.match(source, /verifyCanonicalProjectSource/)
  assert.match(source, /create_project_with_source/)
  assert.match(source, /establish_project_creator_grant/)
  assert.match(source, /complete_create_project_receipt/)
})

test('S3-P5 store composes recovery, Git custody and one atomic terminal response', async (t) => {
  const built = compileHub(t)
  const { createProjectStore } = await import(built('project/store.js'))
  const projectId = '30000000-0000-8000-8000-000000000061'
  const attemptId = '40000000-0000-8000-8000-000000000061'
  const projectRevision = '50000000-0000-8000-8000-000000000061'
  const sourceRevision = '1'.repeat(40)
  const statements = []
  const client = {
    async query(statement, values = []) {
      statements.push({ statement, values })
      if (statement.includes('claim_abandoned_create_project_attempt')) return { rows: [] }
      if (statement.includes('reserve_or_replay_create_project')) {
        return { rows: [{ state: 'RESERVED', project_id: projectId, response_status: null, response_body: null }] }
      }
      if (statement.includes('lock_create_project_receipt')) return { rows: [{ outcome: 'RESERVED', project_id: projectId }] }
      return { rows: [] }
    },
    release() {},
  }
  const commandPool = { connect: async () => client }
  const gitCalls = []
  const git = {
    verifyAdmittedImage: async () => ({ status: 'VERIFIED' }),
    stageNewProjectSource: async (input) => { gitCalls.push(['stage', input]); return { status: 'STAGED', sourceRevision, tree: '2'.repeat(40), appOwnedPathCount: 0 } },
    stageExistingGitProjectSource: async () => { throw new Error('UNEXPECTED_EXISTING') },
    promoteStagedProjectSource: async (input) => { gitCalls.push(['promote', input]); return { status: 'PROMOTED', sourceRevision } },
    verifyCanonicalProjectSource: async (input) => { gitCalls.push(['verify', input]); return { status: 'VERIFIED', sourceRevision } },
    createProjectSourceBundle: async () => { throw new Error('UNEXPECTED_BUNDLE') },
    restoreProjectSourceBundle: async () => { throw new Error('UNEXPECTED_RESTORE') },
  }
  const identities = [projectId, attemptId, projectRevision]
  const store = createProjectStore({
    commandPool,
    git,
    recovery: { cleanupClaimedProjectSource: async () => { throw new Error('UNCLAIMED_CLEANUP') } },
    now: () => Date.parse('2026-09-01T12:00:00.000Z'),
    mintIdentity: () => identities.shift(),
  })
  assert.deepEqual(await store.createProject({
    accountId: '10000000-0000-4000-8000-000000000061',
    workspaceId: '20000000-0000-4000-8000-000000000061',
    idempotencyKey: 'p5-key',
    body: { name: 'Project P5', sourceBootstrap: { mode: 'NEW' } },
  }), {
    projectId,
    workspaceId: '20000000-0000-4000-8000-000000000061',
    name: 'Project P5',
    projectRevision,
    archived: false,
    replayed: false,
  })
  assert.deepEqual(gitCalls.map(([name]) => name), ['stage', 'promote', 'verify'])
  assert.equal(statements.some(({ statement }) => statement.includes('create_project_with_source')), true)
  assert.equal(statements.some(({ statement }) => statement.includes('establish_project_creator_grant')), true)
  assert.equal(statements.some(({ statement }) => statement.includes('complete_create_project_receipt')), true)
  const commits = statements.filter(({ statement }) => statement === 'COMMIT').length
  assert.equal(commits, 3)
})

test('S3-P5 recovery refusal rolls back the open claim and blocks intake', async (t) => {
  const built = compileHub(t)
  const { createProjectStore } = await import(built('project/store.js'))
  const projectId = '30000000-0000-8000-8000-000000000062'
  const statements = []
  const client = {
    async query(statement) {
      statements.push(statement)
      if (statement.includes('claim_abandoned_create_project_attempt')) return { rows: [{ project_id: projectId }] }
      if (statement.includes('reserve_or_replay_create_project')) throw new Error('INTAKE_MUST_BE_BLOCKED')
      return { rows: [] }
    },
    release() {},
  }
  const store = createProjectStore({
    commandPool: { connect: async () => client },
    git: {},
    recovery: { cleanupClaimedProjectSource: async () => ({ status: 'REFUSED', code: 'CLEANUP_FAILED' }) },
  })
  await assert.rejects(store.createProject({
    accountId: '10000000-0000-4000-8000-000000000062',
    workspaceId: '20000000-0000-4000-8000-000000000062',
    idempotencyKey: 'blocked',
    body: { name: 'Blocked', sourceBootstrap: { mode: 'NEW' } },
  }), /RECOVERY_REFUSED/)
  assert.equal(statements.includes('ROLLBACK'), true)
  assert.equal(statements.some((statement) => statement.includes('reserve_or_replay_create_project')), false)
})

test('S3-P5 command failure matrix never reaches a false terminal receipt', async (t) => {
  const built = compileHub(t)
  const { createProjectStore } = await import(built('project/store.js'))
  const projectId = '30000000-0000-8000-8000-000000000065'
  const attemptId = '40000000-0000-8000-8000-000000000065'
  const projectRevision = '50000000-0000-8000-8000-000000000065'
  const sourceRevision = '1'.repeat(40)
  const input = {
    accountId: '10000000-0000-4000-8000-000000000065',
    workspaceId: '20000000-0000-4000-8000-000000000065',
    idempotencyKey: 'failure-key',
    body: { name: 'Failure Matrix', sourceBootstrap: { mode: 'NEW' } },
  }
  const scenario = async ({ reservationState = 'RESERVED', stage, promote, verify, databaseFailure }, expected) => {
    const statements = []
    const client = {
      async query(statement) {
        statements.push(statement)
        if (statement.includes('claim_abandoned_create_project_attempt')) return { rows: [] }
        if (statement.includes('reserve_or_replay_create_project')) {
          return { rows: [{ state: reservationState, project_id: projectId, response_status: null, response_body: null }] }
        }
        if (statement.includes('lock_create_project_receipt')) return { rows: [{ outcome: 'RESERVED', project_id: projectId }] }
        if (databaseFailure && statement.includes('create_project_with_source')) throw new Error('SYNTHETIC_SETTLEMENT_FAILURE')
        return { rows: [] }
      },
      release() {},
    }
    const identities = [projectId, attemptId, projectRevision]
    const store = createProjectStore({
      commandPool: { connect: async () => client },
      recovery: { cleanupClaimedProjectSource: async () => { throw new Error('UNCLAIMED_CLEANUP') } },
      mintIdentity: () => identities.shift(),
      git: {
        stageNewProjectSource: async () => stage ?? ({ status: 'STAGED', sourceRevision, tree: '2'.repeat(40), appOwnedPathCount: 0 }),
        stageExistingGitProjectSource: async () => { throw new Error('UNEXPECTED_EXISTING') },
        promoteStagedProjectSource: async () => promote ?? ({ status: 'PROMOTED', sourceRevision }),
        verifyCanonicalProjectSource: async () => verify ?? ({ status: 'VERIFIED', sourceRevision }),
      },
    })
    await assert.rejects(store.createProject(input), expected)
    assert.equal(statements.some((statement) => statement.includes('complete_create_project_receipt')), false)
    return statements
  }

  await scenario({ reservationState: 'CONFLICT' }, /IDEMPOTENCY_CONFLICT/)
  await scenario({ stage: { status: 'REFUSED', code: 'LOCATOR_REFUSED' } }, /SOURCE_INPUT_REFUSED/)
  await scenario({ promote: { status: 'REFUSED', code: 'CANDIDATE_QUARANTINED' } }, /SOURCE_CONFLICT/)
  await scenario({ verify: { status: 'REFUSED', code: 'CANONICAL_SOURCE_REFUSED' } }, /SOURCE_DEPENDENCY_REFUSED/)
  const settlement = await scenario({ databaseFailure: true }, /SYNTHETIC_SETTLEMENT_FAILURE/)
  assert.equal(settlement.includes('ROLLBACK'), true)
})

test('S3-P5 generated HTTP route enforces authenticity/session and returns only terminal representation', async (t) => {
  const built = compileHub(t)
  const { createHttpApp } = await import(built('http/app.js'))
  const { registerProjectRoutes } = await import(built('project/routes.js'))
  const response = {
    projectId: '30000000-0000-8000-8000-000000000063',
    workspaceId: '20000000-0000-4000-8000-000000000063',
    name: 'HTTP Project',
    projectRevision: '50000000-0000-8000-8000-000000000063',
    archived: false,
    replayed: false,
  }
  let authenticated = true
  const app = await createHttpApp({
    staticRoot: null,
    registerRoutes: (server) => registerProjectRoutes(server, {
      origin: 'https://conexus.test',
      resolveCurrentSession: async () => authenticated ? { account: { accountId: 'account-63' } } : null,
      store: { createProject: async () => response },
    }),
  })
  t.after(() => app.close())
  const request = (overrides = {}) => app.inject({
    method: 'POST',
    url: '/api/control/workspaces/20000000-0000-4000-8000-000000000063/projects',
    headers: {
      origin: 'https://conexus.test',
      cookie: '__Host-conexus_csrf=token',
      'x-conexus-csrf': 'token',
      'idempotency-key': 'http-key',
      'content-type': 'application/json',
      ...overrides.headers,
    },
    payload: overrides.payload ?? { name: 'HTTP Project', sourceBootstrap: { mode: 'NEW' } },
  })
  const success = await request()
  assert.equal(success.statusCode, 201)
  assert.deepEqual(success.json(), Object.fromEntries(Object.entries(response).filter(([key]) => key !== 'replayed')))
  const forged = await request({ headers: { origin: 'https://forged.test' } })
  assert.equal(forged.statusCode, 403)
  authenticated = false
  const anonymous = await request()
  assert.equal(anonymous.statusCode, 401)
  authenticated = true
  const malformed = await request({ payload: { name: 'Missing source' } })
  assert.equal(malformed.statusCode, 400)
})

test('S3-P5 real NEW and EXISTING_GIT HTTP compose PostgreSQL and exact-image Git through terminal replay', {
  skip: process.env.CONEXUS_S3_P5_LIVE !== 'true' ? 'set CONEXUS_S3_P5_LIVE=true for isolated deciding proof' : false,
}, async (t) => {
  const required = (name) => {
    const value = process.env[name]
    if (!value) throw new Error(`MISSING_TEST_CONFIG_${name}`)
    return value
  }
  const adminConnection = {
    host: required('CONEXUS_TEST_DB_HOST'),
    port: Number(required('CONEXUS_TEST_DB_PORT')),
    database: required('CONEXUS_TEST_DB_NAME'),
    user: required('CONEXUS_TEST_DB_USER'),
    password: required('CONEXUS_TEST_DB_PASSWORD'),
  }
  const database = `conexus_s3_p5_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 10)}`
  const ownerRoot = mkdtempSync('/tmp/conexus-s3-p5-live-')
  const fixtureRoot = mkdtempSync('/tmp/conexus-s3-p5-fixture-')
  const suffix = fixtureRoot.split('-').at(-1).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
  const networkName = `conexus-s3-p5-${suffix}`
  const fixtureName = `conexus-s3-p5-fixture-${suffix}`
  let networkCreated = false
  let fixtureCreated = false
  const quote = (value) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('UNSAFE_DATABASE_NAME')
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
  const admin = new pg.Client(adminConnection)
  await admin.connect()
  await admin.query(`CREATE DATABASE ${quote(database)}`)
  await admin.end()
  const fresh = { ...adminConnection, database }
  let app
  let commandPool
  let readPool
  t.after(async () => {
    await app?.close().catch(() => {})
    await commandPool?.end().catch(() => {})
    await readPool?.end().catch(() => {})
    if (fixtureCreated) spawnSync('docker', ['rm', '-f', fixtureName])
    if (networkCreated) spawnSync('docker', ['network', 'rm', networkName])
    rmSync(ownerRoot, { recursive: true, force: true })
    rmSync(fixtureRoot, { recursive: true, force: true })
    const cleanup = new pg.Client(adminConnection)
    await cleanup.connect()
    try {
      await cleanup.query('ALTER ROLE hub_prj03_command PASSWORD NULL').catch(() => {})
      await cleanup.query('ALTER ROLE hub_s3_read PASSWORD NULL').catch(() => {})
      await cleanup.query(`DROP DATABASE ${quote(database)} WITH (FORCE)`)
    } finally {
      await cleanup.end()
    }
  })

  assert.deepEqual((await runHubMigrations({ connectionString: connectionString(fresh) })).versions, ['001', '002', '003', '004', '005', '006', '007'])
  const accountId = '10000000-0000-4000-8000-000000000064'
  const workspaceId = '20000000-0000-4000-8000-000000000064'
  await query(fresh, `
    INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', 's3-p5-subject', 'S3 P5 Account')
  `, [accountId])
  await query(fresh, `INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'S3 P5 Workspace')`, [workspaceId])
  await query(fresh, `
    INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project)
    VALUES ($1, $2, true)
  `, [accountId, workspaceId])
  const commandPassword = 's3-p5-command-synthetic-only'
  const readPassword = 's3-p6-read-synthetic-only'
  await query(fresh, `ALTER ROLE hub_prj03_command PASSWORD '${commandPassword}'`)
  await query(fresh, `ALTER ROLE hub_s3_read PASSWORD '${readPassword}'`)

  const built = compileHub(t)
  const { createHttpApp } = await import(built('http/app.js'))
  const { R1C14_GIT_IDENTITY } = await import(built('generated/r1c14-git-identity.js'))
  const { createPostgresPool } = await import(built('platform/postgres.js'))
  const { createOciGitExecutionPort } = await import(built('project/git-execution.js'))
  const { createGitImportAdmissionCatalog } = await import(built('project/git-import-admission.js'))
  const { registerProjectRoutes } = await import(built('project/routes.js'))
  const { createProjectSourceRecovery } = await import(built('project/source-recovery.js'))
  const { createProjectStore } = await import(built('project/store.js'))
  const run = (command, args) => {
    const outcome = spawnSync(command, args, { encoding: 'utf8' })
    if (outcome.status !== 0 || outcome.signal !== null) {
      throw new Error(`S3_P5_COMMAND_FAILED:${command}:${outcome.status}:${outcome.signal}\n${outcome.stdout}\n${outcome.stderr}`)
    }
    return outcome.stdout.trim()
  }
  const waitFor = async (path) => {
    for (let index = 0; index < 200; index += 1) {
      if (existsSync(path)) return
      await new Promise((complete) => setTimeout(complete, 25))
    }
    throw new Error(`S3_P5_FIXTURE_NOT_READY:${path}`)
  }
  const secret = `S3-P5-${suffix}-credential-canary`
  const credentialPath = resolve(fixtureRoot, 'credential')
  const certPath = resolve(fixtureRoot, 'ca.pem')
  const keyPath = resolve(fixtureRoot, 'ca-key.pem')
  const readyPath = resolve(fixtureRoot, 'ready.json')
  const sourceRoot = resolve(fixtureRoot, 'source')
  mkdirSync(sourceRoot, { mode: 0o700 })
  writeFileSync(resolve(sourceRoot, 'README.md'), 'S3-P5 admitted source\n')
  writeFileSync(credentialPath, `fixture-user\n${secret}\n`, { mode: 0o600 })
  chmodSync(credentialPath, 0o600)
  const opensslConfig = resolve(fixtureRoot, 'openssl.cnf')
  writeFileSync(opensslConfig, '[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=git.allowed.test\n[ext]\nsubjectAltName=DNS:git.allowed.test\n')
  run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-config', opensslConfig, '-keyout', keyPath, '-out', certPath])
  const sourceProgram = `
const { spawnSync } = require('node:child_process')
const env = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/tmp', GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@conexus.invalid', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@conexus.invalid', GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z' }
const git = (args) => { const r = spawnSync('/usr/local/bin/git', args, { env, encoding: 'utf8' }); if (r.status !== 0 || r.signal) process.exit(91); return r.stdout.trim() }
git(['init', '--initial-branch=main', '/fixture/source'])
git(['-C', '/fixture/source', 'add', '--all'])
git(['-C', '/fixture/source', 'commit', '-m', 'fixture'])
git(['clone', '--bare', '/fixture/source', '/fixture/repo.git'])
git(['--git-dir=/fixture/repo.git', 'update-server-info'])
`
  run('docker', [
    'run', '--rm', '--pull', 'never', '--network', 'none', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
    '--user', `${process.getuid()}:${process.getgid()}`, '--mount', `type=bind,src=${fixtureRoot},dst=/fixture`,
    '--entrypoint', '/usr/local/bin/node', R1C14_GIT_IDENTITY.ociIndexDigest, '-e', sourceProgram,
  ])
  run('docker', ['network', 'create', networkName])
  networkCreated = true
  const fixtureScript = resolve(repositoryRoot, 'tests/fixtures/r1-s3-git-import-https-fixture.mjs')
  run('docker', [
    'run', '-d', '--pull', 'never', '--network', networkName, '--network-alias', 'git.allowed.test',
    '--name', fixtureName, '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--read-only',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--user', `${process.getuid()}:${process.getgid()}`,
    '--mount', `type=bind,src=${fixtureRoot},dst=/fixture`,
    '--mount', `type=bind,src=${fixtureScript},dst=/fixture-server.mjs,readonly`, '--entrypoint', '/usr/local/bin/node',
    R1C14_GIT_IDENTITY.ociIndexDigest, '/fixture-server.mjs', '/fixture/repo.git', '/fixture/ca.pem',
    '/fixture/ca-key.pem', '/fixture/credential', '/fixture/ready.json', '/fixture/requests.json',
  ])
  fixtureCreated = true
  await waitFor(readyPath)
  const catalog = createGitImportAdmissionCatalog([{
    id: 'p5-live',
    host: 'git.allowed.test',
    port: 8443,
    pathPrefix: '/admitted/',
    defaultRef: 'refs/heads/main',
    tls: { mode: 'EXTERNAL_CA_FILE', caFileSlot: 'p5-ca' },
    credentialSlot: 'p5-credential',
    networkName,
    timeoutMs: 60_000,
    maxFetchedBytes: 10_000_000,
    maxObjectCount: 10_000,
    enabled: true,
  }])
  assert.ok(catalog)
  commandPool = createPostgresPool({ ...fresh, user: 'hub_prj03_command', password: commandPassword })
  readPool = createPostgresPool({ ...fresh, user: 'hub_s3_read', password: readPassword })
  const store = createProjectStore({
    commandPool,
    readPool,
    git: createOciGitExecutionPort({
      projectStorageRoot: ownerRoot,
      gitImportCatalog: catalog,
      externalFileSlots: { 'p5-credential': credentialPath, 'p5-ca': certPath },
    }),
    recovery: createProjectSourceRecovery(ownerRoot),
  })
  app = await createHttpApp({
    staticRoot: null,
    registerRoutes: (server) => registerProjectRoutes(server, {
      origin: 'https://conexus.test',
      resolveCurrentSession: async () => ({ account: { accountId } }),
      store,
    }),
  })
  const request = (idempotencyKey, name, sourceBootstrap) => app.inject({
    method: 'POST',
    url: `/api/control/workspaces/${workspaceId}/projects`,
    headers: {
      origin: 'https://conexus.test',
      cookie: '__Host-conexus_csrf=token',
      'x-conexus-csrf': 'token',
      'idempotency-key': idempotencyKey,
      'content-type': 'application/json',
    },
    payload: { name, sourceBootstrap },
  })
  const created = await request('s3-p5-live-new', 'Exact Image Project', { mode: 'NEW' })
  assert.equal(created.statusCode, 201, created.body)
  const body = created.json()
  assert.equal(body.workspaceId, workspaceId)
  assert.equal(body.name, 'Exact Image Project')
  assert.equal(body.archived, false)
  assert.equal(existsSync(resolve(ownerRoot, 'projects', body.projectId)), true)
  const listed = await app.inject({ method: 'GET', url: `/api/control/workspaces/${workspaceId}/projects` })
  assert.equal(listed.statusCode, 200, listed.body)
  assert.deepEqual(listed.json(), [{
    projectId: body.projectId,
    workspaceId,
    name: 'Exact Image Project',
    archived: false,
  }])
  const detail = await app.inject({ method: 'GET', url: `/api/control/projects/${body.projectId}` })
  assert.equal(detail.statusCode, 200, detail.body)
  assert.deepEqual(detail.json(), body)
  const replay = await request('s3-p5-live-new', 'Exact Image Project', { mode: 'NEW' })
  assert.equal(replay.statusCode, 201, replay.body)
  assert.deepEqual(replay.json(), body)
  const imported = await request('s3-p5-live-existing', 'Imported Project', {
    mode: 'EXISTING_GIT',
    repositoryLocator: 'https://git.allowed.test:8443/admitted/repo.git',
  })
  assert.equal(imported.statusCode, 201, imported.body)
  const importedBody = imported.json()
  assert.equal(importedBody.name, 'Imported Project')
  assert.equal(existsSync(resolve(ownerRoot, 'projects', importedBody.projectId)), true)
  const importedReplay = await request('s3-p5-live-existing', 'Imported Project', {
    mode: 'EXISTING_GIT',
    repositoryLocator: 'https://git.allowed.test:8443/admitted/repo.git',
  })
  assert.equal(importedReplay.statusCode, 201, importedReplay.body)
  assert.deepEqual(importedReplay.json(), importedBody)
  assert.equal(JSON.stringify([body, importedBody]).includes(secret), false)
  const durable = await query(fresh, `
    SELECT (SELECT count(*)::integer FROM project.project) AS projects,
      (SELECT count(*)::integer FROM iam.account_project_grant) AS grants,
      (SELECT count(*)::integer FROM project.operation_idempotency WHERE outcome = 'SUCCEEDED') AS receipts
  `)
  assert.deepEqual(durable.rows, [{ projects: 2, grants: 2, receipts: 2 }])
})
