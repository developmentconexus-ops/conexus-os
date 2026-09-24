import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { chmodSync, copyFileSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { homedir, networkInterfaces, tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import pg from 'pg'
import { hubRoleNames, provisionApplicationDatabase } from '../../scripts/provision-application-database.mjs'
import { applicationClusterAdmin, loginThroughRelay, refuseProtectedApplicationCluster, relayTls } from './application-cluster.mjs'
import { adminConnection } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'
import { probeOperations, probeServerTree } from './sandbox-probe/server-tree.mjs'
import { EXPECTED_ORDER_22790, FAKE_CREDENTIAL, SECRET_MARKER, startFakeGateway } from './connector-fake-gateway.mjs'

// The real runner path: a supervisor that provisions with app_provisioner, migrates and invokes
// through the rootless bubblewrap worker and the pinned database relay. Needs unprivileged user
// namespaces and /usr/bin/bwrap on the host.
const { createSupervisor } = await import(hubModuleUrl('app-runner/supervisor.js'))
const { assertUserNamespaces, stageWorkerRuntime, DEFAULT_SANDBOX } = await import(hubModuleUrl('app-runner/sandbox.js'))
const { openPgRelay, readRelayTls } = await import(hubModuleUrl('app-runner/pg-relay.js'))
const { previewAllocation } = await import(hubModuleUrl('app-runner/data-plane.js'))
const { createBroker } = await import(hubModuleUrl('connectors/broker.js'))
const { createHandlerPorts } = await import(hubModuleUrl('connectors/handler-port.js'))
const { createSankhyaGateway } = await import(hubModuleUrl('connectors/sankhya/gateway.js'))
const { sankhyaDefinition } = await import(hubModuleUrl('connectors/sankhya/definition.js'))
const { scopeFromArtifactSource } = await import(hubModuleUrl('connectors/scope.js'))
const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))

const sha = (text) => createHash('sha256').update(text).digest('hex')
const file = (path, text) => ({ path: `conexus-server/${path}`, sha256: sha(text), content: Buffer.from(text).toString('base64') })

const NOTE_SQL = `CREATE TABLE follow_up_note (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  purchase_order_id text NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now())`
const NOTE = { type: 'object', properties: { id: { type: 'integer' }, purchaseOrderId: { type: 'string' }, note: { type: 'string' }, createdAt: { type: 'string' } }, required: ['id', 'purchaseOrderId', 'note', 'createdAt'], additionalProperties: false }
const NOTES_HANDLER = `const columns = 'id, purchase_order_id AS "purchaseOrderId", note, created_at AS "createdAt"'
export async function createNote(input, { db }) {
  const { rows } = await db.query(\`INSERT INTO follow_up_note (purchase_order_id, note) VALUES ($1, $2) RETURNING \${columns}\`, [input.purchaseOrderId, input.note])
  return rows[0]
}
export async function listNotes(input, { db }) {
  const { rows } = await db.query(\`SELECT \${columns} FROM follow_up_note WHERE purchase_order_id = $1 ORDER BY id\`, [input.purchaseOrderId])
  return rows
}
`
const PROBE_HANDLER = `export const sleepInDatabase = async (input, { db }) => { await db.query('SET statement_timeout = 0'); await db.query('SET transaction_timeout = 0'); await db.query('SELECT pg_sleep(60)'); return {} }
export const spin = async () => { for (;;) {} }
export const crash = async () => { process.abort() }
export const huge = async () => ({ text: 'x'.repeat(2 * 1024 * 1024) })
export const wrongShape = async () => ({ id: '1', purchaseOrderId: 'PO-1', note: 'n', createdAt: 'now' })
export const environment = async () => ({ text: JSON.stringify(process.env) })
export const whoAmI = async (input, context) => ({ caller: context.caller, frozen: Object.isFrozen(context.caller) && Object.isFrozen(context) })
export const hogMemory = async () => { const kept = []; for (;;) kept.push(new Array(1e6).fill(Math.random())) }
export const hogBuffers = async () => { const kept = []; for (;;) kept.push(Buffer.alloc(256 * 1024 * 1024, 1)) }
// A handler asking the sandbox for authority it must not have. Each attempt reports the refusal
// code instead of the value, so the boundary is what the test reads.
export const beyondBoundary = async () => {
  const fs = await import('node:fs')
  const attempt = (work) => { try { return work() ? 'ALLOWED' : 'ALLOWED' } catch (error) { return String(error?.code ?? error?.name ?? 'ERROR') } }
  return { text: JSON.stringify({
    readEtcPasswd: attempt(() => fs.readFileSync('/etc/passwd', 'utf8').length),
    readParentEnviron: attempt(() => fs.readFileSync('/proc/1/environ', 'utf8').length),
    writeTmp: attempt(() => { fs.writeFileSync('/tmp/probe', 'x'); return true }),
    writeApp: attempt(() => { fs.writeFileSync('/app/probe', 'x'); return true }),
    spawnChild: await import('node:child_process').then((cp) => attempt(() => cp.execSync('id').toString())).catch((error) => String(error?.code ?? 'ERROR')),
    root: attempt(() => fs.readdirSync('/').join(',')),
  }) }
}
`
const byPurchaseOrder = { type: 'object', properties: { purchaseOrderId: { type: 'string', minLength: 1, maxLength: 40 } }, required: ['purchaseOrderId'], additionalProperties: false }
const empty = { type: 'object', properties: {}, additionalProperties: false }
const text = { type: 'object', properties: { text: { type: 'string' } }, additionalProperties: false }
const CALLER_SCHEMA = { type: 'object', properties: { accountId: { type: 'string' }, email: { type: 'string' }, displayName: { type: 'string' } }, required: ['accountId', 'displayName'], additionalProperties: false }
const CALLER = Object.freeze({ accountId: '55555555-5555-4555-8555-555555555555', email: 'funcionaria@example.com', displayName: 'Funcionária' })

