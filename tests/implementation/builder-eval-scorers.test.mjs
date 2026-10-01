import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryStore } from '@mastra/core/storage'
import { ac13Metrics, flowOf } from '../../scripts/builder-eval/flow.mjs'
import { createEvalMastra, findTraceIds, mainToolCalls, scoreRun, traceMetrics } from '../../scripts/builder-eval/scorers.mjs'
import { builderTrace, planFlowTrace, resumedBuilderTrace, SALES_PREVIEW_TEXT, SALES_SCREEN, seedSpans } from './builder-eval-fixtures.mjs'

const groundTruth = { fixture: 'sales-v1', screen: SALES_SCREEN, figures: {} }
const observed = (text) => ({ preview: { kind: 'observed', text, sourceRevision: 'rev-1' } })

// Two sellers, each with two months, so a seller swap and a month swap are each expressible.
const twoSellersTwoMonths = {
  fixture: 'sales-v1',
  screen: {
    names: ['ANA', 'BRUNO'],
    amounts: [
      { cents: 100000, label: 'ANA · jan/2026' },
      { cents: 200000, label: 'ANA · fev/2026' },
      { cents: 300000, label: 'BRUNO · jan/2026' },
      { cents: 400000, label: 'BRUNO · fev/2026' },
      { cents: 1000000, label: 'total geral' },
    ],
    mistakes: [],
  },
}

const evalMastra = () => {
  const storage = new InMemoryStore()
  return { storage, mastra: createEvalMastra({ storage }) }
}

test('traceMetrics counts the main agent of one Builder trace and leaves the memory observer out', () => {
  assert.deepEqual(traceMetrics(builderTrace({ traceId: 'tr-1', builderRunId: 'run-1', projectId: 'p-1' })), {
    traces: 1, toolCalls: 10, stepsWithToolCalls: 3, toolErrors: 1, repeatedReads: 2, skillReloads: 1,
    simulatorRefusals: 1, operationRuns: 0, checkRuns: 0, wallMs: 300_000, inputTokens: 1000, cachedInputTokens: 600, outputTokens: 50,
  })
})

test('traceMetrics counts the run resumed after a question, with the current tool names and conexus_run_operation', () => {
  assert.deepEqual(traceMetrics(resumedBuilderTrace()), {
    traces: 1, toolCalls: 8, stepsWithToolCalls: 5, toolErrors: 0, repeatedReads: 1, skillReloads: 0,
    simulatorRefusals: 0, operationRuns: 2, checkRuns: 2, wallMs: 295_000, inputTokens: 6200, cachedInputTokens: 2000, outputTokens: 1020,
  })
})

const flowOfTrace = (shape, options) => flowOf(mainToolCalls(planFlowTrace(shape, options)))

test('the new flow writes .conexus/plan.md first, as an absolute path, and approves through submit_plan, after an unrelated question', () => {
  assert.deepEqual(flowOfTrace('new'), {
    planFile: { written: true, legacy: false, beforeFirstAppFile: true },
    approval: { via: 'submit_plan' },
    appFilesBeforeApproval: 0,
    appFilesChanged: 2,
  })
})

test('a plan file written under /workspace/repo is the plan, not an app file', () => {
  const write = (path) => ({ entityName: 'mastra_workspace_write_file', input: { path }, attributes: { success: true } })
  const flow = flowOf([write('/workspace/repo/.conexus/plan.md'), { entityName: 'submit_plan', input: { path: '.conexus/plan.md' } }, write('/workspace/repo/app/home.tsx')])
  assert.deepEqual(flow, { planFile: { written: true, legacy: false, beforeFirstAppFile: true }, approval: { via: 'submit_plan' }, appFilesBeforeApproval: 0, appFilesChanged: 1 })
})

test('an approval asked with ask_user and its two options still reads as ask_user', () => {
  assert.deepEqual(flowOfTrace('askUser'), {
    planFile: { written: true, legacy: false, beforeFirstAppFile: true },
    approval: { via: 'ask_user' },
    appFilesBeforeApproval: 0,
    appFilesChanged: 2,
  })
})

