// The score of the interview and the plan of a new app, from a run that stopped at the plan card
// (`run.mjs --stop-at-plan`) or from a Claude Code arm's record. Primary score: the share of the case's
// rules the person got a say on, asked in a question card or left open in the plan for the person.
// A rule the plan settles on its own counts against the run, listed as an assumption or not.
//
// Usage:
//   node scripts/builder-eval/plan-score.mjs --run <dir> [--case <file>]
//   node scripts/builder-eval/plan-score.mjs --cc-record <record.json> --cc-plan <plan.md> --cc-events <events.jsonl> --case <file> --out <dir>
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Agent } from '@mastra/core/agent'
import { z } from 'zod'
import { flowOf, isApprovalOptions } from './flow.mjs'
import { fillSheet, loadValues, parseSheet, personModel } from './person.mjs'

export const QUESTION_CAP = 8

/** The binary plan rubric. `na` names the criterion that has nothing to judge when the app reads no existing data. */
export const RUBRIC = Object.freeze([
  { id: 'screensAsExperience', text: 'Each screen is described as what the person sees and does on it (what is on the screen, what they click, where it leads), not as components, routes, tables or code.' },
  { id: 'valuesHaveSource', text: 'Every value the app shows (each number, column or field on screen) names where it comes from: which system and record or field, or how it is computed from them. Fail if any shown value has no named source.' },
  { id: 'suggestionsMarked', text: 'Everything the person did not ask for is marked as a suggestion the person can decline. Pass when the plan adds nothing beyond the request.' },
  { id: 'assumptionsWithUndo', text: 'The plan lists the choices it made on its own as assumptions, and each one says how the person can change it. Fail if there is no such list or any listed assumption lacks how to change it.' },
  { id: 'oddDataSurfaced', text: 'The plan tells the person at least one oddity it found in the real data (unexpected kinds or categories, test or internal records, empty fields, outliers, very old records) and what it means for the app.', na: 'Pass null only when the app reads no existing data at all (a brand new app with no connected system).' },
  { id: 'checksAsExamples', text: 'The plan gives checks the person can do as concrete examples: where they start, what they do, and what they should see, with a specific example record or value.' },
])

const RULE_STATUS = ['open', 'assumed', 'decided', 'absent']

const plain = (value) => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase()
export const maskDigits = (value) => String(value ?? '').replace(/\d/g, '#')

