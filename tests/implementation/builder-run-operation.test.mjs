import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { RequestContext } from '@mastra/core/request-context'
import { placeBundle } from './check-bundle-vm.mjs'
import { FAKE_CREDENTIAL, NATIVE_ORDER_DATASET, startFakeGateway } from './connector-fake-gateway.mjs'
import { connectorRecord } from './connector-record.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { createBroker } = await import(hubModuleUrl('connectors/broker.js'))
const { createConnectorBrief } = await import(hubModuleUrl('connectors/builder-brief.js'))
const { createConnectorFetchTools, openBuilderRun } = await import(hubModuleUrl('connectors/builder-tool.js'))
const { createHandlerPorts } = await import(hubModuleUrl('connectors/handler-port.js'))
const { createSankhyaGateway } = await import(hubModuleUrl('connectors/sankhya/gateway.js'))
const { sankhyaDefinition } = await import(hubModuleUrl('connectors/sankhya/definition.js'))
const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))
const { schemaViolation } = await import(hubModuleUrl('app-runner/server-manifest.js'))
const { buildCandidateServer, createOperationRunner } = await import(hubModuleUrl('builder/run-operation.js'))
const { createRunOperationTool } = await import(hubModuleUrl('builder/harness/tools.js'))

const PROJECT = '22222222-2222-4222-8222-222222222222'
const CONNECTION = '33333333-3333-4333-8333-333333333333'
const RUN = '11111111-1111-4111-8111-111111111111'
const CALLER = Object.freeze({ accountId: '44444444-4444-4444-8444-444444444444', email: null, displayName: 'Construir' })
const READER_URL = hubModuleUrl('builder/handler-kit/sankhya.js')

const envelope = createSecretEnvelope('ef'.repeat(32))
const sealed = await envelope.seal(JSON.stringify(FAKE_CREDENTIAL))
const store = Object.freeze({
  listBindings: async ({ projectId, environment }) => (projectId === PROJECT && environment === 'preview'
    ? [{ bindingId: 'binding-erp', name: 'erp', connectionId: CONNECTION, connectorId: 'sankhya' }] : []),
  readConnectionCredential: async (_scope, connectionId) => (connectionId === CONNECTION ? sealed : null),
})

const ITEM_LINES = { type: 'object', properties: { code: { type: 'string' }, price: { type: 'string' }, promo: { type: 'string' }, discount: { type: 'string' } }, required: ['code', 'price'], additionalProperties: false }
const LINES_OUTPUT = { type: 'object', properties: { items: { type: 'array', items: ITEM_LINES }, failure: { type: 'string', maxLength: 40 } }, required: ['items'], additionalProperties: false }
const ITEMS_DATASET = { rootEntity: 'ItemNota', criteria: { expression: { $: 'this.NUNOTA = ?' }, parameter: [{ $: '9001', type: 'I' }] }, entity: [{ path: '', fieldset: { list: 'CODPROD,VLRUNIT,VLRDESC' } }] }

