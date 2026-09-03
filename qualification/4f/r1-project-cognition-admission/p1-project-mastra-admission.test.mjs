import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inspect } from 'node:util'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import { z } from 'zod'

process.env.MASTRA_TELEMETRY_DISABLED = '1'

const [{ Agent }, { Mastra }, { RequestContext }, { createTool }, { MastraModelGateway }] = await Promise.all([
  import('@mastra/core/agent'),
  import('@mastra/core/mastra'),
  import('@mastra/core/request-context'),
  import('@mastra/core/tools'),
  import('@mastra/core/llm'),
])

const root = resolve(import.meta.dirname)
const instances = []

const inceptionSchema = {
  type: 'object', additionalProperties: false,
  required: ['candidateDigest', 'proposal', 'sourceRefs'],
  properties: {
    candidateDigest: { type: 'string', minLength: 1 },
    proposal: { type: 'string', minLength: 1 },
    sourceRefs: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
}
const explanationSchema = {
  type: 'object', additionalProperties: false,
  required: ['candidateDigest', 'answer', 'citations'],
  properties: {
    candidateDigest: { type: 'string', minLength: 1 },
    answer: { type: 'string', minLength: 1 },
    citations: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
  },
}

function stableProviderFailure(error) {
  let current = error
  const seen = new Set()
  while (current && !seen.has(current)) {
    seen.add(current)
    if (current instanceof Error && current.message === 'PROJECT_MODEL_RESPONSE_LIMIT_EXCEEDED') {
      return new Error('PROJECT_MODEL_RESPONSE_LIMIT_EXCEEDED')
    }
    current = current.cause
  }
  return new Error('PROJECT_MODEL_PROVIDER_FAILURE')
}

function sanitizeModel(model) {
  return new Proxy(model, {
    get(target, property, receiver) {
      if (property !== 'doGenerate' && property !== 'doStream') {
        return Reflect.get(target, property, receiver)
      }
      return async (...args) => {
        try {
          return await Reflect.apply(target[property], target, args)
        } catch (error) {
          throw stableProviderFailure(error)
        }
      }
    },
  })
}

function hasToolResult(prompt, toolName) {
  return prompt.some(message => message.role === 'tool' && JSON.stringify(message.content).includes(toolName))
}

class ToolBudget {
  constructor({ maxCalls = 3, maxConcurrent = 1 } = {}) {
    this.maxCalls = maxCalls
    this.maxConcurrent = maxConcurrent
    this.calls = 0
    this.concurrent = 0
  }

  enter() {
    if (this.calls >= this.maxCalls) throw new Error('TOOL_CALL_BUDGET_EXHAUSTED')
    if (this.concurrent >= this.maxConcurrent) throw new Error('PARALLEL_TOOL_CALL_DENIED')
    this.calls += 1
    this.concurrent += 1
    let exited = false
    return () => {
      if (exited) return
      exited = true
      this.concurrent -= 1
    }
  }
}

function fixtureModel(profile, counters) {
  return {
    specificationVersion: 'v3',
    provider: 'conexus-r1c13-qualification',
    modelId: `qualification-${profile}-1`,
    supportedUrls: {},
    async doGenerate(options) {
      counters.calls += 1
      counters.options.push({
        maxOutputTokens: options.maxOutputTokens,
        toolChoice: options.toolChoice,
        toolNames: options.tools?.map(tool => tool.name) ?? [],
        responseFormat: options.responseFormat?.type,
      })
      if (profile === 'failure') throw new Error('FIXTURE_PROVIDER_FAILURE')
      if (profile === 'delay') {
        await new Promise((_, reject) => {
          const timer = setTimeout(() => reject(new Error('TIMEOUT_NOT_ENFORCED')), 1000)
          options.abortSignal?.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(options.abortSignal.reason ?? new Error('aborted'))
          }, { once: true })
        })
      }
      if (profile === 'inception' && !hasToolResult(options.prompt, 'listProjectSourceSnapshotPaths')) {
        return {
          content: [{ type: 'tool-call', toolCallId: 'list-1', toolName: 'listProjectSourceSnapshotPaths', input: '{}' }],
          finishReason: 'tool-calls', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [],
        }
      }
      if (profile === 'inception' && !hasToolResult(options.prompt, 'readProjectSourceSnapshotBatch')) {
        return {
          content: [{ type: 'tool-call', toolCallId: 'read-1', toolName: 'readProjectSourceSnapshotBatch', input: JSON.stringify({ paths: ['README.md'] }) }],
          finishReason: 'tool-calls', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [],
        }
      }
      const value = profile === 'inception'
        ? { candidateDigest: 'candidate-42', proposal: 'Bounded proposal', sourceRefs: ['source-42'] }
        : profile === 'invalid'
          ? { candidateDigest: 'candidate-42', answer: 'Bounded answer', citations: [], mutateCandidate: true }
          : { candidateDigest: 'candidate-42', answer: 'Bounded answer', citations: ['candidate-42#scope'] }
      return {
        content: [{ type: 'text', text: JSON.stringify(value) }],
        finishReason: 'stop', usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 }, warnings: [],
      }
    },
    async doStream() {
      throw new Error('STREAM_NOT_ADMITTED')
    },
  }
}

