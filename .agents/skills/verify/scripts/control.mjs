#!/usr/bin/env node
// Launches, inspects, drives and tears down one isolated Conexus instance for verification: its own
// PostgreSQL and Keycloak containers, its own Hub built from this checkout, and its own headless
// Chromium. See ../SKILL.md for the commands and ../features/ for what to drive. Imported by
// tests/live, which reuses launch, signIn, query and cleanup instead of driving a second way.
import { execFileSync, spawn } from 'node:child_process'
import { createHash, randomBytes, randomUUID, X509Certificate } from 'node:crypto'
import { appendFileSync, chmodSync, cpSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request as httpsRequest } from 'node:https'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const SKILL_DIR = resolve(import.meta.dirname, '..')
const REPO = resolve(SKILL_DIR, '../../..')
const STATE_ROOT = process.env.CONEXUS_VERIFY_STATE ?? join(homedir(), '.cache/conexus-verify')
const EVIDENCE_ROOT = process.env.CONEXUS_VERIFY_EVIDENCE ?? join(homedir(), '.cache/conexus-verify/evidence')
const POSTGRES_IMAGE = 'postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f'
const KEYCLOAK_IMAGE = 'quay.io/keycloak/keycloak@sha256:c2a17fe407e892196d0b7cf9cef54e60952d6c372a9205f661a9efa0911463b0'
const DATABASE = 'conexus_verify'
const HUB_HOST = 'hub.conexus.localhost'
// The Builder opens its E2B sandbox before the model's first token. Pointing the SDK at a closed
// loopback port makes every E2B call fail on this machine, so a verification run can never create,
// resume or bill a real sandbox.
const E2B_CLOSED = { E2B_API_URL: 'http://127.0.0.1:9', E2B_DOMAIN: 'e2b-disabled.invalid' }
const PERSON = { username: 'verify-operator', firstName: 'Verify', lastName: 'Operator', email: 'verify-operator@conexus.test' }
const ROLE_FILES = {
  CONEXUS_DB_PASSWORD_FILE: 'hub_runtime',
  CONEXUS_DB_FACTORY_PASSWORD_FILE: 'hub_factory',
}

const fail = (message) => { throw new Error(message) }
// A probe throws a fatal error when waiting longer cannot help, such as a process that exited.
const fatal = (message) => { throw Object.assign(new Error(message), { fatal: true }) }
const today = () => new Date().toLocaleDateString('sv')
const writeSecret = (path, value) => { writeFileSync(path, `${value}\n`, { mode: 0o600 }); chmodSync(path, 0o600) }
const run = (file, args, options = {}) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim()
const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true } catch { return false } }
const cmdline = (pid) => { try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' ') } catch { return '' } }

const freePort = () => new Promise((settle, reject) => {
  const probe = createServer()
  probe.on('error', reject)
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => settle(port)) })
})

const statePath = (runId) => join(STATE_ROOT, runId, 'state.json')
const readState = (runId) => JSON.parse(readFileSync(statePath(runId), 'utf8'))
const saveState = (state) => writeFileSync(statePath(state.runId), `${JSON.stringify(state, null, 2)}\n`)
const listRuns = () => existsSync(STATE_ROOT) ? readdirSync(STATE_ROOT).filter((id) => existsSync(statePath(id))).sort() : []
const currentRun = () => {
  const runId = process.env.CONEXUS_VERIFY_RUN ?? listRuns().at(-1)
  if (!runId || !existsSync(statePath(runId))) fail('NO_RUN: launch one first, or set CONEXUS_VERIFY_RUN')
  return readState(runId)
}
export const evidence = (state, ...parts) => { const path = join(state.evidenceDir, ...parts); mkdirSync(dirname(path), { recursive: true }); return path }
export const logAction = (state, line) => appendFileSync(evidence(state, 'actions.log'), `${new Date().toISOString()} ${line}\n`)

// One throwaway CA per run, trusted by this run's Hub (NODE_EXTRA_CA_CERTS) and nothing else.