// The bundled handler as the server build would leave it, importing the generated reader.
const LINES_HANDLER = `import { loadAllRecords } from ${JSON.stringify(READER_URL)}
export async function orderLines(input, { connectors }) {
  if (input.readHeaderFirst) {
    const header = await connectors.fetch({ connection: 'erp', method: 'POST', path: '/gateway/v1/mge/service.sbr', query: { serviceName: 'CRUDServiceProvider.loadRecords', outputType: 'json' }, body: { serviceName: 'CRUDServiceProvider.loadRecords', requestBody: { dataSet: ${JSON.stringify(NATIVE_ORDER_DATASET)} } } })
    if (!header.ok) return { items: [], failure: header.code }
  }
  const read = await loadAllRecords(connectors, 'erp', ${JSON.stringify(ITEMS_DATASET)})
  if (!read.ok) return { items: [], failure: read.code }
  return { items: read.rows.map((row) => ({ code: row.CODPROD, price: input.priceAsNumber ? Number(row.VLRUNIT) : row.VLRUNIT, promo: row.VLRDESC ?? '', discount: '0.00' })) }
}
export async function throwsWithValue() { throw new Error('Produto 501 Parafuso sem preço') }
`
const MANIFEST = {
  version: 1,
  operations: {
    orderLines: { module: 'handlers/lines.mjs', export: 'orderLines', input: { type: 'object', properties: { readHeaderFirst: { type: 'boolean' }, priceAsNumber: { type: 'boolean' } }, additionalProperties: false }, output: LINES_OUTPUT },
    throwsWithValue: { module: 'handlers/lines.mjs', export: 'throwsWithValue', input: { type: 'object', properties: {}, additionalProperties: false }, output: LINES_OUTPUT },
  },
  migrations: [],
}
const serverFile = (path, text) => ({ path: `conexus-server/${path}`, sha256: createHash('sha256').update(text).digest('hex'), content: Buffer.from(text).toString('base64') })
const BUILT = [serverFile('manifest.json', JSON.stringify(MANIFEST)), serverFile('handlers/lines.mjs', LINES_HANDLER)]

const post = (socketPath, path, body) => new Promise((resolve) => {
  const payload = Buffer.from(JSON.stringify(body))
  const outgoing = request({ socketPath, path, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': payload.byteLength } }, (response) => {
    const chunks = []
    response.on('data', (chunk) => chunks.push(chunk))
    response.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
  })
  outgoing.on('error', () => resolve({ ok: false, code: 'CONNECTOR_UNCONFIGURED' }))
  outgoing.end(payload)
})

// The body the real runner answers a refusal with: the row's problem, with the detail at the top level.
const problemBody = (code, status, detail) => ({ type: `urn:conexus:problem:${code}`, title: code, status, code, ...(detail === undefined ? {} : { detail }) })

// Stands in for the Prévia's runner: loads the built module, hands the handler the invocation's
// connector socket, and refuses an output that breaks the declared schema, as the supervisor does.
const fakeRunner = (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'cx-run-op-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const invocations = []
  const invoke = async ({ projectId, operation, input, files, caller, connectorSocket }) => {
    invocations.push({ projectId, operation, caller, connector: connectorSocket !== undefined })
    const text = (path) => Buffer.from(files.find((file) => file.path === `conexus-server/${path}`).content, 'base64').toString('utf8')
    const declared = JSON.parse(text('manifest.json')).operations[operation]
    const modulePath = join(directory, `${invocations.length}.mjs`)
    writeFileSync(modulePath, text(declared.module))
    const handler = (await import(pathToFileURL(modulePath).href))[declared.export]
    const connectors = { fetch: (fetched) => (connectorSocket ? post(connectorSocket, '/v1/fetch', fetched) : { ok: false, code: 'CONNECTOR_UNCONFIGURED' }) }
    let value
    try {
      value = await handler(input, Object.freeze({ caller, connectors }))
    } catch (error) {
      return { status: 500, body: problemBody('HANDLER_FAILED', 500, error.message) }
    }
    const violation = schemaViolation(declared.output, value, false)
    return violation ? { status: 502, body: problemBody('HANDLER_OUTPUT_REFUSED', 502, violation) } : { status: 200, body: value }
  }
  return { invoke, invocations }
}

const inMode = () => ({ requestContext: new RequestContext() })

