import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = await mkdtemp(resolve(repositoryRoot, 'apps/hub/builder-credential-generation-build-'))
test.after(() => rm(buildRoot, { recursive: true, force: true }))

const bundle = (relativeSourcePath) => {
  const outfile = resolve(buildRoot, `${relativeSourcePath.replaceAll('/', '-')}.js`)
  const built = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
    resolve(repositoryRoot, relativeSourcePath), `--outfile=${outfile}`, '--bundle', '--platform=node', '--format=esm', '--packages=external', '--log-level=error',
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  if (built.status !== 0) throw new Error(built.stdout || built.stderr)
  return import(pathToFileURL(outfile).href)
}

await writeFile(resolve(buildRoot, 'entry.ts'), `export { driveStep } from '${resolve(repositoryRoot, 'apps/hub/src/builder/run/send.ts')}'\nexport { Failure } from '${resolve(repositoryRoot, 'apps/hub/src/platform/failure.ts')}'\n`)
const { driveStep, Failure } = await bundle(relative(repositoryRoot, resolve(buildRoot, 'entry.ts')))
const { RequestContext } = await import('@mastra/core/request-context')
// The Hub's one send: a message with no question open, so there is nothing to end first.
const sendBuilderSessionMessage = (session, { content }, requestContext = new RequestContext()) => driveStep(session, { kind: 'SEND', content }, requestContext, async () => {})

const { ProviderAuthRequiredError } = await import('@mastra/code-sdk/auth/provider-auth-error')

const fakeThreadFields = {
  thread: { requireId: () => 'conversation' },
  identity: { getResourceId: () => 'conversation' },
  machinery: { subscribeToThread: async () => ({ stream: (async function* () {})(), unsubscribe: () => undefined }) },
}

test('the Hub send classifies a 401/403 agent error as an auth failure without leaking the provider message', async () => {
  let listener
  const providerError = new Error('invalid x-api-key header, secret-token-xyz')
  providerError.statusCode = 401
  const session = {
    subscribe: (callback) => { listener = callback; return () => {} },
    ...fakeThreadFields,
    sendMessage: async () => {
      listener({ type: 'error', error: providerError })
      listener({ type: 'agent_end', reason: 'error' })
    },
  }
  await assert.rejects(() => sendBuilderSessionMessage(session, { content: 'hi' }), (error) => {
    assert.equal(error.message, 'BUILDER_MODEL_AUTH_FAILED')
    return true
  })
})

test('Mastra Code\'s provider-auth error is an auth failure, whether the run reports it or sendMessage throws it', async () => {
  let listener
  const reported = {
    subscribe: (callback) => { listener = callback; return () => {} },
    ...fakeThreadFields,
    sendMessage: async () => {
      listener({ type: 'error', error: new ProviderAuthRequiredError('Kimi For Coding credentials are invalid, token kimi-secret') })
      listener({ type: 'agent_end', reason: 'error' })
    },
  }
  const thrown = {
    subscribe: () => () => {},
    ...fakeThreadFields,
    sendMessage: async () => { throw new ProviderAuthRequiredError('Not logged in to Kimi For Coding.') },
  }
  for (const session of [reported, thrown]) {
    await assert.rejects(() => sendBuilderSessionMessage(session, { content: 'hi' }), { message: 'BUILDER_MODEL_AUTH_FAILED' })
  }
})

test('the Hub send preserves a generic agent error as a safe named code, not the raw provider message', async () => {
  let listener
  const session = {
    subscribe: (callback) => { listener = callback; return () => {} },
    ...fakeThreadFields,
    sendMessage: async () => {
      listener({ type: 'error', error: new Error('upstream 500 with internal trace id abc123') })
      listener({ type: 'agent_end', reason: 'error' })
    },
  }
  await assert.rejects(() => sendBuilderSessionMessage(session, { content: 'hi' }), (error) => {
    assert.equal(error.message, 'BUILDER_MODEL_STREAM_FAILED')
    return true
  })
})

test('the Hub send still reports rate limiting distinctly', async () => {
  const session = {
    subscribe: () => () => {},
    ...fakeThreadFields,
    sendMessage: async () => { const err = new Error('Too Many Requests'); err.statusCode = 429; throw err },
  }
  await assert.rejects(() => sendBuilderSessionMessage(session, { content: 'hi' }), (error) => {
    assert.equal(error.message, 'BUILDER_MODEL_RATE_LIMITED')
    return true
  })
})

test('the Hub send propagates a model-selection refusal unchanged, with no agent_end event required', async () => {
  const session = {
    subscribe: () => () => {},
    ...fakeThreadFields,
    sendMessage: async () => { throw new Failure('BUILDER_MODEL_NOT_SELECTED') },
  }
  await assert.rejects(() => sendBuilderSessionMessage(session, { content: 'hi' }), (error) => {
    assert.equal(error.message, 'BUILDER_MODEL_NOT_SELECTED')
    return true
  })
})

test('a model without an account reads as connect-a-model even when it surfaces mid-run as an agent error, wrapped or not', async () => {
  for (const error of [new Failure('BUILDER_MODEL_NOT_SELECTED'), new Error('stream failed', { cause: new Failure('BUILDER_MODEL_NOT_SELECTED') })]) {
    let listener
    const session = {
      subscribe: (callback) => { listener = callback; return () => {} },
      ...fakeThreadFields,
      sendMessage: async () => {
        listener({ type: 'error', error })
        listener({ type: 'agent_end', reason: 'error' })
      },
    }
    await assert.rejects(() => sendBuilderSessionMessage(session, { content: 'hi' }), { message: 'BUILDER_MODEL_NOT_SELECTED' })
  }
})

test('the Hub send returns complete on success', async () => {
  let listener
  const session = {
    subscribe: (callback) => { listener = callback; return () => {} },
    ...fakeThreadFields,
    sendMessage: async () => { listener({ type: 'agent_end', reason: 'complete' }) },
  }
  const reason = await sendBuilderSessionMessage(session, { content: 'hi' })
  assert.equal(reason, 'complete')
})
