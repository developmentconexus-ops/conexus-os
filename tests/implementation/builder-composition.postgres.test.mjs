import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { createEmptyDatabase, testPool } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { invalidConfig } from './failure-matchers.mjs'

const built = hubModuleUrl
const { ConexusRunSandbox, createConversationSandbox, createRunWorkspace } = await import(built('builder/sandbox.js'))
const { createBuilderStorage } = await import(built('builder/storage.js'))
const { readHubConfig } = await import(built('platform/config.js'))

const missing = (name) => (error) => error.id === 'CONFIG_MISSING' && error.details?.name === name

const baseEnvironment = {
  NODE_ENV: 'test',
  CONEXUS_ORIGIN: 'https://hub.test',
  CONEXUS_PORT: '3000',
  CONEXUS_BOOTSTRAP_SUBJECT: 'subject',
  CONEXUS_DB_HOST: '127.0.0.1',
  CONEXUS_DB_PORT: '5432',
  CONEXUS_DB_NAME: 'conexus',
  CONEXUS_DB_USER: 'hub_runtime',
  CONEXUS_DB_PASSWORD_FILE: '/secrets/runtime',
  CONEXUS_OIDC_ISSUER: 'https://issuer.test',
  CONEXUS_OIDC_CLIENT_ID: 'hub',
  CONEXUS_OIDC_CLIENT_SECRET_FILE: '/secrets/oidc',
  CONEXUS_SECRET_KEY_FILE: '/secrets/installation-secret-key',
  CONEXUS_BUILDER_E2B_API_KEY_FILE: '/secrets/e2b',
  CONEXUS_BUILDER_E2B_TEMPLATE_ID: 'conexus:11111111-1111-4111-8111-111111111111',
  CONEXUS_BUILDER_QUESTION_WAIT_MS: String(5 * 60_000),
  CONEXUS_BUILDER_SANDBOX_IDLE_MS: String(5 * 60_000),
}
const storageEnvironment = { CONEXUS_DB_FACTORY_PASSWORD_FILE: '/secrets/factory-db' }
const CONVERSATION = '44444444-4444-4444-8444-444444444444'

const fakeVm = (sandboxId) => {
  const vm = { sandboxId, killed: false, paused: 0, runs: [] }
  vm.kill = async () => { vm.killed = true }
  vm.pause = async () => { vm.paused += 1; return true }
  vm.commands = {
    run: async (script, options) => {
      vm.runs.push({ script, options })
      if (script === 'exit 128') throw Object.assign(new Error('exit status 128'), { exitCode: 128, stdout: '', stderr: 'fatal: refused' })
      return { exitCode: 0, stdout: 'ok\n', stderr: '' }
    },
  }
  return vm
}

// E2B as the conversation's sandbox sees it: `found` is the VM E2B already has for its logical id.
const offlineRunSandbox = (vm, { timeoutMs, idleMs = 300_000, found = () => undefined } = {}) => {
  const sandbox = createConversationSandbox({ apiKey: 'e2b-key', templateId: 'conexus:tpl', conversationId: CONVERSATION, providerSandboxId: null, idleMs, ...(timeoutMs ? { timeoutMs } : {}) })
  const created = []
  sandbox.findExistingSandbox = async () => found()
  sandbox.createSdkSandbox = async (templateId, options) => { created.push({ templateId, options }); return vm }
  return { sandbox, created }
}

test("a conversation's sandbox is its own E2B sandbox, named for the conversation, with no environment and the agent's commands starting in the checkout", () => {
  const sandbox = createConversationSandbox({ apiKey: 'e2b-key', templateId: 'conexus:tpl', conversationId: CONVERSATION, providerSandboxId: null, idleMs: 300_000 })
  assert.ok(sandbox instanceof ConexusRunSandbox)
  assert.deepEqual({ id: sandbox.id, workingDirectory: sandbox.workingDirectory, env: sandbox.getEnv() }, { id: `conexus-conv-${CONVERSATION}`, workingDirectory: '/workspace/repo', env: {} })
  const workspace = createRunWorkspace(sandbox)
  assert.equal(workspace.sandbox, sandbox)
})

