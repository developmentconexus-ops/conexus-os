import type { MastraModelConfig } from '@mastra/core/llm'
import type { RequestContext } from '@mastra/core/request-context'
import { readModeId, type BuilderModeId } from './harness/index.js'
import type { HeldModelAccount, ModelAccountStore } from './model-account-store.js'

/** How a model call pays for and reaches one provider's models: the `model.model_account` provider, and a call built on that row. */
export type ModelRoute = Readonly<{
  accountProvider: string
  take(account: HeldModelAccount): Readonly<{ modelProvider: string; model(modelName: string): Promise<MastraModelConfig> }>
}>

type Role = 'plan' | 'build'

/** Where a run's request context carries its id, and the account that pays for its calls (run-runtime.ts sets both on every turn). */
export const RUN_ID_KEY = 'conexusBuilderRunId'
export const RUN_ACCOUNT_ID_KEY = 'conexusBuilderAccountId'
const ROLE_OF_MODE: Readonly<Record<BuilderModeId, Role>> = Object.freeze({ plan: 'plan', build: 'build' })

const providerOfModel = (modelId: string): string => modelId.slice(0, Math.max(0, modelId.indexOf('/')))

/**
 * Which model a call uses and which account pays for it (spec 0002, Value sourcing). The model is
 * the session's current one, which the person can change at any time (AC-23), else the
 * installation's default for the mode's role. The account is looked up when the model is called:
 * the caller's own row for that model's provider, else the one shared with everyone. A model whose
 * provider has no route, or no usable account, fails with `BUILDER_MODEL_NOT_SELECTED`, which
 * reads as "connect a model". A run records every account that paid for one of its calls.
 */
export const createModelRouting = ({ routes, modelAccounts, modelOf, readDefault, record }: Readonly<{
  /** By the provider in a model id (`<provider>/<model>`). */
  routes: Readonly<Record<string, ModelRoute>>
  modelAccounts: Pick<ModelAccountStore, 'usable'>
  modelOf(projectId: string, conversationId: string, mode: BuilderModeId): Promise<string | null>
  readDefault(role: Role): Promise<string | null>
  record(builderRunId: string, modelAccountId: string): Promise<void>
}>) => {
  const accountFor = async (accountId: string, modelId: string | null) => {
    const route = modelId ? routes[providerOfModel(modelId)] : undefined
    const account = route ? await modelAccounts.usable(accountId, route.accountProvider) : null
    if (!modelId || !route || !account) throw new Error('BUILDER_MODEL_NOT_SELECTED')
    return { route, account, modelId }
  }
  return Object.freeze({
    /** Refuses a run before it starts when the one model it starts on has no usable account. */
    check: async ({ accountId, projectId, conversationId, mode }: Readonly<{
      accountId: string; projectId: string; conversationId: string; mode: 'BUILD' | 'PLAN'
    }>): Promise<void> => {
      const startMode: BuilderModeId = mode === 'BUILD' ? 'build' : 'plan'
      await accountFor(accountId, await modelOf(projectId, conversationId, startMode) ?? await readDefault(ROLE_OF_MODE[startMode]))
    },
    /**
     * The model a call uses; the controller's `model` resolver. `chosen` is a model an
     * observational-memory role was set to, in place of the conversation's own.
     */
    resolve: async ({ requestContext }: Readonly<{ requestContext: RequestContext }>, chosen: string | null = null): Promise<MastraModelConfig> => {
      const runId = requestContext.getRaw(RUN_ID_KEY)
      const payer = requestContext.getRaw(RUN_ACCOUNT_ID_KEY)
      const controller = requestContext.get('controller') as Readonly<{ session?: Readonly<{ modelId?: unknown }> }> | undefined
      const selected = chosen ?? (typeof controller?.session?.modelId === 'string' && controller.session.modelId ? controller.session.modelId : null)
      if (typeof runId !== 'string' || typeof payer !== 'string') throw new Error('BUILDER_MODEL_NOT_SELECTED')
      const { route, account, modelId } = await accountFor(payer, selected ?? await readDefault(ROLE_OF_MODE[readModeId(requestContext) ?? 'plan']))
      await record(runId, account.modelAccountId)
      const held = route.take(account)
      return held.model(modelId.slice(held.modelProvider.length + 1))
    },
  })
}