class AdmissionOnlyGateway extends MastraModelGateway {
  id = 'conexus-project-admission'
  name = 'Conexus Project admission gateway'

  constructor(models, counters) {
    super()
    this.models = models
    this.counters = counters
  }

  async fetchProviders() {
    throw new Error('DYNAMIC_PROVIDER_DISCOVERY_DENIED')
  }

  buildUrl() {
    throw new Error('ARBITRARY_GATEWAY_URL_DENIED')
  }

  async getApiKey() {
    throw new Error('AMBIENT_GATEWAY_CREDENTIAL_DENIED')
  }

  resolveLanguageModel({ modelId, providerId, apiKey }) {
    this.counters.resolutions.push({ modelId, providerId, credentialPresent: Boolean(apiKey) })
    const model = this.models.get(`${providerId}/${modelId}`)
    if (!model) throw new Error('PROJECT_MODEL_ADMISSION_UNAVAILABLE')
    return sanitizeModel(model)
  }
}

function createAdmissionResolver(entries, gateway, credentialFiles) {
  const catalog = new Map(entries.map(entry => [entry.admissionId, Object.freeze({ ...entry })]))
  return ({ requestContext }) => {
    const admissionId = requestContext.get('projectModelAdmissionId')
    const entry = catalog.get(admissionId)
    if (!entry?.enabled || /latest|\*/i.test(entry.modelId)) throw new Error('PROJECT_MODEL_ADMISSION_UNAVAILABLE')
    const secret = credentialFiles.get(entry.credentialSlot)
    if (!secret) throw new Error('PROJECT_MODEL_CREDENTIAL_UNAVAILABLE')
    return gateway.resolveLanguageModel({ providerId: entry.providerId, modelId: entry.modelId, apiKey: secret })
  }
}

