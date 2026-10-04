import { z } from 'zod'

export const STEP_IDS = ['generate', 'typecheck', 'build', 'server', 'boot'] as const
export type StepId = (typeof STEP_IDS)[number]

/** Every step before boot refuses bad source; boot reports rendering without refusing the build. */
export const STEP_BLOCKS = { generate: true, typecheck: true, build: true, server: true, boot: false } as const satisfies Record<StepId, boolean>

/** `generate` runs inside the check process; every other step is a child with its own wall clock. */
export type ChildStepId = Exclude<StepId, 'generate'>
export const STEP_LIMIT_MS: Readonly<Record<ChildStepId, number>> = Object.freeze({ typecheck: 60_000, build: 60_000, server: 60_000, boot: 45_000 })

// Longest the whole check can run, and what the command that starts it waits for. It covers generate
// and the report writing, which have no limit of their own.
export const CHECK_COMMAND_TIMEOUT_MS = Object.values(STEP_LIMIT_MS).reduce((sum, ms) => sum + ms, 0) + 40_000

export const MAX_PROBLEMS = 50
export const MAX_MESSAGE_CHARS = 2_000
export const MAX_FILE_CHARS = 500

export const FAILURE_CODES = [
  'GENERATE_WRITE_REFUSED',
  'MANIFEST_REFUSED',
  'TYPECHECK_ERRORS',
  'BUILD_FAILED',
  'SERVER_BUNDLE_REFUSED',
  'BOOT_UNCAUGHT_ERROR',
  'BOOT_NO_ROOT_CHILD',
  'BOOT_CSP_VIOLATION',
  'BOOT_CONSOLE_ERROR',
  'BOOT_REQUEST_FAILED',
  'STEP_TIMEOUT',
  'STEP_CRASHED',
] as const
export type CheckFailureCode = (typeof FAILURE_CODES)[number]

export const SKIP_CODES = ['AFTER_BLOCKING_FAILURE', 'BOOT_BROWSER_UNAVAILABLE'] as const
export type CheckSkipCode = (typeof SKIP_CODES)[number]

export const problemSchema = z.strictObject({
  file: z.string().exactOptional(),
  line: z.number().int().nonnegative().exactOptional(),
  column: z.number().int().nonnegative().exactOptional(),
  code: z.string().exactOptional(),
  message: z.string(),
}).readonly()
export type Problem = z.infer<typeof problemSchema>

const stepId = z.enum(STEP_IDS)
const durationMs = z.number().finite().nonnegative()

const stepResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ step: stepId, status: z.literal('passed'), durationMs }).readonly(),
  z.strictObject({
    step: stepId,
    status: z.literal('failed'),
    code: z.enum(FAILURE_CODES),
    durationMs,
    problems: z.array(problemSchema).min(1).max(MAX_PROBLEMS).readonly(),
    dropped: z.number().int().positive().exactOptional(),
  }).readonly(),
  z.strictObject({ step: stepId, status: z.literal('skipped'), code: z.enum(SKIP_CODES), reason: z.string() }).readonly(),
])
export type StepResult = z.infer<typeof stepResultSchema>

const hasControlCharacter = (value: string): boolean => [...value].some((character) => {
  const codePoint = character.codePointAt(0) ?? 0
  return codePoint <= 0x1f || codePoint === 0x7f
})

/** A path inside a folder: relative, with no empty, `.` or `..` part, no backslash and no control character. */
export const safeRelativePath = (path: string): boolean => path.length > 0 && path.length <= 4096 &&
  !hasControlCharacter(path) && !path.startsWith('/') && !path.includes('\\') &&
  path.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..')

const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/)

const artifactSchema = z.strictObject({
  templateRef: z.string().min(1),
  files: z.array(z.strictObject({ path: z.string(), bytes: z.number().int().nonnegative(), sha256: sha256Hex }).readonly()).readonly(),
}).readonly()
export type ArtifactManifest = z.infer<typeof artifactSchema>

const reportShape = z.strictObject({
  ok: z.boolean(),
  checkSha256: sha256Hex,
  steps: z.array(stepResultSchema).readonly(),
  artifact: artifactSchema.nullable(),
})

/** The rules a report must keep beyond its shape; each message names the rule the report broke. */
const reportRules = (report: z.infer<typeof reportShape>): readonly string[] => {
  const refusals: string[] = []
  if (report.steps.length !== STEP_IDS.length || report.steps.some((result, index) => result.step !== STEP_IDS[index])) {
    return [`steps must be exactly ${STEP_IDS.join(', ')} in order`]
  }
  let blockedBy: StepId | null = null
  for (const result of report.steps) {
    const afterBlock = result.status === 'skipped' && result.code === 'AFTER_BLOCKING_FAILURE'
    if (blockedBy !== null && !afterBlock) refusals.push(`${result.step} follows the failed ${blockedBy} and must be skipped with AFTER_BLOCKING_FAILURE`)
    if (blockedBy === null && afterBlock) refusals.push(`${result.step} is skipped after a blocking failure that did not happen`)
    if (result.status === 'skipped' && result.code === 'BOOT_BROWSER_UNAVAILABLE' && result.step !== 'boot') refusals.push(`${result.step} cannot be skipped for BOOT_BROWSER_UNAVAILABLE`)
    if (blockedBy === null && result.status === 'failed' && STEP_BLOCKS[result.step]) blockedBy = result.step
  }
  const passedEveryBlockingStep = report.steps.every((result) => !STEP_BLOCKS[result.step] || result.status === 'passed')
  if (report.ok !== passedEveryBlockingStep) refusals.push('ok must be true exactly when every blocking step passed')
  if (report.ok && report.artifact === null) refusals.push('a passing report must carry its artifact')
  if (!report.ok && report.artifact !== null) refusals.push('a refused report must not carry an artifact')
  for (const result of report.steps) {
    if (result.status !== 'failed') continue
    for (const problem of result.problems) {
      if (problem.message.length > MAX_MESSAGE_CHARS) refusals.push(`${result.step} has a message longer than ${MAX_MESSAGE_CHARS} characters`)
      if ((problem.file?.length ?? 0) > MAX_FILE_CHARS) refusals.push(`${result.step} has a file name longer than ${MAX_FILE_CHARS} characters`)
    }
  }
  const paths = new Set<string>()
  for (const file of report.artifact?.files ?? []) {
    if (!safeRelativePath(file.path)) refusals.push(`artifact path ${JSON.stringify(file.path)} is not a safe relative path`)
    if (paths.has(file.path)) refusals.push(`artifact path ${JSON.stringify(file.path)} appears twice`)
    paths.add(file.path)
  }
  return refusals
}

/** What the check prints and the Hub parses: the one definition of a report and of every rule it keeps. */
export const checkReportSchema = reportShape.superRefine((report, context) => {
  for (const message of reportRules(report)) context.addIssue({ code: 'custom', message })
}).readonly()
export type CheckReport = z.infer<typeof checkReportSchema>

/** What the model reads from `conexus_check`: the verdict and its steps, never the artifact's file list. */
export const agentReportSchema = reportShape.pick({ ok: true, steps: true })
export type AgentReport = z.infer<typeof agentReportSchema>
export const agentReportOf = ({ ok, steps }: CheckReport): AgentReport => ({ ok, steps })
