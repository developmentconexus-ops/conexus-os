// Hand-built stand-ins for the Builder eval tests: a Builder trace in the span shape the Hub's Mastra
// exporter stores, the screen truth of the ten-row sales sample, and fakes for the Hub, the browser
// driver and the simulator's health route. Nothing here talks to a model, a Hub or a browser.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { runExperiment } from '../../scripts/builder-eval/experiment.mjs'
import { createEvalMastra } from '../../scripts/builder-eval/scorers.mjs'

/** The known answers of the ten-row sales sample (two sellers, one month each). */
export const SALES_SCREEN = Object.freeze({
  names: ['ANA', 'BRUNO'],
  amounts: [
    { cents: 115035, label: 'ANA · jan/2026' },
    { cents: 200050, label: 'BRUNO · fev/2026' },
    { cents: 315085, label: 'total geral' },
  ],
  mistakes: [
    { cents: 415084, label: 'o total de quem soma notas não confirmadas' },
    { cents: 365085, label: 'o total de quem soma pedidos' },
    { cents: 325085, label: 'o total de quem ignora devoluções' },
  ],
})

export const SALES_PREVIEW_TEXT = 'Painel de vendas\nVendedor\tjan/2026\tfev/2026\nANA\tR$ 1.150,35\t\nBRUNO\t\tR$ 2.000,50\nTotal geral\tR$ 3.150,85'

const at = (ms) => new Date(Date.UTC(2026, 0, 1) + ms)

const span = (traceId, spanId, parentSpanId, spanType, fields = {}) => ({
  traceId, spanId, parentSpanId, spanType, name: spanType, entityType: null, entityId: null, entityName: null,
  metadata: null, attributes: null, input: null, output: null, error: null, isEvent: false,
  startedAt: at(0), endedAt: at(1), ...fields,
})

/**
 * One Builder run's trace: the main agent makes ten tool calls over three steps (a repeated view, a
 * write then a fresh view, a skill loaded twice, a repeated connector_fetch with its keys reordered,
 * a simulator refusal and a failed command), plus an observational-memory observer whose tokens and
 * view belong to it, not to the main agent.
 */
export function builderTrace({ traceId, builderRunId, projectId }) {
  const node = (spanId, parentSpanId, spanType, fields) => span(traceId, spanId, parentSpanId, spanType, fields)
  const tool = (spanId, stepId, startMs, entityName, input, fields = {}) => node(spanId, stepId, 'tool_call', {
    name: `tool: '${entityName}'`, entityType: 'tool', entityName, input, attributes: { success: true },
    startedAt: at(startMs), endedAt: at(startMs + 500), ...fields,
  })
  const fetchX = { connection: 'erp', method: 'POST', path: '/gateway/v1/mge/service.sbr', body: { serviceName: 'CRUDServiceProvider.loadRecords', page: 0 } }
  return [
    node(`${traceId}-root`, null, 'agent_run', {
      name: "agent run: 'code-agent'", entityType: 'agent', entityId: 'code-agent', entityName: 'code-agent',
      metadata: { conexusBuilderRunId: builderRunId, conexusBuilderProjectId: projectId }, startedAt: at(0), endedAt: at(300_000),
    }),
    node(`${traceId}-gen`, `${traceId}-root`, 'model_generation', { attributes: { usage: { inputTokens: 1000, inputDetails: { cacheRead: 600 }, outputTokens: 50 } } }),
    node(`${traceId}-step-1`, `${traceId}-gen`, 'model_step'),
    tool(`${traceId}-t01`, `${traceId}-step-1`, 1000, 'view', { path: 'src/a.ts' }),
    tool(`${traceId}-t02`, `${traceId}-step-1`, 2000, 'view', { path: './src/a.ts' }),
    node(`${traceId}-step-2`, `${traceId}-gen`, 'model_step'),
    tool(`${traceId}-t03`, `${traceId}-step-2`, 3000, 'write_file', { path: 'src/a.ts', content: 'export {}' }),
    tool(`${traceId}-t04`, `${traceId}-step-2`, 4000, 'view', { path: 'src/a.ts' }),
    tool(`${traceId}-t05`, `${traceId}-step-2`, 5000, 'skill', { name: 'sankhya' }),
    tool(`${traceId}-t06`, `${traceId}-step-2`, 6000, 'skill', { name: 'sankhya' }),
    node(`${traceId}-step-3`, `${traceId}-gen`, 'model_step'),
    tool(`${traceId}-t07`, `${traceId}-step-3`, 7000, 'connector_fetch', fetchX),
    tool(`${traceId}-t08`, `${traceId}-step-3`, 8000, 'connector_fetch', { body: { page: 0, serviceName: 'CRUDServiceProvider.loadRecords' }, path: fetchX.path, method: 'POST', connection: 'erp' }),
    tool(`${traceId}-t09`, `${traceId}-step-3`, 9000, 'connector_fetch', { ...fetchX, body: { serviceName: 'CRUDServiceProvider.loadRecords', page: 1 } }, {
      output: { status: '0', statusMessage: '[simulador] função não suportada: EXTRACT' },
    }),
    tool(`${traceId}-t10`, `${traceId}-step-3`, 10_000, 'execute_command', { command: 'npm run build' }, {
      attributes: { success: false }, error: { message: 'exit code 1' },
    }),
    node(`${traceId}-step-4`, `${traceId}-gen`, 'model_step'),
    node(`${traceId}-memory`, `${traceId}-root`, 'memory_operation'),
    node(`${traceId}-observer`, `${traceId}-memory`, 'agent_run', { name: "agent run: 'observational-memory-observer'" }),
    node(`${traceId}-observer-gen`, `${traceId}-observer`, 'model_generation', { attributes: { usage: { inputTokens: 5000, outputTokens: 5 } } }),
    node(`${traceId}-observer-step`, `${traceId}-observer-gen`, 'model_step'),
    tool(`${traceId}-observer-view`, `${traceId}-observer-step`, 1500, 'view', { path: 'src/a.ts' }),
  ]
}

