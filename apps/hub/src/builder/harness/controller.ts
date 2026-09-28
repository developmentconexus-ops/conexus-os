import { resolve } from 'node:path'
import { AgentController } from '@mastra/core/agent-controller'
import { createCodingAgent } from '@mastra/core/coding-agent'
import type { ToolsInput } from '@mastra/core/agent'
import type { MastraModelConfig } from '@mastra/core/llm'
import type { MastraMemory } from '@mastra/core/memory'
import type { RequestContext } from '@mastra/core/request-context'
import type { MastraCompositeStore } from '@mastra/core/storage'
import type { DynamicArgument } from '@mastra/core/types'
import type { Workspace } from '@mastra/core/workspace'
import { attachBuilderModeGuard, DEFAULT_REPOSITORY_ROOT } from './guard.js'
import { BUILDER_MODES, DEFAULT_BUILDER_MODE, type BuilderModeDefinition, type BuilderModeId } from './modes.js'
import { conexusInstructions } from './prompt.js'
import { createSubmitPlanTool, webFetchTool, webSearchTool } from './tools.js'

/** The Hub's own copy of the shared agent skills, `builder-skills/` at the repository root (AC-10). */
export const defaultBuilderSkillsRoot = (cwd: string = process.cwd()): string => resolve(cwd, 'builder-skills', 'conexus-server')

export type BuilderControllerDeps = Readonly<{
  /** One E2B workspace per run, seeded from `main`; a resolver so a fresh one can be supplied per session (Shape of the harness). Tests pass a static local one. */
  workspace: DynamicArgument<Workspace | undefined>
  /** The model this turn runs on; resolved by the caller from the person's account and the thread's role. */
  model: DynamicArgument<MastraModelConfig>
  storage?: MastraCompositeStore
  memory?: DynamicArgument<MastraMemory>
  /** Contributes `connector_fetch` for the current request context (Q-5); absent when the caller has none to offer. */
  connectorFetch?: (ctx: { requestContext: RequestContext }) => ToolsInput | Promise<ToolsInput>
  /** Absolute path to the `conexus-server` agent skill. Defaults to the Hub's own `builder-skills/conexus-server`. */
  skillsPath?: string
  /** Where the run's checkout sits; the mode guard reads every tool path against it. Defaults to `/workspace/repo`. */
  repositoryRoot?: string
  /** Overrides the mode table; only for tests. */
  modes?: Readonly<Record<BuilderModeId, BuilderModeDefinition>>
  id?: string
}>

/**
 * Attaches the mode guard to whatever `Workspace` a (possibly dynamic) workspace dependency
 * resolves to, without attaching it twice to the same instance.
 */
const guardedWorkspace = (
  workspace: BuilderControllerDeps['workspace'],
  modes: Readonly<Record<BuilderModeId, BuilderModeDefinition>>,
  repositoryRoot: string,
): DynamicArgument<Workspace | undefined> => {
  if (typeof workspace !== 'function') {
    if (workspace) attachBuilderModeGuard(workspace, modes, repositoryRoot)
    return workspace
  }
  const guarded = new WeakSet<Workspace>()
  return async (ctx) => {
    const resolved = await workspace(ctx)
    if (resolved && !guarded.has(resolved)) {
      attachBuilderModeGuard(resolved, modes, repositoryRoot)
      guarded.add(resolved)
    }
    return resolved
  }
}

/**
 * Builds the Builder's `AgentController`: `createCodingAgent` with the Conexus prompt and the tools
 * every mode shares (`connector_fetch`, `web_search`, `web_fetch`), the `plan`/`build` modes with the
 * plan-to-build transition, `submit_plan` overridden for AC-1 and mode-gated on its first call, and
 * the mode guard attached to whatever workspace the run resolves to. No Hub wiring: the caller owns
 * sessions, routes, and where `workspace`, `model`, `storage`, and `connectorFetch` come from.
 */
export const createBuilderController = (deps: BuilderControllerDeps): AgentController => {
  const modes = deps.modes ?? BUILDER_MODES
  const repositoryRoot = deps.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT

  const agent = createCodingAgent({
    id: 'conexus-builder',
    name: 'Conexus Builder',
    model: deps.model,
    instructions: conexusInstructions(modes),
    tools: async (ctx: { requestContext: RequestContext }): Promise<ToolsInput> => ({
      ...(deps.connectorFetch ? await deps.connectorFetch(ctx) : {}),
      web_search: webSearchTool,
      web_fetch: webFetchTool,
    }),
    skills: [deps.skillsPath ?? defaultBuilderSkillsRoot()],
    ...(deps.memory ? { memory: deps.memory } : {}),
    workspace: undefined,
  })

  return new AgentController({
    id: deps.id ?? 'conexus-builder',
    agent,
    workspace: guardedWorkspace(deps.workspace, modes, repositoryRoot),
    ...(deps.storage ? { storage: deps.storage } : {}),
    ...(deps.memory ? { memory: deps.memory } : {}),
    disableBuiltinTools: ['submit_plan'],
    tools: () => ({ submit_plan: createSubmitPlanTool(modes, repositoryRoot) }),
    modes: [
      {
        id: modes.plan.id,
        name: modes.plan.displayName,
        metadata: { default: modes.plan.id === DEFAULT_BUILDER_MODE },
        availableTools: [...modes.plan.availableTools],
        ...(modes.plan.transitionsTo ? { transitionsTo: modes.plan.transitionsTo } : {}),
      },
      { id: modes.build.id, name: modes.build.displayName, availableTools: [...modes.build.availableTools] },
    ],
  })
}