function createProjectMastra(resolveModel) {
  const listProjectSourceSnapshotPaths = createTool({
    id: 'listProjectSourceSnapshotPaths', description: 'List exact invocation-bound source paths.',
    inputSchema: z.object({}).strict(),
    outputSchema: z.array(z.object({ path: z.string(), digest: z.string() })),
    execute: async (_input, context) => {
      const exit = context.requestContext.get('toolBudget')?.enter()
      if (!exit) throw new Error('TOOL_BUDGET_MISSING')
      try {
        return [{ path: 'README.md', digest: 'source-digest-42' }]
      } finally {
        exit()
      }
    },
  })
  const readProjectSourceSnapshotBatch = createTool({
    id: 'readProjectSourceSnapshotBatch', description: 'Read a bounded batch from the exact invocation source.',
    inputSchema: z.object({ paths: z.array(z.string()).min(1).max(32) }).strict(),
    outputSchema: z.object({ sourceRevision: z.string(), bytes: z.number().max(262144), files: z.array(z.object({ path: z.string(), text: z.string() })) }),
    execute: async ({ paths }, context) => {
      const exit = context.requestContext.get('toolBudget')?.enter()
      if (!exit) throw new Error('TOOL_BUDGET_MISSING')
      try {
        return { sourceRevision: 'source-42', bytes: 18, files: paths.map(path => ({ path, text: 'admitted source' })) }
      } finally {
        exit()
      }
    },
  })
  const ProjectInceptionAgent = new Agent({
    id: 'project-inception-agent', name: 'Project Inception Agent', instructions: 'Use only admitted source tools.',
    model: resolveModel, tools: { listProjectSourceSnapshotPaths, readProjectSourceSnapshotBatch }, memory: false, editor: false,
  })
  const BaselineExplanationAgent = new Agent({
    id: 'baseline-explanation-agent', name: 'Baseline Explanation Agent', instructions: 'Explain only the exact candidate.',
    model: resolveModel, tools: {}, memory: false, editor: false,
  })
  const config = Object.freeze({
    agents: { ProjectInceptionAgent, BaselineExplanationAgent }, logger: false, workers: false,
    notifications: { dispatch: { enabled: false } }, backgroundTasks: { enabled: false }, scheduler: { enabled: false },
  })
  const mastra = new Mastra(config)
  instances.push(mastra)
  return { config, ProjectInceptionAgent, BaselineExplanationAgent }
}

function requestContext(admissionId, values = {}) {
  const context = new RequestContext()
  context.set('projectModelAdmissionId', admissionId)
  context.set('correlationId', 'correlation-42')
  for (const [key, value] of Object.entries(values)) context.set(key, value)
  return context
}

after(async () => Promise.all(instances.map(instance => instance.stopWorkers())))

test('P1-P01 exact supply chain and telemetry-before-import source remain admitted', () => {
  const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'))
  assert.equal(lock.packages['node_modules/@mastra/core'].version, '1.63.2')
  assert.equal(lock.packages['node_modules/@ai-sdk/openai-compatible'].version, '3.0.43')
  assert.equal(lock.packages['node_modules/@ai-sdk/provider-utils'].version, '5.0.36')
  assert.equal(lock.packages['node_modules/zod'].version, '4.5.2')
  assert.equal(process.env.MASTRA_TELEMETRY_DISABLED, '1')
  assert.doesNotMatch(JSON.stringify(lock.packages[''].dependencies), /memory|libsql|postgres|observability/)
  for (const value of Object.values(lock.packages)) assert.notEqual(value.hasInstallScript, true)
})

test('P1-P02 full Agent path resolves only through the admitted custom gateway', async () => {
  const counters = { resolutions: [] }
  const modelCounters = { calls: 0, options: [] }
  const gateway = new AdmissionOnlyGateway(new Map([
    ['qualification/explanation-model-1', fixtureModel('explanation', modelCounters)],
  ]), counters)
  const resolveModel = createAdmissionResolver([{
    admissionId: 'explanation-admission', providerId: 'qualification', modelId: 'explanation-model-1',
    credentialSlot: 'QUALIFICATION_SECRET_FILE', enabled: true,
  }], gateway, new Map([['QUALIFICATION_SECRET_FILE', 'qualification-only-value']]))
  const { config, BaselineExplanationAgent } = createProjectMastra(resolveModel)
  const result = await BaselineExplanationAgent.generate('Explain candidate-42.', {
    requestContext: requestContext('explanation-admission'), maxSteps: 1, toolChoice: 'none',
    modelSettings: { maxRetries: 0, maxOutputTokens: 2048, timeout: { totalMs: 45000, stepMs: 45000 } },
    structuredOutput: { schema: explanationSchema, errorStrategy: 'strict' },
  })
  assert.deepEqual(result.object, { candidateDigest: 'candidate-42', answer: 'Bounded answer', citations: ['candidate-42#scope'] })
  assert.equal(counters.resolutions.length, 2)
  assert.ok(counters.resolutions.every(value => value.modelId === 'explanation-model-1' && value.providerId === 'qualification' && value.credentialPresent))
  assert.equal(result.steps.length, 1)
  assert.deepEqual(modelCounters.options[0].toolNames, [])
  assert.deepEqual(modelCounters.options[0].toolChoice, { type: 'none' })
  assert.equal(modelCounters.options[0].maxOutputTokens, 2048)
  assert.equal(config.workers, false)
  assert.equal(config.notifications.dispatch.enabled, false)
  assert.equal(config.backgroundTasks.enabled, false)
  assert.equal(config.scheduler.enabled, false)
})

