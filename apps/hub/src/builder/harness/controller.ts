import { resolve } from 'node:path'
import { AgentController } from '@mastra/core/agent-controller'
import { createCodingAgent } from '@mastra/core/coding-agent'
import { SkillsProcessor } from '@mastra/core/processors'
import { resolveAgentSkills } from '@mastra/core/skills'
import { Agent, type ToolsInput } from '@mastra/core/agent'
import { type MastraModelConfig, parseModelString } from '@mastra/core/llm'
import type { MastraMemory } from '@mastra/core/memory'
import type { RequestContext } from '@mastra/core/request-context'
import type { MastraCompositeStore } from '@mastra/core/storage'
import type { DynamicArgument } from '@mastra/core/types'
import type { Workspace } from '@mastra/core/workspace'
import { builderErrorProcessors, BUILDER_MAX_PROCESSOR_RETRIES } from './error-processors.js'
import { conexusInstructions } from './prompt.js'
import { createTool, isProviderDefinedTool, webSearchTool } from '@mastra/core/tools'
import { Failure } from '../../platform/failure.js'
import { guardedWebFetchTool } from './web-fetch.js'
import { z } from 'zod'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { ASK_USER_TOOL, CHECK_TOOL, createAskUserTool, failing, createCheckTool, createRunOperationTool, createSubmitPlanTool, RUN_OPERATION_TOOL, SUBMIT_PLAN_TOOL } from './tools.js'
import type { DocsTools } from './context7.js'
import { SANDBOX_CHECKOUT } from '../sandbox.js'
import { type AgentReport, CHECK_COMMAND_TIMEOUT_MS } from '../check/report.js'
import type { RunOperation } from '../run-operation.js'
import type { CandidateGate } from '../candidate-gate.js'
import { createScorer } from '@mastra/core/evals'

/** The skills the Builder loads, one folder each under the skills root. */
export const BUILDER_SKILL_NAMES = ['conexus-server', 'conexus-app', 'conexus-plan-new', 'conexus-plan-change', 'conexus-build', 'conexus-sankhya'] as const

/** The Hub's own copy of the shared agent skills, `builder-skills/` at the repository root (AC-10). Mastra scans each subfolder holding a SKILL.md. */
export const defaultBuilderSkillsRoot = (cwd: string = process.cwd()): string => resolve(cwd, 'builder-skills')

/**
 * The provider ids Mastra's built-in `webSearchTool` can resolve to a native provider search
 * (`normalizeWebSearchProvider` in `@mastra/core/tools`'s `tools-*.js`, not part of that package's
 * public `./tools` export surface, so the Hub cannot call it directly and duplicates the set here,
 * once). Offering `web_search` for any other provider throws `WEB_SEARCH_UNSUPPORTED_PROVIDER`
 * before the first model call (spec 0002 AC-11), so a model none of these searches for gets no
 * `web_search` tool at all.
 */
const NATIVE_WEB_SEARCH_PROVIDERS: ReadonlySet<string> = new Set(['openai', 'anthropic', 'google', 'xai'])

/** The provider id embedded in a `provider/model` string, or the whole string when it carries none. */
const providerOf = (modelString: string): string => parseModelString(modelString).provider ?? modelString

/** The provider id of whatever `MastraModelConfig` shape a run resolves to: a `provider/model` router string or config, or an already-built language model. */
const resolveModelProviderId = (model: MastraModelConfig): string | undefined => {
  if (typeof model === 'string') return providerOf(model)
  if (typeof model !== 'object' || model === null) return undefined
  if ('id' in model && typeof model.id === 'string') return providerOf(model.id)
  if ('provider' in model && typeof model.provider === 'string') return model.provider
  return undefined
}

const WEB_SEARCH_DESCRIPTION = 'Searches the web for one query and returns what it found, with the address of each source. Call it once per question.'

/**
 * A provider tool of an `@ai-sdk/*` package as Mastra's tool set takes it, which its own type does not promise.
 * @public Tests call it through the built Hub.
 */
export const providerTool = (tool: object): ToolsInput[string] => {
  if (!isProviderDefinedTool(tool)) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'PROVIDER_TOOL_SHAPE_REFUSED' } })
  return tool
}

