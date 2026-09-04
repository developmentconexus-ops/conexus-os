import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { after, test } from 'node:test'
import { z } from 'zod'

process.env.MASTRA_TELEMETRY_DISABLED = '1'
const [{ Agent }, { Mastra }, { RequestContext }, { createTool }] = await Promise.all([
  import('@mastra/core/agent'),
  import('@mastra/core/mastra'),
  import('@mastra/core/request-context'),
  import('@mastra/core/tools'),
])

const root = resolve(import.meta.dirname)
const registry = JSON.parse(readFileSync(resolve(root, 'node_modules/@mastra/core/dist/provider-registry.json'), 'utf8'))
const mastraInstances = []
const officialOrigins = Object.freeze({
  anthropic: 'https://api.anthropic.com/',
  google: 'https://generativelanguage.googleapis.com/',
  openai: 'https://api.openai.com/',
})

const explanationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['candidateDigest', 'answer', 'citations'],
  properties: {
    candidateDigest: { type: 'string', minLength: 1 },
    answer: { type: 'string', minLength: 1 },
    citations: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
}

const inceptionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['candidateDigest', 'proposal', 'sourceRefs'],
  properties: {
    candidateDigest: { type: 'string', minLength: 1 },
    proposal: { type: 'string', minLength: 1 },
    sourceRefs: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
}

function exactRegistryModel(providerKey) {
  const provider = registry.providers[providerKey]
  assert.ok(provider, `fixture provider ${providerKey} must exist`)
  const modelId = provider.models.find(model => !/latest|\*/i.test(model))
  assert.ok(modelId, `fixture provider ${providerKey} needs one non-alias model`)
  return modelId
}

function createAdmissionCatalog(entries) {
  const catalog = new Map()
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry).sort(), [
      'admissionId', 'capabilitySet', 'credentialSlot', 'dataGovernanceRef',
      'enabled', 'modelId', 'officialHttpsOrigin', 'providerKey',
    ])
    assert.ok(registry.providers[entry.providerKey]?.models.includes(entry.modelId), 'model must exist in exact embedded registry')
    assert.doesNotMatch(entry.modelId, /latest|\*/i, 'mutable aliases are denied')
    const origin = new URL(entry.officialHttpsOrigin)
    assert.equal(origin.protocol, 'https:')
    assert.equal(origin.username, '')
    assert.equal(origin.password, '')
    assert.equal(origin.search, '')
    assert.equal(origin.hash, '')
    assert.equal(origin.pathname, '/')
    assert.equal(origin.href, officialOrigins[entry.providerKey], 'provider origin must match closed deployment admission')
    assert.equal(catalog.has(entry.admissionId), false, 'admissionId must be unique')
    catalog.set(entry.admissionId, Object.freeze({ ...entry, model: `${entry.providerKey}/${entry.modelId}` }))
  }
  return catalog
}

function resolveAdmission(policy, catalog) {
  assert.deepEqual(Object.keys(policy).sort(), ['admissionId', 'operationProfile', 'policyRef'])
  const entry = catalog.get(policy.admissionId)
  if (!entry?.enabled) throw new Error('PROJECT_MODEL_ADMISSION_UNAVAILABLE')
  return entry
}

function resolveCredential(entry, secretFiles) {
  const value = secretFiles.get(entry.credentialSlot)
  if (typeof value !== 'string' || value.length < 1) throw new Error('PROJECT_MODEL_CREDENTIAL_UNAVAILABLE')
  return value
}

function settleOwnerResult(captured, current, result) {
  if (captured.authorityVersion !== current.authorityVersion) throw new Error('STALE_PROJECT_AUTHORITY')
  if (captured.candidateDigest !== current.candidateDigest) throw new Error('STALE_CANDIDATE')
  if (captured.sourceSnapshotRef !== current.sourceSnapshotRef) throw new Error('STALE_SOURCE_SNAPSHOT')
  if (result.status !== 'COMPLETED') throw new Error(`PROJECT_COGNITION_${result.status}`)
  return result.payload
}

class ToolBudget {
  constructor({ snapshotRef, maxCalls = 3, maxConcurrent = 1 }) {
    this.snapshotRef = snapshotRef
    this.maxCalls = maxCalls
    this.maxConcurrent = maxConcurrent
    this.calls = 0
    this.concurrent = 0
  }

