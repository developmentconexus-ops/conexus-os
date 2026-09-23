import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import pg from 'pg'
import { provisionApplicationDatabase } from '../../scripts/provision-application-database.mjs'
import { adminConnection } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

// The real runner path: a supervisor that provisions with app_provisioner, migrates and invokes
// through the rootless bubblewrap worker and the pinned database relay. Needs unprivileged user
// namespaces and /usr/bin/bwrap on the host.
const { createSupervisor } = await import(hubModuleUrl('app-runner/supervisor.js'))
const { assertUserNamespaces, stageWorkerRuntime, DEFAULT_SANDBOX } = await import(hubModuleUrl('app-runner/sandbox.js'))
const { openPgRelay } = await import(hubModuleUrl('app-runner/pg-relay.js'))
const { previewAllocation, roleCredential } = await import(hubModuleUrl('app-runner/data-plane.js'))

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
const PROBE_HANDLER = `export const sleepInDatabase = async (input, { db }) => { await db.query('SELECT pg_sleep(60)'); return {} }
export const spin = async () => { for (;;) {} }
export const crash = async () => { process.abort() }
export const huge = async () => ({ text: 'x'.repeat(2 * 1024 * 1024) })
export const wrongShape = async () => ({ id: '1', purchaseOrderId: 'PO-1', note: 'n', createdAt: 'now' })
export const environment = async () => ({ text: JSON.stringify(process.env) })
export const hogMemory = async () => { const kept = []; for (;;) kept.push(new Array(1e6).fill(Math.random())) }
export const hogBuffers = async () => { const kept = []; for (;;) kept.push(Buffer.alloc(256 * 1024 * 1024, 1)) }
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
    },
    migrations: migrations.map(([name, sql]) => ({ name, sha256: sha(sql), sql })),
  }
  return [file('manifest.json', JSON.stringify(manifest)), file('handlers/notes.mjs', NOTES_HANDLER), file('handlers/probe.mjs', PROBE_HANDLER)]
}

const setup = async (t) => {
  await refuseProtectedCluster()
  assertUserNamespaces()
  const admin = adminConnection()
  const database = `conexus_apps_${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const provisionerPassword = randomBytes(24).toString('base64url')
  await provisionApplicationDatabase({ cluster: { host: admin.host, port: admin.port }, database, installation: { user: admin.user, password: admin.password }, provisionerPassword })
  const stateDir = mkdtempSync(join(tmpdir(), 'conexus-runner-'))
  const credentialKey = randomBytes(32)
  const supervisor = createSupervisor({
    stateDir, runtimeDir: stageWorkerRuntime(join(stateDir, 'runtime')), cluster: { host: admin.host, port: admin.port },
    database, provisionerPassword, credentialKey,
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
  return { admin, database, supervisor, projects, credentialKey }
}

test('the runner migrates and serves each Project through its own sandboxed worker', async (t) => {
  const { admin, database, supervisor, projects: [a, b], credentialKey } = await setup(t)
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

  await t.test('a failing migration applies nothing and names the error', async () => {
    const broken = serverTree([['001_follow_up_note.sql', NOTE_SQL], ['002_broken.sql', 'ALTER TABLE follow_up_note ADD COLUMN done boolean; SELECT * FROM missing_table']])
    const result = await supervisor.prepare({ projectId: a, files: broken })
    assert.equal(result.state, 'MIGRATION_FAILED')
    assert.match(result.detail, /42P01 relation "missing_table" does not exist/)
    assert.equal((await invoke(a, 'listNotes', { purchaseOrderId: 'PO-7' })).body.length, 1)
  })

  await t.test('the relay admits only the pinned role on the pinned database', async () => {
    const socketDir = mkdtempSync(join(tmpdir(), 'conexus-relay-'))
    t.after(() => rmSync(socketDir, { recursive: true, force: true }))
    const relay = await openPgRelay({ socketPath: join(socketDir, '.s.PGSQL.5432'), upstream: { host: admin.host, port: admin.port }, pin: { user: previewAllocation(a).runtimeRole, database }, maxSessions: 2 })
    const login = (user, target) => {
      const client = new pg.Client({ host: socketDir, user, password: roleCredential(credentialKey, user), database: target, connectionTimeoutMillis: 3000 })
      return client.connect().then(() => client.query('SELECT current_user AS who').then((result) => { client.end(); return result.rows[0].who }), (error) => error.message)
    }
    assert.equal(await login(previewAllocation(b).runtimeRole, database), 'conexus: session refused')
    assert.equal(await login(previewAllocation(a).migrationRole, database), 'conexus: session refused')
    assert.equal(await login(previewAllocation(a).runtimeRole, 'postgres'), 'conexus: session refused')
    assert.equal(await login(previewAllocation(a).runtimeRole, database), previewAllocation(a).runtimeRole)
    assert.deepEqual(relay.refused(), ['IDENTITY', 'IDENTITY', 'IDENTITY'])
    await relay.close()
  })
})

test('the runner refuses to start where the sandbox cannot be built', () => {
  assert.throws(() => assertUserNamespaces({ ...DEFAULT_SANDBOX, bwrap: '/nonexistent/bwrap' }), /RUNNER_USER_NAMESPACES_UNAVAILABLE/)
})
