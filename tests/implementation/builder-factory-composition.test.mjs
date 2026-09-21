import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import pg from 'pg'
import { prepareAgentControllerMount } from '@mastra/code-sdk'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { createEmptyDatabase } from './hub-database.mjs'

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
const { ConexusFactoryE2BSandbox, PROCESS_BASELINE_SCRIPT, assertFactoryHost, composeFactory, createFactoryPool, createFactorySandbox, scrubCheckoutCredentials } = await import(built('builder/factory.js'))
const { createBuilderMountOptions } = await import(built('builder/module.js'))
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
  CONEXUS_DB_FACTORY_PASSWORD_FILE: '/secrets/factory-db',
}

test('the sandbox never lets GH_TOKEN or GITHUB_TOKEN into its environment', () => {
  const sandbox = new ConexusFactoryE2BSandbox({ id: 'probe', env: { GH_TOKEN: 'ghs_constructor', GITHUB_TOKEN: 'ghs_constructor', KEEP: '1' } })
  assert.deepEqual(sandbox.getEnv(), { KEEP: '1' })
  sandbox.setEnv((env) => ({ ...env, GH_TOKEN: 'ghs_injected', GITHUB_TOKEN: 'ghs_injected', OTHER: '2' }))
  assert.deepEqual(sandbox.getEnv(), { KEEP: '1', OTHER: '2' })
})

