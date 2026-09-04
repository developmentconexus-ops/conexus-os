import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { MastraModelGateway } from '@mastra/core/llm'
import { createBoundedProviderFetch } from './bounded-provider-fetch.mjs'

process.env.MASTRA_TELEMETRY_DISABLED = '1'

const origin = 'http://127.0.0.1:41777/'
const maxResponseBytes = 1024
const encoder = new TextEncoder()

function completion(text = 'bounded answer') {
  return JSON.stringify({
    id: 'response-1',
    object: 'chat.completion',
    created: 1,
    model: 'qualification-model-1',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: text },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
  })
}

function chunkedFetch(bytes, counters, { status = 200, headers = {} } = {}) {
  return async (_input, init) => {
    counters.calls += 1
    counters.redirectModes.push(init.redirect)
    let offset = 0
    const body = new ReadableStream({
      pull(controller) {
        if (offset >= bytes.byteLength) {
          controller.close()
          return
        }
        const end = Math.min(offset + 256, bytes.byteLength)
        counters.producedBytes += end - offset
        controller.enqueue(bytes.slice(offset, end))
        offset = end
      },
      cancel() {
        counters.cancelled += 1
      },
    })
    return new Response(body, {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    })
  }
}

class QualificationGateway extends MastraModelGateway {
  id = 'qualification'
  name = 'R1C13 P0 qualification gateway'

  constructor(fetchImpl) {
    super()
    this.fetchImpl = fetchImpl
    this.boundaryEvents = []
  }

  async fetchProviders() {
    return {
      qualification: {
        apiKeyEnvVar: 'R1C13_QUALIFICATION_KEY',
        gateway: this.id,
        models: ['qualification-model-1'],
        name: this.name,
        url: origin,
      },
    }
  }

  buildUrl() {
    return origin
  }

  async getApiKey() {
    return 'qualification-only-value'
  }

  resolveLanguageModel({ modelId, providerId, apiKey }) {
    const fetch = createBoundedProviderFetch({
      officialOrigin: origin,
      maxResponseBytes,
      fetchImpl: this.fetchImpl,
      allowLoopbackHttpForQualification: true,
      observe: event => this.boundaryEvents.push(event),
    })
    return createOpenAICompatible({
      name: providerId,
      apiKey,
      baseURL: origin,
      fetch,
    }).chatModel(modelId)
  }
}

async function generate(model, promptText = 'bounded prompt') {
  return model.doGenerate({
    prompt: [{ role: 'user', content: [{ type: 'text', text: promptText }] }],
  })
}

function errorChain(error) {
  const values = []
  const seen = new Set()
  let current = error
  while (current && !seen.has(current)) {
    seen.add(current)
    values.push(String(current))
    current = current.cause
  }
  return values.join('\ncaused by: ')
}

test('P0-P01 public Mastra gateway keeps a valid below-limit response usable', async () => {
  const counters = { calls: 0, producedBytes: 0, cancelled: 0, redirectModes: [] }
  const body = encoder.encode(completion())
  assert.ok(body.byteLength < maxResponseBytes)
  const gateway = new QualificationGateway(chunkedFetch(body, counters))
  const model = await gateway.resolveLanguageModel({
    modelId: 'qualification-model-1',
    providerId: 'qualification',
    apiKey: 'qualification-only-value',
  })
  const result = await generate(model)
  assert.equal(result.content.find(part => part.type === 'text')?.text, 'bounded answer')
  assert.equal(counters.calls, 1)
  assert.deepEqual(counters.redirectModes, ['manual'])
  assert.equal(counters.producedBytes, body.byteLength)
})

test('P0-P02 chunked oversized model response refuses before full buffering or settlement', async () => {
  const counters = { calls: 0, producedBytes: 0, cancelled: 0, redirectModes: [] }
  const secret = 'credential-must-not-leak'
  const bodyMarker = 'body-must-not-leak'
  const oversized = encoder.encode(completion(bodyMarker.repeat(900)))
  const gateway = new QualificationGateway(chunkedFetch(oversized, counters))
  const model = await gateway.resolveLanguageModel({
    modelId: 'qualification-model-1',
    providerId: 'qualification',
    apiKey: secret,
  })
  let settled = false
  const error = await generate(model, bodyMarker).then(
    () => {
      settled = true
      return new Error('unexpected settlement')
    },
    reason => reason,
  )
  assert.equal(settled, false)
  const failure = errorChain(error)
  assert.match(failure, /PROJECT_MODEL_RESPONSE_LIMIT_EXCEEDED/)
  assert.doesNotMatch(failure, new RegExp(secret))
  assert.doesNotMatch(failure, new RegExp(bodyMarker))
  assert.ok(counters.producedBytes < oversized.byteLength)
  assert.equal(counters.cancelled, 1)
  const refusalEvent = gateway.boundaryEvents.find(event => event.type === 'stream-limit-refused')
  assert.ok(refusalEvent)
  assert.ok(refusalEvent.acceptedBytes <= maxResponseBytes)
})

