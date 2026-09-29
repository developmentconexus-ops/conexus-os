import { submitPlanTool } from '@mastra/core/agent-controller'
import type { RequestContext } from '@mastra/core/request-context'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { checkReportSchema, type CheckReport } from '../application-check.js'
import { operationRunReportSchema, type RunOperation } from '../run-operation.js'
import { DEFAULT_REPOSITORY_ROOT, isUnderWriteRoot } from './guard.js'
import { BUILDER_MODES, PLAN_WRITE_ROOT, type BuilderModeDefinition, type BuilderModeId } from './modes.js'
import { splitPlanFile } from './plan-file.js'
import { readModeId } from './request-context.js'

const SUBMIT_PLAN_DESCRIPTION = [
  'Submit the plan you wrote to a Markdown file under `.conexus/plans/` for the person to review.',
  'Pass `path` to that file (for example `.conexus/plans/add-dark-mode.md`); write the file first, do not paste the plan text here.',
  'Reuse the same file across revisions of the same plan; only start a new file for a genuinely different plan.',
  'The person approves it, rejects it with feedback, or asks questions first. On approval, Conexus switches you to Construir so you can build it.',
].join(' ')

type SubmitPlanExecute = NonNullable<typeof submitPlanTool.execute>
type SubmitPlanInput = Parameters<SubmitPlanExecute>[0]
type SubmitPlanContext = Parameters<SubmitPlanExecute>[1] & Readonly<{ requestContext?: RequestContext; resumeData?: unknown }>

/**
 * The native `submit_plan` tool, wearing our own description (the built-in one names
 * `.mastracode/plans/`, which conflicts with AC-1 and AC-3) and a mode check on the first call only:
 * a resumed call (`resumeData` set) is the person's own decision replaying, not a fresh attempt, so it
 * is never refused here. A resume needs a suspension, and only a first call this check let through
 * ever suspends, so the check cannot be skipped by answering a refused call.
 */
export const createSubmitPlanTool = (
  modes: Readonly<Record<BuilderModeId, BuilderModeDefinition>> = BUILDER_MODES,
  repositoryRoot: string = DEFAULT_REPOSITORY_ROOT,
): typeof submitPlanTool => ({
  ...submitPlanTool,
  description: SUBMIT_PLAN_DESCRIPTION,
  execute: async (input: SubmitPlanInput, context: SubmitPlanContext) => {
    if (context?.resumeData === undefined) {
      const modeId = readModeId(context?.requestContext)
      const mode = modeId ? modes[modeId] : undefined
      if (!mode?.allowsSubmitPlan) return `Refused by the Conexus mode guard: submit_plan is only available in ${modes.plan.displayName}.`
      if (!isUnderWriteRoot(input.path, PLAN_WRITE_ROOT, repositoryRoot)) return `Refused by the Conexus mode guard: the plan file must be under ${PLAN_WRITE_ROOT}.`
    }
    // The native tool suspends with only the path and leaves reading the plan to the host, so the
    // first call reads it here and suspends with what the person needs to review. An unreadable
    // file still suspends on the path alone.
    const agent = context?.agent
    if (agent?.resumeData === undefined && agent?.suspend) {
      const raw = await context.workspace?.filesystem?.readFile(input.path, { encoding: 'utf-8' }).catch(() => undefined)
      if (typeof raw === 'string') {
        await agent.suspend({ toolId: 'submit_plan', path: input.path, ...splitPlanFile(raw) })
        return undefined
      }
    }
    return submitPlanTool.execute?.(input, context)
  },
})


export const CHECK_TOOL = 'conexus_check'

const CHECK_DESCRIPTION = [
  "Runs Conexus's own check on the app in the checkout: it generates the client from the manifest, type checks `app/` and `conexus/`, builds the app, builds the server half and opens the app in a browser.",
  'Takes no input and returns one report: `ok`, each step as passed, failed (with its problems: file, line, message) or skipped, and counts.',
  'Call it after your last edit and fix what a failed step lists before you finish.',
].join(' ')

/** `conexus_check`: the run's check, run as the agent's user through the run's sandbox. Construir only. */
export const createCheckTool = (
  runCheck: () => Promise<CheckReport>,
  modes: Readonly<Record<BuilderModeId, BuilderModeDefinition>> = BUILDER_MODES,
) => createTool({
  id: CHECK_TOOL,
  description: CHECK_DESCRIPTION,
  outputSchema: checkReportSchema,
  execute: async (_input, context) => {
    const modeId = readModeId(context?.requestContext)
    if (!modeId || !modes[modeId].availableTools.has(CHECK_TOOL)) throw new Error(`${CHECK_TOOL} is only available in ${modes.build.displayName}.`)
    return runCheck()
  },
})

export const RUN_OPERATION_TOOL = 'conexus_run_operation'

const RUN_OPERATION_DESCRIPTION = [
  'Runs one operation of the app you are building as the Prévia would, before Conexus saves the version: it builds the server half from the checkout and calls `operation` with `input` in the Prévia\'s runner, through this Project\'s Conexões, spending this run\'s Conexão calls. The caller is this run\'s account, with no email.',
  'Returns the shape of the answer, never its values: `lists` gives the number of items at each list path, and `fields` gives, for each field the output declares, how many values came back (`values`), how many are filled (`filled`: not null, absent or empty text) and how many are zero (`zeros`). `*` in a path stands for every item of a list.',
  'A refused call returns `code` and, when Conexus can show it, `detail`, such as the JSON pointer where the output broke its schema. A handler\'s own thrown message is never shown, because it can carry company data; a database error shows its SQLSTATE.',
  'Call read operations only: the Prévia\'s saved data is real, and an operation that saves writes into it. Migrations this run added are applied only when Conexus saves the version, so an operation that needs a new table fails here with SQLSTATE 42P01, and one that queries the database answers DATABASE_UNAVAILABLE while the Project has never had a Prévia with a server half.',
].join(' ')

/** `conexus_run_operation`: one operation of the candidate, run in the Prévia's runner and reported as a shape. Construir only. */
export const createRunOperationTool = (
  runOperation: RunOperation,
  modes: Readonly<Record<BuilderModeId, BuilderModeDefinition>> = BUILDER_MODES,
) => createTool({
  id: RUN_OPERATION_TOOL,
  description: RUN_OPERATION_DESCRIPTION,
  inputSchema: z.strictObject({
    operation: z.string().regex(/^[a-z][A-Za-z0-9]{0,63}$/),
    input: z.record(z.string(), z.unknown()),
  }),
  outputSchema: operationRunReportSchema,
  execute: async (request, context) => {
    const modeId = readModeId(context?.requestContext)
    if (!modeId || !modes[modeId].availableTools.has(RUN_OPERATION_TOOL)) throw new Error(`${RUN_OPERATION_TOOL} is only available in ${modes.build.displayName}.`)
    return runOperation(request)
  },
})