/** Pure. True when `cite` is a passage of the plan, ignoring spacing, case, accents and markdown marks. */
export const citedIn = (planText, cite) => {
  const strip = (value) => plain(value).replace(/[*_`#>|-]/g, '').replace(/\s+/g, ' ').trim()
  const needle = strip(cite)
  return needle.length >= 8 && strip(planText).includes(needle)
}

/**
 * What a run or a record showed the person, the input every score is computed from.
 * @typedef {Readonly<{ text: string, ruleIds: readonly string[] }>} AskedQuestion
 * @typedef {Readonly<{ questions: readonly AskedQuestion[], cards: number, planText: string | null, appFilesBeforePlan: number | null }>} Interview
 * @typedef {Readonly<{ id: string, status: 'open' | 'assumed' | 'decided' | 'absent', contrary: boolean | null, cite: readonly string[] }>} RuleJudgment
 * @typedef {Readonly<{ id: string, pass: boolean | null, cite: readonly string[] }>} RubricJudgment
 */

/**
 * Pure. The score of one interview once the judge has read the plan. A rule is discovered when a
 * question card touched it (the person's matcher tied the question to it) or the plan leaves it open
 * for the person. A rubric pass with no citation found in the plan is counted as a fail.
 * @param {import('./person.mjs').Sheet} sheet
 * @param {Interview} interview
 * @param {Readonly<{ rules: readonly RuleJudgment[], rubric: readonly RubricJudgment[] }>} judged
 */
export function scoreInterview(sheet, interview, judged) {
  const asked = new Set(interview.questions.flatMap((question) => question.ruleIds))
  const rules = sheet.rules.map((rule) => {
    const judgment = judged.rules.find((entry) => entry.id === rule.id) ?? { status: 'absent', contrary: null }
    const wasAsked = asked.has(rule.id)
    const decided = judgment.status === 'assumed' || judgment.status === 'decided'
    const strict = wasAsked || judgment.status === 'open'
    const accepted = rule.kind === 'stated' ? decided : rule.kind === 'design' ? judgment.status === 'assumed' : false
    return {
      id: rule.id,
      asked: wasAsked,
      status: judgment.status,
      discoveredStrict: strict,
      discovered: strict || (accepted && judgment.contrary !== true),
      assumedWithoutAsking: !wasAsked && decided,
      contrary: !wasAsked && decided && judgment.contrary === true,
    }
  })
  const rubric = Object.fromEntries(RUBRIC.map((criterion) => {
    const entry = judged.rubric.find((item) => item.id === criterion.id)
    if (!entry || interview.planText === null) return [criterion.id, false]
    if (entry.pass === null) return [criterion.id, criterion.na ? null : false]
    return [criterion.id, entry.pass === true && entry.cite.some((cite) => citedIn(interview.planText, cite))]
  }))
  const verdicts = Object.values(rubric)
  const discovered = rules.filter((rule) => rule.discovered).length
  const discoveredStrict = rules.filter((rule) => rule.discoveredStrict).length
  const share = (count) => (sheet.rules.length === 0 ? null : Number((count / sheet.rules.length).toFixed(3)))
  return {
    primary: share(discovered),
    primaryStrict: share(discoveredStrict),
    discovered,
    discoveredStrict,
    total: sheet.rules.length,
    assumedWithoutAsking: rules.filter((rule) => rule.assumedWithoutAsking).length,
    contrary: rules.filter((rule) => rule.contrary).length,
    questions: interview.questions.length,
    cards: interview.cards,
    planSubmitted: interview.planText !== null,
    appFilesBeforePlan: interview.appFilesBeforePlan,
    rubric,
    rubricPassed: verdicts.filter((verdict) => verdict === true).length,
    rubricApplicable: verdicts.filter((verdict) => verdict !== null).length,
    gates: { questionsWithinCap: interview.questions.length <= QUESTION_CAP, noAppFilesBeforePlan: interview.appFilesBeforePlan === 0 },
    rules: Object.fromEntries(rules.map(({ id, ...rest }) => [id, rest])),
  }
}

const sortedParts = (messages) => [...messages]
  .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  .flatMap((message) => message?.content?.parts ?? [])

/** Pure. The thread's tool calls in the shape `flowOf` reads. */
export const threadCalls = (messages) => sortedParts(messages)
  .filter((part) => part.type === 'tool-invocation')
  .map(({ toolInvocation: call }) => ({ entityName: call.toolName, input: call.args, error: call.state === 'error' || call.result?.isError === true ? true : undefined }))

/** Pure. The interview of a Builder run from its result.json and its thread. */
export function interviewFromRun(result, messages) {
  const questions = result.answers.filter((answer) => answer.kind === 'QUESTION')
  const plan = result.answers.find((answer) => answer.kind === 'PLAN' || answer.kind === 'APPROVAL')
  const flow = messages ? flowOf(threadCalls(messages)) : null
  return {
    questions: questions.map((answer) => ({ text: answer.text, ruleIds: answer.ruleIds ?? [] })),
    cards: new Set(questions.map((answer, index) => answer.toolCallId ?? `card-${index}`)).size,
    planText: plan?.text ?? null,
    appFilesBeforePlan: flow ? (flow.appFilesBeforeApproval ?? flow.appFilesChanged) : null,
  }
}

/** Pure. The interview of a Claude Code arm from its record (questionCalls) and its tool events. */
export function interviewFromClaudeCode(record, events, planText, armDir) {
  const calls = record.questionCalls.map((call) => call.questions.filter((question) => !isApprovalOptions(question.options.map((option) => option.label))))
  const questions = calls.flat().map((question) => ({ text: question.question, ruleIds: question.ruleId ? [question.ruleId] : [] }))
  // The events keep each tool input cut at a fixed length, so the n-th AskUserQuestion is read from the record's n-th call.
  const approvalCalls = record.questionCalls.map((call) => call.questions.some((question) => isApprovalOptions(question.options.map((option) => option.label))))
  let asks = 0
  const approval = (event) => event.name === 'ExitPlanMode' || (event.name === 'AskUserQuestion' && approvalCalls[asks++] === true)
  const toolEvents = events.filter((event) => event.type === 'tool')
  const flowCalls = toolEvents.map((event) => {
    if (approval(event)) return { entityName: 'submit_plan', input: {} }
    if (event.name !== 'Write' && event.name !== 'Edit') return { entityName: event.name, input: {} }
    const path = /"file_path":"([^"]+)"/.exec(String(event.input))?.[1] ?? ''
    return { entityName: 'mastra_workspace_write_file', input: { path: path.startsWith(`${armDir}/`) ? path.slice(armDir.length + 1) : path } }
  })
  const flow = flowOf(flowCalls)
  return { questions, cards: calls.filter((call) => call.length > 0).length, planText, appFilesBeforePlan: flow.appFilesBeforeApproval }
}

const ruleSchema = z.object({ rules: z.array(z.object({ id: z.string(), status: z.enum(RULE_STATUS), contrary: z.boolean().nullable(), cite: z.array(z.string()) })) })
const rubricSchema = z.object({ rubric: z.array(z.object({ id: z.string(), pass: z.boolean().nullable(), cite: z.array(z.string()) })) })

const rulesPrompt = (sheet, planText) => [
  'You read the plan an app builder showed a person before building their app. For each business rule below, say how the plan treats it.',
  'status:',
  '- open: the plan leaves this point for the person to decide, or explicitly asks the person to confirm or answer it before building.',
  '- assumed: the plan decides this point itself and presents the decision as an assumption or choice the person may change.',
  '- decided: the plan applies a decision on this point without presenting it as a choice the person may change.',
  '- absent: the plan does not address this point.',
  'contrary: for assumed or decided, true when the plan\'s decision differs from what the person says below, false when it agrees; null for open or absent.',
  'cite: the plan lines your verdict rests on, copied exactly; empty for absent.',
  'Judge only the plan text. Return every rule id once.',
  '',
  'Rules (id, topic, what the person would say if asked):',
  ...sheet.rules.map((rule) => `- ${rule.id}: ${rule.topic}. The person says: ${rule.template ?? rule.say}`),
  '',
  'Plan:',
  planText,
].join('\n')

const rubricPrompt = (planText) => [
  'You grade the plan an app builder showed a person before building their app, criterion by criterion. Each criterion is pass or fail; be strict.',
  'For each criterion return pass (true or false) and cite, the plan lines that show it, copied exactly. A pass needs at least one cited line.',
  ...RUBRIC.map((criterion) => `- ${criterion.id}: ${criterion.text}${criterion.na ? ` ${criterion.na}` : ' Never null.'}`),
  '',
  'Plan:',
  planText,
].join('\n')

/** The judge reads the plan twice, once per rule and once per rubric criterion. The model is the person's (Opus through the Claude subscription). */
export function createJudge({ model = personModel() } = {}) {
  const agent = new Agent({ id: 'plan-reader', name: 'Leitor do plano', instructions: 'You read app plans written in Portuguese and answer in the requested structure only.', model })
  return async (sheet, planText) => {
    if (planText === null) return { rules: [], rubric: [] }
    const [rules, rubric] = await Promise.all([
      agent.generate(rulesPrompt(sheet, planText), { structuredOutput: { schema: ruleSchema } }),
      agent.generate(rubricPrompt(planText), { structuredOutput: { schema: rubricSchema } }),
    ])
    return { rules: rules.object.rules, rubric: rubric.object.rubric }
  }
}

const sheetOf = (casePath) => {
  const raw = JSON.parse(readFileSync(casePath, 'utf8'))
  if (!raw.person) throw new Error(`plan-score: ${casePath} has no person sheet`)
  return fillSheet(parseSheet(raw.person), loadValues())
}

/** Scores one interview, writes `plan-score.json` (judgments with citations, digits masked) in `out`, and returns the line to print. */
export async function scoreAndRecord({ casePath, interview, out, source, judge = createJudge() }) {
  const sheet = sheetOf(casePath)
  const judged = await judge(sheet, interview.planText)
  const score = scoreInterview(sheet, interview, judged)
  const line = { case: casePath, source, ...score }
  const masked = (entries) => entries.map((entry) => ({ ...entry, cite: entry.cite.map(maskDigits) }))
  writeFileSync(join(out, 'plan-score.json'), `${JSON.stringify({ ...line, judged: { rules: masked(judged.rules), rubric: masked(judged.rubric) }, questions: interview.questions.map((question) => ({ ...question, text: maskDigits(question.text) })) }, null, 2)}\n`)
  return line
}

/**
 * Pure. Why a `--stop-at-plan` result must not be scored, or null when it is a clean stop at a plan card.
 * The runner records a stop at the plan as `failure: 'STOPPED_AT_PLAN'` with an outcome of FAIL or UNGRADED,
 * so the failure value is what says the run reached the plan, and `error` and an ERROR outcome say it crashed.
 */
export function rejectionOf(result) {
  if (result.error || result.outcome === 'ERROR') return `the run failed: ${result.error ?? 'outcome ERROR'}`
  if (result.failure !== 'STOPPED_AT_PLAN') return `the run did not stop at a plan card (failure ${result.failure ?? 'none'})`
  if (!Array.isArray(result.answers) || !result.answers.some((answer) => answer.kind === 'PLAN' || answer.kind === 'APPROVAL')) return 'the run left no plan'
  return null
}

/**
 * Runs one attempt and scores only what that attempt wrote. The artifacts of an earlier attempt in `dir`
 * are removed first, and the result must carry the project this attempt started, so a run that dies
 * before it writes its own result is rejected instead of scored from stale files.
 * @returns {Promise<{ line: object, exit: number | null }>} the score line, or `{ case, rejected }`
 */
export async function scoreAttempt(dir, { casePath, projectId, run, judge }) {
  for (const name of ['result.json', 'thread.json', 'plan-score.json']) rmSync(join(dir, name), { force: true })
  const exit = await run()
  const resultFile = join(dir, 'result.json')
  const result = existsSync(resultFile) ? JSON.parse(readFileSync(resultFile, 'utf8')) : null
  const rejected = result === null ? 'the run wrote no result.json' : result.projectId !== projectId ? `the result is for project ${result.projectId ?? 'none'}, not ${projectId}` : rejectionOf(result)
  return { line: rejected ? { case: casePath, rejected } : await scoreRunDir(dir, { casePath, judge }), exit }
}

/** Scores the run `run.mjs --stop-at-plan` left in `dir`. */
export async function scoreRunDir(dir, { casePath, judge } = {}) {
  const result = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'))
  const rejection = rejectionOf(result)
  if (rejection) throw new Error(`plan-score: ${dir} is not scorable: ${rejection}`)
  const threadFile = join(dir, 'thread.json')
  const messages = existsSync(threadFile) ? JSON.parse(readFileSync(threadFile, 'utf8')) : null
  return scoreAndRecord({ casePath: casePath ?? result.case, interview: interviewFromRun(result, messages), out: dir, source: `builder:${result.projectId}`, judge })
}

function parseArgs(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!flag.startsWith('--') || value === undefined) throw new Error(`plan-score: bad argument ${flag}`)
    options[flag.slice(2)] = value
  }
  return options
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  let line
  if (options.run) line = await scoreRunDir(resolve(options.run), { casePath: options.case })
  else if (options['cc-record']) {
    if (!options.case || !options.out || !options['cc-plan'] || !options['cc-events']) throw new Error('plan-score: --cc-record needs --cc-plan, --cc-events, --case and --out')
    const record = JSON.parse(readFileSync(options['cc-record'], 'utf8'))
    const events = readFileSync(options['cc-events'], 'utf8').trim().split('\n').map((entry) => JSON.parse(entry))
    const planText = readFileSync(options['cc-plan'], 'utf8')
    const interview = interviewFromClaudeCode(record, events, planText, resolve(dirname(resolve(options['cc-plan'])), '..'))
    line = await scoreAndRecord({ casePath: options.case, interview, out: resolve(options.out), source: `claude-code:${record.arm}` })
  } else throw new Error('plan-score: give --run <dir> or --cc-record <file>')
  process.stdout.write(`${JSON.stringify(line)}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