test('P1-P03 PRJ-07 uses exactly the two native read tools and strict bounded output', async () => {
  const gatewayCounters = { resolutions: [] }
  const modelCounters = { calls: 0, options: [] }
  const gateway = new AdmissionOnlyGateway(new Map([
    ['qualification/inception-model-1', fixtureModel('inception', modelCounters)],
  ]), gatewayCounters)
  const resolveModel = createAdmissionResolver([{
    admissionId: 'inception-admission', providerId: 'qualification', modelId: 'inception-model-1',
    credentialSlot: 'QUALIFICATION_SECRET_FILE', enabled: true,
  }], gateway, new Map([['QUALIFICATION_SECRET_FILE', 'qualification-only-value']]))
  const { ProjectInceptionAgent } = createProjectMastra(resolveModel)
  const budget = new ToolBudget()
  const result = await ProjectInceptionAgent.generate('Investigate source-42.', {
    requestContext: requestContext('inception-admission', { toolBudget: budget }), maxSteps: 4,
    modelSettings: { maxRetries: 0, maxOutputTokens: 8192, timeout: { totalMs: 180000, stepMs: 60000 } },
    structuredOutput: { schema: inceptionSchema, errorStrategy: 'strict' },
  })
  assert.deepEqual(result.object, { candidateDigest: 'candidate-42', proposal: 'Bounded proposal', sourceRefs: ['source-42'] })
  assert.equal(result.steps.length, 3)
  assert.deepEqual(modelCounters.options[0].toolNames.sort(), ['listProjectSourceSnapshotPaths', 'readProjectSourceSnapshotBatch'])
  assert.equal(modelCounters.options.at(-1).responseFormat, 'json')
  assert.equal(modelCounters.options.at(-1).maxOutputTokens, 8192)
  assert.equal(budget.calls, 2)
})

test('P1-P04 unknown, disabled, mutable and caller-selected models fail before resolution', () => {
  const counters = { resolutions: [] }
  const gateway = new AdmissionOnlyGateway(new Map(), counters)
  const resolver = createAdmissionResolver([
    { admissionId: 'disabled', providerId: 'qualification', modelId: 'model-1', credentialSlot: 'S', enabled: false },
    { admissionId: 'mutable', providerId: 'qualification', modelId: 'latest', credentialSlot: 'S', enabled: true },
  ], gateway, new Map([['S', 'qualification-only-value']]))
  for (const id of ['unknown', 'disabled', 'mutable']) {
    assert.throws(() => resolver({ requestContext: requestContext(id) }), /PROJECT_MODEL_ADMISSION_UNAVAILABLE/)
  }
  const injected = requestContext('unknown')
  injected.set('modelId', 'openai/caller-choice')
  assert.throws(() => resolver({ requestContext: injected }), /PROJECT_MODEL_ADMISSION_UNAVAILABLE/)
  assert.deepEqual(counters.resolutions, [])
})