/**
 * `web_search` for a model on Gemini's own API, which Google AI Pro reaches through Antigravity:
 * Antigravity answers 400 to `googleSearch` beside function tools, so Google's search never sits in
 * the Builder's own tool set. The Builder's `web_search` asks an agent on the same model whose only
 * tool is Google's search, in one model call per query, and returns its answer and sources.
 */
const searchOnlyWebSearch = (model: BuilderControllerDeps['model']): ToolsInput[string] => {
  const searcher = new Agent({
    id: 'conexus-web-search',
    name: 'Conexus web search',
    instructions: 'Search the web for the query and answer it from what you find. Keep each fact next to the source it came from.',
    model,
    tools: { google_search: providerTool(createGoogleGenerativeAI({}).tools.googleSearch({})) },
  })
  return createTool({
    id: 'web_search',
    description: WEB_SEARCH_DESCRIPTION,
    inputSchema: z.strictObject({ query: z.string().min(1) }),
    execute: failing('web_search', async ({ query }: Readonly<{ query: string }>, context) => {
      const result = await searcher.generate(query, {
        maxSteps: 1,
        // The searcher is built once and resolves its model for each search, from the run's own request context.
        ...context?.requestContext ? { requestContext: context.requestContext } : {},
        ...context?.abortSignal ? { abortSignal: context.abortSignal } : {},
      })
      return {
        text: result.text,
        sources: result.sources.flatMap(({ payload }) => payload.url ? [{ title: payload.title, url: payload.url }] : []),
      }
    }),
  })
}

/**
 * The `web_search` of each model the Hub builds, by the provider id it reports. Every one is an
 * AI SDK model, which names its provider `<family>.<api>`, and `webSearchTool` accepts only the bare
 * family or a `family/model` router string (`normalizeWebSearchProvider` in `@mastra/core`), so it
 * throws `WEB_SEARCH_UNSUPPORTED_PROVIDER` on all of these. Each family's own provider tool from
 * its `@ai-sdk/*` package is what Mastra Code gives the same models
 * (`mastracode/sdk/src/agents/tools.ts`) and what `webSearchTool` itself resolves to. Google's takes
 * the search-only agent. Whether each subscription backend accepts its tool is proven only by a
 * live run.
 */
const PROVIDER_WEB_SEARCH: Readonly<Record<string, (model: MastraModelConfig, searchOnly: () => ToolsInput[string]) => ToolsInput[string]>> = Object.freeze({
  'openai.responses': () => providerTool(createOpenAI({}).tools.webSearch()),
  'anthropic.messages': () => providerTool(createAnthropic({}).tools.webSearch_20250305()),
  'google.generative-ai': (_model, searchOnly) => searchOnly(),
})

/** The run's `web_search` tool, or none when its model has no provider search in Mastra (spec 0002 AC-11, Tool contract). */
const webSearchFor = async (
  model: BuilderControllerDeps['model'],
  searchOnly: () => ToolsInput[string],
  ctx: { requestContext: RequestContext },
): Promise<ToolsInput> => {
  const resolved = typeof model === 'function' ? await model(ctx) : model
  const providerId = resolveModelProviderId(resolved)
  const providerSearch = providerId !== undefined && Object.hasOwn(PROVIDER_WEB_SEARCH, providerId) ? PROVIDER_WEB_SEARCH[providerId] : undefined
  if (providerSearch) return { web_search: providerSearch(resolved, searchOnly) }
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

/** What the Hub proves about a run's checkout on the agent's behalf: the check, and one operation run when the Prévia's runner is there. */
export type RunTools = Readonly<{ check: () => Promise<AgentReport>; runOperation?: RunOperation | undefined; gate?: CandidateGate | undefined }>

/**
 * The run's finish gate as Mastra's own completion check (`isTaskComplete`): when the model stops on
 * its own, one check of the checkout runs. A red check of the app's code goes back to the model as
 * the check's feedback in the same turn. A Conexus fault scores complete, so the agent never sees
 * it; the run settles it. The scorer never throws, since Mastra counts a throw as "keep working".
 */
const gateScorer = (gate: CandidateGate) => createScorer({ id: 'conexus-check', name: 'Verificação do Conexus', description: 'The run is done only when its candidate passes the Conexus check.' })
  .preprocess(async () => ({ feedback: await gate.finish() }))
  .generateScore(({ results }) => (results.preprocessStepResult.feedback === null ? 1 : 0))
  .generateReason(({ results }) => results.preprocessStepResult.feedback ?? undefined)

const gateOptions = (gate: CandidateGate | undefined) => gate ? {
  // Mastra's deadline scores a slow check as red and sends that to the model, so it sits past the
  // check's own timeout, which ends first and is labelled a Conexus fault. It stays under the turn's
  // 10-minute silence watchdog (TURN_SILENCE_MS in run/turn.ts), which a check emits nothing to.
  isTaskComplete: { scorers: [gateScorer(gate)], strategy: 'all' as const, timeout: CHECK_COMMAND_TIMEOUT_MS + 120_000 },
  // Past the budget the check's feedback is still written for the person to see, and the loop stops
  // instead of going back to the model.
  onIterationComplete: () => (gate.gaveUp() ? { continue: false } : undefined),
} : {}

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
  /** The library documentation tools (Context7); absent when the caller offers none. */
  docsTools?: DocsTools
  /** Absolute path to a folder of agent skills, one subfolder per skill. Defaults to the Hub's own `builder-skills/`. */
  skillsPath?: string
  /** Overrides how long one model call may run; only for tests. */
  modelStepTimeoutMs?: number
  /** Overrides the wait before each retry of a transient model failure: tests, and `CONEXUS_BUILDER_MODEL_RETRY_DELAY_MS` when set. */
  modelRetryDelayMs?: (retryCount: number) => number
  id?: string
}>

