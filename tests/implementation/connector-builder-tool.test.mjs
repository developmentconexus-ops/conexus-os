import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Agent } from '@mastra/core/agent'
import { AgentController } from '@mastra/core/agent-controller'
import { Mastra } from '@mastra/core/mastra'
import { RequestContext } from '@mastra/core/request-context'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { EXPECTED_NATIVE_ORDER, FAKE_CREDENTIAL, NATIVE_ORDER_DATASET, SECRET_MARKER, startFakeGateway } from './connector-fake-gateway.mjs'
import { connectorRecord, recordText } from './connector-record.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { createBroker } = await import(hubModuleUrl('connectors/broker.js'))
const { createConnectorBrief } = await import(hubModuleUrl('connectors/builder-brief.js'))
const { BUILDER_RUN_TERMS, createConnectorFetchTools, openBuilderRun } = await import(hubModuleUrl('connectors/builder-tool.js'))
const { createToolPayloadProjection } = await import(hubModuleUrl('connectors/fetch-projection.js'))
const { createSankhyaGateway } = await import(hubModuleUrl('connectors/sankhya/gateway.js'))
const { sankhyaDefinition } = await import(hubModuleUrl('connectors/sankhya/definition.js'))
const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))
const { createHttpApp } = await import(hubModuleUrl('http/app.js'))
const { registerBuilderSessionRoutes } = await import(hubModuleUrl('builder/mastra-session-routes.js'))
const { createConversationSessions } = await import(hubModuleUrl('builder/conversation-sessions.js'))
const { sendBuilderSessionMessage } = await import(hubModuleUrl('builder/runtime.js'))

const PROJECT = '22222222-2222-4222-8222-222222222222'
const OTHER_PROJECT = '66666666-6666-4666-8666-666666666666'
const CONNECTION = '33333333-3333-4333-8333-333333333333'
const RUN = '11111111-1111-4111-8111-111111111111'
const LOAD = 'CRUDServiceProvider.loadRecords'
const ROUTE = '/gateway/v1/mge/service.sbr'
const origin = 'https://conexus.test'

const envelope = createSecretEnvelope('ef'.repeat(32))
const sealed = await envelope.seal(JSON.stringify(FAKE_CREDENTIAL))
const binding = Object.freeze({ bindingId: 'binding-erp', name: 'erp', connectionId: CONNECTION, connectorId: 'sankhya' })
const store = Object.freeze({
  listBindings: async ({ projectId, environment }) => (projectId === PROJECT && environment === 'preview' ? [binding] : []),
  readConnectionCredential: async (connectionId) => (connectionId === CONNECTION ? sealed : null),
})

const connectorsOf = async (t, { now } = {}) => {
  const fake = await startFakeGateway()
  t.after(() => fake.close())
  const record = connectorRecord()
  const connectors = [{ definition: sankhyaDefinition, adapter: createSankhyaGateway({ origin: fake.origin }) }]
  const broker = createBroker({ connectors, store, envelope, observability: record.observability, ...(now ? { now } : {}) })
  const brief = createConnectorBrief({ connectors, store, observability: record.observability })
  return {
    fake, record, broker,
    tools: createConnectorFetchTools(broker),
    projection: createToolPayloadProjection(new Map([['sankhya', new Set(sankhyaDefinition.native.services)]])),
    openRun: (projectId = PROJECT) => openBuilderRun({ brief, projectId, builderRunId: RUN }),
  }
}

const read = (dataSet = NATIVE_ORDER_DATASET, connection = 'erp') => ({
  connection, method: 'POST', path: ROUTE, query: { serviceName: LOAD, outputType: 'json' }, body: { serviceName: LOAD, requestBody: { dataSet } },
})
const markerRead = (marker) => read({ ...NATIVE_ORDER_DATASET, criteria: { expression: { $: 'this.NUMNOTA = ?' }, parameter: [{ $: marker, type: 'S' }] } })
const answered = (body) => ({ ok: true, status: 200, bytes: Buffer.byteLength(JSON.stringify(body)), body })
const services = (fake) => fake.requests.filter(({ path }) => path === ROUTE)

const contextOf = (run) => {
  const requestContext = new RequestContext()
  run?.bind(requestContext)
  return requestContext
}
const toolOf = (tools, run) => tools({ requestContext: contextOf(run) }).connector_fetch
const fetchThrough = (tool, request) => tool.execute(request, {})

