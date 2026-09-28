import type { MastraModelConfig } from '@mastra/core/llm'
import type { RequestContext } from '@mastra/core/request-context'
import { BUILDER_MODES, readModeId, type BuilderModeId } from './harness/index.js'
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
 * run that starts in Planejar goes on in Construir once its plan is approved (AC-4), so it holds an
 * account for each mode it can reach, and a model whose provider has no route, or no usable
 * account, refuses the run before it starts. The account recorded on the run is the start mode's.
 */
export const createModelRouting = ({ routes, modelAccounts, modelOf, readDefault }: Readonly<{
  /** By the provider in a model id (`<provider>/<model>`). */
  routes: Readonly<Record<string, ModelRoute>>
  modelAccounts: Pick<ModelAccountStore, 'usable'>
  modelOf(projectId: string, conversationId: string, mode: BuilderModeId): Promise<string | null>
  readDefault(role: Role): Promise<string | null>
}>) => {
  /** Each held run's models, by model provider. */
  const runModels = new Map<string, ReadonlyMap<string, RunModel>>()
  return Object.freeze({
    hold: async ({ builderRunId, accountId, projectId, conversationId, mode }: Readonly<{
      builderRunId: string; accountId: string; projectId: string; conversationId: string; mode: 'BUILD' | 'PLAN'
    }>): Promise<Readonly<{ modelAccountId: string; release(): void }>> => {
      const held = new Map<string, Readonly<{ modelAccountId: string; run: RunModel }>>()
      const holdFor = async (modeId: BuilderModeId): Promise<string> => {
        const modelId = await modelOf(projectId, conversationId, modeId) ?? await readDefault(ROLE_OF_MODE[modeId])
        const route = modelId ? routes[providerOfModel(modelId)] : undefined
        if (!route) throw new Error('BUILDER_MODEL_NOT_SELECTED')
        const known = held.get(route.accountProvider)
        if (known) return known.modelAccountId
        const account = await modelAccounts.usable(accountId, route.accountProvider)
        if (!account) throw new Error('BUILDER_MODEL_NOT_SELECTED')
        held.set(route.accountProvider, { modelAccountId: account.modelAccountId, run: route.take(account) })
        return account.modelAccountId
      }
      const startMode: BuilderModeId = mode === 'BUILD' ? 'build' : 'plan'
      const startAccountId = await holdFor(startMode)
      const next = BUILDER_MODES[startMode].transitionsTo
      if (next) await holdFor(next)
      runModels.set(builderRunId, new Map([...held.values()].map(({ run }) => [run.modelProvider, run])))
      return Object.freeze({ modelAccountId: startAccountId, release: () => { runModels.delete(builderRunId) } })
    },
    /** The model a turn of a held run calls; the controller's `model` resolver. */
    resolve: async ({ requestContext }: Readonly<{ requestContext: RequestContext }>): Promise<MastraModelConfig> => {
      const runId = requestContext.getRaw(RUN_ID_KEY)
      const controller = requestContext.get('controller') as Readonly<{ session?: Readonly<{ modelId?: unknown }> }> | undefined
      const selected = typeof controller?.session?.modelId === 'string' && controller.session.modelId ? controller.session.modelId : null
      const modelId = selected ?? await readDefault(ROLE_OF_MODE[readModeId(requestContext) ?? 'plan'])
      const run = typeof runId === 'string' && modelId ? runModels.get(runId)?.get(providerOfModel(modelId)) : undefined
      if (!run || !modelId) throw new Error('BUILDER_MODEL_NOT_SELECTED')
      return run.model(modelId.slice(run.modelProvider.length + 1))
    },
  })
}
