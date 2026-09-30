import type { MastraModelConfig } from '@mastra/core/llm'
import type { RequestContext } from '@mastra/core/request-context'
import { readSessionModelId } from './harness/request-context.js'
import type { HeldModelAccount, ModelAccountStore } from './model-account-store.js'

/** How a model call pays for and reaches one provider's models: the `model.model_account` provider, and a call built on that row. */
export type ModelRoute = Readonly<{
  accountProvider: string
  take(account: HeldModelAccount): Readonly<{ modelProvider: string; model(modelName: string): Promise<MastraModelConfig> }>
}>

/** The installation's two default models: the Builder's, for a conversation with none of its own, and the memory's. */
export type ModelRole = 'build' | 'memory'

/** Where a run's request context carries its id, and the account that pays for its calls (run-runtime.ts sets both on every turn). */
export const RUN_ID_KEY = 'conexusBuilderRunId'
export const RUN_ACCOUNT_ID_KEY = 'conexusBuilderAccountId'
/** Where a turn's request context carries its conversation, whose workspace a new session resolves. */
export const CONVERSATION_ID_KEY = 'conexusBuilderConversationId'

const providerOfModel = (modelId: string): string => modelId.slice(0, Math.max(0, modelId.indexOf('/')))

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
  record(builderRunId: string, modelAccountId: string): Promise<void>
}>) => {
  const accountFor = async (accountId: string, modelId: string | null) => {
    const route = modelId ? routes[providerOfModel(modelId)] : undefined
    const account = route ? await modelAccounts.usable(accountId, route.accountProvider) : null
    if (!modelId || !route || !account) throw new Error('BUILDER_MODEL_NOT_SELECTED')
    return { route, account, modelId }
  }
  const call = async (requestContext: RequestContext, modelId: string | null): Promise<MastraModelConfig> => {
    const runId = requestContext.getRaw(RUN_ID_KEY)
    const payer = requestContext.getRaw(RUN_ACCOUNT_ID_KEY)
    if (typeof runId !== 'string' || typeof payer !== 'string') throw new Error('BUILDER_MODEL_NOT_SELECTED')
    const { route, account, modelId: selected } = await accountFor(payer, modelId)
    await record(runId, account.modelAccountId)
    const held = route.take(account)
    return held.model(selected.slice(held.modelProvider.length + 1))
  }
  return Object.freeze({
    /** Refuses a run before it starts when the model it starts on, or the memory's, has no usable account. */
    check: async ({ accountId, projectId, conversationId }: Readonly<{ accountId: string; projectId: string; conversationId: string }>): Promise<void> => {
      await accountFor(accountId, await conversationModel(projectId, conversationId) ?? await readDefault('build'))
      await accountFor(accountId, await readDefault('memory'))
    },
    /** The Builder's model for a call; the controller's `model` resolver. */
    resolve: ({ requestContext }: Readonly<{ requestContext: RequestContext }>): Promise<MastraModelConfig> =>
      call(requestContext, readSessionModelId(requestContext) ?? null),
    /** The model both observational-memory roles call. */
    resolveMemory: async (requestContext: RequestContext): Promise<MastraModelConfig> => call(requestContext, await readDefault('memory')),
  })
}
