import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

// The worker process on its own, outside the sandbox: the job on stdin, the one result line on fd 3.
// Its login names a socket folder that does not exist, as for a Project whose Prévia never had a
// server half and so has no database role yet.
const WORKER = fileURLToPath(hubModuleUrl('app-runner/worker.js'))
const NO_DATABASE = Object.freeze({ host: '/nonexistent/conexus-test-socket', user: 'p_none_runtime', database: 'conexus_apps' })
const CALLER = Object.freeze({ accountId: '44444444-4444-4444-8444-444444444444', email: null, displayName: 'Construir' })

const HANDLERS = `export async function readsConexao(input, { connectors }) {
  const answer = await connectors.fetch({ connection: 'erp', method: 'POST', path: '/x' })
  return { code: answer.code }
}
export async function readsDatabase(input, { db }) {
  const { rows } = await db.query('SELECT 1 AS one')
  return rows
}
`

const invoke = (t, exportName) => {
  const directory = mkdtempSync(join(tmpdir(), 'cx-worker-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const module = join(directory, 'handlers.mjs')
  writeFileSync(module, HANDLERS)
  const job = { kind: 'invoke', login: NO_DATABASE, module, export: exportName, input: {}, caller: CALLER, responseLimit: 1024 * 1024, connector: false }
  return new Promise((resolve) => {
    const worker = spawn(process.execPath, [WORKER], { stdio: ['pipe', 'ignore', 'ignore', 'pipe'] })
    const chunks = []
    worker.stdio[3].on('data', (chunk) => chunks.push(chunk))
    worker.on('close', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
    worker.stdin.end(JSON.stringify(job))
  })
}

test('a handler that never queries the database runs where the Project has no database yet', async (t) => {
  assert.deepEqual(await invoke(t, 'readsConexao'), { ok: true, value: { code: 'CONNECTOR_UNCONFIGURED' } })
})

test('a handler whose query cannot reach the database answers DATABASE_UNAVAILABLE, not HANDLER_FAILED', async (t) => {
  const result = await invoke(t, 'readsDatabase')
  assert.deepEqual({ ok: result.ok, code: result.code }, { ok: false, code: 'DATABASE_UNAVAILABLE' })
  assert.match(result.detail, /ENOENT/)
})