test('P0-P03 declared oversized response refuses before reading', async () => {
  const counters = { calls: 0, producedBytes: 0, cancelled: 0, redirectModes: [] }
  const body = encoder.encode(completion('unused'.repeat(3000)))
  const gateway = new QualificationGateway(chunkedFetch(body, counters, {
    headers: { 'content-length': String(maxResponseBytes + 1) },
  }))
  const model = await gateway.resolveLanguageModel({
    modelId: 'qualification-model-1',
    providerId: 'qualification',
    apiKey: 'qualification-only-value',
  })
  await assert.rejects(generate(model), /PROJECT_MODEL_RESPONSE_LIMIT_EXCEEDED/)
  assert.ok(counters.producedBytes <= 256)
  assert.ok(counters.producedBytes < body.byteLength)
  assert.equal(counters.cancelled, 1)
  assert.deepEqual(gateway.boundaryEvents, [{ type: 'declared-limit-refused', acceptedBytes: 0 }])
})

test('P0-P04 origin and redirect controls fire independently', async () => {
  const fetch = createBoundedProviderFetch({
    officialOrigin: origin,
    maxResponseBytes,
    fetchImpl: async () => new Response(null, {
      status: 302,
      headers: { location: 'https://example.invalid/escape' },
    }),
    allowLoopbackHttpForQualification: true,
  })
  await assert.rejects(fetch('https://example.invalid/v1/chat/completions'), /PROJECT_MODEL_EGRESS_DENIED/)
  await assert.rejects(fetch(`${origin}v1/chat/completions`), /PROJECT_MODEL_REDIRECT_DENIED/)
})

test('P0-P05 production construction refuses non-HTTPS origins and invalid ceilings', () => {
  assert.throws(() => createBoundedProviderFetch({
    officialOrigin: origin,
    maxResponseBytes,
  }), /PROJECT_MODEL_HTTPS_ORIGIN_REQUIRED/)
  assert.throws(() => createBoundedProviderFetch({
    officialOrigin: 'https://api.example.invalid/',
    maxResponseBytes: 0,
  }), /PROJECT_MODEL_RESPONSE_LIMIT_INVALID/)
})

test('P0-P06 control without the boundary consumes the same oversized fixture', async () => {
  const counters = { calls: 0, producedBytes: 0, cancelled: 0, redirectModes: [] }
  const oversizedAnswer = 'control-consumes-full-body'.repeat(900)
  const oversized = encoder.encode(completion(oversizedAnswer))
  const model = createOpenAICompatible({
    name: 'qualification-control',
    apiKey: 'qualification-only-value',
    baseURL: origin,
    fetch: chunkedFetch(oversized, counters),
  }).chatModel('qualification-model-1')
  const result = await generate(model)
  assert.equal(result.content.find(part => part.type === 'text')?.text, oversizedAnswer)
  assert.equal(counters.producedBytes, oversized.byteLength)
  assert.equal(counters.cancelled, 0)
})

test('P0-P07 oversized provider error response uses the same bounded refusal', async () => {
  const counters = { calls: 0, producedBytes: 0, cancelled: 0, redirectModes: [] }
  const errorBody = encoder.encode(JSON.stringify({ error: { message: 'provider-body'.repeat(900) } }))
  const gateway = new QualificationGateway(chunkedFetch(errorBody, counters, { status: 400 }))
  const model = await gateway.resolveLanguageModel({
    modelId: 'qualification-model-1',
    providerId: 'qualification',
    apiKey: 'credential-must-not-leak',
  })
  const error = await generate(model).then(
    () => new Error('unexpected settlement'),
    reason => reason,
  )
  assert.match(errorChain(error), /PROJECT_MODEL_RESPONSE_LIMIT_EXCEEDED/)
  assert.doesNotMatch(errorChain(error), /credential-must-not-leak|provider-body/)
  assert.ok(counters.producedBytes < errorBody.byteLength)
  assert.equal(counters.cancelled, 1)
  assert.ok(gateway.boundaryEvents.some(event => event.type === 'stream-limit-refused'))
})