  enter(snapshotRef) {
    if (snapshotRef !== this.snapshotRef) throw new Error('SOURCE_SNAPSHOT_NOT_ADMITTED')
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

function hasToolResult(prompt) {
  return prompt.some(message => message.role === 'tool' || JSON.stringify(message.content).includes('tool-result'))
}

function fixtureModel({ id, counters, kind, invalid = false, fail = false, delay = false }) {
  return {
    specificationVersion: 'v2',
    provider: 'conexus-local-fixture',
    modelId: id,
    supportedUrls: {},
    async doGenerate(options) {
      counters.calls += 1
      counters.options.push({
        maxOutputTokens: options.maxOutputTokens,
        toolNames: options.tools?.map(tool => tool.name) ?? [],
        toolChoice: options.toolChoice,
        responseFormat: options.responseFormat?.type,
      })
      if (fail) throw new Error('FIXTURE_PROVIDER_FAILURE')
      if (delay) {
        await new Promise((_, reject) => {
          const timer = setTimeout(() => reject(new Error('FIXTURE_TIMEOUT_NOT_ENFORCED')), 1000)
          options.abortSignal?.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(options.abortSignal.reason ?? new Error('aborted'))
          }, { once: true })
        })
      }
      if (kind === 'inception' && !hasToolResult(options.prompt)) {
        return {
          content: [{
            type: 'tool-call',
            toolCallId: 'read-source-1',
            toolName: 'readProjectSource',
            input: JSON.stringify({ snapshotRef: 'snapshot-42' }),
          }],
          finishReason: 'tool-calls',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          warnings: [],
        }
      }
      const value = kind === 'inception'
        ? { candidateDigest: 'candidate-42', proposal: 'Bounded proposal', sourceRefs: ['snapshot-42'] }
        : invalid
          ? { candidateDigest: 'candidate-42', answer: 'Bounded answer', citations: [], mutateCandidate: true }
          : { candidateDigest: 'candidate-42', answer: 'Bounded answer', citations: ['candidate-42#scope'] }
      return {
        content: [{ type: 'text', text: JSON.stringify(value) }],
        finishReason: 'stop',
        usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
        warnings: [],
      }
    },
    async doStream() {
      throw new Error('probe uses deterministic generate only')
    },
  }
}

function makeContext(admissionId, extra = {}) {
  const requestContext = new RequestContext()
  requestContext.set('projectModelAdmissionId', admissionId)
  requestContext.set('correlationId', 'corr-42')
  for (const [key, value] of Object.entries(extra)) requestContext.set(key, value)
  return requestContext
}

function createProjectMastra(models) {
  const resolveModel = ({ requestContext }) => {
    const admissionId = requestContext.get('projectModelAdmissionId')
    const model = models.get(admissionId)
    if (!model) throw new Error('PROJECT_MODEL_ADMISSION_UNAVAILABLE')
    return model
  }
  const readProjectSource = createTool({
    id: 'readProjectSource',
    description: 'Read one exact already-admitted Project source snapshot.',
    inputSchema: z.object({ snapshotRef: z.string() }),
    outputSchema: z.object({ snapshotRef: z.string(), excerpt: z.string() }),
    execute: async ({ snapshotRef }, context) => {
      const budget = context.requestContext.get('toolBudget')
      if (!(budget instanceof ToolBudget)) throw new Error('TOOL_BUDGET_MISSING')
      const exit = budget.enter(snapshotRef)
      try {
        return { snapshotRef, excerpt: 'approved source excerpt' }
      } finally {
        exit()
      }
    },
  })
  const ProjectInceptionAgent = new Agent({
    id: 'project-inception-agent',
    name: 'Project Inception Agent',
    instructions: 'Use only the admitted source tool and return the canonical proposal shape.',
    model: resolveModel,
    tools: { readProjectSource },
    memory: false,
    editor: false,
  })
  const BaselineExplanationAgent = new Agent({
    id: 'baseline-explanation-agent',
    name: 'Baseline Explanation Agent',
    instructions: 'Explain only the exact immutable candidate supplied in this invocation.',
    model: resolveModel,
    tools: {},
    memory: false,
    editor: false,
  })
  const config = Object.freeze({
    agents: { ProjectInceptionAgent, BaselineExplanationAgent },
    logger: false,
    workers: false,
    notifications: { dispatch: { enabled: false } },
    backgroundTasks: { enabled: false },
    scheduler: { enabled: false },
  })
  const mastra = new Mastra(config)
  mastraInstances.push(mastra)
  return { mastra, config, ProjectInceptionAgent, BaselineExplanationAgent }
}

