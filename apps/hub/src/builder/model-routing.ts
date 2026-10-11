import type { MastraModelConfig } from '@mastra/core/llm'
import type { RequestContext } from '@mastra/core/request-context'
import type { AccountId, BuilderRunId, ConversationId, ModelAccountId, ModelId, ProjectId, ThinkingLevel } from '@conexus/contract'
import { admitRun, type RunOwner } from '../identity-access/public.js'
import type { Database } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import { parseModelId, type ModelAccountModule, type OpenRun } from '../model-account/module.js'
import { readSessionModelId, readSessionThinkingLevel } from './harness/request-context.js'
import { requireRunContext } from './run-context.js'
import { runNotAdmitted } from './run-lifecycle.js'

/** What a conversation chose for itself: nothing, a model the Hub routes, or a choice that names none. */
export type ConversationModel = Readonly<{ state: 'default' }> | Readonly<{ state: 'selected'; modelId: ModelId }> | Readonly<{ state: 'unusable' }>

export function conversationModelOf(model: Readonly<{ hasSelection(): boolean; get(): string }>): ConversationModel {
  if (!model.hasSelection()) return { state: 'default' }
  const modelId = parseModelId(model.get())
  return modelId ? { state: 'selected', modelId } : { state: 'unusable' }
}

function openRunFor({ data, owner, run }: Readonly<{ data: Database; owner: RunOwner; run: ReturnType<typeof requireRunContext> }>): OpenRun {
  return (work) => data.transaction(run.accountId, async (gate) => work(await admitRun(gate, run.builderRunId, owner).catch(runNotAdmitted)))
}

export function createBuilderModelRouting({ models, data, owner, conversationModel, record }: Readonly<{
  models: ModelAccountModule
  data: Database
  owner: RunOwner
  conversationModel(accountId: AccountId, projectId: ProjectId, conversationId: ConversationId): Promise<ConversationModel>
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
      const chosen = await conversationModel(accountId, projectId, conversationId)
      // The run would call the conversation's own choice, so the installation default cannot stand in for one that names no model.
      if (chosen.state === 'unusable') throw new Failure('BUILDER_MODEL_NOT_SELECTED')
      const build = chosen.state === 'selected' ? chosen.modelId : await models.readDefault(accountId, 'build')
      const memory = await models.readDefault(accountId, 'memory')
      if (!build || !memory) throw new Failure('BUILDER_MODEL_NOT_SELECTED')
      const checked = await models.checkBeforeRun(accountId, [build, memory])
      if (!checked.ok) throw new Failure(checked.error.code)
    },
    resolve: ({ requestContext }: Readonly<{ requestContext: RequestContext }>): Promise<MastraModelConfig> =>
      call(requestContext, readSessionModelId(requestContext) ?? null, readSessionThinkingLevel(requestContext)),
    resolveMemory: async (requestContext: RequestContext): Promise<MastraModelConfig> =>
      call(requestContext, await models.readDefault(requireRunContext(requestContext).accountId, 'memory').catch(runNotAdmitted), null),
  })
}