test('an app file written before the approval is counted, and the plan file no longer comes first', () => {
  const flow = flowOfTrace('new', { appFirst: true })
  assert.equal(flow.planFile.beforeFirstAppFile, true, 'the plan was still the first write of the two')
  assert.equal(flow.appFilesBeforeApproval, 1)
})

test('the earlier Builder is scored on the same terms: a plan file under .conexus/plans and approval through submit_plan', () => {
  assert.deepEqual(flowOfTrace('legacy'), {
    planFile: { written: true, legacy: true, beforeFirstAppFile: true },
    approval: { via: 'submit_plan' },
    appFilesBeforeApproval: 0,
    appFilesChanged: 2,
  })
})

test('a small edit has no plan file and no approval, so nothing is counted before an approval', () => {
  assert.deepEqual(flowOfTrace('edit'), {
    planFile: { written: false, legacy: false, beforeFirstAppFile: false },
    approval: { via: null },
    appFilesBeforeApproval: null,
    appFilesChanged: 1,
  })
})

test('an ask_user without both approval options is not the approval, and a failed write is not a write', () => {
  const ask = (labels) => ({ entityName: 'ask_user', input: { questions: [{ question: 'q', options: labels.map((label) => ({ label })) }] } })
  assert.equal(flowOf([ask(['Aprovar e construir'])]).approval.via, null)
  assert.equal(flowOf([ask(['  aprovar E construir ', 'Pedir ajustes'])]).approval.via, 'ask_user')
  const twoQuestions = { entityName: 'ask_user', input: { questions: [ask(['Aprovar e construir', 'Pedir ajustes']).input.questions[0], { question: 'r' }] } }
  assert.equal(flowOf([twoQuestions]).approval.via, null, 'an approval is a card of its own')
  const earlier = { entityName: 'ask_user', input: { question: 'q', options: [{ label: 'Aprovar e construir' }, { label: 'Pedir ajustes' }] } }
  assert.equal(flowOf([earlier]).approval.via, 'ask_user', 'a trace from before `questions` still scores')
  const failedWrite = { entityName: 'mastra_workspace_write_file', input: { path: 'src/a.ts' }, error: { message: 'x' } }
  assert.equal(flowOf([failedWrite, ask(['Aprovar e construir', 'Pedir ajustes'])]).appFilesBeforeApproval, 0)
})

test('the AC-13 measures of a run of each flow, with the person\'s clicks and the checks that ran', () => {
  const answers = [{ kind: 'QUESTION' }, { kind: 'APPROVAL' }]
  const measures = (shape, expectation, cards) => {
    const flow = flowOfTrace(shape)
    return ac13Metrics({ expectation, flow, answers: cards, timeToFirstPreviewMs: 61_000, checkRuns: 1, operationRuns: shape === 'new' || shape === 'askUser' ? 1 : 0 })
  }
  assert.deepEqual(measures('new', 'expected', [{ kind: 'QUESTION' }, { kind: 'PLAN' }]), {
    expectation: 'expected', planned: true, plannedWhenExpected: true, planFileBeforeFirstAppFile: true, approvalVia: 'submit_plan', legacyPath: false,
    appFilesBeforeApproval: 0, clicks: 2, timeToFirstPreviewMs: 61_000, checkRuns: 1, operationRuns: 1,
  })
  assert.deepEqual(measures('askUser', 'expected', answers), {
    expectation: 'expected', planned: true, plannedWhenExpected: true, planFileBeforeFirstAppFile: true, approvalVia: 'ask_user', legacyPath: false,
    appFilesBeforeApproval: 0, clicks: 2, timeToFirstPreviewMs: 61_000, checkRuns: 1, operationRuns: 1,
  })
  assert.deepEqual(measures('legacy', 'expected', [{ kind: 'PLAN' }]), {
    expectation: 'expected', planned: true, plannedWhenExpected: true, planFileBeforeFirstAppFile: true, approvalVia: 'submit_plan', legacyPath: true,
    appFilesBeforeApproval: 0, clicks: 1, timeToFirstPreviewMs: 61_000, checkRuns: 1, operationRuns: 0,
  })
  assert.deepEqual(measures('edit', 'notApplicable', []), {
    expectation: 'notApplicable', planned: false, plannedWhenExpected: null, planFileBeforeFirstAppFile: false, approvalVia: null, legacyPath: false,
    appFilesBeforeApproval: null, clicks: 0, timeToFirstPreviewMs: 61_000, checkRuns: 1, operationRuns: 0,
  })
  assert.equal(measures('edit', 'expected', []).plannedWhenExpected, false, 'a request that should be planned and was not')
})