test("a conversation's sandbox is created from the template, closed to public inbound traffic, tagged with its conversation and paused at its timeout", async () => {
  const { sandbox, created } = offlineRunSandbox(fakeVm('vm-fresh'))
  await sandbox.start()
  assert.deepEqual(created.map(({ templateId, options }) => ({ templateId, network: options.network, lifecycle: options.lifecycle, metadata: options.metadata })), [{
    templateId: 'conexus:tpl', network: { allowPublicTraffic: false }, lifecycle: { onTimeout: 'pause' },
    metadata: { 'conexus-builder-conversation': CONVERSATION, 'mastra-sandbox-id': `conexus-conv-${CONVERSATION}` },
  }])
})

test("a conversation's sandbox is never paused by the Hub: once let go it gets the idle window, and E2B pauses it on its own", async () => {
  const vm = fakeVm('vm-kept')
  const deadlines = []
  vm.setTimeout = async (ms) => { deadlines.push(ms) }
  const { sandbox, created } = offlineRunSandbox(vm, { timeoutMs: 900_000, idleMs: 300_000 })
  assert.deepEqual(await sandbox.start(), { outcome: 'created' })
  const release = await sandbox.holdOpen(() => {})
  release()
  await new Promise((resolve) => setImmediate(resolve))
  await sandbox.idle()
  assert.deepEqual({ deadlines, paused: vm.paused, status: sandbox.status }, { deadlines: [900_000, 300_000, 300_000], paused: 0, status: 'running' })
  assert.deepEqual({ sandboxId: sandbox.sandboxId, created: created.length }, { sandboxId: 'vm-kept', created: 1 })
  await sandbox.kill()
  assert.deepEqual({ killed: vm.killed, status: sandbox.status }, { killed: true, status: 'destroyed' })
})

test('a hold taken right after letting go is the deadline E2B keeps, however late the idle request lands', async () => {
  const vm = fakeVm('vm-raced')
  // Each request waits until the test lands it; `landed` is the order E2B applied them in.
  const sent = []
  const landed = []
  vm.setTimeout = (ms) => new Promise((resolve) => { sent.push({ ms, land: () => { landed.push(ms); resolve() } }) })
  const { sandbox } = offlineRunSandbox(vm, { timeoutMs: 900_000, idleMs: 300_000 })
  await sandbox.start()
  const holding = sandbox.holdOpen(() => {})
  await new Promise((resolve) => setImmediate(resolve))
  sent.shift().land()
  const release = await holding
  release()
  let held = false
  const resumed = sandbox.holdOpen(() => {}).then((again) => { held = true; return again })
  // The network lands the newest request first, for as long as the resume waits.
  while (!held) {
    await new Promise((resolve) => setImmediate(resolve))
    sent.pop()?.land()
  }
  ;(await resumed)()
  for (let tick = 0; tick < 3; tick += 1) {
    await new Promise((resolve) => setImmediate(resolve))
    sent.pop()?.land()
  }
  assert.deepEqual(landed.slice(0, 3), [900_000, 300_000, 900_000], 'the idle request lands before the resumed hold')
})

test('a Hub root command runs as root from / with exactly the environment given, and a nonzero exit is returned, not thrown', async () => {
  const vm = fakeVm('vm-fresh')
  const { sandbox } = offlineRunSandbox(vm)
  await sandbox.start()
  const ran = await sandbox.runAsRoot('git --version', { GIT_TERMINAL_PROMPT: '0' })
  assert.deepEqual({ exitCode: ran.exitCode, stdout: ran.stdout }, { exitCode: 0, stdout: 'ok\n' })
  assert.deepEqual(vm.runs.at(-1), { script: 'git --version', options: { user: 'root', cwd: '/', envs: { GIT_TERMINAL_PROMPT: '0' }, timeoutMs: 120_000 } })
  const refused = await sandbox.runAsRoot('exit 128', {})
  assert.deepEqual({ exitCode: refused.exitCode, stderr: refused.stderr, success: refused.success }, { exitCode: 128, stderr: 'fatal: refused', success: false })
})