after(async () => {
  await Promise.all(mastraInstances.map(mastra => mastra.stopWorkers()))
})

test('P13-P01 exact package/source identity and auth-token fix are present', () => {
  const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'))
  const core = lock.packages['node_modules/@mastra/core']
  const zodLock = lock.packages['node_modules/zod']
  assert.equal(lock.packages[''].dependencies['@mastra/core'], '1.63.2')
  assert.equal(lock.packages[''].dependencies.zod, '4.5.2')
  assert.equal(core.integrity, 'sha512-BHVDF4GtQnIqRND/lPVVoTnmoNzZ7+voz+EpI4YSY0W7In6c/EOrmMnshuNQSDJ9NpxQNrwip0WGYpRYwzFirQ==')
  assert.equal(zodLock.integrity, 'sha512-XkYXCol10+ba/6F/cueWV+TezUeOqXW0hdeJt5CdXjTYeAgAQg5N03RQdJ80mhfFE72+pblvYMW4wy2Qp4Qbrg==')
  const changelog = readFileSync(resolve(root, 'node_modules/@mastra/core/CHANGELOG.md'), 'utf8')
  assert.match(changelog, /auth bearer token \(`mastra__authToken`\) was persisted in cleartext/)
  assert.doesNotMatch(JSON.stringify(lock.packages[''].dependencies), /memory|libsql|pg|observability/)
  assert.equal(process.env.MASTRA_TELEMETRY_DISABLED, '1')
  const telemetrySource = readFileSync(resolve(root, 'node_modules/@mastra/core/dist/feature-telemetry-C4P71GGd.js'), 'utf8')
  assert.match(telemetrySource, /MASTRA_TELEMETRY_DISABLED/)
  assert.match(telemetrySource, /https:\/\/us\.posthog\.com/)
})

