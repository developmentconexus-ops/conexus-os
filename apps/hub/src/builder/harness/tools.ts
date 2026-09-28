import { submitPlanTool } from '@mastra/core/agent-controller'
import type { RequestContext } from '@mastra/core/request-context'
import { webFetchTool, webSearchTool } from '@mastra/core/tools'
import { DEFAULT_REPOSITORY_ROOT, isUnderWriteRoot } from './guard.js'
import { BUILDER_MODES, PLAN_WRITE_ROOT, type BuilderModeDefinition, type BuilderModeId } from './modes.js'
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
    return submitPlanTool.execute?.(input, context)
  },
})

export { webFetchTool, webSearchTool }