test('holdOpen extends the deadline now and every third of the budget until released', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const setTimeoutCalls = []
  const vm = fakeVm('vm-fresh')
  vm.setTimeout = async (ms) => { setTimeoutCalls.push(ms) }
  const { sandbox } = offlineRunSandbox(vm, { timeoutMs: 600_000 })
  await sandbox.start()
  const release = await sandbox.holdOpen(() => {})
  assert.deepEqual(setTimeoutCalls, [600_000])
  for (let extension = 0; extension < 2; extension += 1) {
    t.mock.timers.tick(200_000)
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.deepEqual(setTimeoutCalls, [600_000, 600_000, 600_000])
  release()
  t.mock.timers.tick(600_000)
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(setTimeoutCalls, [600_000, 600_000, 600_000, 300_000], 'letting go leaves the idle window and extends no more')
})

test('holdOpen retries transient extension failures three times, reports once, and refuses when the first extension fails', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const vm = fakeVm('vm-fresh')
  let calls = 0
  vm.setTimeout = async () => { calls += 1; if (calls >= 2) throw new Error('E2B_TIMEOUT_REFUSED') }
  const { sandbox } = offlineRunSandbox(vm, { timeoutMs: 600_000 })
  await sandbox.start()
  const lapses = []
  await sandbox.holdOpen((error) => { lapses.push(error) })
  for (let retry = 0; retry < 3; retry += 1) {
    t.mock.timers.tick(200_000)
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.deepEqual({ calls, lapses: lapses.map((error) => error.message) }, { calls: 4, lapses: ['E2B_TIMEOUT_REFUSED'] })

  const firstVm = fakeVm('vm-fresh-2')
  firstVm.setTimeout = async () => { throw new Error('E2B_TIMEOUT_REFUSED') }
  const { sandbox: failingFirst } = offlineRunSandbox(firstVm, { timeoutMs: 600_000 })
  await failingFirst.start()
  await assert.rejects(failingFirst.holdOpen(() => {}), { message: 'E2B_TIMEOUT_REFUSED' })
})

test('holdOpen stops retrying when E2B says the sandbox no longer exists', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const vm = fakeVm('vm-gone')
  let extensions = 0
  vm.setTimeout = async () => {
    extensions += 1
    if (extensions > 1) throw new Error('Sandbox vm-gone not found')
  }
  const { sandbox } = offlineRunSandbox(vm, { timeoutMs: 600_000 })
  await sandbox.start()
  const lapses = []
  const release = await sandbox.holdOpen((error) => { lapses.push(error.message) })
  t.mock.timers.tick(200_000)
  await new Promise((resolve) => setImmediate(resolve))
  t.mock.timers.tick(2_000_000)
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual({ extensions, lapses }, { extensions: 2, lapses: ['Sandbox vm-gone not found'] })
  release()
})

const { CONEXUS_BUILDER_E2B_API_KEY_FILE: _e2bKey, CONEXUS_BUILDER_E2B_TEMPLATE_ID: _e2bTemplate, ...environmentWithoutBuilder } = baseEnvironment

test('with no Builder and no storage role the Hub boots, with the installation credential key', () => {
  assert.equal(readHubConfig(environmentWithoutBuilder).factory, undefined)
  assert.deepEqual(readHubConfig(environmentWithoutBuilder).secretKey, { file: '/secrets/installation-secret-key', previousFiles: [] })
  const { CONEXUS_SECRET_KEY_FILE: _key, ...keyless } = environmentWithoutBuilder
  assert.throws(() => readHubConfig(keyless), missing('CONEXUS_SECRET_KEY_FILE'), 'every Hub seals its sessions\' refresh tokens')
})