test('P13-P02 exact registry is discovery only and closed catalog fails unknown/disabled/alias/custom endpoint', () => {
  assert.equal(Object.keys(registry.providers).length, 189)
  const catalog = createAdmissionCatalog([{
    admissionId: 'fixture-primary',
    providerKey: 'anthropic',
    modelId: exactRegistryModel('anthropic'),
    officialHttpsOrigin: 'https://api.anthropic.com/',
    credentialSlot: 'ANTHROPIC_API_KEY_FILE',
    capabilitySet: ['NATIVE_STRUCTURED_OUTPUT'],
    dataGovernanceRef: 'dg-fixture',
    enabled: true,
  }, {
    admissionId: 'fixture-disabled',
    providerKey: 'google',
    modelId: exactRegistryModel('google'),
    officialHttpsOrigin: 'https://generativelanguage.googleapis.com/',
    credentialSlot: 'GOOGLE_API_KEY_FILE',
    capabilitySet: ['NATIVE_STRUCTURED_OUTPUT'],
    dataGovernanceRef: 'dg-fixture',
    enabled: false,
  }])
  assert.match(resolveAdmission({ policyRef: 'p1', admissionId: 'fixture-primary', operationProfile: 'BASELINE_EXPLANATION' }, catalog).model, /^anthropic\//)
  assert.throws(() => resolveAdmission({ policyRef: 'p1', admissionId: 'unknown', operationProfile: 'BASELINE_EXPLANATION' }, catalog), /UNAVAILABLE/)
  assert.throws(() => resolveAdmission({ policyRef: 'p1', admissionId: 'fixture-disabled', operationProfile: 'BASELINE_EXPLANATION' }, catalog), /UNAVAILABLE/)
  assert.throws(() => resolveAdmission({ policyRef: 'p1', admissionId: 'fixture-primary', operationProfile: 'BASELINE_EXPLANATION', modelId: 'caller-choice' }, catalog))
  assert.throws(() => createAdmissionCatalog([{ admissionId: 'x', providerKey: 'openai', modelId: 'latest', officialHttpsOrigin: 'https://api.openai.com/', credentialSlot: 'X', capabilitySet: [], dataGovernanceRef: 'x', enabled: true }]))
  assert.throws(() => createAdmissionCatalog([{ admissionId: 'x', providerKey: 'openai', modelId: exactRegistryModel('openai'), officialHttpsOrigin: 'https://attacker.invalid/v1', credentialSlot: 'X', capabilitySet: [], dataGovernanceRef: 'x', enabled: true }]))
})

test('P13-P03 PRJ-07 executes one admitted read and strict structured output without memory', async () => {
  const counters = { calls: 0, options: [] }
  const models = new Map([['inception-fixture', fixtureModel({ id: 'inception-fixture', counters, kind: 'inception' })]])
  const { config, ProjectInceptionAgent } = createProjectMastra(models)
  const budget = new ToolBudget({ snapshotRef: 'snapshot-42' })
  const requestContext = makeContext('inception-fixture', { toolBudget: budget })
  const result = await ProjectInceptionAgent.generate('Investigate the exact admitted snapshot.', {
    requestContext,
    maxSteps: 4,
    modelSettings: { maxRetries: 0, maxOutputTokens: 8192, timeout: { totalMs: 180000, stepMs: 60000 } },
    structuredOutput: { schema: inceptionSchema, errorStrategy: 'strict' },
  })
  assert.deepEqual(result.object, { candidateDigest: 'candidate-42', proposal: 'Bounded proposal', sourceRefs: ['snapshot-42'] })
  assert.equal(result.steps.length, 2)
  assert.equal(budget.calls, 1)
  assert.equal(counters.calls, 2)
  assert.deepEqual(counters.options[0].toolNames, ['readProjectSource'])
  assert.equal(counters.options[1].responseFormat, 'json')
  assert.equal(await ProjectInceptionAgent.getMemory({ requestContext }), undefined)
  assert.equal(config.workers, false)
  assert.equal(config.notifications.dispatch.enabled, false)
  assert.equal(config.backgroundTasks.enabled, false)
  assert.equal(config.scheduler.enabled, false)
  assert.doesNotMatch(JSON.stringify(requestContext.toJSON()), /credential|secret|api[_-]?key/i)
})

test('P13-P04 PRJ-24 is one tool-free strict step and rejects mutation-shaped output', async () => {
  const counters = { calls: 0, options: [] }
  const models = new Map([['explanation-fixture', fixtureModel({ id: 'explanation-fixture', counters, kind: 'explanation' })]])
  const { BaselineExplanationAgent } = createProjectMastra(models)
  const requestContext = makeContext('explanation-fixture')
  const result = await BaselineExplanationAgent.generate('Explain candidate-42.', {
    requestContext,
    maxSteps: 1,
    toolChoice: 'none',
    modelSettings: { maxRetries: 0, maxOutputTokens: 2048, timeout: { totalMs: 45000, stepMs: 45000 } },
    structuredOutput: { schema: explanationSchema, errorStrategy: 'strict' },
  })
  assert.deepEqual(result.object, { candidateDigest: 'candidate-42', answer: 'Bounded answer', citations: ['candidate-42#scope'] })
  assert.equal(result.steps.length, 1)
  assert.deepEqual(counters.options[0].toolNames, [])
  assert.deepEqual(counters.options[0].toolChoice, { type: 'none' })
  assert.equal(counters.options[0].maxOutputTokens, 2048)
  assert.equal(await BaselineExplanationAgent.getMemory({ requestContext }), undefined)

  const invalidCounters = { calls: 0, options: [] }
  const invalid = createProjectMastra(new Map([['invalid-fixture', fixtureModel({ id: 'invalid-fixture', counters: invalidCounters, kind: 'explanation', invalid: true })]]))
  await assert.rejects(() => invalid.BaselineExplanationAgent.generate('Try to mutate candidate-42.', {
    requestContext: makeContext('invalid-fixture'),
    maxSteps: 1,
    toolChoice: 'none',
    modelSettings: { maxRetries: 0, maxOutputTokens: 2048 },
    structuredOutput: { schema: explanationSchema, errorStrategy: 'strict' },
  }))
})

test('P13-P05 invocation-local tool guard rejects stale, parallel and fourth calls', () => {
  const budget = new ToolBudget({ snapshotRef: 'snapshot-42' })
  assert.throws(() => budget.enter('snapshot-stale'), /SOURCE_SNAPSHOT_NOT_ADMITTED/)
  const exit1 = budget.enter('snapshot-42')
  assert.throws(() => budget.enter('snapshot-42'), /PARALLEL_TOOL_CALL_DENIED/)
  exit1()
  budget.enter('snapshot-42')()
  budget.enter('snapshot-42')()
  assert.equal(budget.calls, 3)
  assert.throws(() => budget.enter('snapshot-42'), /TOOL_CALL_BUDGET_EXHAUSTED/)
})

test('P13-P06 maxRetries zero and total timeout fire without fallback', async () => {
  const failing = { calls: 0, options: [] }
  const failed = createProjectMastra(new Map([['fail-fixture', fixtureModel({ id: 'fail-fixture', counters: failing, kind: 'explanation', fail: true })]]))
  await assert.rejects(() => failed.BaselineExplanationAgent.generate('fail', {
    requestContext: makeContext('fail-fixture'),
    maxSteps: 1,
    toolChoice: 'none',
    modelSettings: { maxRetries: 0, maxOutputTokens: 2048 },
  }), /FIXTURE_PROVIDER_FAILURE/)
  assert.equal(failing.calls, 1)

  const delayed = { calls: 0, options: [] }
  const timed = createProjectMastra(new Map([['delay-fixture', fixtureModel({ id: 'delay-fixture', counters: delayed, kind: 'explanation', delay: true })]]))
  const started = Date.now()
  await assert.rejects(() => timed.BaselineExplanationAgent.generate('timeout', {
    requestContext: makeContext('delay-fixture'),
    maxSteps: 1,
    toolChoice: 'none',
    modelSettings: { maxRetries: 0, maxOutputTokens: 2048, timeout: { totalMs: 25, stepMs: 25 } },
  }))
  assert.ok(Date.now() - started < 500, 'timeout must terminate the local fixture promptly')
  assert.equal(delayed.calls, 1)
})

test('P13-P07 advisory negative control holds 1.63.2 from Product use', () => {
  const providerUtils = readFileSync(resolve(root, 'node_modules/@ai-sdk/provider-utils-v5/dist/index.mjs'), 'utf8')
  assert.match(providerUtils, /DEFAULT_MAX_DOWNLOAD_SIZE = 2 \* 1024 \* 1024 \* 1024/)
  assert.match(providerUtils, /readResponseWithSizeLimit/)
  assert.equal(2 * 1024 * 1024 * 1024 > 512 * 1024 * 1024, true)
  const decision = {
    frameworkMechanics: 'PASS',
    exactPinProductAdmission: 'HOLD',
    reason: 'TRANSITIVE_RESPONSE_LIMIT_TOO_LARGE_FOR_IN_PROCESS_HUB',
  }
  assert.deepEqual(decision, {
    frameworkMechanics: 'PASS',
    exactPinProductAdmission: 'HOLD',
    reason: 'TRANSITIVE_RESPONSE_LIMIT_TOO_LARGE_FOR_IN_PROCESS_HUB',
  })
})

test('P13-P08 credential and late owner settlement controls fail closed', () => {
  const catalog = createAdmissionCatalog([{
    admissionId: 'fixture-primary',
    providerKey: 'anthropic',
    modelId: exactRegistryModel('anthropic'),
    officialHttpsOrigin: 'https://api.anthropic.com/',
    credentialSlot: 'ANTHROPIC_API_KEY_FILE',
    capabilitySet: ['NATIVE_STRUCTURED_OUTPUT'],
    dataGovernanceRef: 'dg-fixture',
    enabled: true,
  }])
  const entry = catalog.get('fixture-primary')
  assert.throws(() => resolveCredential(entry, new Map()), /CREDENTIAL_UNAVAILABLE/)
  const secret = resolveCredential(entry, new Map([['ANTHROPIC_API_KEY_FILE', 'fixture-secret-not-real']]))
  assert.equal(secret, 'fixture-secret-not-real')
  const requestContext = makeContext('fixture-primary')
  assert.doesNotMatch(JSON.stringify(requestContext.toJSON()), /fixture-secret-not-real/)

  const captured = { authorityVersion: 7, candidateDigest: 'candidate-42', sourceSnapshotRef: 'snapshot-42' }
  const completed = { status: 'COMPLETED', payload: { answer: 'bounded' } }
  assert.deepEqual(settleOwnerResult(captured, { ...captured }, completed), { answer: 'bounded' })
  assert.throws(() => settleOwnerResult(captured, { ...captured, authorityVersion: 8 }, completed), /STALE_PROJECT_AUTHORITY/)
  assert.throws(() => settleOwnerResult(captured, { ...captured, candidateDigest: 'candidate-43' }, completed), /STALE_CANDIDATE/)
  assert.throws(() => settleOwnerResult(captured, { ...captured, sourceSnapshotRef: 'snapshot-43' }, completed), /STALE_SOURCE_SNAPSHOT/)
  for (const status of ['REFUSED', 'ABORTED', 'PROVIDER_FAILURE', 'INVALID_OUTPUT', 'INCONCLUSIVE']) {
    assert.throws(() => settleOwnerResult(captured, { ...captured }, { status }), new RegExp(status))
  }
})
