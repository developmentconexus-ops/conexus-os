import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryStore } from '@mastra/core/storage'
import { createEvalMastra } from '../../scripts/builder-eval/scorers.mjs'
import { startEvalServer } from '../../scripts/builder-eval/serve.mjs'

const startServer = async (t) => {
  const server = await startEvalServer({ mastra: createEvalMastra({ storage: new InMemoryStore() }), port: 0 })
  t.after(() => server.close())
  return server
}

test('the eval server lists every eval scorer on loopback, for Studio to run', async (t) => {
  const server = await startServer(t)

  const response = await fetch(`${server.url}/api/scores/scorers`)

  assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+$/)
  assert.equal(response.status, 200)
  assert.deepEqual(Object.keys(await response.json()).sort(), [
    'app-correct', 'calls-per-step', 'input-tokens', 'output-tokens', 'repeated-reads', 'sim-refusals',
    'skill-reloads', 'tool-calls', 'tool-errors', 'wall-minutes',
  ])
})

test('the eval server lets Studio on port 3000 call it cross-origin and no other origin', async (t) => {
  const server = await startServer(t)
  const preflight = (origin) => fetch(`${server.url}/api/scores/scorers`, {
    method: 'OPTIONS',
    headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'content-type,x-mastra-dev-playground' },
  })

  const studio = await preflight('http://localhost:3000')
  const studioByAddress = await fetch(`${server.url}/api/scores/scorers`, { headers: { origin: 'http://127.0.0.1:3000' } })
  const stranger = await preflight('http://localhost:3001')

  assert.equal(studio.status, 204)
  assert.equal(studio.headers.get('access-control-allow-origin'), 'http://localhost:3000')
  assert.equal(studio.headers.get('access-control-allow-credentials'), 'true')
  assert.equal(studio.headers.get('access-control-allow-headers'), 'content-type,x-mastra-dev-playground')
  assert.equal(studioByAddress.status, 200)
  assert.equal(studioByAddress.headers.get('access-control-allow-origin'), 'http://127.0.0.1:3000')
  assert.equal(stranger.headers.get('access-control-allow-origin'), null)
  assert.equal(stranger.status, 404)
})