/**
 * Builds the Builder's `AgentController`: `createCodingAgent` with the Conexus prompt and the tools
 * the Hub adds (`connector_fetch`, `conexus_check` and `conexus_run_operation` for a run, the guarded `web_fetch`,
 * the `context7_*` documentation tools when `docsTools` is given, and `web_search` when the run's model has a provider search in Mastra), and the one `build`
 * mode, which sets no `availableTools` allowlist so every tool Mastra registers, `recall` included,
 * reaches the model. `submit_plan` is Mastra's own tool, wrapped to take only `.conexus/plan.md` and
 * to suspend with the plan the Hub read, so the plan is approved on its card. `ask_user` is ours, taking 1 to 4
 * questions in one card on the same suspend and resume primitive.
 * No Hub wiring: the caller owns sessions, routes, and where `workspace`, `model`, `storage`, and
 * `connectorFetch` come from.
 */
export const createBuilderController = (deps: BuilderControllerDeps): AgentController => {
  const skillsRoot = deps.skillsPath ?? defaultBuilderSkillsRoot()
  // The `tools` function below runs for every agent call, so the searcher is built once, when the first Google model asks for it.
  let googleSearch: ToolsInput[string] | undefined
  const searchOnly = (): ToolsInput[string] => (googleSearch ??= searchOnlyWebSearch(deps.model))

  const agent = createCodingAgent({
    id: 'conexus-builder',
    name: 'Conexus Builder',
    model: deps.model,
    instructions: conexusInstructions(),
    tools: async (ctx: { requestContext: RequestContext }): Promise<ToolsInput> => ({
      ...(deps.connectorFetch ? await deps.connectorFetch(ctx) : {}),
      ...runToolsInput(deps.runTools?.(ctx)),
      ...(await webSearchFor(deps.model, searchOnly, ctx)),
      ...(deps.docsTools ? await deps.docsTools.tools() : {}),
      web_fetch: guardedWebFetchTool,
    }),
    skills: [skillsRoot],
    // The default catalog names each skill by its path on the Hub host, which the workspace tools (E2B) cannot read. Name it by skill instead; `skill` and `skill_read` resolve that name.
    inputProcessors: [new SkillsProcessor({ skills: resolveAgentSkills([skillsRoot]), formatLocation: (skill) => skill.name })],
    ...(deps.memory ? { memory: deps.memory } : {}),
    workspace: undefined,
    errorProcessors: builderErrorProcessors(deps.modelRetryDelayMs),
    maxProcessorRetries: BUILDER_MAX_PROCESSOR_RETRIES,
    defaultOptions: (ctx: { requestContext: RequestContext }) => ({
      toolCallConcurrency: TOOL_CALL_CONCURRENCY,
      modelSettings: { maxOutputTokens: BUILDER_MAX_OUTPUT_TOKENS, timeout: { stepMs: deps.modelStepTimeoutMs ?? BUILDER_MODEL_STEP_TIMEOUT_MS } },
      ...gateOptions(deps.runTools?.(ctx)?.gate),
    }),
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
