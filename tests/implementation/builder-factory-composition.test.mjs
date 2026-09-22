import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import pg from 'pg'
import { createEmptyDatabase, testPool } from './hub-database.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/builder-factory-composition-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const built = (path) => pathToFileURL(resolve(hubBuild, path)).href
const { ConexusFactoryE2BSandbox, assertFactoryHost, composeFactory, createFactoryPool, createFactorySandbox, createFactoryStorage, createFactorySecretKeyEncryption, SANDBOX_CREDENTIAL } = await import(built('builder/factory.js'))
const { ModelCredentialsStorage } = await import('@mastra/factory/storage/domains/credentials/base')
const { createMastraFactoryRunPorts } = await import(built('builder/factory-runtime.js'))
const { readHubConfig } = await import(built('platform/config.js'))

const baseEnvironment = {
  NODE_ENV: 'test',
  CONEXUS_ORIGIN: 'https://hub.test',
  CONEXUS_BOOTSTRAP_SUBJECT: 'subject',
  CONEXUS_DB_HOST: '127.0.0.1',
  CONEXUS_DB_PORT: '5432',
  CONEXUS_DB_NAME: 'conexus',
  CONEXUS_DB_USER: 'hub_iam_runtime',
  CONEXUS_DB_PASSWORD_FILE: '/secrets/iam',
  CONEXUS_OIDC_ISSUER: 'https://issuer.test',
  CONEXUS_OIDC_CLIENT_ID: 'hub',
  CONEXUS_OIDC_CLIENT_SECRET_FILE: '/secrets/oidc',
  CONEXUS_DB_PROJECT_COMMAND_PASSWORD_FILE: '/secrets/project-command',
  CONEXUS_DB_PROJECT_READ_PASSWORD_FILE: '/secrets/project-read',
  CONEXUS_PROJECT_STORAGE_ROOT: '/storage',
  CONEXUS_GIT_IMPORT_CATALOG_FILE: '/config/catalog.json',
  CONEXUS_GIT_EXTERNAL_FILE_SLOTS_FILE: '/config/slots.json',
  CONEXUS_PROJECT_SOURCE_OWNERSHIP_MANIFEST_FILE: '/config/ownership.json',
  CONEXUS_DB_BUILDER_INGRESS_PASSWORD_FILE: '/secrets/ingress',
  CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE: '/secrets/executor',
  CONEXUS_BUILDER_E2B_API_KEY_FILE: '/secrets/e2b',
  CONEXUS_BUILDER_E2B_TEMPLATE_ID: 'conexus:11111111-1111-4111-8111-111111111111',
}
const factoryEnvironment = {
  CONEXUS_FACTORY_ORG_ID: 'conexus-installation',
  CONEXUS_FACTORY_GITHUB_APP_ID: '5015512',
  CONEXUS_FACTORY_GITHUB_CLIENT_ID: 'Iv23-client',
  CONEXUS_FACTORY_GITHUB_APP_SLUG: 'conexus-app',
  CONEXUS_FACTORY_GITHUB_PRIVATE_KEY_FILE: '/secrets/factory-app.pem',
  CONEXUS_FACTORY_GITHUB_CLIENT_SECRET_FILE: '/secrets/factory-app-client-secret',
  CONEXUS_FACTORY_STATE_SECRET_FILE: '/secrets/factory-state-secret',
  CONEXUS_FACTORY_SECRET_KEY_FILE: '/secrets/factory-secret-key',
  CONEXUS_DB_FACTORY_PASSWORD_FILE: '/secrets/factory-db',
}

test('the sandbox never lets GH_TOKEN or GITHUB_TOKEN into its environment', () => {
  const sandbox = new ConexusFactoryE2BSandbox({ id: 'probe', env: { GH_TOKEN: 'ghs_constructor', GITHUB_TOKEN: 'ghs_constructor', KEEP: '1' } })
  assert.deepEqual(sandbox.getEnv(), { KEEP: '1' })
  sandbox.setEnv((env) => ({ ...env, GH_TOKEN: 'ghs_injected', GITHUB_TOKEN: 'ghs_injected', OTHER: '2' }))
  assert.deepEqual(sandbox.getEnv(), { KEEP: '1', OTHER: '2' })
})

const fakeVm = (sandboxId) => {
  const vm = { sandboxId, killed: false, runs: [] }
  vm.kill = async () => { vm.killed = true }
  vm.commands = {
    run: async (script, options) => {
      vm.runs.push({ script, options })
      if (script === 'exit 128') throw Object.assign(new Error('exit status 128'), { exitCode: 128, stdout: '', stderr: 'fatal: refused' })
      return { exitCode: 0, stdout: 'ok\n', stderr: '' }
    },
  }
  return vm
}