test('with no trace the approval path and the clicks still come from the driver\'s record', () => {
  assert.deepEqual(ac13Metrics({ expectation: 'expected', flow: null, answers: [{ kind: 'PLAN' }], timeToFirstPreviewMs: null, checkRuns: null, operationRuns: null }), {
    expectation: 'expected', planned: true, plannedWhenExpected: true, planFileBeforeFirstAppFile: null, approvalVia: 'submit_plan', legacyPath: false,
    appFilesBeforeApproval: null, clicks: 1, timeToFirstPreviewMs: null, checkRuns: null, operationRuns: null,
  })
})

test('the flow scorers score a stored run of the new Builder and of the earlier ones, and skip a case that needs no plan', async () => {
  const { storage, mastra } = evalMastra()
  await seedSpans(storage, [
    ...planFlowTrace('new', { traceId: 'tr-new', builderRunId: 'run-new', projectId: 'p-n' }),
    ...planFlowTrace('legacy', { traceId: 'tr-old', builderRunId: 'run-old', projectId: 'p-o' }),
    ...planFlowTrace('askUser', { traceId: 'tr-ask', builderRunId: 'run-ask', projectId: 'p-a' }),
    ...planFlowTrace('edit', { traceId: 'tr-edit', builderRunId: 'run-edit', projectId: 'p-e' }),
  ])
  const flowScores = async (traceId, plan) => {
    const { scores, unscored } = await scoreRun(mastra, { output: { runs: [{ traceId }] }, groundTruth: { plan } })
    return { scores: scores.filter(({ scorerId }) => ['plan-file-first', 'approval-via-submit-plan', 'app-files-before-approval'].includes(scorerId)).map(({ scorerId, score }) => [scorerId, score]), unscored: unscored.filter(({ scorerId }) => scorerId.startsWith('plan-file') || scorerId.startsWith('approval') || scorerId.startsWith('app-files')) }
  }
  assert.deepEqual((await flowScores('tr-new', 'expected')).scores, [['plan-file-first', 1], ['approval-via-submit-plan', 1], ['app-files-before-approval', 0]])
  assert.deepEqual((await flowScores('tr-old', 'expected')).scores, [['plan-file-first', 1], ['approval-via-submit-plan', 1], ['app-files-before-approval', 0]])
  assert.deepEqual((await flowScores('tr-ask', 'expected')).scores, [['plan-file-first', 1], ['approval-via-submit-plan', 0], ['app-files-before-approval', 0]])
  const edit = await flowScores('tr-edit', 'notApplicable')
  assert.deepEqual(edit.scores, [])
  assert.deepEqual(edit.unscored.map(({ scorerId, message }) => [scorerId, message]), [
    ['plan-file-first', 'não se aplica: o caso não pede plano'], ['approval-via-submit-plan', 'não se aplica: o caso não pede plano'], ['app-files-before-approval', 'não se aplica: o caso não pede plano'],
  ])
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
    ['output-tokens', 100], ['sim-refusals', 2], ['plan-file-first', 0], ['approval-via-submit-plan', 0],
  ])
  assert.deepEqual(unscored, [{ scorerId: 'app-files-before-approval', message: 'sem aprovação: nada a contar' }], 'a run that asked no approval has no app files before it to count')
})

