import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import pg from 'pg'
import { RequestContext } from '@mastra/core/request-context'
import { createSessionSetupHook, getSessionSandbox } from '@mastra/factory/sandbox/session-sandbox'
import { createEmptyDatabase, testPool } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const built = hubModuleUrl
const { ConexusFactoryE2BSandbox, assertFactoryHost, composeFactory, createFactoryPool, createFactorySandbox, createFactoryStorage, createFactorySecretKeyEncryption, requireObservabilityStore, SANDBOX_CREDENTIAL, tokenEnvironment } = await import(built('builder/factory.js'))
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
  CONEXUS_FACTORY_SECRET_KEY_FILE: '/secrets/installation-secret-key',
  CONEXUS_DB_PROJECT_COMMAND_PASSWORD_FILE: '/secrets/project-command',
  CONEXUS_DB_PROJECT_READ_PASSWORD_FILE: '/secrets/project-read',
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
  CONEXUS_DB_FACTORY_PASSWORD_FILE: '/secrets/factory-db',
}

test('the sandbox never lets GH_TOKEN or GITHUB_TOKEN into its environment', () => {
  const sandbox = new ConexusFactoryE2BSandbox({ id: 'probe', timeout: 900_000, env: { GH_TOKEN: 'ghs_constructor', GITHUB_TOKEN: 'ghs_constructor', KEEP: '1' } })
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
  const sandbox = new ConexusFactoryE2BSandbox({ id: 'conexus-factory-row', template: 'conexus:template', apiKey: 'e2b-test', timeout: 900_000 })
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

test('the Factory sandbox is created closed to public inbound traffic', async () => {
  const sandbox = createFactorySandbox({ apiKey: 'e2b-key', templateId: 'conexus:tpl' })({ sessionId: 'row-1' })
  let captured = null
  sandbox.findExistingSandbox = async () => undefined
  sandbox.createSdkSandbox = async (templateId, opts) => {
    captured = { templateId, opts }
    return fakeVm('vm-fresh')
  }
  await sandbox.start()
  assert.deepEqual({ templateId: captured.templateId, network: captured.opts.network }, {
    templateId: 'conexus:tpl', network: { allowPublicTraffic: false },
  })
})

test('holdOpen extends the deadline now and every third of the budget until released', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const sandbox = createFactorySandbox({ apiKey: 'e2b-key', templateId: 'conexus:tpl', timeoutMs: 600_000 })({ sessionId: 'row-hold' })
  const setTimeoutCalls = []
  const vm = fakeVm('vm-fresh')
  vm.setTimeout = async (ms) => { setTimeoutCalls.push(ms) }
  sandbox.findExistingSandbox = async () => undefined
  sandbox.createSdkSandbox = async () => vm
  await sandbox.start()
  const release = await sandbox.holdOpen(() => {})
  assert.deepEqual(setTimeoutCalls, [600_000])
  t.mock.timers.tick(200_000)
  t.mock.timers.tick(200_000)
  assert.deepEqual(setTimeoutCalls, [600_000, 600_000, 600_000])
  release()
  t.mock.timers.tick(600_000)
  assert.deepEqual(setTimeoutCalls, [600_000, 600_000, 600_000])
})

test('holdOpen reports a failed extension to onLapse, and refuses when the first extension fails', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const sandbox = createFactorySandbox({ apiKey: 'e2b-key', templateId: 'conexus:tpl', timeoutMs: 600_000 })({ sessionId: 'row-hold-lapse' })
  const vm = fakeVm('vm-fresh')
  let calls = 0
  vm.setTimeout = async () => { calls += 1; if (calls >= 2) throw new Error('E2B_TIMEOUT_REFUSED') }
  sandbox.findExistingSandbox = async () => undefined
  sandbox.createSdkSandbox = async () => vm
  await sandbox.start()
  const lapses = []
  await sandbox.holdOpen((error) => { lapses.push(error) })
  t.mock.timers.tick(200_000)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(lapses.length, 1)
  assert.equal(lapses[0].message, 'E2B_TIMEOUT_REFUSED')

  const failingFirst = createFactorySandbox({ apiKey: 'e2b-key', templateId: 'conexus:tpl', timeoutMs: 600_000 })({ sessionId: 'row-hold-lapse-first' })
  const firstVm = fakeVm('vm-fresh-2')
  firstVm.setTimeout = async () => { throw new Error('E2B_TIMEOUT_REFUSED') }
  failingFirst.findExistingSandbox = async () => undefined
  failingFirst.createSdkSandbox = async () => firstVm
  await failingFirst.start()
  await assert.rejects(failingFirst.holdOpen(() => {}), { message: 'E2B_TIMEOUT_REFUSED' })
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
  writeFileSync(systemConfig, `[url "${bundle}"]\n\tinsteadOf = https://github.com/acme-org/app.git\n`)
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
  const sandbox = new ConexusFactoryE2BSandbox({ id: 'conexus-factory-row', template: 'conexus:template', apiKey: 'e2b-test', timeout: 900_000 }, {
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
    "git config --system --replace-all 'url./var/lib/conexus-git/app.seed.bundle.insteadOf' 'https://github.com/acme-org/app.git'",
  ].join(' && '))
  assert.equal(seed.options.envs.GIT_CONFIG_VALUE_0, `AUTHORIZATION: basic ${Buffer.from('x-access-token:ghs_seed').toString('base64')}`)
  assert.deepEqual(order, [['factory', 'created']])
  assert.equal(created.runs.indexOf(seed), 0, 'the seed is the first command of the start')
})