const serverTree = (migrations) => {
  const manifest = {
    version: 1,
    operations: {
      createNote: { module: 'handlers/notes.mjs', export: 'createNote', input: { ...byPurchaseOrder, properties: { ...byPurchaseOrder.properties, note: { type: 'string', minLength: 1, maxLength: 2000 } }, required: ['purchaseOrderId', 'note'] }, output: NOTE },
      listNotes: { module: 'handlers/notes.mjs', export: 'listNotes', input: byPurchaseOrder, output: { type: 'array', items: NOTE, maxItems: 500 } },
      sleepInDatabase: { module: 'handlers/probe.mjs', export: 'sleepInDatabase', input: empty, output: empty },
      spin: { module: 'handlers/probe.mjs', export: 'spin', input: empty, output: empty },
      crash: { module: 'handlers/probe.mjs', export: 'crash', input: empty, output: empty },
      huge: { module: 'handlers/probe.mjs', export: 'huge', input: empty, output: text },
      wrongShape: { module: 'handlers/probe.mjs', export: 'wrongShape', input: empty, output: NOTE },
      environment: { module: 'handlers/probe.mjs', export: 'environment', input: empty, output: text },
      hogMemory: { module: 'handlers/probe.mjs', export: 'hogMemory', input: empty, output: empty },
      hogBuffers: { module: 'handlers/probe.mjs', export: 'hogBuffers', input: empty, output: empty },
      beyondBoundary: { module: 'handlers/probe.mjs', export: 'beyondBoundary', input: empty, output: text },
      whoAmI: { module: 'handlers/probe.mjs', export: 'whoAmI', input: { type: 'object', properties: { caller: CALLER_SCHEMA }, additionalProperties: false }, output: { type: 'object', properties: { caller: CALLER_SCHEMA, frozen: { type: 'boolean' } }, required: ['caller', 'frozen'], additionalProperties: false } },
    },
    migrations: migrations.map(([name, sql]) => ({ name, sha256: sha(sql), sql })),
  }
  return [file('manifest.json', JSON.stringify(manifest)), file('handlers/notes.mjs', NOTES_HANDLER), file('handlers/probe.mjs', PROBE_HANDLER)]
}

const setup = async (t, sandbox, { connectorSocketDir } = {}) => {
  await refuseProtectedCluster()
  await refuseProtectedApplicationCluster()
  assertUserNamespaces()
  const admin = applicationClusterAdmin()
  const database = `conexus_apps_${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const provisionerPassword = randomBytes(24).toString('base64url')
  await provisionApplicationDatabase({
    cluster: { host: admin.host, port: admin.port }, database, hubRoles: hubRoleNames({}),
    installation: { user: admin.user, password: admin.password }, provisionerPassword,
  })
  const stateDir = mkdtempSync(join(tmpdir(), 'conexus-runner-'))
  const supervisor = createSupervisor({
    stateDir, runtimeDir: stageWorkerRuntime(join(stateDir, 'runtime')), cluster: { host: admin.host, port: admin.port },
    database, provisionerPassword, relayTls: relayTls(), ...(sandbox ? { sandbox } : {}), ...(connectorSocketDir ? { connectorSocketDir } : {}),
  })
  const projects = [randomUUID(), randomUUID()]
  t.after(async () => {
    await supervisor.close()
    rmSync(stateDir, { recursive: true, force: true })
    const superuser = new pg.Client({ ...admin, database: 'postgres' })
    await superuser.connect()
    await superuser.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`)
    for (const allocation of projects.map(previewAllocation)) {
      await superuser.query(`DROP ROLE IF EXISTS ${allocation.runtimeRole}`)
      await superuser.query(`DROP ROLE IF EXISTS ${allocation.migrationRole}`)
    }
    await superuser.end()
  })
  return { admin, database, supervisor, projects, stateDir }
}