const fakeVm = (sandboxId, { baseline = '1:5\n321:40\n', baselineExit = 0 } = {}) => {
  const vm = { sandboxId, killed: false, runs: [] }
  vm.kill = async () => { vm.killed = true }
  vm.commands = {
    run: async (script, options) => {
      vm.runs.push({ script, options })
      if (script === PROCESS_BASELINE_SCRIPT) return { exitCode: baselineExit, stdout: baseline, stderr: '' }
      return { exitCode: 0, stdout: '', stderr: '' }
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

test('the Hub lists the VM processes as root the moment it creates the VM, before the Factory start hook', async () => {
  const created = fakeVm('vm-fresh')
  const sandbox = offlineSandbox({ existing: undefined, created })
  let seenByStartHook
  sandbox.setOnStart(() => async () => { seenByStartHook = sandbox.processBaseline })
  await sandbox.start()
  assert.deepEqual(seenByStartHook && [seenByStartHook.sandboxId, [...seenByStartHook.processes]], ['vm-fresh', ['1:5', '321:40']])
  assert.deepEqual(created.runs.map(({ options }) => options), [{ user: 'root', cwd: '/', envs: {}, timeoutMs: 30_000 }])
})

test('the reap spares exactly the baseline, by pid and start time, and runs as root with an empty environment', async () => {
  const created = fakeVm('vm-fresh')
  const sandbox = offlineSandbox({ existing: undefined, created })
  await sandbox.start()
  const reaped = await sandbox.reapAgentProcesses()
  assert.equal(reaped.exitCode, 0)
  const reap = created.runs.at(-1)
  assert.deepEqual(reap.options, { user: 'root', cwd: '/', envs: {}, timeoutMs: 30_000 })
  assert.match(reap.script, /^base=" 1:5 321:40 "$/m)
  assert.match(reap.script, /kill -9 "\$pid"/)
})

test('a VM found by id is killed, never adopted, and a fresh one is created with its own baseline', async () => {
  const existing = fakeVm('vm-left-by-a-previous-hub')
  const created = fakeVm('vm-fresh', { baseline: '1:5\n400:77\n' })
  const sandbox = offlineSandbox({ existing, created })
  await sandbox.start()
  assert.equal(existing.killed, true)
  assert.deepEqual(existing.runs, [])
  assert.equal(sandbox.sandboxId, 'vm-fresh')
  assert.deepEqual([...sandbox.processBaseline.processes], ['1:5', '400:77'])
})

test('without a baseline for the live VM the reap refuses and runs nothing', async () => {
  const sandbox = offlineSandbox({ existing: undefined, created: fakeVm('vm-fresh') })
  const refused = await sandbox.reapAgentProcesses()
  assert.equal(refused.exitCode, 3)
  const failing = fakeVm('vm-unlistable', { baseline: '' })
  await assert.rejects(offlineSandbox({ existing: undefined, created: failing }).start(), /BUILDER_SANDBOX_BASELINE_FAILED/)
  assert.equal(failing.runs.length, 1)
})

test('the Factory sandbox callback builds one E2B sandbox per session row in /workspace', () => {
  const sandbox = createFactorySandbox({ apiKey: 'e2b-key', templateId: 'conexus:tpl' })({ sessionId: 'row-1', repoFullName: 'acme/app' })
  assert.ok(sandbox instanceof ConexusFactoryE2BSandbox)
  assert.equal(sandbox.id, 'conexus-factory-row-1')
  assert.equal(sandbox.workingDirectory, '/workspace')
  assert.deepEqual(sandbox.getEnv(), {})
})

const localShellSandbox = {
  executeCommand: async (command, args = []) => {
    const result = spawnSync(command, args, { encoding: 'utf8' })
    return { exitCode: result.status ?? 1, success: result.status === 0, stdout: result.stdout, stderr: result.stderr }
  },
}
const git = (cwd, ...args) => {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}

test('after the Factory start hook the Hub leaves no GitHub token in the checkout', async (t) => {
  const workdir = mkdtempSync(join(tmpdir(), 'conexus-factory-checkout-'))
  t.after(() => rmSync(workdir, { recursive: true, force: true }))
  git(workdir, 'init', '--quiet')
  git(workdir, 'remote', 'add', 'origin', 'https://x-access-token:ghs_leaked@github.com/acme-org/app.git')
  git(workdir, 'config', 'credential.helper', '!gh auth git-credential')

  await scrubCheckoutCredentials(localShellSandbox, workdir, 'acme-org/app')

  assert.equal(git(workdir, 'remote', 'get-url', 'origin'), 'https://github.com/acme-org/app.git')
  assert.equal(spawnSync('git', ['-C', workdir, 'config', '--get', 'credential.helper']).status, 1)
  assert.doesNotMatch(readFileSync(join(workdir, '.git/config'), 'utf8'), /x-access-token|ghs_/)
})

test('a token left anywhere else in .git refuses the sandbox', async (t) => {
  const workdir = mkdtempSync(join(tmpdir(), 'conexus-factory-checkout-'))
  t.after(() => rmSync(workdir, { recursive: true, force: true }))
  git(workdir, 'init', '--quiet')
  git(workdir, 'remote', 'add', 'origin', 'https://github.com/acme-org/app.git')
  writeFileSync(join(workdir, '.git/FETCH_HEAD'), "abc\t\tbranch 'main' of https://x-access-token:ghs_leaked@github.com/acme-org/app\n")
  await assert.rejects(scrubCheckoutCredentials(localShellSandbox, workdir, 'acme-org/app'), { message: 'FACTORY_CHECKOUT_CREDENTIAL_REFUSED' })
  await assert.rejects(scrubCheckoutCredentials(localShellSandbox, workdir, "acme-org/app'; rm -rf /"), { message: 'FACTORY_CHECKOUT_REFUSED' })
})

test('with no Factory variable the Hub boots as it did before', () => {
  assert.equal(readHubConfig(baseEnvironment).factory, undefined)
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

test('a Hub composing the Factory refuses Mastra Platform credentials', () => {
  assert.throws(
    () => readHubConfig({ ...baseEnvironment, ...factoryEnvironment, MASTRA_PLATFORM_ACCESS_TOKEN: 'token' }),
    /^Error: FACTORY_REFUSES_CONFIG_MASTRA_PLATFORM_ACCESS_TOKEN$/,
  )
  assert.equal(readHubConfig({ ...baseEnvironment, MASTRA_PLATFORM_ACCESS_TOKEN: 'token' }).factory, undefined)
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

test('prepare() registers the controller as code, lands every table in factory, and leaves the legacy model list alone', async (t) => {
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

  const legacyRoot = mkdtempSync(join(tmpdir(), 'conexus-factory-legacy-'))
  t.after(() => rmSync(legacyRoot, { recursive: true, force: true }))
  const legacyStorage = new LibSQLStore({ id: 'legacy-probe', url: `file:${join(legacyRoot, 'session.db')}` })
  const legacy = await prepareAgentControllerMount(createBuilderMountOptions({
    storage: legacyStorage, memory: new Memory({ storage: legacyStorage }), storageRoot: legacyRoot,
  }))
  await legacy.finalize()
  onCleanup(async () => { await legacy.base.controller.destroy(); await legacyStorage.close() })
  const legacyModelsBefore = await legacy.base.controller.listAvailableModels()

  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const pool = new pg.Pool({ ...connection, user: role, password, options: '-c search_path=factory', max: 4 })
  const composition = await composeFactory({
    pool,
    github: { appId: '1', clientId: 'client', clientSecret: 'secret', slug: 'conexus-probe', privateKey: privateKey.export({ type: 'pkcs1', format: 'pem' }) },
    stateSecret: 'state-secret-for-the-probe-only-0123456789',
    publicUrl: 'https://hub.test',
    sandbox: createFactorySandbox({ apiKey: 'unused', templateId: 'conexus:tpl' }),
  })
  onCleanup(() => composition.close())

  assert.deepEqual(Object.keys(composition.mastra.listAgentControllers()), ['code'])
  assert.equal(composition.mastra.getAgentController('code'), composition.controller)
  assert.deepEqual(await legacy.base.controller.listAvailableModels(), legacyModelsBefore)

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
})