const setup = async (t, { built = BUILT } = {}) => {
  const fake = await startFakeGateway()
  t.after(() => fake.close())
  const record = connectorRecord()
  const connectors = [{ definition: sankhyaDefinition, adapter: createSankhyaGateway({ origin: fake.origin }) }]
  const broker = createBroker({ connectors, store, envelope, observability: record.observability })
  const brief = createConnectorBrief({ connectors, store, observability: record.observability })
  const socketDirectory = mkdtempSync(join(tmpdir(), 'cx-run-op-ports-'))
  t.after(() => rmSync(socketDirectory, { recursive: true, force: true }))
  const run = await openBuilderRun({ brief, projectId: PROJECT, accountId: '55555555-5555-4555-8555-555555555555', builderRunId: RUN, ports: createHandlerPorts({ directory: socketDirectory, broker }) })
  t.after(() => run.end())
  const runner = fakeRunner(t)
  const runOperation = createOperationRunner({
    projectId: PROJECT, caller: CALLER,
    buildServer: async () => (typeof built === 'string' ? { ok: false, detail: built } : { ok: true, files: built }),
    openConnectorPort: () => run.openHandlerPort(),
    invoke: runner.invoke,
  })
  const requestContext = new RequestContext()
  run.bind(requestContext)
  const connectorFetch = createConnectorFetchTools(broker)({ requestContext }).connector_fetch
  return { fake, run, runner, tool: createRunOperationTool(runOperation), connectorFetch }
}

const ITEM_VALUES = ['501', '502', '100.05', '130', '9001', '22790', 'Parafuso', 'Arruela']

test('the tool runs the operation through the run\'s Conexão and returns item counts and fill rates, never a value', async (t) => {
  const { fake, tool, runner } = await setup(t)
  const report = await tool.execute({ operation: 'orderLines', input: {} }, inMode())
  assert.deepEqual(report, {
    ok: true,
    operation: 'orderLines',
    lists: { '/items': 2 },
    fields: {
      '/items/*/code': { values: 2, filled: 2 },
      '/items/*/price': { values: 2, filled: 2 },
      '/items/*/promo': { values: 2, filled: 0 },
      '/items/*/discount': { values: 2, filled: 2, zeros: 2 },
      '/failure': { values: 1, filled: 0 },
    },
  })
  const text = JSON.stringify(report)
  for (const value of ITEM_VALUES) assert.equal(text.includes(value), false, `${value} reached the tool result`)
  assert.deepEqual(runner.invocations, [{ projectId: PROJECT, operation: 'orderLines', caller: CALLER, connector: true }])
  assert.deepEqual(fake.requests.map((r) => r.path), ['/authenticate', '/gateway/v1/mge/service.sbr'])
})

test('an output that breaks the schema returns HANDLER_OUTPUT_REFUSED with the pointer, not the value', async (t) => {
  const { tool } = await setup(t)
  const report = await tool.execute({ operation: 'orderLines', input: { priceAsNumber: true } }, inMode())
  assert.deepEqual(report, { ok: false, operation: 'orderLines', code: 'HANDLER_OUTPUT_REFUSED', detail: '/items/0/price: expected string' })
})

test('a handler\'s thrown message never reaches the tool result', async (t) => {
  const { tool } = await setup(t)
  assert.deepEqual(await tool.execute({ operation: 'throwsWithValue', input: {} }, inMode()), { ok: false, operation: 'throwsWithValue', code: 'HANDLER_FAILED' })
})

test('the operation spends the run\'s Conexão budget: with one call left, its second read is CALL_LIMIT', async (t) => {
  const { tool, connectorFetch, fake } = await setup(t)
  const read = { connection: 'erp', method: 'POST', path: '/gateway/v1/mge/service.sbr', query: { serviceName: 'CRUDServiceProvider.loadRecords', outputType: 'json' }, body: { serviceName: 'CRUDServiceProvider.loadRecords', requestBody: { dataSet: NATIVE_ORDER_DATASET } } }
  for (let call = 1; call < 50; call += 1) assert.equal((await connectorFetch.execute(read)).ok, true)
  const report = await tool.execute({ operation: 'orderLines', input: { readHeaderFirst: true } }, inMode())
  assert.deepEqual(report, {
    ok: true,
    operation: 'orderLines',
    lists: { '/items': 0 },
    fields: { '/items/*/code': { values: 0, filled: 0 }, '/items/*/price': { values: 0, filled: 0 }, '/items/*/promo': { values: 0, filled: 0 }, '/items/*/discount': { values: 0, filled: 0 }, '/failure': { values: 1, filled: 1 } },
  })
  assert.equal(fake.requests.filter((r) => r.path === '/gateway/v1/mge/service.sbr').length, 50)
  assert.deepEqual((await connectorFetch.execute(read)).code, 'CALL_LIMIT')
})

