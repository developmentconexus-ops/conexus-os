import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { createApplicationRunnerClient } = await import(hubModuleUrl('app-runner/module.js'))

const fakeRunner = async (t, reply) => {
  const dir = mkdtempSync(join(tmpdir(), 'conexus-app-runner-module-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const socketPath = join(dir, 'runner.sock')
  const server = createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      response.writeHead(reply.status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(reply.body))
    })
  })
  await new Promise((resolve) => server.listen(socketPath, resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return createApplicationRunnerClient(socketPath)
}

const refused = async (t, reply) => {
  const client = await fakeRunner(t, reply)
  const outcome = await client.prepare({ projectId: 'p1', files: [], onDivergence: 'REFUSE' }).then(
    (value) => ({ rejected: false, value }),
    (error) => ({ rejected: true, error }),
  )
  assert.equal(outcome.rejected, true, `expected prepare to reject, got ${JSON.stringify(outcome.value)}`)
  return outcome.error
}

test('a source-shape refusal from the runner keeps its own code and a string reason', async (t) => {
  const error = await refused(t, { status: 422, body: { error: { code: 'SERVER_TREE_REFUSED' } } })
  assert.equal(error.message, 'SERVER_TREE_REFUSED')
  assert.equal(typeof error.cause, 'string')
  assert.equal(error.cause, 'SERVER_TREE_REFUSED')
})

test('a manifest refusal carries its code and its full reason, not just the code', async (t) => {
  const detail = 'MANIFEST_REFUSED: operations.listOpenTitles.input: unknown key "format"'
  const error = await refused(t, { status: 422, body: { error: { code: 'MANIFEST_REFUSED', detail } } })
  assert.equal(error.message, 'MANIFEST_REFUSED')
  assert.equal(error.cause, detail)
})

test('a platform-side prepare fault collapses to the generic refusal, not a source-shape code', async (t) => {
  const detail = 'connect ECONNREFUSED 127.0.0.1:5432'
  const error = await refused(t, { status: 422, body: { error: { code: 'PREPARE_FAILED', detail } } })
  assert.equal(error.message, 'APPLICATION_SERVER_REFUSED')
  assert.equal(typeof error.cause, 'string')
  assert.equal(error.cause, detail)
})

test('a malformed-request refusal with no detail still carries a string reason, the runner\'s own code', async (t) => {
  const error = await refused(t, { status: 400, body: { error: { code: 'PREPARE_REFUSED' } } })
  assert.equal(error.message, 'APPLICATION_SERVER_REFUSED')
  assert.equal(error.cause, 'PREPARE_REFUSED')
})

test('an unparseable refusal body still gives a string reason, never leaving cause undefined', async (t) => {
  const error = await refused(t, { status: 422, body: {} })
  assert.equal(error.message, 'APPLICATION_SERVER_REFUSED')
  assert.equal(error.cause, 'APPLICATION_SERVER_REFUSED')
})

test('a 200 reply resolves normally, refusal-shaping never runs', async (t) => {
  const client = await fakeRunner(t, { status: 200, body: { state: 'READY', reset: false, applied: [] } })
  assert.deepEqual(await client.prepare({ projectId: 'p1', files: [], onDivergence: 'REFUSE' }), { state: 'READY', reset: false, applied: [] })
})
