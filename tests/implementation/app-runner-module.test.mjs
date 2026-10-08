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
      response.writeHead(reply.status, { 'content-type': reply.contentType ?? 'application/json' })
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

test('a handled prepare refusal resolves as its strict private Result', async (t) => {
  const client = await fakeRunner(t, { status: 200, body: { ok: false, error: { code: 'SERVER_TREE_REFUSED' } } })
  assert.deepEqual(await client.prepare({ projectId: 'p1', files: [], onDivergence: 'REFUSE' }), { ok: false, error: { code: 'SERVER_TREE_REFUSED' } })
})

test('a malformed private refusal becomes runner unavailable', async (t) => {
  const error = await refused(t, { status: 200, body: { ok: false, error: { code: 'MANIFEST_REFUSED', where: 'manifest', diagnostic: 'private' } } })
  assert.equal(error.id, 'APPLICATION_RUNNER_UNAVAILABLE')
})

test('an escaping native Problem preserves only its validated table code', async (t) => {
  const error = await refused(t, {
    status: 503,
    contentType: 'application/problem+json',
    body: { type: 'urn:conexus:problem:APPLICATION_RUNNER_UNAVAILABLE', title: 'APPLICATION_RUNNER_UNAVAILABLE', status: 503, code: 'APPLICATION_RUNNER_UNAVAILABLE', detail: 'PRIVATE_MARKER' },
  })
  assert.equal(error.id, 'APPLICATION_RUNNER_UNAVAILABLE')
  assert.notEqual(error.cause, 'PRIVATE_MARKER')
})

test('prepare success resolves with the shared Result', async (t) => {
  const client = await fakeRunner(t, { status: 200, body: { ok: true, result: { reset: false, applied: [] } } })
  assert.deepEqual(await client.prepare({ projectId: 'p1', files: [], onDivergence: 'REFUSE' }), { ok: true, result: { reset: false, applied: [] } })
})

test('a 200 reply that is not a prepare result is the runner being unavailable', async (t) => {
  for (const body of [{ ok: true, result: { reset: 'no', applied: [] } }, { state: 'OTHER' }]) {
    const error = await refused(t, { status: 200, body })
    assert.equal(error.id, 'APPLICATION_RUNNER_UNAVAILABLE')
  }
})

test('a prepare result keeps applied migration identity', async (t) => {
  const body = { ok: true, result: { reset: false, applied: ['001_a.sql'] } }
  const client = await fakeRunner(t, { status: 200, body })
  assert.deepEqual(await client.prepare({ projectId: 'p1', files: [], onDivergence: 'REFUSE' }), body)
})

test('call rejections preserve underlying causes', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'conexus-app-runner-causes-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const socketPath = join(dir, 'runner.sock')

  let mode = 'invalid-json'
  const server = createServer((request, response) => {
    if (mode === 'invalid-json') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('not json')
    } else if (mode === 'socket-error') {
      request.destroy(new Error('simulated-network-fault'))
    }
  })
  await new Promise((resolve) => server.listen(socketPath, resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))

  const client = createApplicationRunnerClient(socketPath)

  // 1. JSON parse error
  mode = 'invalid-json'
  await assert.rejects(
    async () => client.invoke({ projectId: 'p1', method: 'GET', path: '/test', headers: {}, body: null }),
    (error) => {
      assert.equal(error.message, 'APPLICATION_RUNNER_UNAVAILABLE')
      assert.ok(error.cause)
      return true
    }
  )

  // 2. Request/connection error
  mode = 'socket-error'
  await assert.rejects(
    async () => client.invoke({ projectId: 'p1', method: 'GET', path: '/test', headers: {}, body: null }),
    (error) => {
      assert.equal(error.message, 'APPLICATION_RUNNER_UNAVAILABLE')
      assert.ok(error.cause)
      return true
    }
  )
})

for (const status of [200, 201, 204]) {
  test(`release preserves the successful HTTP status distinction at ${status}`, async (t) => {
    const client = await fakeRunner(t, { status, body: { ok: true } })
    if (status === 200) await client.release({ projectId: 'p1' })
    else await assert.rejects(client.release({ projectId: 'p1' }), (error) => error.id === 'APPLICATION_RUNNER_RELEASE_REFUSED')
  })
}

for (const reply of [
  { status: 500, contentType: 'application/problem+json', body: { type: 'urn:conexus:problem:INTERNAL_UNEXPECTED', title: 'INTERNAL_UNEXPECTED', status: 500, code: 'INTERNAL_UNEXPECTED' }, code: 'INTERNAL_UNEXPECTED' },
  { status: 500, body: { private: 'PRIVATE_RELEASE_MARKER' }, code: 'APPLICATION_RUNNER_UNAVAILABLE' },
]) {
  test(`release keeps ${reply.code} for a non-success HTTP response`, async (t) => {
    const client = await fakeRunner(t, reply)
    await assert.rejects(client.release({ projectId: 'p1' }), (error) => error.id === reply.code)
  })
}

test('release maps a closed socket to runner unavailable', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'cx-release-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  await assert.rejects(createApplicationRunnerClient(join(directory, 'closed.sock')).release({ projectId: 'p1' }), (error) => error.id === 'APPLICATION_RUNNER_UNAVAILABLE')
})

for (const timing of ['before', 'in-flight']) {
  test(`Node prepare cancellation ${timing} preserves the signal reason and lets the next request finish`, async (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'cx-abort-'))
    t.after(() => rmSync(directory, { recursive: true, force: true }))
    const socketPath = join(directory, 'runner.sock')
    const controller = new AbortController()
    const reason = new DOMException('Cancelled', 'AbortError')
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json')
      if (!controller.signal.aborted) controller.abort(reason)
      else response.end(JSON.stringify({ ok: true, result: { reset: false, applied: [] } }))
    })
    await new Promise((resolve) => server.listen(socketPath, resolve))
    t.after(() => new Promise((resolve) => server.close(resolve)))
    const client = createApplicationRunnerClient(socketPath)
    if (timing === 'before') controller.abort(reason)
    await assert.rejects(client.prepare({ projectId: 'p1', files: [], onDivergence: 'REFUSE', signal: controller.signal }), (error) => error === reason)
    assert.deepEqual(await client.prepare({ projectId: 'p1', files: [], onDivergence: 'REFUSE' }), { ok: true, result: { reset: false, applied: [] } })
  })
}
