import { submitPlanTool } from '@mastra/core/agent-controller'
import { createTool, formatQuestionAnswer, type AskUserAnswer } from '@mastra/core/tools'
import { z } from 'zod'
import { checkReportSchema, type CheckReport } from '../application-check.js'
import { operationRunReportSchema, type RunOperation } from '../run-operation.js'
import { isPlanPath, PLAN_PATH, splitPlanFile } from './plan-file.js'

export const CHECK_TOOL = 'conexus_check'

const CHECK_DESCRIPTION = [
  "Runs Conexus's own check on the app in the checkout: it generates the client from the manifest, type checks `app/` and `conexus/`, builds the app, builds the server half and opens the app in a browser.",
  'Takes no input and returns one report: `ok`, each step as passed, failed (with its problems: file, line, message) or skipped, and counts.',
  'Run it at the end of each step of the work, and fix what a failed step lists before the next one.',
  'A passing report proves the app type checks, builds and opens. It does not prove that an operation returns the right data, that a screen shows the right values or that anything saves: prove those another way.',
].join(' ')

/** `conexus_check`: the run's check, run as the agent's user through the run's sandbox. */
export const createCheckTool = (runCheck: () => Promise<CheckReport>) => createTool({
  id: CHECK_TOOL,
  description: CHECK_DESCRIPTION,
  outputSchema: checkReportSchema,
  execute: async () => runCheck(),
})

export const RUN_OPERATION_TOOL = 'conexus_run_operation'

const RUN_OPERATION_DESCRIPTION = [
  'Runs one operation of the app you are building as the Prévia would, before Conexus saves the version: it builds the server half from the checkout and calls `operation` with `input` in the Prévia\'s runner, through this Project\'s Conexões, spending this run\'s Conexão calls. The caller is this run\'s account, with no email.',
  'Returns the shape of the answer, never its values: `lists` gives the number of items at each list path, and `fields` gives, for each field the output declares, how many values came back (`values`), how many are filled (`filled`: not null, absent or empty text) and how many are zero (`zeros`). `*` in a path stands for every item of a list.',
  'A refused call returns `code` and, when Conexus can show it, `detail`, such as the JSON pointer where the output broke its schema. A handler\'s own thrown message is never shown, because it can carry company data; a database error shows its SQLSTATE.',
  'Call read operations only: the Prévia\'s saved data is real, and an operation that saves writes into it. Migrations this run added are applied only when Conexus saves the version, so an operation that needs a new table fails here with SQLSTATE 42P01, and one that queries the database answers DATABASE_UNAVAILABLE while the Project has never had a Prévia with a server half.',
].join(' ')

/** `conexus_run_operation`: one operation of the candidate, run in the Prévia's runner and reported as a shape. */
export const createRunOperationTool = (runOperation: RunOperation) => createTool({
  id: RUN_OPERATION_TOOL,
  description: RUN_OPERATION_DESCRIPTION,
  inputSchema: z.strictObject({
    operation: z.string().regex(/^[a-z][A-Za-z0-9]{0,63}$/),
    input: z.record(z.string(), z.unknown()),
  }),
  outputSchema: operationRunReportSchema,
  execute: async (request) => runOperation(request),
})

export const SUBMIT_PLAN_TOOL = 'submit_plan'

const SUBMIT_PLAN_DESCRIPTION = [
  `Submit the plan you wrote to \`${PLAN_PATH}\` for the person to review.`,
  `Pass \`path\` as \`${PLAN_PATH}\`, the only file a plan lives in; write the file first and do not paste the plan text here.`,
  'Reuse the same file across revisions. The person approves it or rejects it with feedback; after a rejection, edit the file and call this tool again.',
].join(' ')

type SubmitPlanExecute = NonNullable<typeof submitPlanTool.execute>
type SubmitPlanInput = Parameters<SubmitPlanExecute>[0]
type SubmitPlanContext = Parameters<SubmitPlanExecute>[1]

