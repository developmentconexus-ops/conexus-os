import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { modelSpecificPrompts } from '@mastra/code-sdk/agents/prompts/model'
import type { RequestContext } from '@mastra/core/request-context'
import { MODEL_KNOWLEDGE_CUTOFFS } from './model-cutoffs.js'
import {
  CONEXUS_CONNECTOR_BRIEF_KEY, CONEXUS_PROJECT_INSTRUCTIONS_KEY, CONEXUS_PROJECT_MEMORY_KEY, CONEXUS_PROJECT_NAME_KEY, CONEXUS_PROJECT_NEW_KEY, CONEXUS_TURN_DATE_KEY,
  readRawString, readSessionModelId, readTurnConflicts,
} from './request-context.js'

/**
 * The prompt file is Markdown, not TypeScript, so the Hub's `tsc` build does not copy it into its
 * compiled output. It is read from the source tree instead, the same way `builder-skills/` is:
 * relative to the Hub process's working directory, which is the repository root both at Hub runtime
 * and under `node --test`.
 */
const defaultPromptRoot = (cwd: string = process.cwd()): string => resolve(cwd, 'apps/hub/src/builder/harness/prompt')

// The prompt is static and shipped with the Hub, so a process reads it once per path.
const fileCache = new Map<string, string>()
const promptFile = (path: string): string => {
  const cached = fileCache.get(path)
  if (cached !== undefined) return cached
  const text = readFileSync(path, 'utf8')
  fileCache.set(path, text)
  return text
}

type PromptValues = Readonly<{
  projectName: string
  /** Today, `YYYY-MM-DD`, in the Hub's clock for `America/Sao_Paulo`. */
  date: string
  /** The model's knowledge cutoff, `Month YYYY`; null drops the clause. */
  cutoff: string | null
  /** True while the Project's `main` is still the starter commit; the Environment's new-app line is dropped otherwise. */
  isNew: boolean
  /** The Conexões section's lines: the list, or the one line that says there is none to show. */
  connections: string
  /** `AGENTS.md` as the Hub read it from `main`, with its notes. */
  instructions: string
  /** `.conexus/memory/MEMORY.md` as the Hub read it from `main`, with its notes. */
  memory: string
}>

// One pass over the template, so text a placeholder brings in is never read as another placeholder.
const PLACEHOLDER = /^- This app is new: it has only the starter screen\.\n| Your knowledge cutoff: \{cutoff\}\.|^- `\{name\}`: \{integrator\} \(skill `conexus-\{integrator\}`\)$|\{project name\}|\{date\}|\{AGENTS\.md content\}|\{index\}/gm

/** Fills the prompt's placeholders. A placeholder the template has no slot for is an error in the template, never in the values. */
const fillPrompt = (template: string, values: PromptValues): string => template.replace(PLACEHOLDER, (slot) => {
  if (slot.startsWith('- This app is new')) return values.isNew ? slot : ''
  if (slot.startsWith(' Your knowledge cutoff')) return values.cutoff ? ` Your knowledge cutoff: ${values.cutoff}.` : ''
  if (slot.startsWith('- `{name}`')) return values.connections
  switch (slot) {
    case '{project name}': return values.projectName
    case '{date}': return values.date
    case '{AGENTS.md content}': return values.instructions
    default: return values.memory
  }
})

/**
 * Builds the agent's dynamic `instructions` function: the Conexus prompt with the turn's values
 * filled in, then the paths the turn's start left in conflict. The prompt lives here, in agent
 * instructions, rather than in the `AgentController` mode's own `instructions`, because only agent
 * instructions are resolved again on a resumed call.
 */
export const conexusInstructions = (
  promptRoot: string = defaultPromptRoot(),
  cutoffs: Readonly<Record<string, string>> = MODEL_KNOWLEDGE_CUTOFFS,
) => ({ requestContext }: { requestContext: RequestContext }): string => {
  const modelId = readSessionModelId(requestContext)
  const cutoff = modelId !== undefined && Object.hasOwn(cutoffs, modelId) ? cutoffs[modelId] : undefined
  const filled = fillPrompt(promptFile(join(promptRoot, 'builder.md')), {
    projectName: readRawString(requestContext, CONEXUS_PROJECT_NAME_KEY),
    date: readRawString(requestContext, CONEXUS_TURN_DATE_KEY),
    isNew: readRawString(requestContext, CONEXUS_PROJECT_NEW_KEY) === 'true',
    cutoff: cutoff ?? null,
    connections: readRawString(requestContext, CONEXUS_CONNECTOR_BRIEF_KEY),
    instructions: readRawString(requestContext, CONEXUS_PROJECT_INSTRUCTIONS_KEY),
    memory: readRawString(requestContext, CONEXUS_PROJECT_MEMORY_KEY),
  })
  // Mastra Code's guidance for this model (`modelSpecificPrompts` in `@mastra/code-sdk`, keyed by the same `<provider>/<model>` id), added after the prompt as `buildFullPromptSections` adds it after the base prompt.
  const modelPrompt = modelId !== undefined && Object.hasOwn(modelSpecificPrompts, modelId) ? modelSpecificPrompts[modelId as keyof typeof modelSpecificPrompts].trim() : ''
  const prompt = modelPrompt ? `${filled.trimEnd()}\n\n${modelPrompt}` : filled
  const conflicts = readTurnConflicts(requestContext)
  return conflicts.length > 0
    ? `${prompt.trimEnd()}\n\n## Merge conflicts\n\nBringing the Project's current main into these files left conflict markers; resolve them before any other change: ${conflicts.map((path) => `\`${path}\``).join(', ')}.`
    : prompt
}

/** Today as `YYYY-MM-DD` in `America/Sao_Paulo`, the date the prompt states. */
export const turnDate = (now: Date = new Date()): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now)