test("a Builder without its Mastra storage role is refused, and with it the role's password file is all the Hub reads", () => {
  assert.throws(() => readHubConfig(baseEnvironment), invalidConfig('BUILDER_FACTORY_RUNTIME_REQUIRED'))
  assert.deepEqual(readHubConfig({ ...baseEnvironment, ...storageEnvironment }).factory, { databasePasswordFile: '/secrets/factory-db' })
})

test('Google AI Pro needs both CLIProxyAPI variables, an absolute path and a sha256, and the storage role', () => {
  const sha256 = 'ab'.repeat(32)
  const complete = { ...baseEnvironment, ...storageEnvironment }
  assert.equal(readHubConfig(complete).googleAiPro, undefined)
  assert.deepEqual(readHubConfig({ ...complete, CONEXUS_CLIPROXY_BIN: '/opt/cliproxy/cli-proxy-api', CONEXUS_CLIPROXY_SHA256: sha256 }).googleAiPro, { binary: '/opt/cliproxy/cli-proxy-api', sha256 })
  assert.throws(() => readHubConfig({ ...complete, CONEXUS_CLIPROXY_BIN: '/opt/cliproxy/cli-proxy-api' }), missing('CONEXUS_CLIPROXY_SHA256'))
  assert.throws(() => readHubConfig({ ...complete, CONEXUS_CLIPROXY_SHA256: sha256 }), missing('CONEXUS_CLIPROXY_BIN'))
  assert.throws(() => readHubConfig({ ...complete, CONEXUS_CLIPROXY_BIN: 'cli-proxy-api', CONEXUS_CLIPROXY_SHA256: sha256 }), invalidConfig('CONEXUS_CLIPROXY_BIN'))
  assert.throws(() => readHubConfig({ ...complete, CONEXUS_CLIPROXY_BIN: '/opt/cli-proxy-api', CONEXUS_CLIPROXY_SHA256: 'AB'.repeat(32) }), invalidConfig('CONEXUS_CLIPROXY_SHA256'))
  assert.throws(() => readHubConfig({ ...environmentWithoutBuilder, CONEXUS_CLIPROXY_BIN: '/opt/cli-proxy-api', CONEXUS_CLIPROXY_SHA256: sha256 }), invalidConfig('GOOGLE_AI_PRO_FACTORY_RUNTIME_REQUIRED'))
})

test('after a key rotation a secret sealed under a previous key still opens, and only through the keys the installation names', async () => {
  const { createSecretEnvelope, sessionContext } = await import(built('platform/secrets.js'))
  const previous = 'c3'.repeat(32)
  const current = 'd4'.repeat(32)
  const context = sessionContext(Buffer.alloc(32, 1))
  const sealedBefore = await createSecretEnvelope(previous).seal('refresh-before-rotation', context)
  assert.equal(await createSecretEnvelope(current, [previous]).open(sealedBefore, context), 'refresh-before-rotation')
  await assert.rejects(createSecretEnvelope(current).open(sealedBefore, context))
})

test('previous credential keys are named by absolute paths, separated by commas', () => {
  const complete = { ...baseEnvironment, ...storageEnvironment }
  assert.deepEqual(readHubConfig(complete).secretKey.previousFiles, [])
  assert.deepEqual(readHubConfig({ ...complete, CONEXUS_PREVIOUS_SECRET_KEY_FILES: '/secrets/key-2025,/secrets/key-2026' }).secretKey.previousFiles,
    ['/secrets/key-2025', '/secrets/key-2026'])
  assert.throws(() => readHubConfig({ ...complete, CONEXUS_PREVIOUS_SECRET_KEY_FILES: 'key-2025' }), invalidConfig('CONEXUS_PREVIOUS_SECRET_KEY_FILES'))
})