/**
 * Mastra's own `submit_plan`, with two things the host owns. The plan path is checked at the
 * boundary: only `.conexus/plan.md` in the run's checkout is submitted. And, as the tool's reference
 * has the host do, the Hub reads the plan from the run's workspace and suspends with its `title` and
 * `plan` beside the `path`, so the browser, which has no filesystem, can show it. A resumed call
 * (`resumeData` set) is the person's decision replaying and goes straight to the native tool.
 */
export const createSubmitPlanTool = (checkout: string): typeof submitPlanTool => ({
  ...submitPlanTool,
  description: SUBMIT_PLAN_DESCRIPTION,
  execute: async (input: SubmitPlanInput, context: SubmitPlanContext) => {
    const agent = context?.agent
    if (agent?.resumeData === undefined) {
      if (!isPlanPath(input.path, checkout)) return `Refused: the plan lives in ${PLAN_PATH}. Write the plan there and submit that path.`
      const raw = await context?.workspace?.filesystem?.readFile(input.path, { encoding: 'utf-8' }).catch(() => undefined)
      if (typeof raw === 'string' && agent?.suspend) {
        await agent.suspend({ toolId: SUBMIT_PLAN_TOOL, path: PLAN_PATH, ...splitPlanFile(raw) })
        return undefined
      }
    }
    return submitPlanTool.execute?.(input, context)
  },
})

export const ASK_USER_TOOL = 'ask_user'
const MAX_QUESTIONS = 4

const ASK_USER_DESCRIPTION = [
  'Ask the person 1 to 4 questions in one card and wait for their answers. Use it only for what the person alone can decide: a business rule, a company fact or a preference you cannot find in the Project, the Conexão, the web or a sensible default. Never ask what you can look up or choose yourself.',
  'Batch every related question into one call; the person answers them all and sends once.',
  'Give a question 2 to 4 `options` when it has likely answers, each a short `label` and an optional `description`. If you recommend one, make it the first option and end its label with "(recomendado)". Set `multiSelect: true` when more than one option can be picked. Omit `options` for an open question. The person can always write their own answer instead of an option.',
  'Write each question so it reads alone, in the person\'s language. `header` is an optional short tag for it (up to 12 characters).',
  'Returns one line per question with the answer.',
].join(' ')

const askOptionsSchema = z.array(z.object({ label: z.string().min(1), description: z.string().optional() })).optional()

const askQuestionSchema = z.object({
  question: z.string().min(1),
  header: z.string().min(1).max(12).optional(),
  options: askOptionsSchema,
  multiSelect: z.boolean().optional(),
})

type AskQuestion = z.infer<typeof askQuestionSchema>

const askInputSchema = z.object({ questions: z.array(askQuestionSchema).min(1).max(MAX_QUESTIONS) })

const askResumeSchema = z.array(z.union([z.string(), z.array(z.string())]))

/**
 * `ask_user` for 1 to 4 questions in one card, on the same suspend and resume primitive as Mastra's
 * own `ask_user`: it suspends with the questions and resumes with one answer per question, in order
 * (a string, or a string array for a `multiSelect` question; free text is a string either way).
 * The Hub registers it under the native id and disables the native tool.
 */
export const createAskUserTool = () => createTool({
  id: ASK_USER_TOOL,
  description: ASK_USER_DESCRIPTION,
  inputSchema: askInputSchema,
  suspendSchema: askInputSchema,
  resumeSchema: askResumeSchema,
  execute: async ({ questions }, context) => {
    const bad = questions.find((entry) => (entry.multiSelect && !entry.options?.length))
    if (bad) return { content: `Failed to ask user: multiSelect requires options (${bad.question}).`, isError: true }
    const resumeData = context?.agent?.resumeData as AskUserAnswer[] | undefined
    if (resumeData !== undefined) {
      const lines = questions.map((entry, index) => `${entry.question}: ${formatQuestionAnswer(resumeData[index] ?? '')}`)
      return { content: `User answered:\n${lines.join('\n')}`, isError: false }
    }
    if (context?.agent?.suspend) {
      await context.agent.suspend({ questions })
      return undefined
    }
    return { content: questions.map((entry) => `[Question for user]: ${entry.question}${entry.options?.length ? `\nOptions: ${entry.options.map((option) => option.label).join(', ')}` : ''}`).join('\n'), isError: false }
  },
})
