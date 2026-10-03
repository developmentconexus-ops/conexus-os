import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { interviewFromRun, rejectionOf, scoreAttempt, scoreInterview, scoreRunDir } from '../../scripts/builder-eval/plan-score.mjs'
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
    primary: 0.5, primaryStrict: 0.5, discovered: 2, discoveredStrict: 2, total: 4, assumedWithoutAsking: 2, contrary: 1, questions: 2, cards: 1,
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

const kindSheet = parseSheet({
  projectName: 'Cobrança',
  persona: 'gerente financeiro',
  answers: [
    { id: 'pago', kind: 'stated', topic: 'só a receber', say: 'Só a receber.' },
    { id: 'status', kind: 'design', topic: 'status da nota', say: 'Tem status.' },
    { id: 'juros', topic: 'se juros entram', say: 'Não entram.' },
  ],
})
const noInterview = { questions: [], cards: 0, planText: null, appFilesBeforePlan: 0 }
const judgedAs = (status, contrary = false) => ({
  rules: ['pago', 'status', 'juros'].map((id) => ({ id, status, contrary: status === 'open' || status === 'absent' ? null : contrary, cite: [] })),
  rubric: [],
})
const found = (score) => Object.entries(score.rules).map(([id, rule]) => `${id}:${rule.discovered}`).join(' ')

test('a stated rule counts when the plan applies it, a design rule when the plan proposes it, a default rule only when asked or open', () => {
  const byStatus = Object.fromEntries(['open', 'assumed', 'decided', 'absent'].map((status) => [status, scoreInterview(kindSheet, noInterview, judgedAs(status))]))

  assert.equal(found(byStatus.open), 'pago:true status:true juros:true')
  assert.equal(found(byStatus.assumed), 'pago:true status:true juros:false')
  assert.equal(found(byStatus.decided), 'pago:true status:false juros:false')
  assert.equal(found(byStatus.absent), 'pago:false status:false juros:false')
  assert.deepEqual(Object.values(byStatus).map((score) => [score.discovered, score.primary, score.discoveredStrict, score.primaryStrict]), [
    [3, 1, 3, 1], [2, 0.667, 0, 0], [1, 0.333, 0, 0], [0, 0, 0, 0],
  ])
})

test('a contrary plan decision earns no fair credit on a tagged rule, and an asked tagged rule still counts', () => {
  const contrary = scoreInterview(kindSheet, noInterview, judgedAs('assumed', true))
  assert.equal(found(contrary), 'pago:false status:false juros:false')
  assert.equal(contrary.discovered, 0)

  const asked = scoreInterview(kindSheet, { ...noInterview, questions: [{ text: 'Status?', ruleIds: ['status'] }] }, judgedAs('decided', true))
  assert.equal(found(asked), 'pago:false status:true juros:false')
  assert.deepEqual([asked.discovered, asked.discoveredStrict], [1, 1])
})

test('a failed workspace write before the plan does not count as an app change, a successful one does', () => {
  const failedWrite = { type: 'tool-invocation', toolInvocation: { toolName: 'mastra_workspace_write_file', toolCallId: 'w1', args: { path: 'app/src/routes/home.tsx' }, state: 'result', result: { isError: true, content: 'EACCES' } } }
  const result = { answers: [{ kind: 'PLAN', text: plan, answer: null }] }
  const withFailure = interviewFromRun(result, [
    message('2026-10-01T00:00:01Z', failedWrite),
    message('2026-10-01T00:00:02Z', call('submit_plan', { path: '.conexus/plan.md' })),
  ])
  assert.equal(withFailure.appFilesBeforePlan, 0)
  const withSuccess = interviewFromRun(result, [
    message('2026-10-01T00:00:01Z', call('mastra_workspace_write_file', { path: 'app/src/routes/home.tsx' })),
    message('2026-10-01T00:00:02Z', call('submit_plan', { path: '.conexus/plan.md' })),
  ])
  assert.equal(withSuccess.appFilesBeforePlan, 1)
  const score = scoreInterview(sheet, withFailure, { rules: [], rubric: [] })
  assert.equal(score.appFilesBeforePlan, 0)
  assert.equal(score.gates.noAppFilesBeforePlan, true)
})

const planned = { failure: 'STOPPED_AT_PLAN', outcome: 'UNGRADED', error: null, answers: [{ kind: 'PLAN', text: plan, answer: null }] }

test('only a clean stop at a plan card is scorable, and STOPPED_AT_PLAN is a failure value, not an outcome', () => {
  assert.equal(rejectionOf(planned), null)
  assert.equal(rejectionOf({ ...planned, outcome: 'FAIL' }), null)
  assert.match(rejectionOf({ ...planned, outcome: 'ERROR', error: 'builder-eval: timed out' }), /^the run failed: builder-eval: timed out$/)
  assert.match(rejectionOf({ ...planned, error: 'locator.click: Timeout' }), /^the run failed/)
  assert.match(rejectionOf({ ...planned, failure: null, outcome: 'PASS' }), /did not stop at a plan card \(failure none\)/)
  assert.match(rejectionOf({ ...planned, failure: 'NO_PREVIEW' }), /\(failure NO_PREVIEW\)/)
  assert.equal(rejectionOf({ ...planned, answers: [{ kind: 'QUESTION', text: 'Quais empresas?', answer: 'Todas.' }] }), 'the run left no plan')
})

test('scoreRunDir refuses a failed run and a run without a plan and writes no score for them', async () => {
  const dirOf = (result) => {
    const dir = mkdtempSync(join(tmpdir(), 'plan-score-'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'result.json'), JSON.stringify(result))
    return dir
  }
  const judge = async () => assert.fail('a rejected run must not reach the judge')
  for (const result of [{ ...planned, outcome: 'ERROR', error: 'boom' }, { ...planned, answers: [] }]) {
    const dir = dirOf(result)
    await assert.rejects(scoreRunDir(dir, { casePath: 'unused.json', judge }), /is not scorable/)
    assert.equal(existsSync(join(dir, 'plan-score.json')), false)
  }
})

test('an attempt that dies before it writes a result is rejected, not scored from the previous attempt\'s files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-attempt-'))
  const stale = { ...planned, projectId: 'project-old' }
  writeFileSync(join(dir, 'result.json'), JSON.stringify(stale))
  writeFileSync(join(dir, 'thread.json'), '[]')
  writeFileSync(join(dir, 'plan-score.json'), '{"primary":1}')
  const judge = async () => assert.fail('a rejected attempt must not reach the judge')
  const attempt = await scoreAttempt(dir, { casePath: 'unused.json', projectId: 'project-new', run: async () => 1, judge })
  assert.deepEqual(attempt, { line: { case: 'unused.json', rejected: 'the run wrote no result.json' }, exit: 1 })
  assert.deepEqual([existsSync(join(dir, 'result.json')), existsSync(join(dir, 'thread.json')), existsSync(join(dir, 'plan-score.json'))], [false, false, false])
})

test('an attempt whose result belongs to another project is rejected', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-attempt-'))
  const judge = async () => assert.fail('a rejected attempt must not reach the judge')
  const run = async () => { writeFileSync(join(dir, 'result.json'), JSON.stringify({ ...planned, projectId: 'project-other' })); return 0 }
  const attempt = await scoreAttempt(dir, { casePath: 'unused.json', projectId: 'project-new', run, judge })
  assert.deepEqual(attempt, { line: { case: 'unused.json', rejected: 'the result is for project project-other, not project-new' }, exit: 0 })
})
