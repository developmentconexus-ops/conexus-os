import type { MastraModelConfig } from '@mastra/core/llm'
import type { RequestContext } from '@mastra/core/request-context'
import { readModeId, type BuilderModeId } from './harness/index.js'
import type { HeldModelAccount, ModelAccountStore } from './model-account-store.js'

/** What a run keeps from the model account it took: which model provider it pays for, and how to call one of its models. */
type RunModel = Readonly<{ modelProvider: string; model(modelName: string): Promise<MastraModelConfig> }>

/** How a run pays for and calls the models of one provider: the `model.model_account` provider, and a call built on that row. */
export type ModelRoute = Readonly<{ accountProvider: string; take(account: HeldModelAccount): RunModel }>

type Role = 'plan' | 'build'

/** Where a run's request context carries its id (run-runtime.ts sets it on every turn). */
export const RUN_ID_KEY = 'conexusBuilderRunId'
const ROLE_OF_MODE: Readonly<Record<BuilderModeId, Role>> = Object.freeze({ plan: 'plan', build: 'build' })

const providerOfModel = (modelId: string): string => modelId.slice(0, Math.max(0, modelId.indexOf('/')))

/**
 * Which account a run pays with and which model a turn calls (spec 0002, Value sourcing). The model
 * is the conversation's selection for its mode, else the installation's default for that role; the
 * account is the caller's own row for that model's provider, else the one shared with everyone. A
 * model whose provider has no route, or no usable account, refuses the run before it starts.
 */
export const createModelRouting = ({ routes, modelAccounts, modelOf, readDefault }: Readonly<{
  /** By the provider in a model id (`<provider>/<model>`). */
  routes: Readonly<Record<string, ModelRoute>>
  modelAccounts: Pick<ModelAccountStore, 'usable'>
  modelOf(projectId: string, conversationId: string, mode: BuilderModeId): Promise<string | null>
  readDefault(role: Role): Promise<string | null>
}>) => {
  const runModels = new Map<string, RunModel>()
  return Object.freeze({
    hold: async ({ builderRunId, accountId, projectId, conversationId, mode }: Readonly<{
      builderRunId: string; accountId: string; projectId: string; conversationId: string; mode: 'BUILD' | 'PLAN'
    }>): Promise<Readonly<{ modelAccountId: string; release(): void }>> => {
      const modeId: BuilderModeId = mode === 'BUILD' ? 'build' : 'plan'
      const modelId = await modelOf(projectId, conversationId, modeId) ?? await readDefault(ROLE_OF_MODE[modeId])
      const route = modelId ? routes[providerOfModel(modelId)] : undefined
      const account = route ? await modelAccounts.usable(accountId, route.accountProvider) : null
      if (!route || !account) throw new Error('BUILDER_MODEL_NOT_SELECTED')
      runModels.set(builderRunId, route.take(account))
      return Object.freeze({ modelAccountId: account.modelAccountId, release: () => { runModels.delete(builderRunId) } })
    },
    /** The model a turn of a held run calls; the controller's `model` resolver. */
    resolve: async ({ requestContext }: Readonly<{ requestContext: RequestContext }>): Promise<MastraModelConfig> => {
      const runId = requestContext.getRaw(RUN_ID_KEY)
      const run = typeof runId === 'string' ? runModels.get(runId) : undefined
      const controller = requestContext.get('controller') as Readonly<{ session?: Readonly<{ modelId?: unknown }> }> | undefined
      const selected = typeof controller?.session?.modelId === 'string' && controller.session.modelId ? controller.session.modelId : null
      const modelId = selected ?? await readDefault(ROLE_OF_MODE[readModeId(requestContext) ?? 'plan'])
      if (!run || !modelId || providerOfModel(modelId) !== run.modelProvider) throw new Error('BUILDER_MODEL_NOT_SELECTED')
      return run.model(modelId.slice(run.modelProvider.length + 1))
    },
  })
}