test('the seed points the agent\'s clone URL at its bundle, and root\'s token-bearing git still reaches GitHub', async (t) => {
  const created = fakeVm('vm-fresh')
  const sandbox = new ConexusFactoryE2BSandbox({ id: 'conexus-factory-row', template: 'conexus:template', apiKey: 'e2b-test', timeout: 900_000 }, {
    repositorySlug: 'acme-org/app', read: async () => ({ token: 'ghs_seed', defaultBranch: 'main' }),
  })
  sandbox.findExistingSandbox = async () => undefined
  sandbox.createSdkSandbox = async () => created
  sandbox.setOnStart((previous) => async (args) => { await previous?.(args) })
  await sandbox.start()
  const seed = created.runs.find(({ options }) => options?.user === 'root')
  const root = mkdtempSync(join(tmpdir(), 'conexus-factory-rule-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const system = { GIT_CONFIG_SYSTEM: join(root, 'gitconfig'), GIT_CONFIG_GLOBAL: '/dev/null' }
  const rule = seed.script.split(' && ').at(-1)
  assert.equal(spawnSync('sh', ['-c', rule], { env: { ...process.env, ...system, ...seed.options.envs } }).status, 0)
  const resolve = (env) => spawnSync('git', ['ls-remote', '--get-url', 'https://github.com/acme-org/app.git'], { encoding: 'utf8', env: { ...process.env, ...system, ...env } }).stdout.trim()
  assert.equal(resolve({}), '/var/lib/conexus-git/app.seed.bundle')
  assert.equal(resolve(tokenEnvironment('ghs_write')), 'https://github.com/acme-org/app.git')
})

test('the agent\'s commands start in the Project checkout, while the Factory still checks out under /workspace', async () => {
  const sessionId = 'row-cwd'
  const entry = getSessionSandbox(sessionId, 'acme/app', () => createFactorySandbox({
    apiKey: 'e2b-key', templateId: 'conexus:tpl', readCheckout: async () => ({ token: 'ghs_seed', defaultBranch: 'main' }),
  })({ sessionId, repoFullName: 'acme/app' }))
  const sandbox = entry.sandbox
  const vms = [fakeVm('vm-fresh-1'), fakeVm('vm-fresh-2')]
  sandbox.findExistingSandbox = async () => undefined
  sandbox.createSdkSandbox = async () => vms.shift()
  const seen = []
  sandbox.setOnStart(() => createSessionSetupHook(async (hooked, workdir) => {
    seen.push({ factoryWorkdir: workdir, cwdDuringFactoryHook: hooked.workingDirectory })
  }, sessionId, 'acme/app'))
  await sandbox.start()
  const firstVm = sandbox.e2b
  await sandbox.executeCommand('pwd')
  const agentCwd = firstVm.runs.find(({ script }) => script === 'pwd').options.cwd
  sandbox.handleSandboxTimeout()
  await sandbox.start()
  assert.deepEqual({ seen, agentCwd, cwdAfterRestart: sandbox.workingDirectory }, {
    seen: [
      { factoryWorkdir: '/workspace/app', cwdDuringFactoryHook: '/workspace' },
      { factoryWorkdir: '/workspace/app', cwdDuringFactoryHook: '/workspace' },
    ],
    agentCwd: '/workspace/app',
    cwdAfterRestart: '/workspace/app',
  })
})


const { CONEXUS_DB_BUILDER_INGRESS_PASSWORD_FILE: _ingress, CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE: _executor, CONEXUS_BUILDER_E2B_API_KEY_FILE: _e2bKey, CONEXUS_BUILDER_E2B_TEMPLATE_ID: _e2bTemplate, ...environmentWithoutBuilder } = baseEnvironment

test('with no Builder and no Factory variable the Hub boots as it did before, with the installation credential key', () => {
  assert.equal(readHubConfig(environmentWithoutBuilder).factory, undefined)
  assert.deepEqual(readHubConfig(environmentWithoutBuilder).secretKey, { file: '/secrets/installation-secret-key', previousFiles: [] })
  const { CONEXUS_FACTORY_SECRET_KEY_FILE: _key, ...keyless } = environmentWithoutBuilder
  assert.throws(() => readHubConfig(keyless), /^Error: MISSING_CONFIG_CONEXUS_FACTORY_SECRET_KEY_FILE$/, 'every Hub seals its sessions\' refresh tokens')
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
    databasePasswordFile: '/secrets/factory-db',
  })
  const { CONEXUS_FACTORY_STATE_SECRET_FILE: _omitted, ...partial } = factoryEnvironment
  assert.throws(() => readHubConfig({ ...baseEnvironment, ...partial }), /^Error: MISSING_CONFIG_CONEXUS_FACTORY_STATE_SECRET_FILE$/)
})

