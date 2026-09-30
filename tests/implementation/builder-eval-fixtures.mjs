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
    tool(`${traceId}-t01`, `${traceId}-step-1`, 1000, 'mastra_workspace_read_file', { path: 'src/a.ts' }),
    tool(`${traceId}-t02`, `${traceId}-step-1`, 2000, 'mastra_workspace_read_file', { path: './src/a.ts' }),
    node(`${traceId}-step-2`, `${traceId}-gen`, 'model_step'),
    tool(`${traceId}-t03`, `${traceId}-step-2`, 3000, 'mastra_workspace_write_file', { path: 'src/a.ts', content: 'export {}' }),
    tool(`${traceId}-t04`, `${traceId}-step-2`, 4000, 'mastra_workspace_read_file', { path: 'src/a.ts' }),
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
    tool(`${traceId}-observer-view`, `${traceId}-observer-step`, 1500, 'mastra_workspace_read_file', { path: 'src/a.ts' }),
  ]
}

/**
 * A Builder run that stopped for a question and resumed after the answer, as Mastra records it: the
 * resumed agent_run is nested under the first run's model generation, ends at a later time, and
 * holds the whole build. Times are seconds after the run row's creation, kept apart from the
 * person's wait (60 s to 160 s). The observer's agent_run has another entityId and stays out.
 */
export function resumedBuilderTrace({ traceId = 'tr-r', builderRunId = 'run-r', projectId = 'p-r' } = {}) {
  const s = (seconds) => at(seconds * 1000)
  const node = (spanId, parentSpanId, spanType, fields) => span(traceId, spanId, parentSpanId, spanType, fields)
  const tool = (spanId, stepId, from, to, entityName, input, fields = {}) => node(spanId, stepId, 'tool_call', {
    name: `tool: '${entityName}'`, entityType: 'tool', entityName, input, attributes: { success: true }, startedAt: s(from), endedAt: s(to), ...fields,
  })
  const step = (spanId, parentSpanId, from, to, usage) => node(spanId, parentSpanId, 'model_step', { startedAt: s(from), endedAt: s(to), attributes: { usage } })
  const agent = (spanId, parentSpanId, from, to, fields = {}) => node(spanId, parentSpanId, 'agent_run', {
    entityType: 'agent', entityId: 'code-agent', entityName: 'code-agent', startedAt: s(from), endedAt: s(to), ...fields,
  })
  const report = (ok, problemCode) => ({
    ok,
    steps: [
      { step: 'generate', status: 'passed', durationMs: 30 },
      ok ? { step: 'typecheck', status: 'passed', durationMs: 7000 } : { step: 'typecheck', status: 'failed', durationMs: 7000, problems: [{ code: problemCode, message: 'x' }] },
    ],
  })
  const operation = { name: 'listar', input: {} }
  return [
    agent(`${traceId}-root`, null, 5, 60, { metadata: { conexusBuilderRunId: builderRunId, conexusBuilderProjectId: projectId } }),
    node(`${traceId}-gen-1`, `${traceId}-root`, 'model_generation', { startedAt: s(5), endedAt: s(60), attributes: { usage: { inputTokens: 1000, inputDetails: { cacheRead: 0 }, outputTokens: 100 } } }),
    node(`${traceId}-chunk-1`, `${traceId}-gen-1`, 'model_chunk', { name: 'chunk: reasoning', startedAt: s(8), endedAt: s(9) }),
    node(`${traceId}-chunk-2`, `${traceId}-gen-1`, 'model_chunk', { name: 'chunk: text', startedAt: s(12), endedAt: s(13) }),
    step(`${traceId}-s1`, `${traceId}-gen-1`, 5, 60, { inputTokens: 1000, inputDetails: { cacheRead: 0 }, outputTokens: 100 }),
    tool(`${traceId}-ask`, `${traceId}-s1`, 15, 60, 'ask_user', { question: 'Qual a regra?' }),
    agent(`${traceId}-resumed`, `${traceId}-gen-1`, 160, 400),
    node(`${traceId}-gen-2`, `${traceId}-resumed`, 'model_generation', { startedAt: s(160), endedAt: s(400), attributes: { usage: { inputTokens: 5200, inputDetails: { cacheRead: 2000 }, outputTokens: 920 } } }),
    step(`${traceId}-s2`, `${traceId}-gen-2`, 160, 200, { inputTokens: 2000, inputDetails: { cacheRead: 1000 }, outputTokens: 200 }),
    tool(`${traceId}-t1`, `${traceId}-s2`, 175, 180, 'mastra_workspace_read_file', { path: 'app/a.ts' }),
    tool(`${traceId}-t2`, `${traceId}-s2`, 176, 190, 'conexus_run_operation', operation),
    step(`${traceId}-s3`, `${traceId}-gen-2`, 200, 240, { inputTokens: 3000, inputDetails: { cacheRead: 1000 }, outputTokens: 700 }),
    tool(`${traceId}-t3`, `${traceId}-s3`, 205, 215, 'conexus_run_operation', operation),
    tool(`${traceId}-t4`, `${traceId}-s3`, 230, 231, 'mastra_workspace_edit_file', { path: 'app/a.ts' }),
    step(`${traceId}-s4`, `${traceId}-gen-2`, 240, 300, { inputTokens: 100, outputTokens: 10 }),
    tool(`${traceId}-t5`, `${traceId}-s4`, 250, 258, 'conexus_check', {}, { output: report(false, 'TS2304') }),
    step(`${traceId}-s5`, `${traceId}-gen-2`, 300, 400, { inputTokens: 100, outputTokens: 10 }),
    tool(`${traceId}-t6`, `${traceId}-s5`, 310, 320, 'conexus_check', {}, { output: report(true) }),
    tool(`${traceId}-plan`, `${traceId}-s5`, 390, 400, 'submit_plan', { path: '.conexus/plans/x.md' }),
    node(`${traceId}-memory`, `${traceId}-resumed`, 'memory_operation'),
    node(`${traceId}-observer`, `${traceId}-memory`, 'agent_run', { entityId: 'observational-memory-observer', startedAt: s(170), endedAt: s(171) }),
    node(`${traceId}-observer-gen`, `${traceId}-observer`, 'model_generation', { attributes: { usage: { inputTokens: 9000, outputTokens: 9 } } }),
  ]
}

