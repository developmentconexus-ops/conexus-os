import type { MastraModelConfig } from '@mastra/core/llm'
import type { RequestContext } from '@mastra/core/request-context'
import type { AccountId, BuilderRunId, ConversationId, ModelAccountId, ModelId, ProjectId, ThinkingLevel } from '@conexus/contract'
import { admitRun, type RunOwner } from '../identity-access/admission.js'
import type { Database } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import type { ModelAccountModule, OpenRun } from '../model-account/module.js'
import { readSessionModelId, readSessionThinkingLevel } from './harness/request-context.js'
import { requireRunContext } from './run-context.js'

function openRunFor({ data, owner, run }: Readonly<{ data: Database; owner: RunOwner; run: ReturnType<typeof requireRunContext> }>): OpenRun {
  return async (work) => {
    try {
      return await data.transaction(run.accountId, async (gate) => work(await admitRun(gate, run.builderRunId, owner)))
    } catch (error) {
      if (error instanceof Failure) return { ok: false, error: { code: error.id } }
      throw error
    }
  }
}

export function createBuilderModelRouting({ models, data, owner, conversationModel, record }: Readonly<{
  models: ModelAccountModule
  data: Database
  owner: RunOwner
  conversationModel(accountId: AccountId, projectId: ProjectId, conversationId: ConversationId): Promise<ModelId | null>
  record(builderRunId: BuilderRunId, accountId: AccountId, modelAccountId: ModelAccountId): Promise<void>
}>) {
  const call = async (requestContext: RequestContext, modelId: ModelId | null, thinkingLevel: ThinkingLevel | null): Promise<MastraModelConfig> => {
    if (!modelId) throw new Failure('BUILDER_MODEL_NOT_SELECTED')
    const run = requireRunContext(requestContext)
    const selected = await models.modelFor(openRunFor({ data, owner, run }), { modelId, thinkingLevel })
    if (!selected.ok) throw new Failure(selected.error.code)
    await record(run.builderRunId, run.accountId, selected.result.modelAccountId)
    return selected.result.model
  }
  return Object.freeze({
    check: async ({ accountId, projectId, conversationId }: Readonly<{ accountId: AccountId; projectId: ProjectId; conversationId: ConversationId }>): Promise<void> => {
      const build = await conversationModel(accountId, projectId, conversationId) ?? await models.readDefault(accountId, 'build')
      const memory = await models.readDefault(accountId, 'memory')
      if (!build || !memory) throw new Failure('BUILDER_MODEL_NOT_SELECTED')
      const checked = await models.checkBeforeRun(accountId, [build, memory])
      if (!checked.ok) throw new Failure(checked.error.code)
    },
    resolve: ({ requestContext }: Readonly<{ requestContext: RequestContext }>): Promise<MastraModelConfig> =>
      call(requestContext, readSessionModelId(requestContext) ?? null, readSessionThinkingLevel(requestContext)),
    resolveMemory: async (requestContext: RequestContext): Promise<MastraModelConfig> =>
      call(requestContext, await models.readDefault(requireRunContext(requestContext).accountId, 'memory'), null),
  })
}
