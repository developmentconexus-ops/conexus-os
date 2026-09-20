import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = await mkdtemp(resolve(repositoryRoot, 'apps/hub/model-connection-anthropic-oauth-build-'))
test.after(() => rm(buildRoot, { recursive: true, force: true }))

const outfile = resolve(buildRoot, 'anthropic-oauth-provider.js')
const built = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
  resolve(repositoryRoot, 'apps/hub/src/model-connection/anthropic-oauth-provider.ts'), `--outfile=${outfile}`, '--bundle', '--platform=node', '--format=esm', '--packages=external', '--log-level=error',
], { cwd: repositoryRoot, encoding: 'utf8' })
if (built.status !== 0) throw new Error(built.stdout || built.stderr)
const { createAnthropicOAuthModel } = await import(pathToFileURL(outfile).href)

const tokenStore = Object.freeze({ validate: () => undefined, getToken: async () => Object.freeze({ access: 'access-fixture' }) })
const prompt = [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }]

const requestSent = async (callOptions, modelId = 'claude-sonnet-5') => {
  let captured
  const fetchImpl = async (input, init) => {
    captured = { url: String(input instanceof Request ? input.url : input), init }
    return new Response('event: message_stop\ndata: {"type":"message_stop"}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  try { await createAnthropicOAuthModel({ tokenStore, modelId, fetchImpl }).doStream({ prompt, includeRawChunks: false, ...callOptions }) }
  catch (error) { if (!captured) throw error }
  return { url: captured.url, headers: new Headers(captured.init.headers), body: JSON.parse(captured.init.body) }
}

test('a Claude request bears the OAuth token, never an API key, and reaches the one Anthropic endpoint', async () => {
  const sent = await requestSent({})
  assert.equal(sent.url, 'https://api.anthropic.com/v1/messages')
  assert.equal(sent.headers.get('authorization'), 'Bearer access-fixture')
  assert.equal(sent.headers.get('x-api-key'), null)
  assert.equal(sent.body.model, 'claude-sonnet-5')
})

test('a thinking summary is asked for, so the person sees what the model thought', async () => {
  const sent = await requestSent({})
  assert.deepEqual(sent.body.thinking, { type: 'adaptive', display: 'summarized' })
})

test('a model without adaptive thinking is asked the way it accepts, not refused', async () => {
  const sent = await requestSent({}, 'claude-sonnet-4-5')
  assert.equal(sent.body.thinking.type, 'enabled')
  assert.ok(sent.body.thinking.budget_tokens > 0)
})

test('a caller that already said how thinking behaves is left alone', async () => {
  const disabled = await requestSent({ providerOptions: { anthropic: { thinking: { type: 'disabled' } } } })
  assert.deepEqual(disabled.body.thinking, { type: 'disabled' })

  const omitted = await requestSent({ providerOptions: { anthropic: { thinking: { type: 'adaptive', display: 'omitted' } } } })
  assert.deepEqual(omitted.body.thinking, { type: 'adaptive', display: 'omitted' })
})