const makeTls = (dir) => {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const at = (name) => join(dir, name)
  run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=Conexus verify CA', '-keyout', at('ca-key.pem'), '-out', at('ca.pem')])
  writeFileSync(at('san.ext'), `subjectAltName=DNS:${HUB_HOST},DNS:*.conexus.localhost,DNS:localhost,IP:127.0.0.1\n`)
  run('openssl', ['req', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=localhost', '-keyout', at('server-key.pem'), '-out', at('server.csr')])
  run('openssl', ['x509', '-req', '-in', at('server.csr'), '-CA', at('ca.pem'), '-CAkey', at('ca-key.pem'), '-CAcreateserial', '-days', '2', '-extfile', at('san.ext'), '-out', at('server.pem')])
  chmodSync(at('server-key.pem'), 0o600)
  return new X509Certificate(readFileSync(at('server.pem'))).fingerprint256
}

// Without a servername the certificate is checked against 127.0.0.1, which its SAN also holds.
const httpsGet = (state, port, path, servername) => new Promise((settle, reject) => {
  const request = httpsRequest({ host: '127.0.0.1', port, path, ...(servername ? { servername } : {}), ca: readFileSync(join(state.stateDir, 'tls/ca.pem')), timeout: 5000 }, (response) => {
    const fingerprint = response.socket.getPeerX509Certificate()?.fingerprint256
    let body = ''
    response.on('data', (piece) => { body += piece })
    response.on('end', () => settle({ status: response.statusCode, body, fingerprint }))
  })
  request.on('timeout', () => request.destroy(new Error('timeout')))
  request.on('error', reject)
  request.end()
})

const waitFor = async (label, check, timeoutMs) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if (await check()) return
    } catch (error) {
      if (error.fatal) throw error
    }
    await delay(1000)
  }
  fail(`TIMEOUT_${label}`)
}

const realmFor = ({ origin, clientSecret, subject, password }) => {
  const realm = JSON.parse(readFileSync(join(REPO, 'infra/keycloak/realm-conexus.json'), 'utf8'))
  // The Conexus login theme is a separate jar build; the run uses Keycloak's own login page.
  delete realm.loginTheme
  realm.clients = realm.clients.map((client) => ({ ...client, secret: clientSecret, redirectUris: [`${origin}/protocol/oidc/callback`] }))
  realm.users = [{ id: subject, ...PERSON, enabled: true, emailVerified: true, credentials: [{ type: 'password', value: password, temporary: false }] }]
  return realm
}

const startPostgres = async (state, secrets) => {
  writeSecret(join(secrets, 'postgres.env'), `POSTGRES_PASSWORD=${randomBytes(18).toString('hex')}\nPOSTGRES_DB=${DATABASE}`)
  run('docker', ['run', '--rm', '-d', '--name', state.containers.postgres, '--env-file', join(secrets, 'postgres.env'),
    '-p', `127.0.0.1:${state.ports.postgres}:5432`, '--memory=512m', POSTGRES_IMAGE])
  await waitFor('POSTGRES', () => run('docker', ['exec', state.containers.postgres, 'pg_isready', '-U', 'postgres', '-d', DATABASE, '-h', '127.0.0.1']).includes('accepting'), 90_000)
}

const adminUrl = (state) => {
  const password = /POSTGRES_PASSWORD=(.+)/.exec(readFileSync(join(state.stateDir, 'secrets/postgres.env'), 'utf8'))[1]
  return `postgresql://postgres:${password}@127.0.0.1:${state.ports.postgres}/${DATABASE}`
}

const prepareDatabase = async (state, secrets, hubEnv) => {
  const { runHubMigrations } = await import(join(REPO, 'scripts/run-hub-migrations.mjs'))
  const { provisionRoles, readRegister, readDatabase } = await import(join(REPO, 'scripts/provision-hub-roles.mjs'))
  const migrated = await runHubMigrations({ connectionString: adminUrl(state) })
  writeSecret(join(secrets, 'provision-password'), /POSTGRES_PASSWORD=(.+)/.exec(readFileSync(join(secrets, 'postgres.env'), 'utf8'))[1])
  const environment = { ...hubEnv, CONEXUS_PROVISION_USER: 'postgres', CONEXUS_PROVISION_PASSWORD_FILE: join(secrets, 'provision-password') }
  const provisioned = await provisionRoles(readDatabase(environment), environment, readRegister(REPO))
  return { migrated, provisioned: provisioned.verdict }
}