test('the runner migrates and serves each Project through its own sandboxed worker', async (t) => {
  const { admin, database, supervisor, projects: [a, b] } = await setup(t)
  const files = serverTree([['001_follow_up_note.sql', NOTE_SQL]])
  const invoke = (projectId, operation, input = {}) => supervisor.invoke({ projectId, operation, input, files, caller: CALLER })

  assert.deepEqual(await supervisor.prepare({ projectId: a, files }), { state: 'READY', reset: false, applied: ['001_follow_up_note.sql'] })
  assert.deepEqual(await supervisor.prepare({ projectId: a, files }), { state: 'READY', reset: false, applied: [] })
  assert.deepEqual(await supervisor.prepare({ projectId: b, files }), { state: 'READY', reset: false, applied: ['001_follow_up_note.sql'] })

  const created = await invoke(a, 'createNote', { purchaseOrderId: 'PO-7', note: 'ligar para o fornecedor' })
  assert.equal(created.status, 200)
  assert.equal(created.body.note, 'ligar para o fornecedor')
  const listed = await invoke(a, 'listNotes', { purchaseOrderId: 'PO-7' })
  assert.deepEqual(listed.body.map((note) => [note.id, note.purchaseOrderId, note.note]), [[created.body.id, 'PO-7', 'ligar para o fornecedor']])
  assert.deepEqual((await invoke(b, 'listNotes', { purchaseOrderId: 'PO-7' })).body, [])

  assert.deepEqual(await invoke(a, 'listNotes', { purchaseOrderId: 'PO-7', projectId: b }), { status: 400, body: { error: { code: 'INPUT_REFUSED', detail: '/projectId: not declared' } } })
  // The handler sees the platform's caller, frozen, even when the input declares and carries one.
  assert.deepEqual(await invoke(a, 'whoAmI'), { status: 200, body: { caller: { accountId: '55555555-5555-4555-8555-555555555555', email: 'funcionaria@example.com', displayName: 'Funcionária' }, frozen: true } })
  assert.deepEqual(await invoke(a, 'whoAmI', { caller: { accountId: 'forged', displayName: 'Chefe' } }), { status: 200, body: { caller: { accountId: '55555555-5555-4555-8555-555555555555', email: 'funcionaria@example.com', displayName: 'Funcionária' }, frozen: true } })
  assert.deepEqual(await invoke(a, 'dropEverything'), { status: 404, body: { error: { code: 'OPERATION_NOT_FOUND' } } })
  assert.deepEqual(await invoke(a, 'wrongShape'), { status: 502, body: { error: { code: 'HANDLER_OUTPUT_REFUSED', detail: '/id: expected integer' } } })
  assert.deepEqual(await invoke(a, 'huge'), { status: 502, body: { error: { code: 'RESPONSE_TOO_LARGE' } } })
  assert.deepEqual(await invoke(a, 'environment'), { status: 200, body: { text: '{"PWD":"/"}' } })

  // The handler first lifts its own statement_timeout and transaction_timeout, which any session may
  // do, so only the relay's cancel at the invocation's wall clock can end the statement.
  await t.test('a worker past its wall clock is killed and its database statement cancelled', async () => {
    const started = Date.now()
    assert.deepEqual(await invoke(a, 'sleepInDatabase'), { status: 504, body: { error: { code: 'HANDLER_TIMEOUT' } } })
    assert.ok(Date.now() - started < 8000)
    const superuser = new pg.Client({ ...admin, database })
    await superuser.connect()
    let active = 1
    for (let attempt = 0; attempt < 20 && active > 0; attempt += 1) {
      active = (await superuser.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename = $1 AND query LIKE '%pg_sleep%' AND state = 'active'", [previewAllocation(a).runtimeRole])).rows[0].n
      if (active > 0) await new Promise((resolve) => setTimeout(resolve, 100))
    }
    await superuser.end()
    assert.equal(active, 0)
    assert.deepEqual(await invoke(a, 'spin'), { status: 504, body: { error: { code: 'HANDLER_TIMEOUT' } } })
  })

  await t.test('a crashed or exhausted worker ends alone and the next request is served', async () => {
    assert.equal((await invoke(a, 'crash')).body.error.code, 'HANDLER_CRASHED')
    assert.equal((await invoke(a, 'hogMemory')).body.error.code, 'HANDLER_CRASHED')
    assert.equal((await invoke(a, 'hogBuffers')).body.error.code, 'HANDLER_FAILED')
    assert.equal((await invoke(a, 'listNotes', { purchaseOrderId: 'PO-7' })).status, 200)
  })

  await t.test('a handler cannot read host files, write, spawn or list the root', async () => {
    const answer = await invoke(a, 'beyondBoundary')
    assert.equal(answer.status, 200)
    const seen = JSON.parse(answer.body.text)
    assert.equal(seen.readEtcPasswd, 'ERR_ACCESS_DENIED')
    assert.equal(seen.readParentEnviron, 'ERR_ACCESS_DENIED')
    assert.equal(seen.writeTmp, 'ERR_ACCESS_DENIED')
    assert.equal(seen.writeApp, 'ERR_ACCESS_DENIED')
    assert.equal(seen.spawnChild, 'ERR_ACCESS_DENIED')
    // The permission model even refuses listing '/', which the namespace root would otherwise allow.
    assert.equal(seen.root, 'ERR_ACCESS_DENIED')
  })

  await t.test('a failing migration applies nothing and names the error', async () => {
    const broken = serverTree([['001_follow_up_note.sql', NOTE_SQL], ['002_broken.sql', 'ALTER TABLE follow_up_note ADD COLUMN done boolean; SELECT * FROM missing_table']])
    const result = await supervisor.prepare({ projectId: a, files: broken })
    assert.equal(result.state, 'MIGRATION_FAILED')
    assert.match(result.detail, /42P01 relation "missing_table" does not exist/)
    assert.equal((await invoke(a, 'listNotes', { purchaseOrderId: 'PO-7' })).body.length, 1)
  })

  await t.test('the relay authenticates upstream itself and admits only the pinned identity', async () => {
    const socketDir = mkdtempSync(join(tmpdir(), 'conexus-relay-'))
    t.after(() => rmSync(socketDir, { recursive: true, force: true }))
    const runtimeRole = previewAllocation(a).runtimeRole
    const relay = await openPgRelay({ socketPath: join(socketDir, '.s.PGSQL.5432'), upstream: { host: admin.host, port: admin.port }, pin: { user: runtimeRole, database }, tls: relayTls(), maxSessions: 2 })
    // The client sends no credential at all; the relay logs in upstream with the runner certificate.
    const login = (user, target) => {
      const client = new pg.Client({ host: socketDir, user, database: target, connectionTimeoutMillis: 3000 })
      return client.connect().then(() => client.query('SELECT current_user AS who').then((result) => { client.end(); return result.rows[0].who }), (error) => error.message)
    }
    assert.equal(await login(runtimeRole, database), runtimeRole)
    assert.equal(await login(previewAllocation(b).runtimeRole, database), 'conexus: session refused')
    assert.equal(await login(previewAllocation(a).migrationRole, database), 'conexus: session refused')
    assert.equal(await login(runtimeRole, 'postgres'), 'conexus: session refused')
    assert.deepEqual(relay.refused(), ['IDENTITY', 'IDENTITY', 'IDENTITY'])
    // A password the client offers is ignored: the relay never asks for one and still admits it.
    const withPassword = new pg.Client({ host: socketDir, user: runtimeRole, password: 'wrong', database, connectionTimeoutMillis: 3000 })
    assert.equal(await withPassword.connect().then(() => { withPassword.end(); return 'connected' }, (error) => error.message), 'connected')
    await relay.close()
  })

  await t.test('the runner does not serve while a routine language is usable by PUBLIC or a Project role', async () => {
    const converged = [a, b].sort()
    assert.deepEqual([...await supervisor.checkProvisioner()], converged)
    const migrationB = previewAllocation(b).migrationRole
    const superuser = new pg.Client({ ...admin, database })
    await superuser.connect()
    try {
      await superuser.query('GRANT USAGE ON LANGUAGE plpgsql TO PUBLIC')
      await assert.rejects(supervisor.checkProvisioner(), { message: 'RUNNER_ROUTINE_LANGUAGE_USABLE: plpgsql' })
      await superuser.query('REVOKE USAGE ON LANGUAGE plpgsql FROM PUBLIC')
      await superuser.query(`GRANT USAGE ON LANGUAGE sql TO ${migrationB}`)
      await assert.rejects(supervisor.checkProvisioner(), { message: 'RUNNER_ROUTINE_LANGUAGE_USABLE: sql' })
    } finally {
      await superuser.query(`REVOKE USAGE ON LANGUAGE sql FROM ${migrationB}`)
      await superuser.end()
    }
    assert.deepEqual([...await supervisor.checkProvisioner()], converged)
  })

  await t.test('a migration cannot give the runtime role more than DML, directly or through PUBLIC', async (st) => {
    const runtimeB = previewAllocation(b).runtimeRole
    const extra = 'TRUNCATE, TRIGGER, REFERENCES, MAINTAIN'
    const granting = serverTree([['001_follow_up_note.sql', NOTE_SQL], ['002_grant_more.sql', `GRANT ${extra} ON follow_up_note TO ${runtimeB}; GRANT ALL ON follow_up_note TO PUBLIC`]])
    assert.deepEqual(await supervisor.prepare({ projectId: b, files: granting }), { state: 'READY', reset: false, applied: ['002_grant_more.sql'] })
    const runtime = await loginThroughRelay(st, { host: admin.host, port: admin.port }, runtimeB, database)
    const attempt = (sql) => runtime.query(sql).then(() => 'ok', (error) => error.code)
    assert.deepEqual({
      truncate: await attempt('TRUNCATE follow_up_note'),
      createTrigger: await attempt('CREATE TRIGGER t BEFORE UPDATE ON follow_up_note FOR EACH ROW EXECUTE FUNCTION suppress_redundant_updates_trigger()'),
      insert: await attempt("INSERT INTO follow_up_note (purchase_order_id, note) VALUES ('PO-9', 'n')"),
    }, { truncate: '42501', createTrigger: '42501', insert: 'ok' })
  })
})

test('the runner reads relay TLS only from a private directory holding exactly its three files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'conexus-relay-tls-'))
  try {
    for (const name of ['ca.pem', 'relay.pem', 'relay-key.pem']) copyFileSync(join(process.env.CONEXUS_TEST_APP_TLS_DIR, name), join(directory, name))
    chmodSync(join(directory, 'relay-key.pem'), 0o600)
    chmodSync(directory, 0o700)
    assert.deepEqual(Object.keys(readRelayTls(directory)), ['ca', 'cert', 'key'])
    writeFileSync(join(directory, 'ca-key.pem'), 'authority', { mode: 0o600 })
    assert.throws(() => readRelayTls(directory), { message: 'RUNNER_RELAY_TLS_DIR_REFUSED: ca-key.pem,ca.pem,relay-key.pem,relay.pem' })
    rmSync(join(directory, 'ca-key.pem'))
    chmodSync(directory, 0o750)
    assert.throws(() => readRelayTls(directory), { message: 'RUNNER_RELAY_TLS_DIR_PERMISSIONS' })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

// The arena's reviewed cases, run with Node's permission layer off, so what they report is what the
// bubblewrap namespaces alone allow. The network targets are listeners the host provably reaches.
test('with the Node permission layer off, the namespaces alone hide host files, processes and network', async (t) => {
  const { admin, supervisor, projects: [project], stateDir } = await setup(t, { ...DEFAULT_SANDBOX, nodePermission: false })
  const files = probeServerTree()
  assert.deepEqual(await supervisor.prepare({ projectId: project, files }), { state: 'READY', reset: false, applied: [] })
  const run = async (name, input) => {
    const answer = await supervisor.invoke({ projectId: project, operation: probeOperations[name], input, files, caller: CALLER })
    assert.equal(answer.status, 200, JSON.stringify(answer.body))
    return JSON.parse(answer.body.text)
  }

  const listener = net.createServer((socket) => socket.destroy())
  await new Promise((resolve) => listener.listen(0, '0.0.0.0', resolve))
  t.after(() => listener.close())
  const port = listener.address().port
  const hostAddress = Object.values(networkInterfaces()).flat().find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address
  assert.ok(hostAddress, 'the host has a non-loopback IPv4 address')
  const loopback = (host) => (host === 'localhost' ? '127.0.0.1' : host)
  const hubCluster = adminConnection()
  const targets = [{ host: '127.0.0.1', port }, { host: hostAddress, port }, { host: loopback(admin.host), port: admin.port }, { host: loopback(hubCluster.host), port: hubCluster.port }]
  const fromHost = (target) => new Promise((resolve) => {
    const socket = net.connect(target)
    socket.once('connect', () => { socket.destroy(); resolve('CONNECTED') })
    socket.once('error', (error) => resolve(error.code))
  })
  assert.deepEqual(await Promise.all(targets.map(fromHost)), ['CONNECTED', 'CONNECTED', 'CONNECTED', 'CONNECTED'], 'every target, the Applications and the Hub cluster included, accepts the host')

  const egress = await run('network_egress', { targets })
  assert.equal(egress.BREACH, false, JSON.stringify(egress))
  assert.deepEqual(Object.values(egress.results).map((result) => result.ok), [false, false, false, false, false, false])

  const walk = await run('walk_fs', { home: homedir() })
  assert.equal(typeof walk.probes['/'], 'number', 'the permission layer is off: the root lists')
  assert.deepEqual({ ...walk.probes, '/': 'listed' }, { [homedir()]: 'ENOENT', '/home': 'ENOENT', '/root': 'ENOENT', '/etc': 'ENOENT', '/': 'listed' })

  const secrets = [homedir(), '/etc/passwd', '/etc/shadow', `/proc/${process.pid}/environ`, `/proc/${process.pid}/cmdline`,
    join(process.env.CONEXUS_TEST_APP_TLS_DIR, 'relay-key.pem'), stateDir, '/var/run/docker.sock']
  const read = await run('read_secrets', { paths: secrets })
  assert.equal(read.BREACH, false)
  assert.deepEqual(read.results.map((entry) => [entry.path, entry.exists, entry.err]), secrets.map((path) => [path, false, 'ENOENT']))

  const proc = await run('read_proc', {})
  assert.equal(proc.sawForeignSecret, false)
  assert.ok(proc.visiblePids <= 3, `the worker sees only its own pid namespace (${proc.visiblePids})`)
})

test('the runner refuses to start where the sandbox cannot be built', () => {
  assert.throws(() => assertUserNamespaces({ ...DEFAULT_SANDBOX, bwrap: '/nonexistent/bwrap' }), /RUNNER_USER_NAMESPACES_UNAVAILABLE/)
})

test('the runner socket admits an invocation only with an exact platform caller beside the input', async () => {
  const { invokeBody } = await import(hubModuleUrl('app-runner/requests.js'))
  const body = { projectId: randomUUID(), operation: 'whoAmI', input: {}, files: serverTree([]), caller: CALLER }
  assert.deepEqual(invokeBody.parse(body).caller, { accountId: '55555555-5555-4555-8555-555555555555', email: 'funcionaria@example.com', displayName: 'Funcionária' })
  assert.equal(invokeBody.safeParse({ ...body, caller: { ...CALLER, email: null } }).success, true)
  const { caller: _omitted, ...withoutCaller } = body
  for (const refused of [
    withoutCaller,
    { ...body, caller: { ...CALLER, role: 'owner' } },
    { ...body, caller: { accountId: CALLER.accountId, displayName: CALLER.displayName } },
    { ...body, caller: { ...CALLER, accountId: 'not-a-uuid' } },
    { ...body, caller: { ...CALLER, displayName: '' } },
    { ...body, caller: { ...CALLER, email: '' } },
    { ...body, caller: { ...CALLER, email: 42 } },
  ]) assert.equal(invokeBody.safeParse(refused).success, false, JSON.stringify(refused.caller))
})

// A handler reaching the Connector broker through the one socket the runner binds: the order comes
// back, and the handler still holds no credential, no token and no other way out.
const CONNECTOR_HANDLER = `const READ = 'sankhya.purchase-order.read'
export const readOrder = async (input, { connectors }) => ({ text: JSON.stringify(await connectors.call(READ, { documentNumber: input.documentNumber })) })
export const callShapes = async (input, { connectors }) => ({ text: JSON.stringify([
  await connectors.call(42, {}),
  await connectors.call(READ, { documentNumber: 22790, service: 'CRUDServiceProvider.saveRecord' }),
  await connectors.call('sankhya.everything.read', {}),
]) })
export const probe = async (input, context) => {
  const fs = await import('node:fs')
  const net = await import('node:net')
  const attempt = async (work) => { try { return await work() } catch (error) { return String(error?.cause?.code ?? error?.code ?? error?.name ?? 'ERROR') } }
  const connect = (options) => new Promise((resolve) => { const socket = net.connect(options); socket.once('connect', () => { socket.destroy(); resolve('CONNECTED') }); socket.once('error', (error) => resolve(String(error.code))) })
  return { text: JSON.stringify({
    uid: process.getuid(),
    socket: await attempt(() => { const stat = fs.statSync('/run/conexus/connector/.s.connector'); return { uid: stat.uid, mode: (stat.mode & 0o777).toString(8), isSocket: stat.isSocket() } }),
    listing: await attempt(() => fs.readdirSync('/run/conexus/connector')),
    elsewhere: await Promise.all(input.paths.map((path) => connect({ path }))),
    tcp: await connect({ host: '127.0.0.1', port: input.port }),
    fetch: await attempt(async () => { await fetch('http://127.0.0.1:' + input.port + '/authenticate'); return 'FETCHED' }),
    env: process.env,
    context: Object.keys(context).sort(),
    connectorKeys: Object.keys(context.connectors),
    frozen: Object.isFrozen(context.connectors),
    files: { environ: await attempt(() => fs.readFileSync('/proc/self/environ', 'utf8')), cmdline: await attempt(() => fs.readFileSync('/proc/self/cmdline', 'utf8')) },
  }) }
}
`
const connectorTree = () => {
  const manifest = {
    version: 1,
    operations: {
      readOrder: { module: 'handlers/connector.mjs', export: 'readOrder', input: { type: 'object', properties: { documentNumber: { type: 'integer' } }, required: ['documentNumber'], additionalProperties: false }, output: text },
      callShapes: { module: 'handlers/connector.mjs', export: 'callShapes', input: empty, output: text },
      probe: { module: 'handlers/connector.mjs', export: 'probe', input: { type: 'object', properties: { paths: { type: 'array', items: { type: 'string' } }, port: { type: 'integer' } }, required: ['paths', 'port'], additionalProperties: false }, output: text },
    },
    migrations: [],
  }
  return [file('manifest.json', JSON.stringify(manifest)), file('handlers/connector.mjs', CONNECTOR_HANDLER)]
}

const connectorSetup = async (t, sandbox) => {
  const socketDir = mkdtempSync(join(tmpdir(), 'cx-'))
  t.after(() => rmSync(socketDir, { recursive: true, force: true }))
  const runner = await setup(t, sandbox, { connectorSocketDir: socketDir })
  const [project, otherProject] = runner.projects
  const fake = await startFakeGateway()
  t.after(() => fake.close())
  const envelope = createSecretEnvelope('fe'.repeat(32))
  const sealed = await envelope.seal(JSON.stringify(FAKE_CREDENTIAL))
  const store = {
    resolveGrant: async (input) => (input.projectId === project ? { grantId: 'grant', connectionId: '33333333-3333-4333-8333-333333333333' } : null),
    readConnectionCredential: async () => sealed,
    listGrantedCapabilities: async () => [],
  }
  const broker = createBroker({ connectors: [{ definition: sankhyaDefinition, adapter: createSankhyaGateway({ origin: fake.origin }) }], store, envelope, audit: () => undefined })
  const ports = createHandlerPorts({ directory: socketDir, broker })
  await ports.sweep()
  const open = async (projectId) => {
    const port = await ports.open(scopeFromArtifactSource({ via: 'PREVIEW', projectId }))
    t.after(() => port.close())
    return port
  }
  const files = connectorTree()
  assert.deepEqual(await runner.supervisor.prepare({ projectId: project, files }), { state: 'READY', reset: false, applied: [] })
  const invoke = (operation, input, connectorSocket) => runner.supervisor.invoke({ projectId: project, operation, input, files, caller: CALLER, ...(connectorSocket ? { connectorSocket } : {}) })
  const port = Number(new URL(fake.origin).port)
  return { ...runner, socketDir, fake, open, invoke, project, otherProject, port }
}

const noSecretIn = (text) => {
  for (const secret of [...Object.values(FAKE_CREDENTIAL), 'fake-token-', SECRET_MARKER]) assert.equal(text.includes(secret), false, `${secret} reached the handler`)
}

test('a handler reads the order through the bound connector socket, and holds nothing else', async (t) => {
  const { socketDir, fake, open, invoke, project, otherProject, port } = await connectorSetup(t)
  const portA = await open(project)
  const portB = await open(otherProject)
  const run = async (operation, input, socket = portA.socketPath) => {
    const answer = await invoke(operation, input, socket)
    assert.equal(answer.status, 200, JSON.stringify(answer.body))
    return JSON.parse(answer.body.text)
  }

  assert.deepEqual(await run('readOrder', { documentNumber: 22790 }), { ok: true, value: EXPECTED_ORDER_22790 })
  assert.deepEqual(fake.requests.map((request) => request.path), ['/authenticate', '/gateway/v1/mge/service.sbr', '/gateway/v1/mge/service.sbr'])
  assert.deepEqual(await run('callShapes', {}), [
    { ok: false, code: 'OPERATION_UNKNOWN' },
    { ok: false, code: 'INPUT_REFUSED', issues: ['/service'] },
    { ok: false, code: 'OPERATION_UNKNOWN' },
  ])
  // The other Project's port is open, but its socket is not this handler's, and the grant is the port's.
  assert.deepEqual(await run('readOrder', { documentNumber: 22790 }, portB.socketPath), { ok: false, code: 'NOT_GRANTED' })

  const seen = await run('probe', { paths: [portA.socketPath, portB.socketPath, `${socketDir}/.s.connector`, socketDir], port })
  noSecretIn(JSON.stringify(seen))
  assert.deepEqual({ ...seen, tcp: seen.tcp === 'CONNECTED', fetch: seen.fetch === 'FETCHED' }, {
    uid: seen.uid,
    socket: 'ERR_ACCESS_DENIED',
    listing: 'ERR_ACCESS_DENIED',
    elsewhere: ['ENOENT', 'ENOENT', 'ENOENT', 'ENOENT'],
    tcp: false,
    fetch: false,
    env: { PWD: '/' },
    context: ['caller', 'connectors', 'db'],
    connectorKeys: ['call'],
    frozen: true,
    files: { environ: 'ERR_ACCESS_DENIED', cmdline: 'ERR_ACCESS_DENIED' },
  })
  t.diagnostic(`P12 with the socket bound: tcp ${seen.tcp}, fetch ${seen.fetch}`)
  assert.equal(fake.requests.length, 3, 'the probe reached no gateway')

  await t.test('without a bound socket every call answers CONNECTOR_UNCONFIGURED', async () => {
    const answer = await invoke('readOrder', { documentNumber: 22790 })
    assert.deepEqual(JSON.parse(answer.body.text), { ok: false, code: 'CONNECTOR_UNCONFIGURED' })
  })

  await t.test('the runner binds only a socket directly inside its own configured directory', async () => {
    writeFileSync(join(socketDir, 'plain.s'), 'x')
    symlinkSync(portA.socketPath, join(socketDir, 'link.s'))
    for (const path of [join(socketDir, 'plain.s'), join(socketDir, 'link.s'), join(tmpdir(), 'elsewhere.s'), `${socketDir}/../${portA.socketPath.split('/').at(-1)}`, 'relative.s']) {
      assert.deepEqual(await invoke('readOrder', { documentNumber: 22790 }, path), { status: 500, body: { error: { code: 'CONNECTOR_SOCKET_REFUSED' } } }, path)
    }
  })

  await t.test('a closed port refuses its next connection: the socket dies with the invocation', async () => {
    await portA.close()
    assert.deepEqual(await invoke('readOrder', { documentNumber: 22790 }, portA.socketPath), { status: 500, body: { error: { code: 'CONNECTOR_SOCKET_REFUSED' } } })
  })
})

// M3 and M4 with the Node permission layer off, so the probe can stat and list what the namespaces
// alone expose: the bound socket's owner, the uid bubblewrap runs the handler under, and a directory
// holding only this invocation's socket.
test('M3 and M4: the handler connects to the 0600 socket under its own uid and sees no other socket', async (t) => {
  const { socketDir, open, invoke, project, otherProject, port } = await connectorSetup(t, { ...DEFAULT_SANDBOX, nodePermission: false })
  const portA = await open(project)
  const portB = await open(otherProject)
  const answer = await invoke('probe', { paths: [portA.socketPath, portB.socketPath, `${socketDir}/.s.connector`], port }, portA.socketPath)
  assert.equal(answer.status, 200, JSON.stringify(answer.body))
  const seen = JSON.parse(answer.body.text)
  noSecretIn(JSON.stringify(seen))
  const host = statSync(portA.socketPath)
  t.diagnostic(`M3: host socket owner uid ${host.uid} mode ${(host.mode & 0o777).toString(8)}; runner uid ${process.getuid()}; inside the sandbox socket uid ${seen.socket.uid}, handler uid ${seen.uid}`)
  assert.deepEqual({ uid: seen.uid, socket: seen.socket, listing: seen.listing, elsewhere: seen.elsewhere, tcp: seen.tcp === 'CONNECTED', fetch: seen.fetch === 'FETCHED', env: seen.env }, {
    uid: process.getuid(),
    socket: { uid: host.uid, mode: '600', isSocket: true },
    listing: ['.s.connector'],
    elsewhere: ['ENOENT', 'ENOENT', 'ENOENT'],
    tcp: false,
    fetch: false,
    env: { PWD: '/' },
  })
  assert.equal((await invoke('readOrder', { documentNumber: 22790 }, portA.socketPath)).body.text, JSON.stringify({ ok: true, value: EXPECTED_ORDER_22790 }))
})
