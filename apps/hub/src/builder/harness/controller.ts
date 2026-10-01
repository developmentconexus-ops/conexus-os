import { resolve } from 'node:path'
import { AgentController } from '@mastra/core/agent-controller'
import { createCodingAgent } from '@mastra/core/coding-agent'
import { isMastraTimeoutError } from '@mastra/core/loop'
import { isBadRequestError, PrefillErrorHandler, ProviderHistoryCompat, SkillsProcessor, StreamErrorRetryProcessor } from '@mastra/core/processors'
import { resolveAgentSkills } from '@mastra/core/skills'
import type { ToolsInput } from '@mastra/core/agent'
import type { MastraModelConfig } from '@mastra/core/llm'
import type { MastraMemory } from '@mastra/core/memory'
import type { RequestContext } from '@mastra/core/request-context'
import type { MastraCompositeStore } from '@mastra/core/storage'
import type { DynamicArgument } from '@mastra/core/types'
import type { Workspace } from '@mastra/core/workspace'
import { conexusInstructions } from './prompt.js'
import { webFetchTool, webSearchTool } from '@mastra/core/tools'
import { ASK_USER_TOOL, CHECK_TOOL, createAskUserTool, createCheckTool, createRunOperationTool, createSubmitPlanTool, RUN_OPERATION_TOOL, SUBMIT_PLAN_TOOL } from './tools.js'
import { SANDBOX_CHECKOUT } from '../sandbox.js'
import type { CheckReport } from '../application-check.js'
import type { RunOperation } from '../run-operation.js'

/** The skills the Builder loads, one folder each under the skills root. */
export const BUILDER_SKILL_NAMES = ['conexus-server', 'conexus-app', 'conexus-plan', 'conexus-build', 'conexus-sankhya'] as const

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
 * one at a time whenever any tool in the active set can suspend (`ask_user`), which
 * is every step here. `'called'` looks only at the tools the model called in that step, so a step
 * that calls `ask_user` still runs one at a time and every other step runs in
 * parallel. Same-path writes stay ordered by the workspace's own per-file write lock. The limit is
 * low because each command runs in one E2B sandbox.
 */
const TOOL_CALL_CONCURRENCY = { limit: 4, strategy: 'called' } as const

/**
 * The most one model step may generate, and the longest one model call may run (Mastra's
 * `modelSettings.maxOutputTokens` and `modelSettings.timeout.stepMs`, applied to every call of the
 * agent). A step that streams a tool call without end otherwise holds the run for as long as the
 * provider keeps sending: one did for 12 minutes. The token cap ends it for providers that honor
 * it; the time budget covers those that do not (the ChatGPT Codex backend takes no output cap, see
 * `openai-codex/route.ts`) and a stream that stalls. A step that writes a whole large file needs
 * well under both.
 */
const BUILDER_MAX_OUTPUT_TOKENS = 32_000
const BUILDER_MODEL_STEP_TIMEOUT_MS = 5 * 60_000

const isConnectionReset = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (
    ('code' in error && typeof error.code === 'string' && error.code.toUpperCase() === 'ECONNRESET')
    || (error instanceof Error && /econnreset|socket hang up/i.test(error.message))
  )

/**
 * Mastra Code's `defaultErrorProcessors` (`createCodingAgent` in `@mastra/core/coding-agent`) with
 * one matcher added: a call that ran past `BUILDER_MODEL_STEP_TIMEOUT_MS` is not retried. Retrying
 * replays the same request, and a step that ran away once would run away again, holding the run
 * for three budgets instead of one.
 */
const builderErrorProcessors = (): NonNullable<Parameters<typeof createCodingAgent>[0]['errorProcessors']> => [
  new ProviderHistoryCompat(),
  new PrefillErrorHandler(),
  new StreamErrorRetryProcessor({
    retryUnknownErrors: true,
    maxRetries: 2,
    delayMs: 3000,
    matchers: [
      { match: (error) => isMastraTimeoutError(error), maxRetries: 0 },
      { match: isBadRequestError, maxRetries: 1, delayMs: 2000 },
      { match: isConnectionReset, maxRetries: 2, delayMs: ({ retryCount }) => Math.min(1000 * 2 ** retryCount, 30_000) },
    ],
  }),
]

/** What the Hub proves about a run's checkout on the agent's behalf: the check, and one operation run when the Prévia's runner is there. */
export type RunTools = Readonly<{ check: () => Promise<CheckReport>; runOperation?: RunOperation | undefined }>