test('scoreRun leaves every trace scorer out when a run has no trace, instead of scoring it 0', async () => {
  const { mastra } = evalMastra()
  const output = { ...observed(SALES_PREVIEW_TEXT), runs: [{ traceId: null }] }

  const { scores, unscored } = await scoreRun(mastra, { output, groundTruth })

  assert.deepEqual(scores.map(({ scorerId, score }) => [scorerId, score]), [['app-correct', 1]])
  assert.deepEqual(unscored, ['tool-calls', 'tool-errors', 'calls-per-step', 'repeated-reads', 'skill-reloads', 'wall-minutes', 'input-tokens', 'output-tokens', 'sim-refusals', 'plan-file-first', 'approval-via-submit-plan', 'app-files-before-approval']
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

test('app-correct passes a refusal case only when the final run changed nothing and its reply names the system and Integrações', async () => {
  const { storage, mastra } = evalMastra()
  const refusal = { missingSystem: 'Sankhya' }
  const replyTrace = async (traceId, text) => {
    const spans = builderTrace({ traceId, builderRunId: `run-${traceId}`, projectId: 'p-1' })
    spans[0] = { ...spans[0], output: { text } }
    await seedSpans(storage, spans)
  }
  await replyTrace('tr-refused', 'Este Projeto não tem uma Conexão com o Sankhya. Vincule uma Conexão em Integrações e peça de novo.')
  await replyTrace('tr-built', 'Pronto! O pedido 12345 aparece com os dados do Sankhya ERP.')
  const grade = async (preview, traceId) => {
    const { score, reason } = await mastra.getScorer('app-correct').run({ output: { preview, runs: [{ traceId }] }, groundTruth: refusal })
    return { score, reason }
  }
  const unchanged = { kind: 'not-built', reason: 'NO_SOURCE_CHANGE' }

  assert.deepEqual(await grade(unchanged, 'tr-refused'), {
    score: 1, reason: 'O Builder não mudou o código e disse que falta a Conexão com Sankhya em Integrações.',
  })
  assert.deepEqual(await grade({ kind: 'observed', text: 'Pedido 12345 · Sankhya ERP · Fornecedor Alfa · R$ 1.250,00', sourceRevision: 'rev-1' }, 'tr-built'), {
    score: 0, reason: 'o Builder mudou o código em vez de recusar; a resposta não diz para vincular a Conexão em Integrações',
  })
  assert.deepEqual(await grade({ kind: 'not-built', reason: 'FINAL_RUN_NOT_BUILT' }, 'tr-refused'), {
    score: 0, reason: 'o Builder mudou o código em vez de recusar',
  })
  await replyTrace('tr-vague', 'Não consigo acessar esse sistema agora.')
  assert.deepEqual(await grade(unchanged, 'tr-vague'), {
    score: 0, reason: 'a resposta não nomeia Sankhya; a resposta não diz para vincular a Conexão em Integrações',
  })

  // Reviewer counterexample: mentions Integrações without saying a Conexão must be bound.
  await replyTrace('tr-mentions-integracoes', 'Não consigo acessar Sankhya no momento. Veja Integrações para saber mais.')
  assert.deepEqual(await grade(unchanged, 'tr-mentions-integracoes'), {
    score: 0, reason: 'a resposta não diz para vincular a Conexão em Integrações',
  })

  // Reviewer counterexample: every word of the instruction, negated.
  await replyTrace('tr-negated', 'Não vincule uma Conexão em Integrações para Sankhya; peça acesso ao administrador.')
  assert.deepEqual(await grade(unchanged, 'tr-negated'), {
    score: 0, reason: 'a resposta não diz para vincular a Conexão em Integrações',
  })

  // Reviewer counterexample: the negation sits words away from the verb, not right before it.
  await replyTrace('tr-negated-far', 'Não é necessário vincular uma Conexão do Sankhya em Integrações.')
  assert.deepEqual(await grade(unchanged, 'tr-negated-far'), {
    score: 0, reason: 'a resposta não diz para vincular a Conexão em Integrações',
  })

  // Reviewer counterexample: the negated verb and the trailing comma clause are the same
  // instruction, just with the system name appended after the comma.
  await replyTrace('tr-negated-trailing-comma', 'Você não precisa conectar nada em Integrações, Sankhya.')
  assert.deepEqual(await grade(unchanged, 'tr-negated-trailing-comma'), {
    score: 0, reason: 'a resposta não diz para vincular a Conexão em Integrações',
  })

  // Reviewer counterexample: an absence statement ("não há Conexão") is not a negated
  // instruction; the comma ends that clause before the real instruction starts.
  await replyTrace('tr-absent-then-bind', 'Não há Conexão com Sankhya, vincule uma Conexão em Integrações.')
  assert.deepEqual(await grade(unchanged, 'tr-absent-then-bind'), {
    score: 1, reason: 'O Builder não mudou o código e disse que falta a Conexão com Sankhya em Integrações.',
  })

  // Reviewer counterexample: the same absence-then-instruction shape, with a colon instead of a
  // comma between the clauses.
  await replyTrace('tr-absent-then-bind-colon', 'Não há Conexão com Sankhya: vincule uma Conexão em Integrações.')
  assert.deepEqual(await grade(unchanged, 'tr-absent-then-bind-colon'), {
    score: 1, reason: 'O Builder não mudou o código e disse que falta a Conexão com Sankhya em Integrações.',
  })

  await replyTrace('tr-conectar', 'Este Projeto não tem uma Conexão com o Sankhya. Conecte uma Conexão em Integrações e peça de novo.')
  assert.deepEqual(await grade(unchanged, 'tr-conectar'), {
    score: 1, reason: 'O Builder não mudou o código e disse que falta a Conexão com Sankhya em Integrações.',
  })
})

test('app-correct grades a fixture case whose final run changed nothing as a Preview that never came', async () => {
  const { mastra } = evalMastra()
  const { score, reason } = await mastra.getScorer('app-correct').run({ output: { preview: { kind: 'not-built', reason: 'NO_SOURCE_CHANGE' } }, groundTruth })
  assert.deepEqual({ score, reason }, { score: 0, reason: 'A prévia não ficou pronta (NO_SOURCE_CHANGE)' })
})

test('app-correct fails a Preview whose table swaps two sellers\' totals or two months, even though every number and name is on screen', async () => {
  const { mastra } = evalMastra()
  const grade = async (text) => {
    const { score, reason } = await mastra.getScorer('app-correct').run({ output: observed(text), groundTruth: twoSellersTwoMonths })
    return { score, reason }
  }
  const header = 'Vendedor\tjan/2026\tfev/2026'
  const correct = `${header}\nANA\tR$ 1.000,00\tR$ 2.000,00\nBRUNO\tR$ 3.000,00\tR$ 4.000,00\nTotal geral\tR$ 10.000,00`

  assert.deepEqual(await grade(correct), { score: 1, reason: 'Os 2 nomes e 5 valores aparecem, e nenhum total errado conhecido.' })
  assert.deepEqual(await grade(`${header}\nANA\tR$ 3.000,00\tR$ 2.000,00\nBRUNO\tR$ 1.000,00\tR$ 4.000,00\nTotal geral\tR$ 10.000,00`), {
    score: 0, reason: 'faltam valores: R$ 1.000,00 (ANA · jan/2026), R$ 3.000,00 (BRUNO · jan/2026)',
  })
  assert.deepEqual(await grade(`${header}\nANA\tR$ 2.000,00\tR$ 1.000,00\nBRUNO\tR$ 3.000,00\tR$ 4.000,00\nTotal geral\tR$ 10.000,00`), {
    score: 0, reason: 'faltam valores: R$ 1.000,00 (ANA · jan/2026), R$ 2.000,00 (ANA · fev/2026)',
  })
})

test('app-correct binds a table whose month headers spell out the month name instead of the fixture token', async () => {
  const { mastra } = evalMastra()
  const grade = async (text) => {
    const { score, reason } = await mastra.getScorer('app-correct').run({ output: observed(text), groundTruth: twoSellersTwoMonths })
    return { score, reason }
  }
  const header = 'Vendedor\tJaneiro 2026\tFevereiro 2026'

  assert.deepEqual(await grade(`${header}\nANA\tR$ 1.000,00\tR$ 2.000,00\nBRUNO\tR$ 3.000,00\tR$ 4.000,00\nTotal geral\tR$ 10.000,00`), {
    score: 1, reason: 'Os 2 nomes e 5 valores aparecem, e nenhum total errado conhecido.',
  })
  assert.deepEqual(await grade(`${header}\nANA\tR$ 3.000,00\tR$ 2.000,00\nBRUNO\tR$ 1.000,00\tR$ 4.000,00\nTotal geral\tR$ 10.000,00`), {
    score: 0, reason: 'faltam valores: R$ 1.000,00 (ANA · jan/2026), R$ 3.000,00 (BRUNO · jan/2026)',
  })
})

test('app-correct binds a table whose month headers are numeric (mm/yyyy)', async () => {
  const { mastra } = evalMastra()
  const { score, reason } = await mastra.getScorer('app-correct').run({
    output: observed('Vendedor\t01/2026\t02/2026\nANA\tR$ 1.000,00\tR$ 2.000,00\nBRUNO\tR$ 3.000,00\tR$ 4.000,00\nTotal geral\tR$ 10.000,00'),
    groundTruth: twoSellersTwoMonths,
  })
  assert.deepEqual({ score, reason }, { score: 1, reason: 'Os 2 nomes e 5 valores aparecem, e nenhum total errado conhecido.' })
})

test('app-correct binds a transposed table, months as rows and sellers as columns', async () => {
  const { mastra } = evalMastra()
  const grade = async (text) => {
    const { score, reason } = await mastra.getScorer('app-correct').run({ output: observed(text), groundTruth: twoSellersTwoMonths })
    return { score, reason }
  }
  const header = 'Mês\tANA\tBRUNO'

  assert.deepEqual(await grade(`${header}\njan/2026\tR$ 1.000,00\tR$ 3.000,00\nfev/2026\tR$ 2.000,00\tR$ 4.000,00\nTotal geral\tR$ 10.000,00`), {
    score: 1, reason: 'Os 2 nomes e 5 valores aparecem, e nenhum total errado conhecido.',
  })
  assert.deepEqual(await grade(`${header}\njan/2026\tR$ 3.000,00\tR$ 1.000,00\nfev/2026\tR$ 2.000,00\tR$ 4.000,00\nTotal geral\tR$ 10.000,00`), {
    score: 0, reason: 'faltam valores: R$ 1.000,00 (ANA · jan/2026), R$ 3.000,00 (BRUNO · jan/2026)',
  })
})

test('app-correct refuses to score a table whose month headers match no known form, instead of falling back to whole-text', async () => {
  const { mastra } = evalMastra()
  const { score, reason } = await mastra.getScorer('app-correct').run({
    output: observed('Vendedor\tPeríodo A\tPeríodo B\nANA\tR$ 1.000,00\tR$ 2.000,00\nBRUNO\tR$ 3.000,00\tR$ 4.000,00\nTotal geral\tR$ 10.000,00'),
    groundTruth: twoSellersTwoMonths,
  })
  assert.deepEqual({ score, reason }, {
    score: 0, reason: 'a tabela tem uma linha ou coluna de mês que eu não reconheço; não dá para confirmar a qual vendedor e mês cada valor pertence',
  })
})

test('findTraceIds answers the finished root of each Builder run and null for one that has none', async () => {
  const { storage, mastra } = evalMastra()
  await seedSpans(storage, builderTrace({ traceId: 'tr-1', builderRunId: 'run-1', projectId: 'p-1' }))
  const running = builderTrace({ traceId: 'tr-3', builderRunId: 'run-3', projectId: 'p-1' })
  await seedSpans(storage, [{ ...running[0], endedAt: null }])

  assert.deepEqual(await findTraceIds(mastra, { projectId: 'p-1', builderRunIds: ['run-1', 'run-2', 'run-3'] }, { waitMs: 0 }), ['tr-1', null, null])
})
