import assert from 'node:assert/strict'
import test from 'node:test'
import { APICallError } from 'ai'
import { hubModuleUrl } from './hub-build.mjs'

const { builderErrorProcessors } = await import(hubModuleUrl('builder/harness/error-processors.js'))

const offline = (code) => new APICallError({
  message: `Cannot connect to API: getaddrinfo ${code} api.anthropic.com`,
  cause: Object.assign(new Error(`getaddrinfo ${code} api.anthropic.com`), { code }),
  url: 'https://api.anthropic.com/v1/messages',
  requestBodyValues: {},
  isRetryable: true,
})

const retryProcessor = (delays) => builderErrorProcessors((retryCount) => { delays.push(retryCount); return 1 }).find((p) => p.id === 'stream-error-retry-processor')

for (const code of ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EWHATEVER']) {
  test(`a dropped connection (${code}) is retried through the 10th attempt and not the 11th`, async () => {
    const processor = retryProcessor([])
    const results = []
    for (let retryCount = 0; retryCount <= 10; retryCount++) {
      results.push(await processor.processAPIError({ error: offline(code), retryCount, abortSignal: undefined, requestContext: undefined }))
    }
    assert.deepEqual(results.map((result) => result?.retry), [true, true, true, true, true, true, true, true, true, true, undefined])
  })
}

test('the wait before attempt n is min(500 * 2^n, 30000) ms and each retry emits an event with maxRetries 10', async () => {
  const events = []
  const waits = []
  const processor = builderErrorProcessors().find((p) => p.id === 'stream-error-retry-processor')
  const requestContext = { get: () => ({ emitEvent: (event) => events.push(event) }) }
  const realSetTimeout = globalThis.setTimeout
  globalThis.setTimeout = (fn, ms, ...rest) => { waits.push(ms); return realSetTimeout(fn, 0, ...rest) }
  try {
    for (let retryCount = 0; retryCount < 10; retryCount++) await processor.processAPIError({ error: offline('ENOTFOUND'), retryCount, abortSignal: undefined, requestContext })
  } finally { globalThis.setTimeout = realSetTimeout }
  assert.deepEqual(waits, [500, 1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000])
  assert.deepEqual(events.map((e) => [e.retryAttempt, e.retryDelay, e.maxRetries, e.retryable, e.error.message]), [500, 1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000].map((d, i) => [i + 1, d, 10, true, 'MODEL_CALL_RETRYING']))
})

test('an HTTP answer with a status keeps the processor default, and a 5xx is still the server policy', async () => {
  const processor = retryProcessor([])
  const http = (statusCode) => new APICallError({ message: 'x', url: 'u', requestBodyValues: {}, statusCode })
  assert.deepEqual(await processor.processAPIError({ error: http(429), retryCount: 1, abortSignal: undefined }), { retry: true })
  assert.equal(await processor.processAPIError({ error: http(429), retryCount: 2, abortSignal: undefined }), undefined)
  assert.deepEqual(await processor.processAPIError({ error: http(503), retryCount: 9, abortSignal: undefined }), { retry: true })
})