export const seedSpans = async (storage, records) => (await storage.getStore('observability')).batchCreateSpans({ records })

/** A Hub that knows `models` and hands out Project ids p-1, p-2, … in call order. */
function fakeHub(models) {
  const created = []
  const bound = []
  return {
    created,
    bound,
    workspaceId: 'ws-eval',
    usableModelIds: async () => models,
    createProject: async ({ name }) => {
      const projectId = `p-${created.length + 1}`
      created.push({ projectId, name })
      return { projectId }
    },
    openSimulatorBinding: async () => ({ connectionId: 'conn-sim', bindProject: async (projectId) => { bound.push(projectId) } }),
    close: async () => {},
  }
}

/**
 * Stands in for run.mjs's runCase: reads the case file the driver wrote, seeds one Builder trace
 * (trace-<project>) and answers a built Preview, or a failed run when `failures[model]` still holds a
 * failure category for that model.
 */
function fakeRunCase(storage, { failures = {} } = {}) {
  const calls = []
  let inFlight = 0
  let maxInFlight = 0
  const runCase = async (options) => {
    calls.push({ experimentId: basename(dirname(options.out)), item: basename(options.out), model: options.model, project: options.project, case: JSON.parse(readFileSync(options.case, 'utf8')) })
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise((resolve) => setTimeout(resolve, 5))
    inFlight -= 1
    const builderRunId = `run-${options.project}`
    await seedSpans(storage, builderTrace({ traceId: `trace-${options.project}`, builderRunId, projectId: options.project }))
    const category = failures[options.model]?.shift()
    const failed = category !== undefined
    return {
      outcome: failed ? 'FAIL' : 'PASS', error: null, projectId: options.project, modelId: options.model,
      runs: [{
        builderRunId, isRepair: false, state: failed ? 'FAILED' : 'SUCCEEDED', resultKind: failed ? null : 'SOURCE_CHANGED',
        failureCategory: category ?? null, failureCode: failed ? `BUILDER_${category}` : null,
      }],
      failure: failed ? 'FINAL_RUN_NOT_BUILT' : null,
      previewText: failed ? null : SALES_PREVIEW_TEXT,
      sourceRevisionAfter: failed ? null : 'rev-1',
      wallTimeToUsablePreviewMs: failed ? null : 42_000,
    }
  }
  return { runCase, calls, maxInFlight: () => maxInFlight }
}

/** The simulator's health route only, serving `fixtures`, on a loopback port. */
async function startSimulatorHealth(fixtures) {
  const server = createServer((request, response) => {
    response.writeHead(request.url === '/__sim/health' ? 200 : 404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ fixtures, counters: { loadRecords: 0, refusals: 0, otherServices: 0 } }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) }
}

export const ARMS = Object.freeze([{ id: 'flash', model: 'm-flash' }, { id: 'luna', model: 'm-luna' }])

export const CASES = Object.freeze([{
  id: 'sales-dashboard',
  input: { request: 'Quero um painel de vendas com os dados do nosso Sankhya.', fixture: 'sales-v1' },
  truth: { fixture: 'sales-v1', screen: SALES_SCREEN, figures: { grandTotalCents: 315085 } },
}])

/**
 * Comparison c1 over `storage` with a fake Hub where m-flash, m-luna and m-other are usable, the fake driver and a
 * simulator health route serving sales-v1. `run(overrides)` is one invocation of the driver.
 */
export async function experimentHarness(t, storage, { failures } = {}) {
  const mastra = createEvalMastra({ storage })
  const hub = fakeHub(['m-flash', 'm-luna', 'm-other'])
  const driver = fakeRunCase(storage, { failures })
  const simulator = await startSimulatorHealth(['sales-v1'])
  const outRoot = mkdtempSync(join(tmpdir(), 'builder-eval-test-'))
  t.after(async () => {
    await simulator.close()
    rmSync(outRoot, { recursive: true, force: true })
  })
  const run = (overrides = {}) => runExperiment(
    { mastra, hub, runCase: driver.runCase, simulatorOrigin: simulator.origin, log: () => {} },
    { comparisonId: 'c1', arms: ARMS, cases: CASES, trials: 1, concurrency: 2, outRoot, statePath: '/state.json', baseUrl: 'https://hub.test', maxRepairs: 2, ...overrides },
  )
  return { mastra, hub, driver, simulator, run }
}