const startKeycloak = async (state, realm) => {
  const importDir = join(state.stateDir, 'keycloak-import')
  mkdirSync(importDir, { recursive: true, mode: 0o700 })
  writeSecret(join(importDir, 'realm-conexus.json'), JSON.stringify(realm))
  // The TLS key and the realm are readable by this user alone. Keycloak's image runs under any uid in
  // group 0, so it runs as this user: under another uid (a CI runner's is 1001) it cannot read them.
  run('docker', ['run', '--rm', '-d', '--name', state.containers.keycloak, '-p', `127.0.0.1:${state.ports.keycloak}:8443`,
    '--user', `${process.getuid()}:0`, '-e', 'JAVA_OPTS_KC_HEAP=-Xms128m -Xmx384m', '--memory=640m',
    '-v', `${importDir}:/opt/keycloak/data/import:ro`, '-v', `${join(state.stateDir, 'tls')}:/tls:ro`,
    KEYCLOAK_IMAGE, 'start-dev', '--import-realm', `--hostname=https://127.0.0.1:${state.ports.keycloak}`,
    '--https-port=8443', '--https-certificate-file=/tls/server.pem', '--https-certificate-key-file=/tls/server-key.pem'])
  // Followed from the start: a container that exits is removed (--rm) and its log with it.
  const out = openSync(evidence(state, 'keycloak.log'), 'a')
  spawn('docker', ['logs', '-f', state.containers.keycloak], { detached: true, stdio: ['ignore', out, out] }).unref()
  await waitFor('KEYCLOAK', async () => (await httpsGet(state, state.ports.keycloak, '/realms/conexus/.well-known/openid-configuration')).status === 200, 180_000)
}

