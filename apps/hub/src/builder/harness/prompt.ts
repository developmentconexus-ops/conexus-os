import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { RequestContext } from '@mastra/core/request-context'
import { BUILDER_MODES, DEFAULT_BUILDER_MODE, type BuilderModeDefinition, type BuilderModeId } from './modes.js'
import { readConnectorBrief, readModeId, readProjectKnowledge } from './request-context.js'

/**
 * Prompt files are Markdown, not TypeScript, so the Hub's `tsc` build does not copy them into its
 * compiled output (unlike `.ts` sources, which `import.meta.url` would still resolve there). They are
 * read from the source tree instead, the same way `builder-skills/` is: relative to the Hub process's
 * own working directory, which is the repository root both at Hub runtime and under `node --test`.
 */
const defaultPromptDir = (cwd: string = process.cwd()): string => resolve(cwd, 'apps/hub/src/builder/harness/prompt')

const readPromptFile = (name: string, promptDir: string): string => readFileSync(join(promptDir, name), 'utf8').trim()

// Prompt files are static and shipped with the Hub, so a process reads each one once per directory.
const fileCache = new Map<string, string>()
const cachedPromptFile = (name: string, promptDir: string): string => {
  const key = `${promptDir}\0${name}`
  const cached = fileCache.get(key)
  if (cached !== undefined) return cached
  const text = readPromptFile(name, promptDir)
  fileCache.set(key, text)
  return text
}

const conexusPromptText = (promptDir: string = defaultPromptDir()): string => cachedPromptFile('conexus.md', promptDir)
const modePromptText = (mode: BuilderModeDefinition, promptDir: string = defaultPromptDir()): string => cachedPromptFile(mode.promptFile, promptDir)

/**
 * Builds the agent's dynamic `instructions` function: the Conexus prompt, the current mode's prompt,
 * the Project's `AGENTS.md` under a project-knowledge heading, then the connector brief, in that
 * order (Shape of the harness). The mode prompt lives here, in agent instructions, rather than in the
 * `AgentController` mode's own `instructions`, because only agent instructions are resolved again on a
 * resumed call (proven in the blast radius of slices 0 and 1).
 */
export const conexusInstructions = (
  modes: Readonly<Record<BuilderModeId, BuilderModeDefinition>> = BUILDER_MODES,
  promptDir: string = defaultPromptDir(),
) => ({ requestContext }: { requestContext: RequestContext }): string => {
  const modeId = readModeId(requestContext) ?? DEFAULT_BUILDER_MODE
  const mode = modes[modeId]
  const projectKnowledge = readProjectKnowledge(requestContext)
  const connectorBrief = readConnectorBrief(requestContext)
  return [
    conexusPromptText(promptDir),
    modePromptText(mode, promptDir),
    ...(projectKnowledge ? [`## Project knowledge\n\n${projectKnowledge}`] : []),
    ...(connectorBrief ? [connectorBrief] : []),
  ].join('\n\n')
}
