import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import net from 'node:net'
import { homedir, networkInterfaces, tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import pg from 'pg'
import { provisionApplicationDatabase } from '../../scripts/provision-application-database.mjs'
import { relayTls } from './application-cluster.mjs'
import { adminConnection, createEmptyDatabase } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'
import { probeOperations, probeServerTree } from './sandbox-probe/server-tree.mjs'

// The real runner path: a supervisor that provisions with app_provisioner, migrates and invokes
// through the rootless bubblewrap worker and the pinned database relay. Needs unprivileged user
// namespaces and /usr/bin/bwrap on the host.
const { createSupervisor } = await import(hubModuleUrl('app-runner/supervisor.js'))
const { assertUserNamespaces, stageWorkerRuntime, DEFAULT_SANDBOX } = await import(hubModuleUrl('app-runner/sandbox.js'))
const { openPgRelay } = await import(hubModuleUrl('app-runner/pg-relay.js'))
const { previewAllocation } = await import(hubModuleUrl('app-runner/data-plane.js'))

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
const PROBE_HANDLER = `export const sleepInDatabase = async (input, { db }) => { await db.query('SET statement_timeout = 0'); await db.query('SELECT pg_sleep(60)'); return {} }
export const spin = async () => { for (;;) {} }
export const crash = async () => { process.abort() }
export const huge = async () => ({ text: 'x'.repeat(2 * 1024 * 1024) })
export const wrongShape = async () => ({ id: '1', purchaseOrderId: 'PO-1', note: 'n', createdAt: 'now' })
export const environment = async () => ({ text: JSON.stringify(process.env) })
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
    },
    migrations: migrations.map(([name, sql]) => ({ name, sha256: sha(sql), sql })),
  }
  return [file('manifest.json', JSON.stringify(manifest)), file('handlers/notes.mjs', NOTES_HANDLER), file('handlers/probe.mjs', PROBE_HANDLER)]
}

const setup = async (t, sandbox) => {
  await refuseProtectedCluster()
  assertUserNamespaces()
  const admin = adminConnection()
  const database = `conexus_apps_${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const provisionerPassword = randomBytes(24).toString('base64url')
  const hub = await createEmptyDatabase(t, 'conexus_q1_hub')
  await provisionApplicationDatabase({
    cluster: { host: admin.host, port: admin.port }, database, hubDatabase: hub.database, hubRoles: [],
    installation: { user: admin.user, password: admin.password }, provisionerPassword,
  })
  const stateDir = mkdtempSync(join(tmpdir(), 'conexus-runner-'))
  const supervisor = createSupervisor({
    stateDir, runtimeDir: stageWorkerRuntime(join(stateDir, 'runtime')), cluster: { host: admin.host, port: admin.port },
    database, provisionerPassword, relayTls: relayTls(), ...(sandbox ? { sandbox } : {}),
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
  const invoke = (projectId, operation, input = {}) => supervisor.invoke({ projectId, operation, input, files })

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
  assert.deepEqual(await invoke(a, 'dropEverything'), { status: 404, body: { error: { code: 'OPERATION_NOT_FOUND' } } })
  assert.deepEqual(await invoke(a, 'wrongShape'), { status: 502, body: { error: { code: 'HANDLER_OUTPUT_REFUSED', detail: '/id: expected integer' } } })
  assert.deepEqual(await invoke(a, 'huge'), { status: 502, body: { error: { code: 'RESPONSE_TOO_LARGE' } } })
  assert.deepEqual(await invoke(a, 'environment'), { status: 200, body: { text: '{"PWD":"/"}' } })

  // The handler first lifts its own statement_timeout, which any session may do, so only the
  // relay's cancel at the invocation's wall clock can end the statement.
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
})

// The arena's reviewed cases, run with Node's permission layer off, so what they report is what the
// bubblewrap namespaces alone allow. The network targets are listeners the host provably reaches.
test('with the Node permission layer off, the namespaces alone hide host files, processes and network', async (t) => {
  const { admin, supervisor, projects: [project], stateDir } = await setup(t, { ...DEFAULT_SANDBOX, nodePermission: false })
  const files = probeServerTree()
  assert.deepEqual(await supervisor.prepare({ projectId: project, files }), { state: 'READY', reset: false, applied: [] })
  const run = async (name, input) => {
    const answer = await supervisor.invoke({ projectId: project, operation: probeOperations[name], input, files })
    assert.equal(answer.status, 200, JSON.stringify(answer.body))
    return JSON.parse(answer.body.text)
  }

  const listener = net.createServer((socket) => socket.destroy())
  await new Promise((resolve) => listener.listen(0, '0.0.0.0', resolve))
  t.after(() => listener.close())
  const port = listener.address().port
  const hostAddress = Object.values(networkInterfaces()).flat().find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address
  assert.ok(hostAddress, 'the host has a non-loopback IPv4 address')
  const targets = [{ host: '127.0.0.1', port }, { host: hostAddress, port }, { host: admin.host === 'localhost' ? '127.0.0.1' : admin.host, port: admin.port }]
  const fromHost = (target) => new Promise((resolve) => {
    const socket = net.connect(target)
    socket.once('connect', () => { socket.destroy(); resolve('CONNECTED') })
    socket.once('error', (error) => resolve(error.code))
  })
  assert.deepEqual(await Promise.all(targets.map(fromHost)), ['CONNECTED', 'CONNECTED', 'CONNECTED'], 'every target accepts the host')

  const egress = await run('network_egress', { targets })
  assert.equal(egress.BREACH, false, JSON.stringify(egress))
  assert.deepEqual(Object.values(egress.results).map((result) => result.ok), [false, false, false, false, false])

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