test('after the run ends its scope is revoked, so the operation\'s reads are NOT_GRANTED', async (t) => {
  const { tool, run, fake } = await setup(t)
  run.end()
  const report = await tool.execute({ operation: 'orderLines', input: {} }, inMode())
  assert.deepEqual(report.fields['/failure'], { values: 1, filled: 1 })
  assert.equal(fake.requests.length, 0)
})

test('a server half that does not build, and an undeclared operation, answer with the build\'s own reason', async (t) => {
  const broken = await setup(t, { built: 'conexus/handlers/lines.ts does not exist' })
  assert.deepEqual(await broken.tool.execute({ operation: 'orderLines', input: {} }, inMode()), {
    ok: false, operation: 'orderLines', code: 'SERVER_BUILD_FAILED', detail: 'conexus/handlers/lines.ts does not exist',
  })
  const { tool, runner } = await setup(t)
  assert.deepEqual(await tool.execute({ operation: 'orderTotals', input: {} }, inMode()), {
    ok: false, operation: 'orderTotals', code: 'OPERATION_NOT_FOUND', detail: 'declared: orderLines, throwsWithValue',
  })
  assert.deepEqual(runner.invocations, [])
})

const repositoryRoot = resolve(import.meta.dirname, '../..')
const SOURCE_MANIFEST = {
  operations: {
    orderLines: { handler: 'handlers/lines.ts', export: 'orderLines', input: MANIFEST.operations.orderLines.input, output: LINES_OUTPUT },
  },
}
const SOURCE_HANDLER = `import { loadAllRecords } from '../sankhya.gen.ts'
export async function orderLines(_input: unknown, { connectors }: { connectors: any }) {
  const read = await loadAllRecords(connectors, 'erp', { rootEntity: 'ItemNota' })
  return read.ok ? { items: read.rows.map((row) => ({ code: row.CODPROD ?? '', price: row.VLRUNIT ?? '' })) } : { items: [], failure: read.code }
}
`

// The Hub's bundle, run for real by its `server` command, as the tool runs it in the sandbox: one
// shell script, positional paths, and the files read back.
const localServerBuild = async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'cx-run-op-build-'))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const entry = placeBundle(join(scratch, 'opt'))
  const checkout = join(scratch, 'repo')
  const place = { node: process.execPath, entry, checkout, out: join(scratch, 'out') }
  const write = (files) => {
    rmSync(checkout, { recursive: true, force: true })
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(checkout, path)), { recursive: true })
      writeFileSync(join(checkout, path), content)
    }
  }
  const run = async (text, args) => {
    const ran = spawnSync('sh', ['-c', text, 'conexus-run-operation', ...args], { encoding: 'utf8', timeout: 120_000 })
    return { exitCode: ran.status ?? 1, stdout: ran.stdout, stderr: ran.stderr }
  }
  const build = () => buildCandidateServer(place, run, async (path) => readFileSync(path))
  return { write, build }
}