test('the tool is contributed only to a session whose request context carries a run this module opened', async (t) => {
  const { tools, openRun } = await connectorsOf(t)
  const run = await openRun()
  assert.deepEqual(Object.keys(tools({ requestContext: contextOf(run) })), ['connector_fetch'])
  assert.deepEqual(tools({ requestContext: contextOf() }), {})
  const forged = new RequestContext()
  forged.setRaw('conexusConnectorConsumer', { kind: 'agent', sessionId: RUN, scope: { projectId: PROJECT, environment: 'preview' } })
  assert.deepEqual(tools({ requestContext: forged }), {}, 'a look-alike consumer is not a run')
})

test("a run reads through its own binding, and another Project's run is refused the same name before the network", async (t) => {
  const { fake, tools, openRun } = await connectorsOf(t)
  const own = toolOf(tools, await openRun())
  assert.deepEqual(await fetchThrough(own, read()), answered(EXPECTED_NATIVE_ORDER))
  assert.equal(services(fake).length, 1)

  const other = toolOf(tools, await openRun(OTHER_PROJECT))
  assert.deepEqual(await fetchThrough(other, read()), { ok: false, code: 'NOT_GRANTED' })
  assert.equal(services(fake).length, 1, 'the other Project reached no vendor')
})

test('a run that ended is refused, and so is a run past its lifetime, each after a read that succeeded', async (t) => {
  let clock = Date.now()
  const { fake, tools, openRun } = await connectorsOf(t, { now: () => clock })
  const ended = await openRun()
  const endedTool = toolOf(tools, ended)
  assert.deepEqual(await fetchThrough(endedTool, read()), answered(EXPECTED_NATIVE_ORDER))
  ended.end()
  ended.end()
  assert.deepEqual(await fetchThrough(endedTool, read()), { ok: false, code: 'NOT_GRANTED' })

  const expiring = toolOf(tools, await openRun())
  assert.deepEqual(await fetchThrough(expiring, read()), answered(EXPECTED_NATIVE_ORDER))
  clock += BUILDER_RUN_TERMS.ttlMs + 60_000
  assert.deepEqual(await fetchThrough(expiring, read()), { ok: false, code: 'NOT_GRANTED' })
  assert.equal(services(fake).length, 2, 'neither refusal reached the vendor')
})

test("a run's calls are bounded: the call after the budget is CALL_LIMIT, before the network", async (t) => {
  const { fake, tools, openRun } = await connectorsOf(t)
  const tool = toolOf(tools, await openRun())
  const answers = []
  for (let call = 0; call <= BUILDER_RUN_TERMS.calls; call++) answers.push((await fetchThrough(tool, read())).ok ? 'OK' : 'REFUSED')
  assert.deepEqual(answers, [...Array(BUILDER_RUN_TERMS.calls).fill('OK'), 'REFUSED'])
  assert.deepEqual(await fetchThrough(tool, read()), { ok: false, code: 'CALL_LIMIT' })
  assert.equal(services(fake).length, BUILDER_RUN_TERMS.calls)
})