test('Google AI Pro needs both CLIProxyAPI variables, an absolute path and a sha256, and the Factory', () => {
  const sha256 = 'ab'.repeat(32)
  const complete = { ...baseEnvironment, ...factoryEnvironment }
  assert.equal(readHubConfig(complete).googleAiPro, undefined)
  assert.deepEqual(readHubConfig({ ...complete, CONEXUS_CLIPROXY_BIN: '/opt/cliproxy/cli-proxy-api', CONEXUS_CLIPROXY_SHA256: sha256 }).googleAiPro, { binary: '/opt/cliproxy/cli-proxy-api', sha256 })
  assert.throws(() => readHubConfig({ ...complete, CONEXUS_CLIPROXY_BIN: '/opt/cliproxy/cli-proxy-api' }), /^Error: MISSING_CONFIG_CONEXUS_CLIPROXY_SHA256$/)
  assert.throws(() => readHubConfig({ ...complete, CONEXUS_CLIPROXY_SHA256: sha256 }), /^Error: MISSING_CONFIG_CONEXUS_CLIPROXY_BIN$/)
  assert.throws(() => readHubConfig({ ...complete, CONEXUS_CLIPROXY_BIN: 'cli-proxy-api', CONEXUS_CLIPROXY_SHA256: sha256 }), /^Error: INVALID_CONFIG_CONEXUS_CLIPROXY_BIN$/)
  assert.throws(() => readHubConfig({ ...complete, CONEXUS_CLIPROXY_BIN: '/opt/cli-proxy-api', CONEXUS_CLIPROXY_SHA256: 'AB'.repeat(32) }), /^Error: INVALID_CONFIG_CONEXUS_CLIPROXY_SHA256$/)
  assert.throws(() => readHubConfig({ ...environmentWithoutBuilder, CONEXUS_CLIPROXY_BIN: '/opt/cli-proxy-api', CONEXUS_CLIPROXY_SHA256: sha256 }), /^Error: GOOGLE_AI_PRO_FACTORY_RUNTIME_REQUIRED$/)
})

