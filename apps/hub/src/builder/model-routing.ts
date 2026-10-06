import type { ThinkingLevelSetting } from '@mastra/code-sdk/thinking'
import { type GatewayLanguageModel, type MastraModelConfig, parseModelString } from '@mastra/core/llm'
import type { RequestContext } from '@mastra/core/request-context'
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai'
import { readSessionModelId, readSessionThinkingLevel } from './harness/request-context.js'
import type { HeldAccount, ModelAccounts, ModelRole } from './model-account/accounts.js'
import { isRouterPrefix, type MODEL_PROVIDERS, type Lawful } from './model-account/providers.js'
import { Failure } from '../platform/failure.js'
import { requireRunContext } from './run-context.js'
import type { AccountId, BuilderRunId, ConversationId, ModelAccountId, ModelAccountProvider, ProjectId } from '../../../../packages/contract/dist/index.js'

type Taken = Readonly<{ modelProvider: string; model(modelName: string, thinkingLevel?: ThinkingLevelSetting): Promise<MastraModelConfig> }>

/**
 * How a model call pays for and reaches one provider's models: the account provider whose rows pay,
 * and the call built on the row a run holds. A Builder call carries the conversation's thinking
 * level, which the route hands to its provider's own Mastra option; a memory call carries none.
 */
export type ModelRoute<P extends ModelAccountProvider = ModelAccountProvider> = Readonly<{
  accountProvider: P
  take(held: HeldAccount<Extract<Lawful, { provider: P }>>): Taken
}>

export type ModelRoutes = { readonly [P in ModelAccountProvider as (typeof MODEL_PROVIDERS)[P]['routerPrefix']]: ModelRoute<P> }

/**
 * A model Mastra's models.dev gateway built, under the Mastra Code middleware its route adds, in
 * order. Mastra Code gives no thinking middleware for a model or level without thinking.
 */
export const wrapGatewayModel = (model: GatewayLanguageModel, middleware: readonly (LanguageModelMiddleware | undefined)[]): MastraModelConfig => {
  if (model.specificationVersion !== 'v3') throw new Failure('BUILDER_GATEWAY_MODEL_REFUSED')
  const applied = middleware.filter((each) => each !== undefined)
  return applied.length ? wrapLanguageModel({ model, middleware: applied }) : model
}

function takeFrom(routes: ModelRoutes, held: HeldAccount): Taken {
  const { credential } = held
  switch (credential.provider) {
    case 'anthropic': return routes.anthropic.take({ ...held, credential })
    case 'openai-codex': return routes.openai.take({ ...held, credential })
    case 'google-ai-pro': return routes['google-ai-pro'].take({ ...held, credential })
  }
}

function routeOf(routes: ModelRoutes, modelId: string): ModelRoutes[keyof ModelRoutes] | undefined {
  const prefix = parseModelString(modelId).provider ?? ''
  return isRouterPrefix(prefix) ? routes[prefix] : undefined
}

/**
 * Which model a call uses and which account pays for it (spec 0002, Value sourcing). A Builder call
 * uses the model in the conversation's Mastra session, which the person can change between
 * messages (AC-12); a memory call uses the installation's memory default and nothing else (AC-16).
 * The account is looked up when the model is called: the caller's own row for that model's
 * provider, else the one shared with everyone. A model whose provider has no route, or no usable
 * account, fails with `BUILDER_MODEL_NOT_SELECTED`, which reads as "connect a model". A run records
 * every account that paid for one of its calls.
 */
export const createModelRouting = ({ routes, modelAccounts, conversationModel, readDefault, record }: Readonly<{
  routes: ModelRoutes
  modelAccounts: Pick<ModelAccounts, 'usable' | 'select'>
  /** The model in the conversation's Mastra session, or null when it has none yet. */
  conversationModel(projectId: ProjectId, conversationId: ConversationId): Promise<string | null>
  readDefault(accountId: AccountId, role: ModelRole): Promise<string | null>
  /** Records the account that paid for one call of the run; the run id and the paying account are what the run's request context carried. */
  record(builderRunId: BuilderRunId, accountId: AccountId, modelAccountId: ModelAccountId): Promise<void>
}>) => {
  const check = async (accountId: AccountId, modelId: string | null): Promise<void> => {
    const route = modelId ? routeOf(routes, modelId) : undefined
    if (!route || !await modelAccounts.usable(accountId, route.accountProvider)) throw new Failure('BUILDER_MODEL_NOT_SELECTED')
  }
  const call = async (requestContext: RequestContext, modelId: string | null, thinkingLevel?: ThinkingLevelSetting): Promise<MastraModelConfig> => {
    const run = requireRunContext(requestContext)
    const route = modelId ? routeOf(routes, modelId) : undefined
    const held = route ? await modelAccounts.select(run, route.accountProvider) : null
    if (!modelId || !held) throw new Failure('BUILDER_MODEL_NOT_SELECTED')
    await record(run.builderRunId, run.accountId, held.modelAccountId)
    return takeFrom(routes, held).model(parseModelString(modelId).modelId, thinkingLevel)
  }
  return Object.freeze({
    /** Refuses a run before it starts when the model it starts on, or the memory's, has no usable account. */
    check: async ({ accountId, projectId, conversationId }: Readonly<{ accountId: AccountId; projectId: ProjectId; conversationId: ConversationId }>): Promise<void> => {
      await check(accountId, await conversationModel(projectId, conversationId) ?? await readDefault(accountId, 'build'))
      await check(accountId, await readDefault(accountId, 'memory'))
    },
    /** The Builder's model for a call; the controller's `model` resolver. */
    resolve: ({ requestContext }: Readonly<{ requestContext: RequestContext }>): Promise<MastraModelConfig> =>
      call(requestContext, readSessionModelId(requestContext) ?? null, readSessionThinkingLevel(requestContext)),
    /** The model both observational-memory roles call. */
    resolveMemory: async (requestContext: RequestContext): Promise<MastraModelConfig> =>
      call(requestContext, await readDefault(requireRunContext(requestContext).accountId, 'memory')),
  })
}