test('a route-level projection keeps the tool\'s projections and projects whatever reached it raw, with Mastra\'s model-output copy removed', async (t) => {
  const { projection } = await connectorsOf(t)
  const tool = { integrator: 'sankhya', service: LOAD, fields: ['body.serviceName', 'query.serviceName'] }
  const raw = { messages: [{ role: 'assistant', content: { format: 2, parts: [
    { type: 'tool-invocation', toolInvocation: { state: 'result', toolCallId: 'call-1', toolName: 'connector_fetch', args: tool, result: { ok: false, code: 'NOT_GRANTED' } } },
    {
      type: 'tool-invocation',
      toolInvocation: { state: 'result', toolCallId: 'call-2', toolName: 'connector_fetch', args: markerRead(SECRET_MARKER), result: answered({ id: SECRET_MARKER, rows: [{ a: 1 }, { a: 2 }] }) },
      providerMetadata: { mastra: { modelOutput: { type: 'json', value: SECRET_MARKER }, toolPayloadTransform: {} } },
    },
    { type: 'tool-invocation', toolInvocation: { state: 'result', toolCallId: 'call-3', toolName: 'connector_fetch', args: { ...tool, service: SECRET_MARKER }, result: `Invalid input ${SECRET_MARKER}` } },
    { type: 'tool-invocation', toolInvocation: { state: 'result', toolCallId: 'call-4', toolName: 'other_tool', args: { note: 'kept' }, result: 'kept' } },
  ] } }] }
  const [[kept, projected, forged, other]] = projection.value(raw).messages.map(({ content }) => content.parts)
  assert.deepEqual(kept.toolInvocation, raw.messages[0].content.parts[0].toolInvocation)
  assert.deepEqual(projected, {
    type: 'tool-invocation',
    toolInvocation: {
      state: 'result', toolCallId: 'call-2', toolName: 'connector_fetch',
      args: { integrator: null, service: null, fields: [
        'body', 'body.requestBody', 'body.requestBody.dataSet', 'body.requestBody.dataSet.criteria', 'body.requestBody.dataSet.criteria.expression',
        'body.requestBody.dataSet.criteria.expression.$', 'body.requestBody.dataSet.criteria.parameter', 'body.requestBody.dataSet.criteria.parameter[].$',
        'body.requestBody.dataSet.criteria.parameter[].type', 'body.requestBody.dataSet.entity', 'body.requestBody.dataSet.entity.fieldset',
        'body.requestBody.dataSet.entity.fieldset.list', 'body.requestBody.dataSet.includePresentationFields', 'body.requestBody.dataSet.offsetPage',
        'body.requestBody.dataSet.rootEntity', 'body.serviceName', 'query', 'query.outputType', 'query.serviceName',
      ] },
      result: { ok: true, status: 200, bytes: Buffer.byteLength(JSON.stringify({ id: SECRET_MARKER, rows: [{ a: 1 }, { a: 2 }] })), fields: ['id', 'rows', 'rows[].a'], counts: { rows: 2 } },
    },
    providerMetadata: { mastra: { toolPayloadTransform: {} } },
  })
  assert.deepEqual([forged.toolInvocation.args.integrator, forged.toolInvocation.args.service, forged.toolInvocation.result], [null, null, 'connector_fetch failed'])
  assert.deepEqual(other.toolInvocation, raw.messages[0].content.parts[3].toolInvocation)
  assert.equal(JSON.stringify(projection.value(raw)).includes(SECRET_MARKER), false)

  const project = projection.stream()
  assert.deepEqual(project({ type: 'tool_input_start', toolCallId: 'call-9', toolName: 'connector_fetch' }), { type: 'tool_input_start', toolCallId: 'call-9', toolName: 'connector_fetch' })
  assert.deepEqual(project({ type: 'tool_end', toolCallId: 'call-9', result: answered({ id: SECRET_MARKER }), isError: false }), {
    type: 'tool_end', toolCallId: 'call-9', result: { ok: true, status: 200, bytes: Buffer.byteLength(JSON.stringify({ id: SECRET_MARKER })), fields: ['id'], counts: {} }, isError: false,
  })
  assert.deepEqual(project({ type: 'tool_end', toolCallId: 'call-other', result: SECRET_MARKER, isError: false }), { type: 'tool_end', toolCallId: 'call-other', result: SECRET_MARKER, isError: false }, 'another tool\'s call is served as it is')
})

// A model that reads once, reads again with a value only the first answer held, then answers; or, with no reads, only answers.
const scriptedModel = ({ reads = true } = {}) => {
  const prompts = []
  const streamOf = (chunks) => new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close() } })
  const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
  const call = (id, input) => {
    const text = JSON.stringify(input)
    return [
      { type: 'stream-start', warnings: [] },
      { type: 'tool-input-start', id, toolName: 'connector_fetch' },
      { type: 'tool-input-delta', id, delta: text },
      { type: 'tool-input-end', id },
      { type: 'tool-call', toolCallId: id, toolName: 'connector_fetch', input: text },
      { type: 'finish', finishReason: 'tool-calls', usage },
    ]
  }
  const reply = [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't1' }, { type: 'text-delta', id: 't1', delta: 'Pronto.' }, { type: 'text-end', id: 't1' },
    { type: 'finish', finishReason: 'stop', usage },
  ]
  const results = (prompt) => prompt.flatMap((message) => (message.role === 'tool' ? message.content : []))
  const steps = reads ? [
    () => call('call-1', read()),
    (prompt) => call('call-2', markerRead(results(prompt).at(-1).output.value.body.transactionId)),
  ] : []
  return {
    prompts,
    results,
    model: {
      specificationVersion: 'v2', provider: 'conexus-probe', modelId: 'scripted', supportedUrls: {},
      doGenerate: async ({ prompt }) => {
        prompts.push(prompt)
        return { content: [{ type: 'text', text: 'Pronto.' }], finishReason: 'stop', usage, warnings: [] }
      },
      doStream: async ({ prompt }) => {
        prompts.push(prompt)
        const step = steps.shift()
        return { stream: streamOf(step ? step(prompt) : reply) }
      },
    },
  }
}