const offlineSandbox = ({ existing, created }) => {
  const sandbox = new ConexusFactoryE2BSandbox({ id: 'conexus-factory-row', template: 'conexus:template', apiKey: 'e2b-test' })
  sandbox.findExistingSandbox = async () => existing
  sandbox.createSdkSandbox = async () => created
  return sandbox
}

test('a VM left running by an earlier Hub process is adopted, since the agent cannot reach the Hub root commands', async () => {
  const existing = fakeVm('vm-left-by-a-previous-hub')
  const created = fakeVm('vm-fresh')
  const sandbox = offlineSandbox({ existing, created })
  await sandbox.start()
  assert.equal(existing.killed, false)
  assert.equal(sandbox.sandboxId, 'vm-left-by-a-previous-hub')
  assert.deepEqual(created.runs, [])
})

test('a Hub root command runs as root from / with exactly the environment given, and a nonzero exit is returned, not thrown', async () => {
  const created = fakeVm('vm-fresh')
  const sandbox = offlineSandbox({ existing: undefined, created })
  await sandbox.start()
  const ran = await sandbox.runAsRoot('git --version', { GIT_TERMINAL_PROMPT: '0' })
  assert.deepEqual({ exitCode: ran.exitCode, stdout: ran.stdout }, { exitCode: 0, stdout: 'ok\n' })
  assert.deepEqual(created.runs.at(-1), { script: 'git --version', options: { user: 'root', cwd: '/', envs: { GIT_TERMINAL_PROMPT: '0' }, timeoutMs: 120_000 } })
  const refused = await sandbox.runAsRoot('exit 128', {})
  assert.deepEqual({ exitCode: refused.exitCode, stderr: refused.stderr, success: refused.success }, { exitCode: 128, stderr: 'fatal: refused', success: false })
})

test('the Factory sandbox callback builds one E2B sandbox per session row in /workspace', () => {
  const sandbox = createFactorySandbox({ apiKey: 'e2b-key', templateId: 'conexus:tpl' })({ sessionId: 'row-1', repoFullName: 'acme/app' })
  assert.ok(sandbox instanceof ConexusFactoryE2BSandbox)
  assert.equal(sandbox.id, 'conexus-factory-row-1')
  assert.equal(sandbox.workingDirectory, '/workspace')
  assert.deepEqual(sandbox.getEnv(), {})
})


// A host shell standing in for the sandbox, running the Factory's own git code as it would in the VM.
const localShellSandbox = (env) => ({
  executeCommand: async (command, args = []) => {
    const result = spawnSync(command, args, { encoding: 'utf8', env: { ...process.env, ...env } })
    return { exitCode: result.status ?? 1, success: result.status === 0, stdout: result.stdout, stderr: result.stderr }
  },
})
const git = (cwd, ...args) => {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}