const hubEnvironment = (state, secrets, fake, e2b) => {
  const environment = {
    NODE_EXTRA_CA_CERTS: join(state.stateDir, 'tls/ca.pem'),
    CONEXUS_ORIGIN: state.origin,
    CONEXUS_PORT: String(state.ports.hub),
    ...{ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318', OTEL_RESOURCE_ATTRIBUTES: 'deployment.environment.name=verify' },
    CONEXUS_BOOTSTRAP_SUBJECT: state.person.subject,
    CONEXUS_DB_HOST: '127.0.0.1',
    CONEXUS_DB_PORT: String(state.ports.postgres),
    CONEXUS_DB_NAME: DATABASE,
    CONEXUS_DB_USER: 'hub_runtime',
    CONEXUS_BUILDER_E2B_API_KEY_FILE: join(secrets, 'e2b-api-key'),
    CONEXUS_BUILDER_E2B_TEMPLATE_ID: e2b ? e2b.templateId : 'verify-e2b-disabled', CONEXUS_BUILDER_QUESTION_WAIT_MS: String(5 * 60_000), CONEXUS_BUILDER_MODEL_RETRY_DELAY_MS: '100',
    ...(e2b ? {} : E2B_CLOSED),
    CONEXUS_FACTORY_SECRET_KEY_FILE: join(secrets, 'secret-key'),
    CONEXUS_OIDC_ISSUER: state.issuer,
    CONEXUS_OIDC_CLIENT_ID: 'conexus-hub',
    CONEXUS_OIDC_CLIENT_SECRET_FILE: join(secrets, 'oidc-client-secret'),
    CONEXUS_PREVIEW_PORT: String(state.ports.preview),
    CONEXUS_PREVIEW_CERT_FILE: join(state.stateDir, 'tls/server.pem'), CONEXUS_PREVIEW_KEY_FILE: join(state.stateDir, 'tls/server-key.pem'),
    CONEXUS_GIT_ROOT: join(state.stateDir, 'git'),
    CONEXUS_CONNECTOR_SOCKET_DIR: join(state.stateDir, 'connectors'),
    XDG_STATE_HOME: join(state.stateDir, 'xdg'),
    CONEXUS_CLIPROXY_BIN: fake,
    CONEXUS_CLIPROXY_SHA256: createHash('sha256').update(readFileSync(fake)).digest('hex'),
  }
  for (const [variable, role] of Object.entries(ROLE_FILES)) environment[variable] = join(secrets, `db-${role}`)
  return environment
}

// Only what a person's shell needs; every Conexus and E2B variable comes from the run.
const baseEnvironment = () => Object.fromEntries(['PATH', 'HOME', 'LANG', 'USER', 'SHELL', 'TZ'].filter((name) => process.env[name]).map((name) => [name, process.env[name]]))

// The repository's own local build (web app, then the Hub into a fresh directory it names), then its
// server run with the same node arguments scripts/build-hub-local.mjs uses. The run records that
// directory by name and deletes only it.
const startHub = async (state, environment, scripted) => {
  const { buildHubLocal, hubNodeArguments } = await import(join(REPO, 'scripts/build-hub-local.mjs'))
  state.hubBuildDir = await buildHubLocal().catch((error) => {
    writeFileSync(evidence(state, 'hub.log'), `HUB_BUILD_FAILED\n${error.message}\n`)
    fatal('HUB_BUILD_FAILED: see hub.log')
  })
  saveState(state)
  const out = openSync(evidence(state, 'hub.log'), 'a')
  const diagnosticDir = join(state.evidenceDir, 'diagnostics')
  mkdirSync(diagnosticDir, { recursive: true })
  // A scripted run starts the Hub through tests/live's entry, which hands it a local sandbox; the entry stays recorded so `hubIsOurs` finds it.
  const entry = scripted ? join(REPO, 'tests/live/hub-entry.mjs') : join(state.hubBuildDir, 'server.js')
  state.hubEntry = entry
  saveState(state)
  const hub = spawn(process.execPath, hubNodeArguments({ buildRoot: state.hubBuildDir, diagnosticDir, entry, args: scripted ? [state.hubBuildDir, scripted.sandboxRoot, ...(scripted.e2b ? ['e2b'] : [])] : [] }),
    { cwd: REPO, env: { ...baseEnvironment(), ...environment }, detached: true, stdio: ['ignore', out, out] })
  hub.unref()
  state.pids.hub = hub.pid
  saveState(state)
  await waitFor('HUB', async () => {
    if (!alive(hub.pid)) fatal('HUB_EXITED: see hub.log')
    return (await httpsGet(state, state.ports.hub, '/', HUB_HOST)).status === 200
  }, 300_000)
}

const hubIsOurs = (state) => Boolean(state.hubBuildDir) && alive(state.pids.hub) && cmdline(state.pids.hub).includes(state.hubEntry ?? join(state.hubBuildDir, 'server.js'))

const startBrowser = async (state) => {
  const out = openSync(evidence(state, 'browser.log'), 'a')
  const browser = spawn(process.execPath, [import.meta.filename, '__browser-host', statePath(state.runId)],
    { cwd: REPO, env: baseEnvironment(), detached: true, stdio: ['ignore', out, out] })
  browser.unref()
  state.pids.browser = browser.pid
  saveState(state)
  await waitFor('BROWSER', async () => {
    if (!alive(browser.pid)) fatal('BROWSER_EXITED: see browser.log')
    return (await fetch(`http://127.0.0.1:${state.ports.cdp}/json/version`)).ok
  }, 60_000)
}

// What every browser of a run is launched with. accounts.google.com never resolves: the Google AI Pro
// sign-in tab must not reach Google.
export const BROWSER_OPTIONS = Object.freeze({
  headless: true, ignoreHTTPSErrors: true, locale: 'pt-BR', viewport: Object.freeze({ width: 1440, height: 900 }),
  args: Object.freeze(['--ignore-certificate-errors', '--host-resolver-rules=MAP accounts.google.com ~NOTFOUND']),
})

const browserHost = async (path) => {
  const state = JSON.parse(readFileSync(path, 'utf8'))
  const { chromium } = await import('@playwright/test')
  const context = await chromium.launchPersistentContext(join(state.stateDir, 'chromium-profile'), {
    ...BROWSER_OPTIONS, args: [`--remote-debugging-port=${state.ports.cdp}`, ...BROWSER_OPTIONS.args],
  })
  const record = (page) => page.on('console', (message) => console.log(`${new Date().toISOString()} console.${message.type()} ${page.url()} ${message.text()}`))
  for (const page of context.pages()) record(page)
  context.on('page', record)
  process.once('SIGTERM', () => { context.close().finally(() => process.exit(0)) })
  console.log('browser-ready')
}

// The model proxy the Hub spawns is a wrapper that sets the scripted model's address and imports the
// real stand-in, because the Hub gives the binary a scrubbed environment.
const writeScriptedProxy = (state, modelUrl) => {
  const path = join(state.stateDir, 'cliproxy.mjs')
  writeFileSync(path, `#!/usr/bin/env node\nprocess.env.CONEXUS_FAKE_MODEL_URL = ${JSON.stringify(modelUrl)}\nawait import(${JSON.stringify(pathToFileURL(join(SKILL_DIR, 'scripts/fake-cliproxy.mjs')).href)})\n`)
  chmodSync(path, 0o755)
  return path
}

/**
 * Starts one run. With no `scripted`, the model proxy answers no model call and E2B is closed. With it,
 * the Hub's model calls go to `modelUrl` and its sandboxes are directories under `sandboxRoot`; E2B stays closed
 * unless `e2b` (key file, template) is given: then the Hub opens real sandboxes, a paid manual proof.
 * `onState` receives the run as soon as it exists, so a caller can clean up a launch that fails midway.
 * @param {{ browser: boolean, scripted?: { modelUrl: string, sandboxRoot: string, e2b?: { apiKeyFile: string, templateId: string } }, onState?: (state: object) => void }} options
 */
export const launch = async ({ browser, scripted, onState }) => {
  const runId = `${new Date().toTimeString().slice(0, 8).replaceAll(':', '')}-${randomBytes(2).toString('hex')}`
  const stateDir = join(STATE_ROOT, runId)
  const secrets = join(stateDir, 'secrets')
  mkdirSync(secrets, { recursive: true, mode: 0o700 })
  for (const dir of ['git', 'connectors', 'xdg']) mkdirSync(join(stateDir, dir), { recursive: true, mode: 0o700 })
  const ports = { postgres: await freePort(), keycloak: await freePort(), hub: await freePort(), preview: await freePort(), cdp: await freePort() }
  const gitHead = run('git', ['rev-parse', 'HEAD'], { cwd: REPO })
  const state = {
    runId, stateDir, evidenceDir: join(EVIDENCE_ROOT, today(), runId), repo: REPO, gitHead,
    gitDirty: run('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: REPO }) !== '',
    ports, origin: `https://${HUB_HOST}:${ports.hub}`, issuer: `https://127.0.0.1:${ports.keycloak}/realms/conexus`,
    containers: { postgres: `conexus-verify-pg-${runId}`, keycloak: `conexus-verify-kc-${runId}` },
    person: { ...PERSON, subject: randomUUID() }, pids: {}, tlsFingerprint: null, cleanedAt: null, e2bOpen: Boolean(scripted?.e2b),
  }
  mkdirSync(state.evidenceDir, { recursive: true })
  saveState(state)
  onState?.(state)
  const step = (name) => { logAction(state, `launch ${name}`); console.error(`launch: ${name}`) }

  step('tls')
  state.tlsFingerprint = makeTls(join(stateDir, 'tls'))
  writeSecret(join(secrets, 'oidc-client-secret'), randomBytes(24).toString('hex'))
  writeSecret(join(secrets, 'secret-key'), randomBytes(32).toString('hex'))
  writeSecret(join(secrets, 'e2b-api-key'), scripted?.e2b ? readFileSync(scripted.e2b.apiKeyFile, 'utf8').trim() : 'e2b_verify_disabled')
  writeSecret(join(secrets, 'person-password'), randomBytes(12).toString('hex'))
  for (const role of Object.values(ROLE_FILES)) writeSecret(join(secrets, `db-${role}`), randomBytes(18).toString('hex'))
  saveState(state)

  step('postgres')
  await startPostgres(state, secrets)
  const proxy = scripted ? writeScriptedProxy(state, scripted.modelUrl) : join(SKILL_DIR, 'scripts/fake-cliproxy.mjs')
  const environment = hubEnvironment(state, secrets, proxy, scripted?.e2b)
  step('migrations and roles')
  state.database = await prepareDatabase(state, secrets, environment)
  saveState(state)

  step('keycloak')
  await startKeycloak(state, realmFor({
    origin: state.origin,
    clientSecret: readFileSync(join(secrets, 'oidc-client-secret'), 'utf8').trim(),
    subject: state.person.subject,
    password: readFileSync(join(secrets, 'person-password'), 'utf8').trim(),
  }))

  step('hub build and start (a few minutes)')
  writeFileSync(evidence(state, 'hub.env'), Object.entries(environment).map(([name, value]) => `${name}=${value}`).join('\n'))
  await startHub(state, environment, scripted)
  saveState(state)

  if (browser) {
    step('browser')
    await startBrowser(state)
    saveState(state)
  }
  writeFileSync(evidence(state, 'run.json'), `${JSON.stringify({ runId, gitHead, gitDirty: state.gitDirty, origin: state.origin, issuer: state.issuer, ports, containers: state.containers, person: state.person.username }, null, 2)}\n`)
  return state
}

const launchCommand = async () => {
  const state = await launch({ browser: true })
  console.log(JSON.stringify({ runId: state.runId, origin: state.origin, evidence: state.evidenceDir }, null, 2))
}

const doctor = async () => {
  const state = currentRun()
  const checks = []
  const check = async (name, probe) => {
    try { const detail = await probe(); checks.push({ name, ok: true, ...(detail ? { detail } : {}) }) } catch (error) { checks.push({ name, ok: false, detail: error.message }) }
  }
  await check('not cleaned up', () => { if (state.cleanedAt) fail(`cleaned at ${state.cleanedAt}`) })
  for (const [name, container] of Object.entries(state.containers)) {
    await check(`${name} container running`, () => { if (run('docker', ['inspect', '-f', '{{.State.Running}}', container]) !== 'true') fail('not running') })
  }
  await check('hub process ours', () => { if (!hubIsOurs(state)) fail(`pid ${state.pids.hub} is not this run's Hub`) })
  await check('hub answers with this run certificate', async () => {
    const answer = await httpsGet(state, state.ports.hub, '/', HUB_HOST)
    if (answer.status !== 200) fail(`status ${answer.status}`)
    if (answer.fingerprint !== state.tlsFingerprint) fail('another server holds the port')
  })
  await check('E2B unreachable from the hub', () => {
    const environ = readFileSync(`/proc/${state.pids.hub}/environ`, 'utf8')
    if (!state.e2bOpen && !environ.includes(`E2B_API_URL=${E2B_CLOSED.E2B_API_URL}`)) fail('hub environment does not close E2B')
  })
  await check('keycloak issuer', async () => {
    const answer = await httpsGet(state, state.ports.keycloak, '/realms/conexus/.well-known/openid-configuration')
    if (JSON.parse(answer.body).issuer !== state.issuer) fail('issuer differs')
  })
  await check('browser reachable over CDP', async () => {
    if (!alive(state.pids.browser)) fail('browser host exited')
    if (!(await fetch(`http://127.0.0.1:${state.ports.cdp}/json/version`)).ok) fail('CDP did not answer')
  })
  await check('hub runs this checkout', () => {
    const head = run('git', ['rev-parse', 'HEAD'], { cwd: REPO })
    if (head !== state.gitHead) fail(`launched at ${state.gitHead.slice(0, 8)}, checkout is now ${head.slice(0, 8)}: relaunch`)
    return state.gitDirty ? 'launched with uncommitted changes' : undefined
  })
  const ok = checks.every((entry) => entry.ok)
  console.log(JSON.stringify({ runId: state.runId, origin: state.origin, ok, checks }, null, 2))
  if (!ok) process.exitCode = 1
}

const option = (args, name) => { const index = args.indexOf(`--${name}`); return index === -1 ? undefined : args[index + 1] }

const connect = async (state) => {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${state.ports.cdp}`)
  const [context] = browser.contexts()
  const pages = context.pages()
  return { context, pages }
}

const locate = (page, args) => {
  const role = option(args, 'role')
  const name = option(args, 'name')
  const exact = args.includes('--exact')
  if (role) return page.getByRole(role, name ? { name, exact } : {}).first()
  if (option(args, 'label')) return page.getByLabel(option(args, 'label'), { exact }).first()
  if (option(args, 'text')) return page.getByText(option(args, 'text'), { exact }).first()
  if (option(args, 'css')) return page.locator(option(args, 'css')).first()
  fail('LOCATOR_REQUIRED: --role [--name], --label, --text or --css')
}

const browserCommand = async ([action, ...args]) => {
  const state = currentRun()
  const { context, pages } = await connect(state)
  // CDP lists tabs in no stable order, so the default is the first tab on the Hub's origin.
  const page = (option(args, 'page') === undefined ? pages.find((each) => each.url().startsWith(state.origin)) ?? pages[0] : pages[Number(option(args, 'page'))]) ?? fail('NO_SUCH_PAGE')
  const timeout = Number(option(args, 'timeout') ?? 15_000)
  logAction(state, `browser ${action} ${args.join(' ')}`)
  const shot = async (name) => {
    const path = evidence(state, 'screens', `${name}.png`)
    await page.screenshot({ path, fullPage: false })
    return path
  }
  switch (action) {
    case 'goto': await page.goto(new URL(args[0], state.origin).href, { waitUntil: 'domcontentloaded' }); break
    case 'click': await locate(page, args).click({ timeout }); break
    case 'fill': await locate(page, args).fill(option(args, 'value') ?? fail('VALUE_REQUIRED'), { timeout }); break
    case 'focus': await locate(page, args).focus({ timeout }); break
    case 'press': await page.keyboard.press(option(args, 'key') ?? fail('KEY_REQUIRED')); break
    case 'wait': await locate(page, args).waitFor({ state: args.includes('--gone') ? 'detached' : 'visible', timeout }); break
    case 'attr': console.log(await locate(page, args).getAttribute(option(args, 'attr') ?? fail('ATTR_REQUIRED'), { timeout })); break
    case 'text': console.log(await locate(page, args).innerText({ timeout })); break
    case 'screenshot': console.log(await shot(args[0] ?? fail('NAME_REQUIRED'))); break
    case 'snapshot': {
      const path = evidence(state, 'aria', `${args[0] ?? fail('NAME_REQUIRED')}.aria.yml`)
      writeFileSync(path, await page.locator('body').ariaSnapshot())
      console.log(path)
      break
    }
    case 'pages': for (const [index, each] of context.pages().entries()) console.log(`${index} ${each.url()}`); break
    case 'close-page':
      for (const each of option(args, 'page') === undefined ? context.pages().filter((tab) => !tab.url().startsWith(state.origin)) : [page]) await each.close()
      break
    case 'url': break
    default: fail(`UNKNOWN_BROWSER_ACTION ${action}`)
  }
  if (!['pages', 'close-page'].includes(action)) console.log(page.url())
}

// The repeated first stretch of every drive: Keycloak's form, which also creates the first account on the first sign-in.
export const signIn = async (page, state) => {
  logAction(state, 'sign-in')
  await page.goto(new URL('/protocol/oidc/login', state.origin).href)
  // While the browser holds a Keycloak session (a sign-in that never signed out), Keycloak returns at once.
  const form = page.locator('#username')
  await Promise.race([form.waitFor({ timeout: 30_000 }), page.waitForURL((url) => url.origin === state.origin, { timeout: 30_000 })].map((wait) => wait.catch(() => {})))
  if (new URL(page.url()).origin !== state.origin) {
    await form.fill(state.person.username)
    await page.locator('#password').fill(readFileSync(join(state.stateDir, 'secrets/person-password'), 'utf8').trim())
    await page.locator('#kc-login').click()
    await page.waitForURL((url) => url.origin === state.origin, { timeout: 30_000 })
  }
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: evidence(state, 'screens', 'sign-in-landed.png') })
}

const signInCommand = async () => {
  const state = currentRun()
  const { pages } = await connect(state)
  const page = pages.find((each) => each.url().startsWith(state.origin)) ?? pages[0]
  await signIn(page, state)
  console.log(page.url())
}

// One read-only query as the database's owner, so a proof can read any schema.
export const query = async (state, sql) => {
  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: adminUrl(state) })
  await client.connect()
  try {
    await client.query('BEGIN READ ONLY')
    const { rows } = await client.query(sql)
    await client.query('ROLLBACK')
    logAction(state, `db ${sql}`)
    return rows
  } finally {
    await client.end()
  }
}

const db = async (args) => {
  const sql = args.find((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--save') ?? fail('SQL_REQUIRED')
  const text = `${JSON.stringify(await query(currentRun(), sql), null, 2)}\n`
  if (option(args, 'save')) writeFileSync(evidence(currentRun(), 'db', `${option(args, 'save')}.json`), `-- ${sql}\n${text}`)
  process.stdout.write(text)
}

export const seedModelDefaults = async (state, model = 'google-ai-pro/gemini-3-flash') => {
  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: adminUrl(state) })
  await client.connect()
  try {
    const { rows: [account] } = await client.query('SELECT account_id FROM iam.account WHERE external_subject = $1', [state.person.subject])
    if (!account) fail('NO_ACCOUNT: sign in first')
    for (const role of ['build', 'memory']) {
      await client.query(`INSERT INTO model.installation_default(role, model_id, updated_by) VALUES ($1, $2, $3)
        ON CONFLICT (role) DO UPDATE SET model_id = EXCLUDED.model_id, updated_by = EXCLUDED.updated_by`, [role, model, account.account_id])
    }
    logAction(state, `seed model-defaults ${model}`)
  } finally {
    await client.end()
  }
}

const seedModelDefaultsCommand = async (args) => {
  const model = option(args, 'model') ?? 'google-ai-pro/gemini-3-flash'
  await seedModelDefaults(currentRun(), model)
  console.log(`build and memory default: ${model}`)
}

const stop = async (pid, label, graceMs = 15_000) => {
  if (!pid || !alive(pid)) return `${label} already gone`
  process.kill(pid, 'SIGTERM')
  const deadline = Date.now() + graceMs
  while (alive(pid) && Date.now() < deadline) await delay(250)
  if (alive(pid)) { process.kill(pid, 'SIGKILL'); return `${label} killed` }
  return `${label} stopped`
}

export const cleanup = async (state) => {
  const done = []
  if (hubIsOurs(state)) done.push(await stop(state.pids.hub, 'hub'))
  if (state.pids.browser && cmdline(state.pids.browser).includes('__browser-host')) done.push(await stop(state.pids.browser, 'browser'))
  for (const container of Object.values(state.containers)) {
    try {
      run('docker', ['stop', container])
      done.push(`${container} stopped`)
    } catch { done.push(`${container} already gone`) }
  }
  if (state.hubBuildDir && existsSync(state.hubBuildDir)) {
    rmSync(state.hubBuildDir, { recursive: true, force: true })
    done.push(`removed ${state.hubBuildDir}`)
  }
  state.cleanedAt = new Date().toISOString()
  writeFileSync(evidence(state, 'cleanup.json'), `${JSON.stringify({ cleanedAt: state.cleanedAt, done }, null, 2)}\n`)
  cpSync(statePath(state.runId), evidence(state, 'state.json'))
  rmSync(state.stateDir, { recursive: true, force: true })
  return { runId: state.runId, done, evidence: state.evidenceDir, evidenceKept: existsSync(join(state.evidenceDir, 'cleanup.json')) }
}

const cleanupCommand = async () => { console.log(JSON.stringify(await cleanup(currentRun()), null, 2)) }

const list = () => {
  for (const runId of listRuns()) {
    const state = readState(runId)
    console.log(`${runId} ${state.origin} hub ${alive(state.pids.hub) ? 'up' : 'down'} evidence ${state.evidenceDir}`)
  }
}

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2)
  const commands = {
    launch: launchCommand, doctor, list, cleanup: cleanupCommand,
    'sign-in': signInCommand,
    browser: () => browserCommand(rest),
    db: () => db(rest),
    'seed-model-defaults': () => seedModelDefaultsCommand(rest),
    '__browser-host': () => browserHost(rest[0]),
  }
  if (!commands[command]) {
    console.error(`usage: control.mjs ${Object.keys(commands).filter((name) => !name.startsWith('__')).join('|')}`)
    process.exitCode = 2
  } else {
    try {
      await commands[command]()
    } catch (error) {
      console.error(error.message)
      process.exitCode = 1
    }
    // A CDP connection keeps the event loop alive; leaving drops it and the browser keeps running.
    if (command !== '__browser-host') process.exit()
  }
}