test('P1-P05 sanitized model errors discard prompt, response and credential envelopes', async () => {
  const secret = 'credential-must-not-leak'
  const prompt = 'prompt-must-not-leak'
  const response = 'response-must-not-leak'
  const raw = {
    specificationVersion: 'v3', provider: 'fixture', modelId: 'failure-1', supportedUrls: {},
    async doGenerate() {
      const inner = new Error('PROJECT_MODEL_RESPONSE_LIMIT_EXCEEDED')
      const outer = new Error('provider wrapper', { cause: inner })
      outer.requestBodyValues = { messages: [{ content: prompt }], apiKey: secret }
      outer.responseBody = response
      throw outer
    },
    async doStream() { throw new Error('provider stream wrapper') },
  }
  const error = await sanitizeModel(raw).doGenerate({}).then(() => new Error('unexpected success'), reason => reason)
  const serialized = inspect(error, { depth: null, showHidden: true })
  assert.equal(error.message, 'PROJECT_MODEL_RESPONSE_LIMIT_EXCEEDED')
  assert.doesNotMatch(serialized, new RegExp(`${secret}|${prompt}|${response}|requestBodyValues`))
  assert.equal(error.cause, undefined)
})

test('P1-P06 tool call and concurrency budgets fire independently', () => {
  const budget = new ToolBudget()
  const exit = budget.enter()
  assert.throws(() => budget.enter(), /PARALLEL_TOOL_CALL_DENIED/)
  exit()
  budget.enter()()
  budget.enter()()
  assert.equal(budget.calls, 3)
  assert.throws(() => budget.enter(), /TOOL_CALL_BUDGET_EXHAUSTED/)
})

test('P1-P07 strict output rejects mutation shape and zero retries makes one call', async () => {
  for (const profile of ['invalid', 'failure']) {
    const gatewayCounters = { resolutions: [] }
    const modelCounters = { calls: 0, options: [] }
    const gateway = new AdmissionOnlyGateway(new Map([
      [`qualification/${profile}-model-1`, fixtureModel(profile, modelCounters)],
    ]), gatewayCounters)
    const resolveModel = createAdmissionResolver([{
      admissionId: `${profile}-admission`, providerId: 'qualification', modelId: `${profile}-model-1`,
      credentialSlot: 'QUALIFICATION_SECRET_FILE', enabled: true,
    }], gateway, new Map([['QUALIFICATION_SECRET_FILE', 'qualification-only-value']]))
    const { BaselineExplanationAgent } = createProjectMastra(resolveModel)
    await assert.rejects(BaselineExplanationAgent.generate('Must fail.', {
      requestContext: requestContext(`${profile}-admission`), maxSteps: 1, toolChoice: 'none',
      modelSettings: { maxRetries: 0, maxOutputTokens: 2048 },
      structuredOutput: { schema: explanationSchema, errorStrategy: 'strict' },
    }))
    assert.equal(modelCounters.calls, 1)
  }
})

test('P1-P08 total timeout aborts a delayed provider promptly', async () => {
  const gatewayCounters = { resolutions: [] }
  const modelCounters = { calls: 0, options: [] }
  const gateway = new AdmissionOnlyGateway(new Map([
    ['qualification/delay-model-1', fixtureModel('delay', modelCounters)],
  ]), gatewayCounters)
  const resolveModel = createAdmissionResolver([{
    admissionId: 'delay-admission', providerId: 'qualification', modelId: 'delay-model-1',
    credentialSlot: 'QUALIFICATION_SECRET_FILE', enabled: true,
  }], gateway, new Map([['QUALIFICATION_SECRET_FILE', 'qualification-only-value']]))
  const { BaselineExplanationAgent } = createProjectMastra(resolveModel)
  const started = Date.now()
  await assert.rejects(BaselineExplanationAgent.generate('Must time out.', {
    requestContext: requestContext('delay-admission'), maxSteps: 1, toolChoice: 'none',
    modelSettings: { maxRetries: 0, maxOutputTokens: 2048, timeout: { totalMs: 25, stepMs: 25 } },
  }))
  assert.ok(Date.now() - started < 500)
  assert.equal(modelCounters.calls, 1)
})
