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
import { webFetchTool, webSearchTool } from '@mastra/core/tools'
import { CHECK_TOOL, createCheckTool, createSubmitPlanTool } from './tools.js'
import type { CheckReport } from '../application-check.js'

/** The skills the Builder loads, one folder each under the skills root. */
export const BUILDER_SKILL_NAMES = ['conexus-server', 'conexus-app-ui', 'conexus-app-code'] as const

/** The Hub's own copy of the shared agent skills, `builder-skills/` at the repository root (AC-10). Mastra scans each subfolder holding a SKILL.md. */
export const defaultBuilderSkillsRoot = (cwd: string = process.cwd()): string => resolve(cwd, 'builder-skills')

/**
 * The provider ids Mastra's built-in `webSearchTool` can resolve to a native provider search
 * (`normalizeWebSearchProvider` in `@mastra/core/tools`'s `tools-*.js`, not part of that package's
 * public `./tools` export surface, so the Hub cannot call it directly and duplicates the set here,
 * once). Offering `web_search` for any other provider throws `WEB_SEARCH_UNSUPPORTED_PROVIDER`
 * before the first model call (spec 0002 AC-11): a model without native search gets no `web_search`
 * tool at all here, in slice 1; a common search tool for such models is slice 6's owed decision.
 */
const NATIVE_WEB_SEARCH_PROVIDERS: ReadonlySet<string> = new Set(['openai', 'anthropic', 'google', 'xai'])

/** The provider id embedded in a `provider/model` string, or the whole string when it carries none. */
const providerOf = (modelString: string): string => {
  const slash = modelString.indexOf('/')
  return slash > 0 ? modelString.slice(0, slash) : modelString
}

/**
 * The provider id of whatever `MastraModelConfig` shape a run resolves to: a `provider/model`
 * router string, either `OpenAICompatibleConfig` shape (module.ts's `createModelResolver` returns
 * the `providerId` one for Google AI Pro today), or an already-resolved language model instance.
 */
const resolveModelProviderId = (model: MastraModelConfig): string | undefined => {
  if (typeof model === 'string') return providerOf(model)
  if (typeof model !== 'object' || model === null) return undefined
  if ('providerId' in model && typeof model.providerId === 'string') return model.providerId
  if ('id' in model && typeof model.id === 'string') return providerOf(model.id)
  if ('provider' in model && typeof model.provider === 'string') return model.provider
  return undefined
}

/**
 * The provider ids a subscription model reports: `openaiCodexModel` (ChatGPT) and Mastra Code's
 * Claude provider (`anthropic.messages`). `webSearchTool` cannot map them
 * (`normalizeWebSearchProvider` accepts only the bare id or a `provider/` prefix), so each gets the
 * provider-defined tool `webSearchTool` itself resolves to for its family
 * (`createWebSearchProviderTool` in `@mastra/core`, not exported), which the model executes
 * server-side, as Mastra Code does (`mastracode/sdk/src/agents/tools.ts`). Whether each
 * subscription backend accepts its tool is proven only by a live run.
 */
const SUBSCRIPTION_WEB_SEARCH: Readonly<Record<string, ToolsInput[string]>> = Object.freeze({
  'openai.responses': { type: 'provider-defined', id: 'openai.web_search', name: 'web_search', args: {} },
  'anthropic.messages': { type: 'provider-defined', id: 'anthropic.web_search_20250305', name: 'web_search', args: {} },
})

/** The run's `web_search` tool, or none when its model has no provider-native search in Mastra (spec 0002 AC-11, Tool contract). */
const webSearchFor = async (
  model: BuilderControllerDeps['model'],
  ctx: { requestContext: RequestContext },
): Promise<ToolsInput> => {
  const resolved = typeof model === 'function' ? await model(ctx) : model
  const providerId = resolveModelProviderId(resolved)
  const subscriptionSearch = providerId !== undefined && Object.hasOwn(SUBSCRIPTION_WEB_SEARCH, providerId) ? SUBSCRIPTION_WEB_SEARCH[providerId] : undefined
  if (subscriptionSearch) return { web_search: subscriptionSearch }
  if (providerId !== undefined && NATIVE_WEB_SEARCH_PROVIDERS.has(providerId)) return { web_search: webSearchTool }
  return {}
}

/**
 * How many of one step's tool calls run at once. Mastra's default strategy `'available'` runs them
 * one at a time whenever any tool in the active set can suspend (`ask_user`, `submit_plan`), which
 * is every step here. `'called'` looks only at the tools the model called in that step, so a step
 * that calls `ask_user` or `submit_plan` still runs one at a time and every other step runs in
 * parallel. Same-path writes stay ordered by the workspace's own per-file write lock. The limit is
 * low because each command runs in one E2B sandbox.
 */
const TOOL_CALL_CONCURRENCY = { limit: 4, strategy: 'called' } as const

const checkTools = (runCheck: (() => Promise<CheckReport>) | undefined, modes: Readonly<Record<BuilderModeId, BuilderModeDefinition>>): ToolsInput =>
  runCheck ? { [CHECK_TOOL]: createCheckTool(runCheck, modes) } : {}

export type BuilderControllerDeps = Readonly<{
  /** One E2B workspace per run, seeded from `main`; a resolver so a fresh one can be supplied per session (Shape of the harness). Tests pass a static local one. */
  workspace: DynamicArgument<Workspace | undefined>
  /** The model this turn runs on; resolved by the caller from the person's account and the thread's role. */
  model: DynamicArgument<MastraModelConfig>
  storage?: MastraCompositeStore
  memory?: DynamicArgument<MastraMemory>
  /** Contributes `connector_fetch` for the current request context (Q-5); absent when the caller has none to offer. */
  connectorFetch?: (ctx: { requestContext: RequestContext }) => ToolsInput | Promise<ToolsInput>
  /** The run's check, through its sandbox, for `conexus_check`; absent for a turn with no run behind it, which then has no such tool. */
  runCheck?: (ctx: { requestContext: RequestContext }) => (() => Promise<CheckReport>) | undefined
  /** Absolute path to a folder of agent skills, one subfolder per skill. Defaults to the Hub's own `builder-skills/`. */
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
 * every mode shares (`connector_fetch`, `conexus_check` for a run (Construir only), `web_fetch`, and `web_search` when the run's model has native
 * provider search in Mastra), the `plan`/`build` modes with the
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
      ...checkTools(deps.runCheck?.(ctx), modes),
      ...(await webSearchFor(deps.model, ctx)),
      web_fetch: webFetchTool,
    }),
    skills: [deps.skillsPath ?? defaultBuilderSkillsRoot()],
    ...(deps.memory ? { memory: deps.memory } : {}),
    workspace: undefined,
    // Mastra's fallback when errorProcessors are set, made explicit so the cap is ours to read.
    maxProcessorRetries: 3,
    defaultOptions: { toolCallConcurrency: TOOL_CALL_CONCURRENCY },
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