const APPROVAL_OPTIONS = [{ label: 'Aprovar e construir', description: 'Começa a construir.' }, { label: 'Pedir ajustes', description: 'Diz o que mudar.' }]

/**
 * A recorded Builder run that plans, in one of three shapes: `new` (the plan in `.conexus/plan.md`,
 * approval through `ask_user` with the approval options, after an unrelated question), `legacy`
 * (today's Builder: `.conexus/plans/lista.md`, approval through `submit_plan`) and `edit` (a small
 * edit: no plan, no approval, one app file). `appFirst` makes the new flow write an app file before
 * the approval, the defect the scorers must catch.
 */
export function planFlowTrace(shape, { traceId = `tr-${shape}`, builderRunId = `run-${shape}`, projectId = 'p-flow', appFirst = false } = {}) {
  const node = (spanId, parentSpanId, spanType, fields) => span(traceId, spanId, parentSpanId, spanType, fields)
  let clock = 1000
  const step = `${traceId}-step`
  const tool = (entityName, input, fields = {}) => {
    clock += 1000
    return node(`${traceId}-t${clock}`, step, 'tool_call', { name: `tool: '${entityName}'`, entityType: 'tool', entityName, input, attributes: { success: true }, startedAt: at(clock), endedAt: at(clock + 500), ...fields })
  }
  const write = (path) => tool('mastra_workspace_write_file', { path, content: 'x' })
  const check = () => tool('conexus_check', {}, { output: { ok: true, steps: [{ step: 'typecheck', status: 'passed', durationMs: 7000 }] } })
  const shapes = {
    new: () => [
      tool('ask_user', { question: 'Qual o formato da data?', options: [{ label: 'Dia/mês/ano' }, { label: 'Ano-mês-dia' }] }),
      write('.conexus/plan.md'),
      ...(appFirst ? [write('src/app.tsx')] : []),
      tool('ask_user', { question: 'Posso construir assim?', options: APPROVAL_OPTIONS }),
      write('src/app.tsx'), write('./src/api.ts'), write('src/app.tsx'), check(), tool('conexus_run_operation', { name: 'listar', input: {} }),
    ],
    legacy: () => [
      write('.conexus/plans/lista.md'),
      tool('submit_plan', { path: '.conexus/plans/lista.md', title: 'Lista' }),
      write('src/app.tsx'), write('src/api.ts'), check(),
    ],
    edit: () => [tool('mastra_workspace_read_file', { path: 'src/app.tsx' }), tool('mastra_workspace_edit_file', { path: 'src/app.tsx' }), check()],
  }
  const calls = shapes[shape]()
  return [
    node(`${traceId}-root`, null, 'agent_run', {
      entityType: 'agent', entityId: 'code-agent', entityName: 'code-agent',
      metadata: { conexusBuilderRunId: builderRunId, conexusBuilderProjectId: projectId }, startedAt: at(0), endedAt: at(clock + 5000),
    }),
    node(`${traceId}-gen`, `${traceId}-root`, 'model_generation', { attributes: { usage: { inputTokens: 100, outputTokens: 10 } } }),
    node(step, `${traceId}-gen`, 'model_step'),
    ...calls,
  ]
}

export const seedSpans = async (storage, records) => (await storage.getStore('observability')).batchCreateSpans({ records })

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
 * (trace-<project>) and answers a built Preview, a failed run when `failures[model]` still holds a
 * failure category for that model, or, for an item in `replies`, a run that changed no source and
 * ended with that reply.
 */
function fakeRunCase(storage, { failures = {}, replies = {} } = {}) {
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
    const spans = builderTrace({ traceId: `trace-${options.project}`, builderRunId, projectId: options.project })
    const reply = replies[basename(options.out)]
    if (reply !== undefined) spans[0] = { ...spans[0], output: { text: reply } }
    await seedSpans(storage, spans)
    if (reply !== undefined) {
      return {
        outcome: 'FAIL', error: null, projectId: options.project, modelId: options.model,
        runs: [{ builderRunId, isRepair: false, state: 'SUCCEEDED', resultKind: 'RESPONSE_ONLY', failureCategory: null, failureCode: null }],
        failure: 'NO_SOURCE_CHANGE', previewText: null, sourceRevisionAfter: 'rev-0', wallTimeToUsablePreviewMs: null,
      }
    }
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

async function startSimulatorHealth(fixtures) {
  const server = createServer((request, response) => {
    response.writeHead(request.url === '/__sim/health' ? 200 : 404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ fixtures, counters: { loadRecords: 0, refusals: 0, writes: 0 } }))
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
export async function experimentHarness(t, storage, { failures, replies } = {}) {
  const mastra = createEvalMastra({ storage })
  const hub = fakeHub(['m-flash', 'm-luna', 'm-other'])
  const driver = fakeRunCase(storage, { failures, replies })
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
