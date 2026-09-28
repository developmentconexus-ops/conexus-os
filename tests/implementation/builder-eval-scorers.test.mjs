import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryStore } from '@mastra/core/storage'
import { createEvalMastra, findTraceIds, scoreRun, traceMetrics } from '../../scripts/builder-eval/scorers.mjs'
import { builderTrace, SALES_PREVIEW_TEXT, SALES_SCREEN, seedSpans } from './builder-eval-fixtures.mjs'

const groundTruth = { fixture: 'sales-v1', screen: SALES_SCREEN, figures: {} }
const observed = (text) => ({ preview: { kind: 'observed', text, sourceRevision: 'rev-1' } })

const evalMastra = () => {
  const storage = new InMemoryStore()
  return { storage, mastra: createEvalMastra({ storage }) }
}

test('traceMetrics counts the main agent of one Builder trace and leaves the memory observer out', () => {
  assert.deepEqual(traceMetrics(builderTrace({ traceId: 'tr-1', builderRunId: 'run-1', projectId: 'p-1' })), {
    traces: 1, toolCalls: 10, stepsWithToolCalls: 3, toolErrors: 1, repeatedReads: 2, skillReloads: 1,
    simulatorRefusals: 1, wallMs: 300_000, inputTokens: 1000, cachedInputTokens: 600, outputTokens: 50,
  })
})

test('traceMetrics refuses a trace whose root has not ended', () => {
  const spans = builderTrace({ traceId: 'tr-1', builderRunId: 'run-1', projectId: 'p-1' })
  spans[0] = { ...spans[0], endedAt: null }
  assert.throws(() => traceMetrics(spans), { message: 'trace ainda em execução' })
})

test('scoreRun sums the trace metrics of a request and its repair and grades the Preview', async () => {
  const { storage, mastra } = evalMastra()
  await seedSpans(storage, builderTrace({ traceId: 'tr-1', builderRunId: 'run-1', projectId: 'p-1' }))
  const output = { ...observed(SALES_PREVIEW_TEXT), runs: [{ traceId: 'tr-1' }, { traceId: 'tr-1' }] }

  const { scores, unscored } = await scoreRun(mastra, { output, groundTruth })

  assert.deepEqual(scores.map(({ scorerId, score }) => [scorerId, score]), [
    ['app-correct', 1], ['tool-calls', 20], ['tool-errors', 2], ['calls-per-step', 3.3333333333333335],
    ['repeated-reads', 4], ['skill-reloads', 2], ['wall-minutes', 10], ['input-tokens', 2000],
    ['output-tokens', 100], ['sim-refusals', 2],
  ])
  assert.deepEqual(unscored, [])
})

test('scoreRun leaves every trace scorer out when a run has no trace, instead of scoring it 0', async () => {
  const { mastra } = evalMastra()
  const output = { ...observed(SALES_PREVIEW_TEXT), runs: [{ traceId: null }] }

  const { scores, unscored } = await scoreRun(mastra, { output, groundTruth })

  assert.deepEqual(scores.map(({ scorerId, score }) => [scorerId, score]), [['app-correct', 1]])
  assert.deepEqual(unscored, ['tool-calls', 'tool-errors', 'calls-per-step', 'repeated-reads', 'skill-reloads', 'wall-minutes', 'input-tokens', 'output-tokens', 'sim-refusals']
    .map((scorerId) => ({ scorerId, message: 'trace ausente' })))
})

test('a registered trace scorer scores a stored trace by targetTraceId, as Studio runs it', async () => {
  const { storage, mastra } = evalMastra()
  await seedSpans(storage, builderTrace({ traceId: 'tr-1', builderRunId: 'run-1', projectId: 'p-1' }))

  const result = await mastra.getScorer('tool-calls').run({ output: { text: 'resposta do agente' }, targetTraceId: 'tr-1' })

  assert.equal(result.score, 10)
  await assert.rejects(mastra.getScorer('app-correct').run({ output: { text: 'resposta do agente' }, groundTruth, targetTraceId: 'tr-1' }))
})

test('app-correct passes a Preview that shows every name and amount in pt-BR, en or whole reais', async () => {
  const { mastra } = evalMastra()
  const grade = async (output) => {
    const { score, reason } = await mastra.getScorer('app-correct').run({ output, groundTruth })
    return { score, reason }
  }
  const pass = { score: 1, reason: 'Os 2 nomes e 3 valores aparecem, e nenhum total errado conhecido.' }

  assert.deepEqual(await grade(observed('ANA R$ 1.150,35 … BRUNO R$ 2.000,50 … Total geral R$ 3.150,85')), pass)
  assert.deepEqual(await grade(observed('Ana 1,150.35 Bruno 2,000.50 Total 3,150.85')), pass)
  assert.deepEqual(await grade(observed('ANA R$ 1.150 BRUNO R$ 2.001 Total R$ 3.151')), pass)
})

test('app-correct fails a Preview with a known wrong total, a missing name or no build, and says why', async () => {
  const { mastra } = evalMastra()
  const grade = async (output) => {
    const { score, reason } = await mastra.getScorer('app-correct').run({ output, groundTruth })
    return { score, reason }
  }

  assert.deepEqual(await grade(observed('ANA R$ 1.150,35 BRUNO R$ 2.000,50 Total geral R$ 3.650,85')), {
    score: 0, reason: 'faltam valores: R$ 3.150,85 (total geral); aparece R$ 3.650,85, o total de quem soma pedidos',
  })
  assert.deepEqual(await grade(observed('Vendedor 1: R$ 1.150,35 Vendedor 2: R$ 2.000,50 Total R$ 3.150,85')), {
    score: 0, reason: 'faltam nomes: ANA, BRUNO',
  })
  assert.deepEqual(await grade({ preview: { kind: 'not-built', reason: 'FINAL_RUN_NOT_BUILT' } }), {
    score: 0, reason: 'A prévia não ficou pronta (FINAL_RUN_NOT_BUILT)',
  })
})

test('findTraceIds answers the finished root of each Builder run and null for one that has none', async () => {
  const { storage, mastra } = evalMastra()
  await seedSpans(storage, builderTrace({ traceId: 'tr-1', builderRunId: 'run-1', projectId: 'p-1' }))
  const running = builderTrace({ traceId: 'tr-3', builderRunId: 'run-3', projectId: 'p-1' })
  await seedSpans(storage, [{ ...running[0], endedAt: null }])

  assert.deepEqual(await findTraceIds(mastra, { projectId: 'p-1', builderRunIds: ['run-1', 'run-2', 'run-3'] }, { waitMs: 0 }), ['tr-1', null, null])
})
