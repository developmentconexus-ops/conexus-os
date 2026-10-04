import { Failure } from '../platform/failure.js'
import { CURRENT_TEMPLATE_PIN } from '../platform/application-template-pins.js'
import { checkEntryPath } from './check-delivery.js'
import { AGENT_IDENTITY } from './check/agent.js'
import type { Caller } from './check/command.js'
import { type CheckFailureCode, type CheckReport, checkReportSchema, STEP_BLOCKS, type StepResult } from './check/report.js'

/**
 * The Hub's side of the check: the command it runs in a VM, how it reads what the check printed,
 * and what the gate asks of a report. The check itself is `./check/`, bundled when the Hub is built.
 */
export const CHECK_NODE_PATH = '/usr/local/bin/node'

type FailedStep = Extract<StepResult, { status: 'failed' }>

/** `node <bundle by its hash> check ...`: the Hub always runs the check by the path of the bytes it holds. */
export const checkCommand = (input: Readonly<{ sha256: string; caller: Caller; root: string; out: string; thumbnail?: string }>): string =>
  [
    CHECK_NODE_PATH, checkEntryPath(input.sha256), 'check', '--caller', input.caller, '--root', `'${input.root}'`, '--out', `'${input.out}'`,
    ...(input.thumbnail ? ['--thumbnail', `'${input.thumbnail}'`] : []),
    '--template-ref', `'${CURRENT_TEMPLATE_PIN.templateRef}'`, '--as', `${AGENT_IDENTITY.uid}:${AGENT_IDENTITY.gid}`,
  ].join(' ')

/**
 * The report is the last line the check printed; anything else it wrote before is not the report. A
 * line that is not JSON is no report; JSON that breaks the schema or one of its rules is a report no
 * check of ours printed.
 */
export const readCheckReport = (stdout: string): CheckReport => {
  let printed: unknown
  try {
    printed = JSON.parse(stdout.trim().split('\n').pop() ?? '')
  } catch (cause) {
    throw new Failure('APPLICATION_CHECK_REPORT_UNREADABLE', { cause })
  }
  const parsed = checkReportSchema.safeParse(printed)
  if (!parsed.success) throw new Failure('APPLICATION_CHECK_UNREADABLE', { cause: parsed.error })
  return parsed.data
}

const problemLine = ({ file, line, column, code, message }: FailedStep['problems'][number]): string => {
  const place = file ? `${file}${line ? `:${line}${column ? `:${column}` : ''}` : ''}: ` : ''
  return `${place}${code ? `${code} ` : ''}${message}`
}

/** What the next turn reads about a failed step: each problem as the check reported it, with the count it had to drop. */
export const failedStepEvidence = (step: FailedStep): string =>
  [`${step.step} failed:`, ...step.problems.map(problemLine), ...(step.dropped ? [`(${step.dropped} more problems not shown)`] : [])].join('\n')

/** One line for the Hub log: each step, how it ended and how long it took. */
export const checkSummary = (report: CheckReport): string =>
  report.steps.map((step) => `${step.step}=${step.status === 'skipped' ? `skipped(${step.reason})` : `${step.status}:${step.durationMs}ms`}`).join(' ')

const isFailed = (step: StepResult): step is FailedStep => step.status === 'failed'

/** The step that refused the source, or null when every blocking step passed. */
export const refusingStep = (report: CheckReport): FailedStep | null =>
  report.steps.find((step): step is FailedStep => isFailed(step) && STEP_BLOCKS[step.step]) ?? null

/** The `boot` step when it found problems, whatever they were. */
export const failedBootStep = (report: CheckReport): FailedStep | null =>
  report.steps.find((step): step is FailedStep => step.step === 'boot' && isFailed(step)) ?? null

// A page that threw or drew nothing has no Preview worth opening. The other boot problems (a blocked
// font, a console error, a failed request) are reported and leave the Preview standing.
const UNRENDERED_BOOT_CODES: ReadonlySet<CheckFailureCode> = new Set(['BOOT_UNCAUGHT_ERROR', 'BOOT_NO_ROOT_CHILD', 'STEP_TIMEOUT'])

/** The `boot` step when the page did not render, which is the only boot result that withholds the Preview. */
export const unrenderedBootStep = (report: CheckReport): FailedStep | null => {
  const step = failedBootStep(report)
  return step && UNRENDERED_BOOT_CODES.has(step.code) ? step : null
}
