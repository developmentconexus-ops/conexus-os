import assert from 'node:assert/strict'
import test from 'node:test'
import { interviewFromRun, scoreInterview } from '../../scripts/builder-eval/plan-score.mjs'
import { parseSheet } from '../../scripts/builder-eval/person.mjs'

const sheet = parseSheet({
  projectName: 'Cobrança',
  persona: 'gerente financeiro',
  answers: [
    { id: 'juros', topic: 'se juros entram', say: 'Juros não contam.', pick: ['sem juros'] },
    { id: 'empresas', topic: 'quais empresas', say: 'Todas.', pick: ['todas'] },
    { id: 'provisorio', topic: 'se provisório entra', say: 'Não entra.', pick: ['provisório'] },
    { id: 'vencido', topic: 'o que é vencido', say: 'Antes de hoje.', pick: ['antes de hoje'] },
  ],
})

const plan = [
  '## A tela',
  'Na primeira tela você vê a lista de clientes com o total devido.',
  '## O que eu supus',
  'O valor devido conta os juros. Se não quiser, diga "sem juros".',
  '## Para você decidir',
  'Títulos provisórios entram ou não?',
].join('\n')

const message = (createdAt, ...parts) => ({ role: 'assistant', createdAt, content: { parts } })
const call = (toolName, args, toolCallId = toolName) => ({ type: 'tool-invocation', toolInvocation: { toolName, toolCallId, args, state: 'result' } })

test('a run that asked one rule and left one open discovers two of four, and its assumption against the sheet counts', () => {
  const result = {
    answers: [
      { kind: 'QUESTION', toolCallId: 'a', text: 'Quais empresas?', answer: 'Todas.', ruleIds: ['empresas'] },
      { kind: 'QUESTION', toolCallId: 'a', text: 'Prefere cards?', answer: 'Não sei.', ruleIds: [] },
      { kind: 'PLAN', text: plan, answer: null },
    ],
  }
  const thread = [
    message('2026-10-01T00:00:01Z', call('ask_user', { question: 'Quais empresas?' }, 'a')),
    message('2026-10-01T00:00:02Z', call('mastra_workspace_write_file', { path: 'app/src/routes/home.tsx' }), call('mastra_workspace_write_file', { path: '.conexus/plan.md' }), call('submit_plan', { path: '.conexus/plan.md' })),
  ]
  const judged = {
    rules: [
      { id: 'juros', status: 'assumed', contrary: true, cite: ['O valor devido conta os juros.'] },
      { id: 'empresas', status: 'absent', contrary: null, cite: [] },
      { id: 'provisorio', status: 'open', contrary: null, cite: ['Títulos provisórios entram ou não?'] },
      { id: 'vencido', status: 'decided', contrary: false, cite: [] },
    ],
    rubric: [
      { id: 'screensAsExperience', pass: true, cite: ['Na primeira tela você vê a lista de clientes'] },
      { id: 'valuesHaveSource', pass: true, cite: ['uma linha que o plano não tem'] },
      { id: 'oddDataSurfaced', pass: null, cite: [] },
      { id: 'checksAsExamples', pass: null, cite: [] },
    ],
  }

  const score = scoreInterview(sheet, interviewFromRun(result, thread), judged)

  assert.deepEqual({ ...score, rules: undefined }, {
    primary: 0.5, discovered: 2, total: 4, assumedWithoutAsking: 2, contrary: 1, questions: 2, cards: 1,
    planSubmitted: true, appFilesBeforePlan: 1,
    rubric: { screensAsExperience: true, valuesHaveSource: false, suggestionsMarked: false, assumptionsWithUndo: false, oddDataSurfaced: null, checksAsExamples: false },
    rubricPassed: 1, rubricApplicable: 5,
    gates: { questionsWithinCap: true, noAppFilesBeforePlan: false },
    rules: undefined,
  })
  assert.deepEqual(Object.entries(score.rules).map(([id, rule]) => [id, rule.discovered]), [['juros', false], ['empresas', true], ['provisorio', true], ['vencido', false]])
})

test('a run that never submitted a plan discovers nothing from the plan and counts every app file it wrote', () => {
  const result = { answers: [] }
  const thread = [message('2026-10-01T00:00:01Z', call('mastra_workspace_write_file', { path: '/workspace/repo/app/src/a.tsx' }), call('mastra_workspace_edit_file', { path: 'app/src/b.tsx' }))]

  const score = scoreInterview(sheet, interviewFromRun(result, thread), { rules: [], rubric: [] })

  assert.equal(score.primary, 0)
  assert.equal(score.planSubmitted, false)
  assert.equal(score.appFilesBeforePlan, 2)
  assert.equal(score.rubricPassed, 0)
})
