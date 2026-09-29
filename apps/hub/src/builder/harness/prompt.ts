import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { RequestContext } from '@mastra/core/request-context'
import { BUILDER_MODES, DEFAULT_BUILDER_MODE, type BuilderModeDefinition, type BuilderModeId } from './modes.js'
import { readConnectorBrief, readModeId, readProjectKnowledge, readPromptVariant } from './request-context.js'

/**
 * The prompt variants the Hub ships, each a folder `prompt/<id>/` holding `conexus.md` and one file
 * per mode. A run names its variant; a run that names none gets the default. One variant ships
 * today; a candidate is added beside it to compare them on the eval (spec 0002, Follow-up on
 * prompt variants).
 * @public Tests import this at runtime from the built module.
 */
export const PROMPT_VARIANTS = Object.freeze(['v2'] as const)
export type PromptVariantId = (typeof PROMPT_VARIANTS)[number]
/** @public Tests import this at runtime from the built module. */
export const DEFAULT_PROMPT_VARIANT: PromptVariantId = 'v2'

const isPromptVariantId = (value: string): value is PromptVariantId => (PROMPT_VARIANTS as readonly string[]).includes(value)

/**
 * Prompt files are Markdown, not TypeScript, so the Hub's `tsc` build does not copy them into its
 * compiled output (unlike `.ts` sources, which `import.meta.url` would still resolve there). They are
 * read from the source tree instead, the same way `builder-skills/` is: relative to the Hub process's
 * own working directory, which is the repository root both at Hub runtime and under `node --test`.
 */
const defaultPromptRoot = (cwd: string = process.cwd()): string => resolve(cwd, 'apps/hub/src/builder/harness/prompt')

// A prompt file opens with an HTML comment naming the sources its passages were adapted from and
// their license (AC-25). That notice is for people reading the repository, not for the model.
const withoutComments = (text: string): string => text.replace(/<!--[\s\S]*?-->/g, '').trim()

// Prompt files are static and shipped with the Hub, so a process reads each one once per path.
const fileCache = new Map<string, string>()
const promptFile = (promptRoot: string, variant: PromptVariantId, name: string): string => {
  const path = join(promptRoot, variant, name)
  const cached = fileCache.get(path)
  if (cached !== undefined) return cached
  const text = withoutComments(readFileSync(path, 'utf8'))
  fileCache.set(path, text)
  return text
}

/**
 * Builds the agent's dynamic `instructions` function: the Conexus prompt, the current mode's prompt,
 * the connector brief under a Conexões heading, then the Project's `AGENTS.md` under a
 * project-knowledge heading, all of the run's prompt variant. The brief and its integrator guides are
 * instructions, so they come before the notes and never read as part of them. The mode prompt lives here, in agent
 * instructions, rather than in the `AgentController` mode's own `instructions`, because only agent
 * instructions are resolved again on a resumed call (proven in the blast radius of slices 0 and 1).
 * A variant the Hub does not ship fails the turn rather than falling back to another prompt.
 */
export const conexusInstructions = (
  modes: Readonly<Record<BuilderModeId, BuilderModeDefinition>> = BUILDER_MODES,
  promptRoot: string = defaultPromptRoot(),
) => ({ requestContext }: { requestContext: RequestContext }): string => {
  const variant = readPromptVariant(requestContext) ?? DEFAULT_PROMPT_VARIANT
  if (!isPromptVariantId(variant)) throw new Error('BUILDER_PROMPT_VARIANT_UNKNOWN')
  const mode = modes[readModeId(requestContext) ?? DEFAULT_BUILDER_MODE]
  const projectKnowledge = readProjectKnowledge(requestContext)
  const connectorBrief = readConnectorBrief(requestContext)
  return [
    promptFile(promptRoot, variant, 'conexus.md'),
    promptFile(promptRoot, variant, mode.promptFile),
    ...(connectorBrief ? [`## Conexões\n\n${connectorBrief}`] : []),
    ...(projectKnowledge ? [`## Project knowledge\n\n${projectKnowledge}`] : []),
  ].join('\n\n')
}