test('a secret key that is not 64 hex characters is refused before the Factory stores anything', () => {
  for (const key of ['', 'f'.repeat(63), 'F'.repeat(64), 'g'.repeat(64), 'f'.repeat(65)]) {
    assert.throws(() => createFactorySecretKeyEncryption(key), /^Error: FACTORY_SECRET_KEY_REFUSED$/)
  }
})

test('after a key rotation a secret sealed under a previous key still opens, and only through the keys the installation names', async () => {
  const { createSecretEnvelope } = await import(built('platform/secrets.js'))
  const previous = 'c3'.repeat(32)
  const current = 'd4'.repeat(32)
  const sealedBefore = await createSecretEnvelope(previous).seal('refresh-before-rotation')
  assert.equal(await createSecretEnvelope(current, [previous]).open(sealedBefore), 'refresh-before-rotation')
  await assert.rejects(createSecretEnvelope(current).open(sealedBefore))
  const credential = await createFactorySecretKeyEncryption(previous).encrypt({ apiKey: 'sk-before-rotation' })
  assert.deepEqual(await createFactorySecretKeyEncryption(current, [previous]).decrypt(credential), { value: { apiKey: 'sk-before-rotation' }, needsReencryption: true })
})

test('previous credential keys are named by absolute paths, separated by commas', () => {
  const complete = { ...baseEnvironment, ...factoryEnvironment }
  assert.deepEqual(readHubConfig(complete).secretKey.previousFiles, [])
  assert.deepEqual(readHubConfig({ ...complete, CONEXUS_FACTORY_PREVIOUS_SECRET_KEY_FILES: '/secrets/key-2025,/secrets/key-2026' }).secretKey.previousFiles,
    ['/secrets/key-2025', '/secrets/key-2026'])
  assert.throws(() => readHubConfig({ ...complete, CONEXUS_FACTORY_PREVIOUS_SECRET_KEY_FILES: 'key-2025' }), /^Error: INVALID_CONFIG_CONEXUS_FACTORY_PREVIOUS_SECRET_KEY_FILES$/)
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

test('requireObservabilityStore resolves the store the Factory storage carries, and refuses to compose without one', async () => {
  await assert.rejects(requireObservabilityStore({ getStore: async () => undefined }), /^Error: FACTORY_OBSERVABILITY_STORE_UNAVAILABLE$/)
  const store = { listTraces: async () => ({ spans: [] }) }
  assert.equal(await requireObservabilityStore({ getStore: async (name) => (name === 'observability' ? store : undefined) }), store)
})

test('the Factory pool connects as hub_factory with its search_path pinned to factory', async () => {
  const pool = createFactoryPool({ host: '127.0.0.1', port: 1, database: 'unreachable' }, 'unused')
  assert.equal(pool.options.max, 20)
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
  // The placeholder is the sandbox's alone: an installation token is still a real one from GitHub.
  const original = globalThis.fetch
  const asked = []
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    asked.push(`${init?.method ?? input.method ?? 'GET'} ${url}`)
    return new Response(JSON.stringify({ token: 'ghs_installation_token', expires_at: '2099-01-01T00:00:00Z', permissions: {}, repository_selection: 'all' }), { status: 201, headers: { 'content-type': 'application/json' } })
  }
  try {
    assert.equal(await composition.github.mintInstallationToken(163574754), 'ghs_installation_token')
  } finally {
    globalThis.fetch = original
  }
  assert.deepEqual(asked, ['POST https://api.github.com/app/installations/163574754/access_tokens'])

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

test('composeFactory routes the observability domain back onto the Factory\'s own Postgres store: spans persist and 30-day retention prunes only stale spans, never memory', async (t) => {
  const { admin, connection, onCleanup } = await createEmptyDatabase(t, 'conexus_factory_tracing')
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
  const composition = await composeFactory({
    pool,
    github: { appId: '1', clientId: 'client', clientSecret: 'secret', slug: 'conexus-probe', privateKey: privateKey.export({ type: 'pkcs1', format: 'pem' }) },
    stateSecret: 'state-secret-for-the-probe-only-0123456789',
    secretKey: 'a1'.repeat(32),
    publicUrl: 'https://hub.test',
    sandbox: createFactorySandbox({ apiKey: 'unused', templateId: 'conexus:tpl' }),
  })
  onCleanup(() => composition.close())

  // The bug this PR fixes: Code SDK forces the observability domain of the storage it hands
  // Mastra to `false` (mastra-capabilities-study.md §4.1), so this used to resolve undefined
  // and every span the run produced was silently dropped.
  const observabilityStore = await composition.mastra.getStorage()?.getStore('observability')
  assert.ok(observabilityStore, 'the composed Mastra carries a real observability store')

  const traceId = randomUUID().replaceAll('-', '')
  const rootSpanId = randomUUID().replaceAll('-', '').slice(0, 16)
  const staleSpanId = randomUUID().replaceAll('-', '').slice(0, 16)
  const now = new Date()
  const stale = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000)
  await observabilityStore.batchCreateSpans({
    records: [
      {
        traceId, spanId: rootSpanId, name: 'agent run', spanType: 'agent_run', isEvent: false, startedAt: now, endedAt: now,
        metadata: { conexusBuilderProjectId: 'project-1', conexusBuilderRunId: 'run-1' },
      },
      {
        traceId, spanId: staleSpanId, parentSpanId: rootSpanId, name: 'old model call', spanType: 'model_generation', isEvent: false,
        startedAt: stale, endedAt: stale, attributes: { model: 'anthropic/claude', usage: { inputTokens: 10, outputTokens: 5 } },
      },
    ],
  })

  // Persistence, read back through the exact metadata filter the Hub's trace route uses.
  const found = await observabilityStore.listTraces({
    filters: { metadata: { conexusBuilderProjectId: 'project-1', conexusBuilderRunId: 'run-1' } },
    pagination: { page: 0, perPage: 1 },
  })
  assert.equal(found.spans.at(0)?.traceId, traceId)
  const trace = await observabilityStore.getTrace({ traceId })
  assert.deepEqual(trace.spans.map((span) => span.spanId).sort(), [rootSpanId, staleSpanId].sort())

  // A message must survive retention: Builder evidence is rebuilt from mastra_messages, and the
  // 30-day policy this PR declares names only observability.spans (factory.ts, OBSERVABILITY_SPAN_RETENTION).
  const memory = await composition.mastra.getStorage()?.getStore('memory')
  await memory.saveThread({ thread: { id: 'thread-1', resourceId: 'thread-1', title: 'probe thread', createdAt: now, updatedAt: now } })
  const messageId = randomUUID()
  await memory.saveMessages({
    messages: [{ id: messageId, role: 'user', createdAt: now, threadId: 'thread-1', resourceId: 'thread-1', content: { format: 2, parts: [{ type: 'text', text: 'hi' }] } }],
  })

  // Retention: prune() (wired on a schedule in module.ts) removes only the stale span.
  const results = await composition.storage.getMastraStorage().prune()
  assert.deepEqual(results.map((result) => ({ domain: result.domain, table: result.table, deleted: result.deleted })), [
    { domain: 'observability', table: 'mastra_ai_spans', deleted: 1 },
  ])

  // Pruning lazily creates the retention anchor index on the configured table
  const indexCheck = await pool.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'factory' AND tablename = 'mastra_ai_spans' AND indexname = 'factory_mastra_spans_retention_idx'
  `)
  assert.equal(indexCheck.rows.length, 1, 'mastra retention anchor index exists in factory schema')

  const survivors = await observabilityStore.getTrace({ traceId })
  assert.deepEqual(survivors.spans.map((span) => span.spanId), [rootSpanId])
  const messages = await memory.listMessagesById({ messageIds: [messageId] })
  assert.equal(messages.messages.length, 1)
})

test('scheduleRetentionPrune prunes immediately at boot, logs deleted rows and errors, and can be ticked and closed', async () => {
  const { scheduleRetentionPrune } = await import(built('builder/module.js'))
  const logs = []
  let pruneCalls = 0
  let pruneResult = [{ domain: 'observability', table: 'mastra_ai_spans', deleted: 5, done: true }]

  const fakeReady = Promise.resolve({
    storage: {
      getMastraStorage: () => ({
        prune: async () => {
          pruneCalls++
          return pruneResult
        },
      }),
    },
  })

  const schedule = scheduleRetentionPrune(fakeReady, (line) => logs.push(line), 60_000)
  // Yield microtask so the immediate boot tick runs
  await new Promise((r) => setImmediate(r))

  assert.equal(pruneCalls, 1)
  assert.deepEqual(logs, ['BUILDER_RETENTION_PRUNED:observability.mastra_ai_spans:5'])

  // Manual tick
  pruneResult = [
    { domain: 'observability', table: 'mastra_ai_spans', deleted: 2, done: false },
    { domain: 'observability', table: 'other_table', deleted: 0, done: true },
  ]
  await schedule.tick()
  assert.equal(pruneCalls, 2)
  assert.deepEqual(logs, [
    'BUILDER_RETENTION_PRUNED:observability.mastra_ai_spans:5',
    'BUILDER_RETENTION_PRUNED:observability.mastra_ai_spans:2',
    'BUILDER_RETENTION_PRUNE_INCOMPLETE:observability.mastra_ai_spans',
    'BUILDER_RETENTION_PRUNED:observability.other_table:0',
  ])

  // Failed prune is caught and logged
  const failingReady = Promise.resolve({
    storage: {
      getMastraStorage: () => ({
        prune: async () => { throw new Error('DB_DISCONNECTED') },
      }),
    },
  })
  const failLogs = []
  const failingSchedule = scheduleRetentionPrune(failingReady, (line) => failLogs.push(line), 60_000)
  await new Promise((r) => setImmediate(r))
  assert.deepEqual(failLogs, ['BUILDER_RETENTION_PRUNE_FAILED:DB_DISCONNECTED'])

  schedule.close()
  failingSchedule.close()
})

test('compactProcessorRunPayloads condenses PROCESSOR_RUN input and output message arrays to messageCount', async () => {
  const { compactProcessorRunPayloads } = await import(built('builder/module.js'))
  const { SpanType } = await import('@mastra/core/observability')

  assert.equal(compactProcessorRunPayloads.name, 'builder-compact-processor-run-payloads')

  // PROCESSOR_RUN span with arrays
  const processorSpan = {
    type: SpanType.PROCESSOR_RUN,
    input: [{ id: '1', role: 'user', content: 'hello' }, { id: '2', role: 'assistant', content: 'hi' }],
    output: [{ id: '3', role: 'user', content: 'more' }],
  }
  const processed = compactProcessorRunPayloads.process(processorSpan)
  assert.deepEqual(processed.input, { messageCount: 2 })
  assert.deepEqual(processed.output, { messageCount: 1 })

  // Non-array input/output on PROCESSOR_RUN are preserved
  const nonArraySpan = {
    type: SpanType.PROCESSOR_RUN,
    input: { someOtherField: 123 },
    output: 'done',
  }
  const processedNonArray = compactProcessorRunPayloads.process(nonArraySpan)
  assert.deepEqual(processedNonArray.input, { someOtherField: 123 })
  assert.equal(processedNonArray.output, 'done')

  // Other span types are not touched
  const agentSpan = {
    type: SpanType.AGENT_RUN,
    input: [{ id: '1', content: 'test' }],
    output: [{ id: '2', content: 'result' }],
  }
  const processedAgent = compactProcessorRunPayloads.process(agentSpan)
  assert.deepEqual(processedAgent.input, [{ id: '1', content: 'test' }])
  assert.deepEqual(processedAgent.output, [{ id: '2', content: 'result' }])

  // null or undefined spans pass through safely
  assert.equal(compactProcessorRunPayloads.process(undefined), undefined)
})

test('compactProcessorRunPayloads deterministically compacts processor_run span bytes', async () => {
  const { compactProcessorRunPayloads } = await import(built('builder/module.js'))
  const { SpanType } = await import('@mastra/core/observability')

  // Synthetic Builder turn with 25 conversation messages of typical turn context size (~1.5 KB each)
  const syntheticMessages = Array.from({ length: 25 }, (_, i) => ({
    id: `msg-${i}`,
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Builder prompt turn context chunk ${i}: `.padEnd(1500, 'x'),
  }))

  const rawProcessorSpan = {
    type: SpanType.PROCESSOR_RUN,
    input: syntheticMessages,
    output: syntheticMessages.slice(0, 10),
  }

  const rawBytes = Buffer.byteLength(JSON.stringify(rawProcessorSpan.input)) + Buffer.byteLength(JSON.stringify(rawProcessorSpan.output))

  // Clone before passing to span processor
  const spanToProcess = {
    type: SpanType.PROCESSOR_RUN,
    input: [...syntheticMessages],
    output: syntheticMessages.slice(0, 10),
  }

  const processed = compactProcessorRunPayloads.process(spanToProcess)
  const compactedBytes = Buffer.byteLength(JSON.stringify(processed.input)) + Buffer.byteLength(JSON.stringify(processed.output))

  // Assert deterministic reduction: raw is ~54 KB, compacted is exactly 38 bytes (>99.9% reduction)
  assert.ok(rawBytes > 50_000, `expected raw bytes > 50000, got ${rawBytes}`)
  assert.deepEqual(processed.input, { messageCount: 25 })
  assert.deepEqual(processed.output, { messageCount: 10 })
  assert.equal(compactedBytes, 38)
  assert.ok(compactedBytes / rawBytes < 0.001, 'compacted payload must be less than 0.1% of raw payload')
})


