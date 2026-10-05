import type { ThinkingLevelSetting } from '@mastra/code-sdk/thinking'
import { type GatewayLanguageModel, type MastraModelConfig, parseModelString } from '@mastra/core/llm'
import type { RequestContext } from '@mastra/core/request-context'
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai'
import { readSessionModelId, readSessionThinkingLevel } from './harness/request-context.js'
import type { HeldModelAccount, ModelAccountStore } from './model-account-store.js'
import { Failure } from '../platform/failure.js'

/**
 * How a model call pays for and reaches one provider's models: the `model.model_account` provider,
 * and a call built on that row. A Builder call carries the conversation's thinking level, which the
 * route hands to its provider's own Mastra option; a memory call carries none.
 */
export type ModelRoute = Readonly<{
  accountProvider: string
  take(account: HeldModelAccount): Readonly<{ modelProvider: string; model(modelName: string, thinkingLevel?: ThinkingLevelSetting): Promise<MastraModelConfig> }>
}>

/**
 * A model Mastra's models.dev gateway built, under the Mastra Code middleware its route adds, in
 * order. Mastra Code gives no thinking middleware for a model or level without thinking.
 */
export const wrapGatewayModel = (model: GatewayLanguageModel, middleware: readonly (LanguageModelMiddleware | undefined)[]): MastraModelConfig => {
  if (model.specificationVersion !== 'v3') throw new Failure('BUILDER_GATEWAY_MODEL_REFUSED')
  const applied = middleware.filter((each) => each !== undefined)
  return applied.length ? wrapLanguageModel({ model, middleware: applied }) : model
}

/** The installation's two default models: the Builder's, for a conversation with none of its own, and the memory's. */
export type ModelRole = 'build' | 'memory'

/** Where a run's request context carries its id, and the account that pays for its calls (run/run.ts sets both on every turn). */
export const RUN_ID_KEY = 'conexusBuilderRunId'
export const RUN_ACCOUNT_ID_KEY = 'conexusBuilderAccountId'
/** Where a turn's request context carries its conversation, whose workspace a new session resolves. */
export const CONVERSATION_ID_KEY = 'conexusBuilderConversationId'

const providerOfModel = (modelId: string): string => parseModelString(modelId).provider ?? ''

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
  /** By the provider in a model id (`<provider>/<model>`). */
  routes: Readonly<Record<string, ModelRoute>>
  modelAccounts: Pick<ModelAccountStore, 'usable'>
  /** The model in the conversation's Mastra session, or null when it has none yet. */
  conversationModel(projectId: string, conversationId: string): Promise<string | null>
  readDefault(role: ModelRole): Promise<string | null>
  /** Records the account that paid for one call of the run; the run id and the paying account are what the run's request context carried. */
  record(builderRunId: string, accountId: string, modelAccountId: string): Promise<void>
}>) => {
  const accountFor = async (accountId: string, modelId: string | null) => {
    const route = modelId ? routes[providerOfModel(modelId)] : undefined
    const account = route ? await modelAccounts.usable(accountId, route.accountProvider) : null
    if (!modelId || !route || !account) throw new Failure('BUILDER_MODEL_NOT_SELECTED')
    return { route, account, modelId }
  }
  const call = async (requestContext: RequestContext, modelId: string | null, thinkingLevel?: ThinkingLevelSetting): Promise<MastraModelConfig> => {
    const runId = requestContext.getRaw(RUN_ID_KEY)
    const payer = requestContext.getRaw(RUN_ACCOUNT_ID_KEY)
    if (typeof runId !== 'string' || typeof payer !== 'string') throw new Failure('BUILDER_MODEL_NOT_SELECTED')
    const { route, account, modelId: selected } = await accountFor(payer, modelId)
    await record(runId, payer, account.modelAccountId)
    const held = route.take(account)
    return held.model(parseModelString(selected).modelId, thinkingLevel)
  }
  return Object.freeze({
    /** Refuses a run before it starts when the model it starts on, or the memory's, has no usable account. */
    check: async ({ accountId, projectId, conversationId }: Readonly<{ accountId: string; projectId: string; conversationId: string }>): Promise<void> => {
      await accountFor(accountId, await conversationModel(projectId, conversationId) ?? await readDefault('build'))
      await accountFor(accountId, await readDefault('memory'))
    },
    /** The Builder's model for a call; the controller's `model` resolver. */
    resolve: ({ requestContext }: Readonly<{ requestContext: RequestContext }>): Promise<MastraModelConfig> =>
      call(requestContext, readSessionModelId(requestContext) ?? null, readSessionThinkingLevel(requestContext)),
    /** The model both observational-memory roles call. */
    resolveMemory: async (requestContext: RequestContext): Promise<MastraModelConfig> => call(requestContext, await readDefault('memory')),
  })
}