const runToolsInput = (tools: RunTools | undefined): ToolsInput => ({
  ...(tools ? { [CHECK_TOOL]: createCheckTool(tools.check) } : {}),
  ...(tools?.runOperation ? { [RUN_OPERATION_TOOL]: createRunOperationTool(tools.runOperation) } : {}),
})

export type BuilderControllerDeps = Readonly<{
  /** One E2B workspace per run, seeded from `main`; a resolver so a fresh one can be supplied per session (Shape of the harness). Tests pass a static local one. */
  workspace: DynamicArgument<Workspace | undefined>
  /** The model this turn runs on; resolved by the caller from the person's account and the thread's role. */
  model: DynamicArgument<MastraModelConfig>
  storage?: MastraCompositeStore
  memory?: DynamicArgument<MastraMemory>
  /** Contributes `connector_fetch` for the current request context (Q-5); absent when the caller has none to offer. */
  connectorFetch?: (ctx: { requestContext: RequestContext }) => ToolsInput | Promise<ToolsInput>
  /** The run's check and operation run, for `conexus_check` and `conexus_run_operation`; absent for a turn with no run behind it, which then has neither tool. */
  runTools?: (ctx: { requestContext: RequestContext }) => RunTools | undefined
  /** Absolute path to a folder of agent skills, one subfolder per skill. Defaults to the Hub's own `builder-skills/`. */
  skillsPath?: string
  /** Overrides how long one model call may run; only for tests. */
  modelStepTimeoutMs?: number
  id?: string
}>

/**
 * Builds the Builder's `AgentController`: `createCodingAgent` with the Conexus prompt and the tools
 * the Hub adds (`connector_fetch`, `conexus_check` and `conexus_run_operation` for a run, `web_fetch`,
 * and `web_search` when the run's model has native provider search in Mastra), and the one `build`
 * mode, which sets no `availableTools` allowlist so every tool Mastra registers, `recall` included,
 * reaches the model. `submit_plan` is Mastra's own tool, wrapped to take only `.conexus/plan.md` and
 * to suspend with the plan the Hub read, so the plan is approved on its card. `ask_user` is ours, taking 1 to 4
 * questions in one card on the same suspend and resume primitive.
 * No Hub wiring: the caller owns sessions, routes, and where `workspace`, `model`, `storage`, and
 * `connectorFetch` come from.
 */
export const createBuilderController = (deps: BuilderControllerDeps): AgentController => {
  const skillsRoot = deps.skillsPath ?? defaultBuilderSkillsRoot()

  const agent = createCodingAgent({
    id: 'conexus-builder',
    name: 'Conexus Builder',
    model: deps.model,
    instructions: conexusInstructions(),
    tools: async (ctx: { requestContext: RequestContext }): Promise<ToolsInput> => ({
      ...(deps.connectorFetch ? await deps.connectorFetch(ctx) : {}),
      ...runToolsInput(deps.runTools?.(ctx)),
      ...(await webSearchFor(deps.model, ctx)),
      web_fetch: webFetchTool,
    }),
    skills: [skillsRoot],
    // The default catalog names each skill by its path on the Hub host, which the workspace tools (E2B) cannot read. Name it by skill instead; `skill` and `skill_read` resolve that name.
    inputProcessors: [new SkillsProcessor({ skills: resolveAgentSkills([skillsRoot]), formatLocation: (skill) => skill.name })],
    ...(deps.memory ? { memory: deps.memory } : {}),
    workspace: undefined,
    errorProcessors: builderErrorProcessors(),
    // Mastra's fallback when errorProcessors are set, made explicit so the cap is ours to read.
    maxProcessorRetries: 3,
    defaultOptions: {
      toolCallConcurrency: TOOL_CALL_CONCURRENCY,
      modelSettings: { maxOutputTokens: BUILDER_MAX_OUTPUT_TOKENS, timeout: { stepMs: deps.modelStepTimeoutMs ?? BUILDER_MODEL_STEP_TIMEOUT_MS } },
    },
  })

  return new AgentController({
    id: deps.id ?? 'conexus-builder',
    agent,
    workspace: deps.workspace,
    ...(deps.storage ? { storage: deps.storage } : {}),
    ...(deps.memory ? { memory: deps.memory } : {}),
    disableBuiltinTools: [SUBMIT_PLAN_TOOL, ASK_USER_TOOL],
    tools: { [SUBMIT_PLAN_TOOL]: createSubmitPlanTool(SANDBOX_CHECKOUT), [ASK_USER_TOOL]: createAskUserTool() },
    modes: [{ id: 'build', name: 'Builder', metadata: { default: true } }],
  })
}