test('composeFactory gives connector_fetch to an agent step whose request context carries a Builder run, and to no other', async (t) => {
  const { createConnectorFetchIntegration, openBuilderRun } = await import(built('connectors/builder-tool.js'))
  const { admin, connection, onCleanup } = await createEmptyDatabase(t, 'conexus_factory_connector_tool')
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
  const broker = { fetch: async () => ({ ok: false, code: 'NOT_GRANTED' }), describe: async () => ({ integrator: null, service: null }) }
  const composition = await composeFactory({
    pool,
    github: { appId: '1', clientId: 'client', clientSecret: 'secret', slug: 'conexus-probe', privateKey: privateKey.export({ type: 'pkcs1', format: 'pem' }) },
    stateSecret: 'state-secret-for-the-probe-only-0123456789',
    secretKey: 'a1'.repeat(32),
    publicUrl: 'https://hub.test',
    sandbox: createFactorySandbox({ apiKey: 'unused', templateId: 'conexus:tpl' }),
    integrations: [createConnectorFetchIntegration(broker)],
  })
  onCleanup(() => composition.close())

  const [agent] = Object.values(composition.mastra.listAgents())
  const toolsFor = async (bind) => {
    const requestContext = new RequestContext()
    bind?.(requestContext)
    return Object.keys(await agent.listTools({ requestContext })).filter((name) => name === 'connector_fetch')
  }
  const run = await openBuilderRun({ brief: async () => '', projectId: '22222222-2222-4222-8222-222222222222', builderRunId: '11111111-1111-4111-8111-111111111111' })
  assert.deepEqual([await toolsFor(run.bind), await toolsFor()], [['connector_fetch'], []])
})