test('the Factory\'s own clone and branch checkout, holding the credential that opens nothing, read the seed bundle and leave a clean checkout', async (t) => {
  const { materializeRepo, checkoutSessionBranch } = await import('@mastra/factory/integrations/github/sandbox')
  const root = mkdtempSync(join(tmpdir(), 'conexus-factory-seed-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const upstream = join(root, 'upstream')
  mkdirSync(upstream)
  git(upstream, 'init', '--quiet', '-b', 'main')
  git(upstream, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '--allow-empty', '-m', 'base')
  const base = git(upstream, 'rev-parse', 'HEAD')
  // What root's seed leaves: a bundle of the default branch, and a system rule sending the
  // credential-free clone URL to it.
  const bundle = join(root, 'app.seed.bundle')
  git(upstream, 'bundle', 'create', '--quiet', bundle, 'refs/heads/main')
  const systemConfig = join(root, 'gitconfig')
  writeFileSync(systemConfig, `[url "${bundle}"]\n\tinsteadOf = https://x-access-token:${SANDBOX_CREDENTIAL}@github.com/acme-org/app.git\n`)
  const sandbox = localShellSandbox({ GIT_CONFIG_SYSTEM: systemConfig, GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' })
  const workdir = join(root, 'workspace', 'app')
  const marked = []
  await materializeRepo({
    row: { id: 'row-1', sandboxWorkdir: workdir, materializedAt: null },
    repoInfo: { repoFullName: 'acme-org/app', defaultBranch: 'main' },
    sandbox, token: SANDBOX_CREDENTIAL, storage: { markMaterialized: async (row) => { marked.push(row.id) } },
  })
  await checkoutSessionBranch(sandbox, workdir, { branch: 'conexus/conversation-1', baseBranch: 'main', token: SANDBOX_CREDENTIAL, repoFullName: 'acme-org/app' })
  assert.deepEqual(marked, ['row-1'])
  assert.equal(git(workdir, 'branch', '--show-current'), 'conexus/conversation-1')
  assert.equal(git(workdir, 'rev-parse', 'HEAD'), base)
  assert.equal(git(workdir, 'config', '--get', 'remote.origin.url'), 'https://github.com/acme-org/app.git')
})

test('every start seeds root\'s mirror with a read token in root\'s environment before the Factory\'s start hook runs', async () => {
  const created = fakeVm('vm-fresh')
  const sandbox = new ConexusFactoryE2BSandbox({ id: 'conexus-factory-row', template: 'conexus:template', apiKey: 'e2b-test' }, {
    repositorySlug: 'acme-org/app', read: async () => ({ token: 'ghs_seed', defaultBranch: 'main' }),
  })
  sandbox.findExistingSandbox = async () => undefined
  sandbox.createSdkSandbox = async () => created
  const order = []
  sandbox.setOnStart((previous) => async (args) => { order.push(['factory', args.outcome]); await previous?.(args) })
  await sandbox.start()
  const seed = created.runs.find(({ options }) => options?.user === 'root')
  assert.deepEqual(seed.script, [
    "mkdir -p '/var/lib/conexus-git'",
    "{ test -d '/var/lib/conexus-git/app.git' || git init --quiet --bare '/var/lib/conexus-git/app.git'; }",
    "git --git-dir='/var/lib/conexus-git/app.git' fetch --quiet --no-tags 'https://github.com/acme-org/app.git' '+refs/heads/main:refs/heads/main'",
    "git --git-dir='/var/lib/conexus-git/app.git' bundle create --quiet '/var/lib/conexus-git/app.seed.bundle' 'refs/heads/main'",
    `git config --system --replace-all 'url./var/lib/conexus-git/app.seed.bundle.insteadOf' 'https://x-access-token:${SANDBOX_CREDENTIAL}@github.com/acme-org/app.git'`,
  ].join(' && '))
  assert.equal(seed.options.envs.GIT_CONFIG_VALUE_0, `AUTHORIZATION: basic ${Buffer.from('x-access-token:ghs_seed').toString('base64')}`)
  assert.deepEqual(order, [['factory', 'created']])
  assert.equal(created.runs.indexOf(seed), 0, 'the seed is the first command of the start')
})


const { CONEXUS_DB_BUILDER_INGRESS_PASSWORD_FILE: _ingress, CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE: _executor, CONEXUS_BUILDER_E2B_API_KEY_FILE: _e2bKey, CONEXUS_BUILDER_E2B_TEMPLATE_ID: _e2bTemplate, ...environmentWithoutBuilder } = baseEnvironment

test('with no Builder and no Factory variable the Hub boots as it did before', () => {
  assert.equal(readHubConfig(environmentWithoutBuilder).factory, undefined)
})

test('a Builder without Factory variables is refused: there is no second agent runtime to fall back to', () => {
  assert.throws(() => readHubConfig(baseEnvironment), /^Error: BUILDER_FACTORY_RUNTIME_REQUIRED$/)
})

test('a complete Factory configuration is read, and a partial one names the missing variable', () => {
  assert.deepEqual(readHubConfig({ ...baseEnvironment, ...factoryEnvironment }).factory, {
    orgId: 'conexus-installation',
    githubAppId: '5015512',
    githubClientId: 'Iv23-client',
    githubAppSlug: 'conexus-app',
    githubPrivateKeyFile: '/secrets/factory-app.pem',
    githubClientSecretFile: '/secrets/factory-app-client-secret',
    stateSecretFile: '/secrets/factory-state-secret',
    secretKeyFile: '/secrets/factory-secret-key',
    databasePasswordFile: '/secrets/factory-db',
  })
  const { CONEXUS_FACTORY_STATE_SECRET_FILE: _omitted, ...partial } = factoryEnvironment
  assert.throws(() => readHubConfig({ ...baseEnvironment, ...partial }), /^Error: MISSING_CONFIG_CONEXUS_FACTORY_STATE_SECRET_FILE$/)
  const { CONEXUS_FACTORY_SECRET_KEY_FILE: _key, ...keyless } = factoryEnvironment
  assert.throws(() => readHubConfig({ ...baseEnvironment, ...keyless }), /^Error: MISSING_CONFIG_CONEXUS_FACTORY_SECRET_KEY_FILE$/)
})

test('a secret key that is not 64 hex characters is refused before the Factory stores anything', () => {
  for (const key of ['', 'f'.repeat(63), 'F'.repeat(64), 'g'.repeat(64), 'f'.repeat(65)]) {
    assert.throws(() => createFactorySecretKeyEncryption(key), /^Error: FACTORY_SECRET_KEY_REFUSED$/)
  }
})

test('a Hub composing the Factory refuses Mastra Platform credentials', () => {
  assert.throws(
    () => readHubConfig({ ...baseEnvironment, ...factoryEnvironment, MASTRA_PLATFORM_ACCESS_TOKEN: 'token' }),
    /^Error: FACTORY_REFUSES_CONFIG_MASTRA_PLATFORM_ACCESS_TOKEN$/,
  )
  assert.equal(readHubConfig({ ...environmentWithoutBuilder, MASTRA_PLATFORM_ACCESS_TOKEN: 'token' }).factory, undefined)
})

test('the Factory refuses to boot where Mastra Code would load .mastracode or .env', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-factory-host-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const cwd = join(root, 'cwd')
  const home = join(root, 'home')
  mkdirSync(cwd)
  mkdirSync(home)
  assert.doesNotThrow(() => assertFactoryHost({ cwd, home }))
  mkdirSync(join(home, '.mastracode'))
  assert.throws(() => assertFactoryHost({ cwd, home }), { message: `FACTORY_HOST_REFUSED:${join(home, '.mastracode')}` })
  rmSync(join(home, '.mastracode'), { recursive: true })
  writeFileSync(join(cwd, '.env'), 'X=1\n')
  assert.throws(() => assertFactoryHost({ cwd, home }), { message: `FACTORY_HOST_REFUSED:${join(cwd, '.env')}` })
})

test('the Factory pool connects as hub_factory with its search_path pinned to factory', async () => {
  const pool = createFactoryPool({ host: '127.0.0.1', port: 1, database: 'unreachable' }, 'unused')
  assert.equal(pool.options.user, 'hub_factory')
  assert.equal(pool.options.options, '-c search_path=factory')
  assert.equal(pool.options.application_name, 'conexus-hub:factory-storage')
  await pool.end()
})

test('prepare() registers the controller as code and lands every table in factory', async (t) => {
  const { admin, connection, onCleanup } = await createEmptyDatabase(t, 'conexus_factory_composition')
  const role = `factory_probe_${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const password = randomUUID()
  await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`)
  onCleanup(() => admin.query(`DROP ROLE IF EXISTS ${role}`))
  const owner = new pg.Client(connection)
  await owner.connect()
  await owner.query(`CREATE SCHEMA factory AUTHORIZATION ${role}`)
  await owner.end()
  onCleanup(async () => {
    const dropper = new pg.Client(connection)
    await dropper.connect()
    await dropper.query('DROP SCHEMA IF EXISTS factory CASCADE')
    await dropper.end()
  })

  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const pool = testPool({ ...connection, user: role, password, options: '-c search_path=factory', max: 4 })
  // A credential a Hub stored before it had a key, through the Factory's plaintext default.
  const beforePool = testPool({ ...connection, user: role, password, options: '-c search_path=factory', max: 1 })
  const before = createFactoryStorage(beforePool)
  const plaintextCredentials = before.registerDomain(new ModelCredentialsStorage())
  await before.init()
  await plaintextCredentials.setCredential({ orgId: 'conexus-installation', userId: null }, 'anthropic', { type: 'api_key', key: 'sk-ant-before-the-key' })
  await beforePool.end()
  const composition = await composeFactory({
    pool,
    github: { appId: '1', clientId: 'client', clientSecret: 'secret', slug: 'conexus-probe', privateKey: privateKey.export({ type: 'pkcs1', format: 'pem' }) },
    stateSecret: 'state-secret-for-the-probe-only-0123456789',
    secretKey: 'a1'.repeat(32),
    publicUrl: 'https://hub.test',
    sandbox: createFactorySandbox({ apiKey: 'unused', templateId: 'conexus:tpl' }),
  })
  onCleanup(() => composition.close())

  assert.deepEqual(Object.keys(composition.mastra.listAgentControllers()), ['code'])
  assert.equal(composition.controllerId, 'code')
  assert.equal(composition.mastra.getAgentController('code'), composition.controller)
  // The run ports list the GitHub integration's tools and read the memory-settings domain prepare() registered.
  assert.equal(typeof createMastraFactoryRunPorts({ composition, orgId: 'conexus-installation', log: () => undefined }).openSession, 'function')

  // Every Factory path that would hand the sandbox a repository token gets the one that opens nothing.
  const sourceControl = composition.github.sourceControlStorage
  const installation = await sourceControl.installations.upsert({ orgId: 'conexus-installation', connectedByUserId: 'conexus-operator', externalId: '163574754', accountName: 'acme-org', accountType: 'Organization', providerMetadata: {} })
  const repository = await sourceControl.repositories.upsert({ orgId: 'conexus-installation', input: { installationId: installation.id, externalId: '700001', slug: 'acme-org/app', defaultBranch: 'main', providerMetadata: {} } })
  assert.deepEqual(await composition.github.versionControl.getRepositoryAccess({ orgId: 'conexus-installation', repositoryId: repository.id }), {
    cloneUrl: 'https://github.com/acme-org/app.git', authorization: { scheme: 'bearer', token: 'conexus-no-credential' },
  })

  const inspector = new pg.Client(connection)
  await inspector.connect()
  onCleanup(() => inspector.end())
  const { rows } = await inspector.query(`
    SELECT n.nspname AS schema, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND pg_get_userbyid(c.relowner) = $1 ORDER BY 1, 2`, [role])
  assert.deepEqual([...new Set(rows.map((row) => row.schema))], ['factory'])
  const tables = rows.map((row) => row.name)
  for (const expected of ['factory_projects', 'source_control_installations', 'source_control_repositories', 'factory_project_source_control_connections', 'factory_project_repositories', 'source_control_sessions', 'mastra_threads', 'mastra_messages']) {
    assert.ok(tables.includes(expected), `${expected} is created in factory`)
  }
  const publicTables = await inspector.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname = 'public'")
  assert.equal(publicTables.rows[0].count, 0)

  // Stored credentials are the Factory's AES-256-GCM envelope, the one stored before the key included,
  // and each reads back as the credential it was.
  const credentials = composition.storage.getDomain('model-credentials')
  await credentials.setCredential({ orgId: 'conexus-installation', userId: 'conexus-operator' }, 'openai', { type: 'api_key', key: 'sk-probe-at-rest' })
  const stored = (await inspector.query('SELECT provider, data::text AS data FROM factory.model_provider_credentials ORDER BY provider')).rows
  assert.deepEqual(stored.map(({ provider, data }) => [provider, data.startsWith('"mastra:factory-secret:v1:'), /sk-|api_key/.test(data)]), [
    ['anthropic', true, false], ['openai', true, false],
  ])
  assert.deepEqual(await credentials.getCredential({ orgId: 'conexus-installation', userId: 'conexus-operator' }, 'openai'), { type: 'api_key', key: 'sk-probe-at-rest' })
  assert.deepEqual(await credentials.getCredential({ orgId: 'conexus-installation', userId: null }, 'anthropic'), { type: 'api_key', key: 'sk-ant-before-the-key' })
  const atRest = (await inspector.query('SELECT convert_to(data::text, \'UTF8\') AS bytes FROM factory.model_provider_credentials')).rows.map(({ bytes }) => bytes)
  assert.equal(atRest.length, 2)
  for (const bytes of atRest) {
    for (const secret of ['sk-probe-at-rest', 'sk-ant-before-the-key']) assert.equal(bytes.includes(Buffer.from(secret)), false, `${secret} is not stored in the clear`)
  }

  // Without the Hub's key the same rows give back no credential: another key is refused, and the
  // Factory's plaintext default hands back only the envelope.
  const readWith = async (encryption) => {
    const readerPool = testPool({ ...connection, user: role, password, options: '-c search_path=factory', max: 1 })
    onCleanup(() => readerPool.end())
    const reader = createFactoryStorage(readerPool)
    const domain = reader.registerDomain(new ModelCredentialsStorage(encryption))
    await reader.init()
    return domain.getCredential({ orgId: 'conexus-installation', userId: 'conexus-operator' }, 'openai')
  }
  await assert.rejects(readWith(createFactorySecretKeyEncryption('b2'.repeat(32))))
  const keyless = await readWith(undefined)
  assert.equal(typeof keyless, 'string')
  assert.ok(keyless.startsWith('mastra:factory-secret:v1:'), keyless)
  assert.equal(keyless.includes('sk-probe-at-rest'), false)
})