// A probe role owning a `factory` schema, as hub_factory owns it in production.
const storageRole = async (t, name) => {
  const { admin, connection, onCleanup } = await createEmptyDatabase(t, name)
  const role = `factory_probe_${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const password = randomUUID()
  await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`)
  onCleanup(() => admin.query(`DROP ROLE IF EXISTS ${role}`))
  const owner = new pg.Client(connection)
  await owner.connect()
  await owner.query(`CREATE SCHEMA factory AUTHORIZATION ${role}`)
  await owner.end()
  onCleanup(async () => {
    const dropper = new pg.Client(connection)
    await dropper.connect()
    await dropper.query('DROP SCHEMA IF EXISTS factory CASCADE')
    await dropper.end()
  })
  const pool = testPool({ ...connection, user: role, password, options: '-c search_path=factory', max: 4 })
  onCleanup(() => pool.end())
  return { connection, role, pool, onCleanup }
}

test("the Builder's storage lands every table in factory: its threads, messages and spans, and nothing in public", async (t) => {
  const { connection, role, pool, onCleanup } = await storageRole(t, 'conexus_builder_storage')
  const storage = createBuilderStorage(pool)
  await storage.init()
  const inspector = new pg.Client(connection)
  await inspector.connect()
  onCleanup(() => inspector.end())
  const { rows } = await inspector.query(`
    SELECT n.nspname AS schema, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND pg_get_userbyid(c.relowner) = $1 ORDER BY 1, 2`, [role])
  assert.deepEqual([...new Set(rows.map((row) => row.schema))], ['factory'])
  const tables = rows.map((row) => row.name)
  for (const expected of ['mastra_threads', 'mastra_messages', 'mastra_ai_spans']) assert.ok(tables.includes(expected), `${expected} is created in factory`)
  const publicTables = await inspector.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname = 'public'")
  assert.equal(publicTables.rows[0].count, 0)
})

test("the Builder's spans persist, and the 30-day retention prunes only stale spans, never a conversation's messages", async (t) => {
  const { pool } = await storageRole(t, 'conexus_builder_tracing')
  const storage = createBuilderStorage(pool)
  await storage.init()
  const observabilityStore = await storage.getStore('observability')
  assert.ok(observabilityStore, 'the storage carries a real observability store')

  const traceId = randomUUID().replaceAll('-', '')
  const rootSpanId = randomUUID().replaceAll('-', '').slice(0, 16)
  const staleSpanId = randomUUID().replaceAll('-', '').slice(0, 16)
  const now = new Date()
  const stale = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000)
  await observabilityStore.batchCreateSpans({
    records: [
      {
        traceId, spanId: rootSpanId, name: 'agent run', spanType: 'agent_run', isEvent: false, startedAt: now, endedAt: now,
        metadata: { conexusBuilderProjectId: 'project-1', conexusBuilderRunId: 'run-1' },
      },
      {
        traceId, spanId: staleSpanId, parentSpanId: rootSpanId, name: 'old model call', spanType: 'model_generation', isEvent: false,
        startedAt: stale, endedAt: stale, attributes: { model: 'google-ai-pro/gemini', usage: { inputTokens: 10, outputTokens: 5 } },
      },
    ],
  })
  const found = await observabilityStore.listTraces({
    filters: { metadata: { conexusBuilderProjectId: 'project-1', conexusBuilderRunId: 'run-1' } },
    pagination: { page: 0, perPage: 1 },
  })
  assert.equal(found.spans.at(0)?.traceId, traceId)

  const memory = await storage.getStore('memory')
  await memory.saveThread({ thread: { id: 'thread-1', resourceId: 'project:1', title: 'probe thread', createdAt: now, updatedAt: now } })
  const messageId = randomUUID()
  await memory.saveMessages({
    messages: [{ id: messageId, role: 'user', createdAt: stale, threadId: 'thread-1', resourceId: 'project:1', content: { format: 2, parts: [{ type: 'text', text: 'hi' }] } }],
  })

  const results = await storage.prune()
  assert.deepEqual(results.map((result) => ({ domain: result.domain, table: result.table, deleted: result.deleted })), [
    { domain: 'observability', table: 'mastra_ai_spans', deleted: 1 },
  ])
  const survivors = await observabilityStore.getTrace({ traceId })
  assert.deepEqual(survivors.spans.map((span) => span.spanId), [rootSpanId])
  const messages = await memory.listMessagesById({ messageIds: [messageId] })
  assert.equal(messages.messages.length, 1)
})