test('a Builder turn reads through the tool; the model receives the vendor body, and the browser and the history receive only the projection', async (t) => {
  const { fake, record, tools, projection, openRun } = await connectorsOf(t)
  const root = mkdtempSync(join(tmpdir(), 'conexus-connector-tool-'))
  const storage = new LibSQLStore({ id: `connector-tool-${randomUUID()}`, url: `file:${join(root, 'session.db')}` })
  const memory = new Memory({ storage, options: { lastMessages: 20 } })
  const scripted = scriptedModel()
  const agent = new Agent({
    id: 'builder', name: 'builder', instructions: 'Build.', model: scripted.model, memory,
    tools,
  })
  const controller = new AgentController({ id: 'code', storage, memory, agent, modes: [{ id: 'build', name: 'Build', default: true }], defaultModeId: 'build' })
  await controller.init()
  const mastra = new Mastra({ storage, agentControllers: { code: controller }, logger: false })
  const conversation = randomUUID()
  const app = await createHttpApp({
    registerRoutes: async (instance) => {
      await registerBuilderSessionRoutes(instance, {
        mastra, controllerId: 'code', controller, sessions: createConversationSessions({ controller }), origin,
        resolveCurrentSession: async (request) => (request.cookies['__Host-conexus_session'] ? { account: { accountId: randomUUID(), displayName: 'Operator' }, issuer: 'https://issuer.test', subject: 'subject-1' } : null),
        admitProject: async ({ projectId }) => projectId === PROJECT,
        admitConversation: async () => true,
        projectBusy: async () => false,
        runContext: () => undefined,
        toolPayloads: projection,
      })
      return []
    },
    staticRoot: null,
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  t.after(async () => {
    await app.close()
    await controller.destroy()
    await storage.close()
    rmSync(root, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${app.server.address().port}/api/builder/agent-controller/code/sessions/project:${PROJECT}`
  const headers = { cookie: '__Host-conexus_session=session-1' }

  const run = await openRun()
  const requestContext = contextOf(run)
  const scope = `builder:${RUN}`
  const session = await controller.createSession({ resourceId: `project:${PROJECT}`, scope, threadId: conversation, requestContext })
  // As the run configures it: no tool waits for a person's approval.
  await session.state.set({ yolo: true })
  const sessionEvents = []
  session.subscribe((event) => { sessionEvents.push(event) })
  const abort = new AbortController()
  const response = await fetch(`${base}/stream?sessionScope=${scope}`, { headers, signal: abort.signal })
  assert.equal(response.status, 200)
  const reader = response.body.getReader()
  let served = ''
  const streaming = (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return
        served += Buffer.from(value).toString('utf8')
      }
    } catch {}
  })()
  await new Promise((settle) => setTimeout(settle, 50))

  assert.equal(await sendBuilderSessionMessage(session, { content: 'Mostre o pedido 22790.' }, requestContext), 'complete')
  await new Promise((settle) => setTimeout(settle, 100))
  abort.abort()
  await streaming
  run.end()

  // The model: the vendor body in its input, and its second request carried a value only that body held.
  const [firstResult] = scripted.results(scripted.prompts[1])
  assert.deepEqual(firstResult.output, { type: 'json', value: answered(EXPECTED_NATIVE_ORDER) })
  assert.deepEqual(services(fake).map(({ body }) => body.requestBody.dataSet.criteria.parameter), [[{ $: '22790', type: 'I' }], [{ $: SECRET_MARKER, type: 'S' }]])

  // The browser stream: both calls streamed, as projections only.
  const streamed = served.split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice('data: '.length)))
  const started = streamed.filter(({ type }) => type === 'tool_start')
  const requestProjection = { integrator: 'sankhya', service: LOAD, fields: [
    'body', 'body.requestBody', 'body.requestBody.dataSet', 'body.requestBody.dataSet.criteria', 'body.requestBody.dataSet.criteria.expression',
    'body.requestBody.dataSet.criteria.expression.$', 'body.requestBody.dataSet.criteria.parameter', 'body.requestBody.dataSet.criteria.parameter[].$',
    'body.requestBody.dataSet.criteria.parameter[].type', 'body.requestBody.dataSet.entity', 'body.requestBody.dataSet.entity.fieldset',
    'body.requestBody.dataSet.entity.fieldset.list', 'body.requestBody.dataSet.includePresentationFields', 'body.requestBody.dataSet.offsetPage',
    'body.requestBody.dataSet.rootEntity', 'body.serviceName', 'query', 'query.outputType', 'query.serviceName',
  ] }
  // Mastra streams a streamed input's raw arguments on tool_start, so the route projects them with no integrator or service.
  const unresolved = { ...requestProjection, integrator: null, service: null }
  assert.deepEqual(started.map(({ toolName, args }) => [toolName, args]), [['connector_fetch', unresolved], ['connector_fetch', unresolved]])
  const ended = streamed.filter(({ type }) => type === 'tool_end').map(({ result }) => result)
  assert.deepEqual(ended[0], {
    ok: true, status: 200, bytes: Buffer.byteLength(JSON.stringify(EXPECTED_NATIVE_ORDER)),
    fields: [
      'pendingPrinting', 'responseBody', 'responseBody.entities', 'responseBody.entities.entity', 'responseBody.entities.entity.f0', 'responseBody.entities.entity.f0.$',
      'responseBody.entities.entity.f1', 'responseBody.entities.entity.f1.$', 'responseBody.entities.entity.f2', 'responseBody.entities.entity.f2.$',
      'responseBody.entities.hasMoreResult', 'responseBody.entities.metadata', 'responseBody.entities.metadata.fields', 'responseBody.entities.metadata.fields.field',
      'responseBody.entities.metadata.fields.field[].name', 'responseBody.entities.offset', 'responseBody.entities.offsetPage', 'responseBody.entities.total',
      'serviceName', 'status', 'transactionId',
    ],
    counts: { 'responseBody.entities.metadata.fields.field': 3 },
  })
  assert.equal(streamed.filter(({ type, argsTextDelta }) => type === 'tool_input_delta' && argsTextDelta).length, 0, 'no input delta reached the browser')

  // The history after a reload, through the Hub's messages route.
  const reloaded = await fetch(`${base}/threads/${conversation}/messages`, { headers })
  assert.equal(reloaded.status, 200)
  const history = await reloaded.json()
  const invocations = history.messages.flatMap(({ content }) => content.parts ?? []).filter(({ type }) => type === 'tool-invocation').map(({ toolInvocation }) => toolInvocation)
  assert.deepEqual(invocations.map(({ toolName, args, result }) => [toolName, args, result?.ok]), [['connector_fetch', requestProjection, true], ['connector_fetch', requestProjection, true]])

  // Past the Hub's routes, measured on @mastra/core 1.71.0: the session's own events carry the second
  // call's raw arguments (Mastra skips the display transform of an input the model streamed), and the
  // stored thread keeps the raw arguments and result. Only the routes' projection keeps them from the browser.
  const stored = await (await storage.getStore('memory')).listMessages({ threadId: conversation, perPage: false })
  const values = [SECRET_MARKER, '1520.50', FAKE_CREDENTIAL.clientSecret, FAKE_CREDENTIAL.xToken, FAKE_CREDENTIAL.clientId, 'fake-token-']
  const carriers = { 'browser stream': served, 'messages route': JSON.stringify(history), 'session events': JSON.stringify(sessionEvents), 'stored thread': JSON.stringify(stored), 'connector spans': recordText(record) }
  assert.deepEqual(Object.fromEntries(Object.entries(carriers).map(([name, text]) => [name, values.filter((value) => text.includes(value))])), {
    'browser stream': [], 'messages route': [], 'session events': [SECRET_MARKER], 'stored thread': [SECRET_MARKER, '1520.50'], 'connector spans': [],
  })
  assert.equal(JSON.stringify(scripted.prompts).includes('fake-token-'), false, 'the model never saw the vendor token')

  // A later turn of the same conversation: what the model receives from the history.
  const later = scriptedModel({ reads: false })
  const laterAgent = new Agent({ id: 'builder', name: 'builder', instructions: 'Build.', model: later.model, memory })
  const laterPrompts = later.prompts
  await laterAgent.generate('E agora?', { memory: { thread: conversation, resource: `project:${PROJECT}` } })
  const laterText = JSON.stringify(laterPrompts)
  assert.deepEqual([laterText.includes('connector_fetch'), laterText.includes('1520.50')], [true, true], 'a later turn receives the body from the stored thread')
})