test('the server half is built from the checkout and read back as the runner takes it, and a later build never serves a stale one', async (t) => {
  const { write, build } = await localServerBuild(t)
  write({
    'conexus/manifest.json': JSON.stringify(SOURCE_MANIFEST),
    'conexus/handlers/lines.ts': SOURCE_HANDLER,
    'conexus/sankhya.gen.ts': readFileSync(join(repositoryRoot, 'apps/hub/src/builder/handler-kit/sankhya.ts'), 'utf8'),
  })
  const built = await build()
  assert.equal(built.ok, true, built.detail)
  assert.deepEqual(built.files.map((file) => file.path), ['conexus-server/handlers/lines.mjs', 'conexus-server/manifest.json'])
  const manifest = JSON.parse(Buffer.from(built.files[1].content, 'base64').toString('utf8'))
  assert.deepEqual(manifest, { version: 1, operations: { orderLines: { module: 'handlers/lines.mjs', export: 'orderLines', input: SOURCE_MANIFEST.operations.orderLines.input, output: LINES_OUTPUT } }, migrations: [] })
  const bundle = Buffer.from(built.files[0].content, 'base64')
  assert.equal(built.files[0].sha256, createHash('sha256').update(bundle).digest('hex'))
  assert.match(bundle.toString('utf8'), /hasMoreResult/)

  write({ 'app/index.html': '<!doctype html>' })
  assert.deepEqual(await build(), { ok: true, files: [] })

  write({ 'conexus/manifest.json': JSON.stringify(SOURCE_MANIFEST) })
  assert.deepEqual(await build(), { ok: false, detail: 'conexus/handlers/lines.ts does not exist' })
})

test('calls made together build and run one at a time, since every build writes the same folder', async (t) => {
  const runner = fakeRunner(t)
  let building = 0
  const overlaps = []
  const runOperation = createOperationRunner({
    projectId: PROJECT, caller: CALLER,
    buildServer: async () => {
      building += 1
      overlaps.push(building)
      await new Promise((resolve) => setTimeout(resolve, 20))
      building -= 1
      return { ok: true, files: BUILT }
    },
    openConnectorPort: async () => null,
    invoke: runner.invoke,
  })
  const reports = await Promise.all([runOperation({ operation: 'orderLines', input: {} }), runOperation({ operation: 'throwsWithValue', input: {} })])
  assert.deepEqual(overlaps, [1, 1])
  assert.deepEqual(reports.map((report) => [report.operation, report.ok]), [['orderLines', true], ['throwsWithValue', false]])
})

const refusalReport = async (reply) => {
  const runOperation = createOperationRunner({
    projectId: PROJECT, caller: CALLER,
    buildServer: async () => ({ ok: true, files: BUILT }),
    openConnectorPort: async () => null,
    invoke: async () => reply,
  })
  return runOperation({ operation: 'orderLines', input: {} })
}

test('a refusal body the real runner writes reaches the Builder as its own code, and a body with no code as RUNNER_REFUSED', async () => {
  assert.deepEqual(await refusalReport({ status: 500, body: problemBody('HANDLER_FAILED', 500, '23505 duplicate') }), { ok: false, operation: 'orderLines', code: 'HANDLER_FAILED', detail: 'SQLSTATE 23505' })
  assert.deepEqual(await refusalReport({ status: 502, body: problemBody('HANDLER_OUTPUT_REFUSED', 502, '/items/0/price: expected string') }), { ok: false, operation: 'orderLines', code: 'HANDLER_OUTPUT_REFUSED', detail: '/items/0/price: expected string' })
  assert.deepEqual(await refusalReport({ status: 500, body: { type: 'x', title: 'x', status: 500 } }), { ok: false, operation: 'orderLines', code: 'RUNNER_REFUSED' })
  assert.deepEqual(await refusalReport({ status: 500, body: { code: 5, detail: 'x' } }), { ok: false, operation: 'orderLines', code: 'RUNNER_REFUSED' })
})

test('a detail the worker wrote for a load failure never reaches the Builder, and the export name still does', async () => {
  const loadFailed = await refusalReport({ status: 500, body: problemBody('HANDLER_LOAD_FAILED', 500, 'secret') })
  assert.deepEqual(loadFailed, { ok: false, operation: 'orderLines', code: 'HANDLER_LOAD_FAILED' })
  assert.equal(JSON.stringify(loadFailed).includes('secret'), false)
  assert.deepEqual(await refusalReport({ status: 500, body: problemBody('HANDLER_EXPORT_MISSING', 500, 'find') }), { ok: false, operation: 'orderLines', code: 'HANDLER_EXPORT_MISSING', detail: 'find' })
})