test("a span prune pass on a fresh installation waits for the store's tables instead of failing on them", async (t) => {
  const { pruneSpans } = await import(built('builder/storage.js'))
  const { pool } = await storageRole(t, 'conexus_builder_fresh_prune')
  const logs = []
  await pruneSpans(createBuilderStorage(pool), (code, fields) => logs.push([code, ...Object.values(fields)].join(':')), new AbortController().signal)
  assert.deepEqual(logs, ['BUILDER_RETENTION_PRUNED:observability.mastra_ai_spans:0'])
})

test('a span prune pass aborts a prune that never ends on its own, so the executor can drain it inside the shutdown deadline', async () => {
  const { pruneSpans } = await import(built('builder/storage.js'))
  const logs = []
  const stop = new AbortController()
  const storage = {
    init: async () => undefined,
    prune: ({ signal }) => new Promise((settle) => {
      signal.addEventListener('abort', () => settle([{ domain: 'observability', table: 'mastra_ai_spans', deleted: 1000, done: false }]))
    }),
  }
  const pass = pruneSpans(storage, (code, fields) => logs.push([code, ...Object.values(fields)].join(':')), stop.signal)
  await new Promise((r) => setImmediate(r))
  const started = Date.now()
  stop.abort()
  await pass
  assert.ok(Date.now() - started < 1_000, 'the pass returned without waiting for the backlog')
  assert.deepEqual(logs, [
    'BUILDER_RETENTION_PRUNED:observability.mastra_ai_spans:1000',
    'BUILDER_RETENTION_PRUNE_INCOMPLETE:observability.mastra_ai_spans',
  ])
})

test('a span prune pass logs each table it pruned, and a prune that fails rejects the pass', async () => {
  const { pruneSpans } = await import(built('builder/storage.js'))
  const logs = []
  const log = (code, fields) => logs.push([code, ...Object.values(fields)].join(':'))
  const signal = new AbortController().signal
  const storage = (prune) => ({ init: async () => undefined, prune })
  await pruneSpans(storage(async () => [{ domain: 'observability', table: 'mastra_ai_spans', deleted: 5, done: true }]), log, signal)
  await pruneSpans(storage(async () => [
    { domain: 'observability', table: 'mastra_ai_spans', deleted: 2, done: false },
    { domain: 'observability', table: 'other_table', deleted: 0, done: true },
  ]), log, signal)
  assert.deepEqual(logs, [
    'BUILDER_RETENTION_PRUNED:observability.mastra_ai_spans:5',
    'BUILDER_RETENTION_PRUNED:observability.mastra_ai_spans:2',
    'BUILDER_RETENTION_PRUNE_INCOMPLETE:observability.mastra_ai_spans',
    'BUILDER_RETENTION_PRUNED:observability.other_table:0',
  ])
  await assert.rejects(pruneSpans(storage(async () => { throw new Error('PRUNE_DOWN') }), log, signal), { message: 'PRUNE_DOWN' })
})

