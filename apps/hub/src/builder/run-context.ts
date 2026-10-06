import type { RequestContext } from '@mastra/core/request-context'
import { z } from 'zod'
import { AccountId, BuilderRunId, ConversationId } from '@conexus/contract'
import { Failure } from '../platform/failure.js'

/** What a run's turn carries in Mastra's request context: its id, the account that pays for its calls, and its conversation. */
export type RunContext = Readonly<{ builderRunId: BuilderRunId; accountId: AccountId; conversationId: ConversationId }>

const KEYS = { builderRunId: 'conexusBuilderRunId', accountId: 'conexusBuilderAccountId', conversationId: 'conexusBuilderConversationId' } as const
const Carried = z.object({ builderRunId: BuilderRunId, accountId: AccountId, conversationId: ConversationId })

/** The only writer of the three keys: run/run.ts binds them on every turn it runs. */
export const bindRunContext = (requestContext: RequestContext, context: RunContext): void => {
  requestContext.setRaw(KEYS.builderRunId, context.builderRunId)
  requestContext.setRaw(KEYS.accountId, context.accountId)
  requestContext.setRaw(KEYS.conversationId, context.conversationId)
}

/**
 * The run a request belongs to, or null for a request that no run made (none of the keys is set).
 * Only the run binds these keys, so a context with some of them, or with a value that is no id, is a
 * broken invariant and never "no model".
 */
export const readRunContext = (requestContext: RequestContext): RunContext | null => {
  const carried = {
    builderRunId: requestContext.getRaw(KEYS.builderRunId),
    accountId: requestContext.getRaw(KEYS.accountId),
    conversationId: requestContext.getRaw(KEYS.conversationId),
  }
  if (Object.values(carried).every((value) => value === undefined)) return null
  const parsed = Carried.safeParse(carried)
  if (!parsed.success) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'RUN_CONTEXT_INVALID' } })
  return parsed.data
}

/** The run behind a model call, which only a run makes. */
export const requireRunContext = (requestContext: RequestContext): RunContext => {
  const context = readRunContext(requestContext)
  if (!context) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'RUN_CONTEXT_MISSING' } })
  return context
}
