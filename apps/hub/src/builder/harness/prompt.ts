import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { RequestContext } from '@mastra/core/request-context'
import { readMethodology } from './methodology.js'
import { BUILDER_MODES, DEFAULT_BUILDER_MODE, type BuilderModeDefinition, type BuilderModeId } from './modes.js'
import { readConnectorBrief, readModeId, readProjectKnowledge, readSubmittedPlan, readTurnConflicts } from './request-context.js'

/**
 * Prompt files are Markdown, not TypeScript, so the Hub's `tsc` build does not copy them into its
 * compiled output (unlike `.ts` sources, which `import.meta.url` would still resolve there). They are
 * read from the source tree instead, the same way `builder-skills/` is: relative to the Hub process's
 * own working directory, which is the repository root both at Hub runtime and under `node --test`.
 * `conexus.md` at the root is shared by every methodology, and `plan-checklist.md` by the
 * methodologies that plan with it; each methodology's folder holds one file per mode.
 */
const defaultPromptRoot = (cwd: string = process.cwd()): string => resolve(cwd, 'apps/hub/src/builder/harness/prompt')

// A prompt file opens with an HTML comment naming the sources its passages were adapted from and
// their license (AC-25). That notice is for people reading the repository, not for the model.
const withoutComments = (text: string): string => text.replace(/<!--[\s\S]*?-->/g, '').trim()

// Prompt files are static and shipped with the Hub, so a process reads each one once per path.
const fileCache = new Map<string, string>()
const promptFile = (path: string): string => {
  const cached = fileCache.get(path)
  if (cached !== undefined) return cached
  const text = withoutComments(readFileSync(path, 'utf8'))
  fileCache.set(path, text)
  return text
}

/**
 * Builds the agent's dynamic `instructions` function: the Conexus prompt, the current mode's prompt
 * from the run's methodology, in Planejar the planning checklist when the methodology plans with it,
 * in Construir the plan the person approved when the methodology carries
 * it, the paths the turn's start left in conflict, the connector brief under a Conexões heading, then
 * the Project's `AGENTS.md` under a project-knowledge heading. The brief and its integrator guides are
 * instructions, so they come before the notes and never read as part of them. The mode prompt lives
 * here, in agent instructions, rather than in the `AgentController` mode's own `instructions`, because
 * only agent instructions are resolved again on a resumed call (proven in the blast radius of slices 0
 * and 1). A methodology the Hub does not ship fails the turn rather than falling back to another prompt.
 */
export const conexusInstructions = (
  modes: Readonly<Record<BuilderModeId, BuilderModeDefinition>> = BUILDER_MODES,
  promptRoot: string = defaultPromptRoot(),
) => ({ requestContext }: { requestContext: RequestContext }): string => {
  const methodology = readMethodology(requestContext)
  if (!methodology) throw new Error('BUILDER_PROMPT_VARIANT_UNKNOWN')
  const mode = modes[readModeId(requestContext) ?? DEFAULT_BUILDER_MODE]
  const approvedPlan = methodology.activePlanInBuild && mode.readsApprovedPlan ? readSubmittedPlan(requestContext) : undefined
  const projectKnowledge = readProjectKnowledge(requestContext)
  const connectorBrief = readConnectorBrief(requestContext)
  const conflicts = readTurnConflicts(requestContext)
  return [
    promptFile(join(promptRoot, 'conexus.md')),
    promptFile(join(promptRoot, methodology.promptFolder, mode.promptFile)),
    ...(methodology.planningChecklist && mode.readsPlanningChecklist ? [promptFile(join(promptRoot, 'plan-checklist.md'))] : []),
    ...(approvedPlan ? [`## Approved plan\n\nThe person approved this plan, written in \`${approvedPlan.path}\`:\n\n${approvedPlan.title ? `# ${approvedPlan.title}\n\n` : ''}${approvedPlan.plan}`] : []),
    ...(conflicts.length > 0 ? [`## Merge conflicts\n\nBringing the Project's current main into these files left conflict markers; resolve them before any other change: ${conflicts.map((path) => `\`${path}\``).join(', ')}.`] : []),
    ...(connectorBrief ? [`## Conexões\n\n${connectorBrief}`] : []),
    ...(projectKnowledge ? [`## Project knowledge\n\n${projectKnowledge}`] : []),
  ].join('\n\n')
}