test('the Builder observability compacts PROCESSOR_RUN input and output message arrays to messageCount', async () => {
  const { createBuilderObservability } = await import(built('builder/observability.js'))
  const [compactProcessorRunPayloads] = createBuilderObservability('conexus-builder-test').getDefaultInstance().getConfig().spanOutputProcessors
  const { SpanType } = await import('@mastra/core/observability')

  assert.equal(compactProcessorRunPayloads.name, 'builder-compact-processor-run-payloads')

  // PROCESSOR_RUN span with arrays
  const processorSpan = {
    type: SpanType.PROCESSOR_RUN,
    input: [{ id: '1', role: 'user', content: 'hello' }, { id: '2', role: 'assistant', content: 'hi' }],
    output: [{ id: '3', role: 'user', content: 'more' }],
  }
  const processed = compactProcessorRunPayloads.process(processorSpan)
  assert.deepEqual(processed.input, { messageCount: 2 })
  assert.deepEqual(processed.output, { messageCount: 1 })

  // Non-array input/output on PROCESSOR_RUN are preserved
  const nonArraySpan = {
    type: SpanType.PROCESSOR_RUN,
    input: { someOtherField: 123 },
    output: 'done',
  }
  const processedNonArray = compactProcessorRunPayloads.process(nonArraySpan)
  assert.deepEqual(processedNonArray.input, { someOtherField: 123 })
  assert.equal(processedNonArray.output, 'done')

  // Other span types are not touched
  const agentSpan = {
    type: SpanType.AGENT_RUN,
    input: [{ id: '1', content: 'test' }],
    output: [{ id: '2', content: 'result' }],
  }
  const processedAgent = compactProcessorRunPayloads.process(agentSpan)
  assert.deepEqual(processedAgent.input, [{ id: '1', content: 'test' }])
  assert.deepEqual(processedAgent.output, [{ id: '2', content: 'result' }])

  // null or undefined spans pass through safely
  assert.equal(compactProcessorRunPayloads.process(undefined), undefined)
})

test('the Builder observability deterministically compacts processor_run span bytes', async () => {
  const { createBuilderObservability } = await import(built('builder/observability.js'))
  const [compactProcessorRunPayloads] = createBuilderObservability('conexus-builder-test').getDefaultInstance().getConfig().spanOutputProcessors
  const { SpanType } = await import('@mastra/core/observability')

  // Synthetic Builder turn with 25 conversation messages of typical turn context size (~1.5 KB each)
  const syntheticMessages = Array.from({ length: 25 }, (_, i) => ({
    id: `msg-${i}`,
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Builder prompt turn context chunk ${i}: `.padEnd(1500, 'x'),
  }))

  const rawProcessorSpan = {
    type: SpanType.PROCESSOR_RUN,
    input: syntheticMessages,
    output: syntheticMessages.slice(0, 10),
  }

  const rawBytes = Buffer.byteLength(JSON.stringify(rawProcessorSpan.input)) + Buffer.byteLength(JSON.stringify(rawProcessorSpan.output))

  // Clone before passing to span processor
  const spanToProcess = {
    type: SpanType.PROCESSOR_RUN,
    input: [...syntheticMessages],
    output: syntheticMessages.slice(0, 10),
  }

  const processed = compactProcessorRunPayloads.process(spanToProcess)
  const compactedBytes = Buffer.byteLength(JSON.stringify(processed.input)) + Buffer.byteLength(JSON.stringify(processed.output))

  // Assert deterministic reduction: raw is ~54 KB, compacted is exactly 38 bytes (>99.9% reduction)
  assert.ok(rawBytes > 50_000, `expected raw bytes > 50000, got ${rawBytes}`)
  assert.deepEqual(processed.input, { messageCount: 25 })
  assert.deepEqual(processed.output, { messageCount: 10 })
  assert.equal(compactedBytes, 38)
  assert.ok(compactedBytes / rawBytes < 0.001, 'compacted payload must be less than 0.1% of raw payload')
})


test('retired key variable alone cannot boot a Hub', () => {
  const { CONEXUS_SECRET_KEY_FILE: _key, ...withoutCurrent } = environmentWithoutBuilder
  assert.throws(() => readHubConfig({ ...withoutCurrent, CONEXUS_FACTORY_SECRET_KEY_FILE: '/synthetic/retired-key' }), missing('CONEXUS_SECRET_KEY_FILE'))
})
