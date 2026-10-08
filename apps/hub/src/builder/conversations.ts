import type { MemoryStorage } from '@mastra/core/storage'
import { ConversationId, type ProjectId } from '@conexus/contract'

/**
 * A Project's conversations are Mastra threads under one resource per Project, shared by every
 * member (spec 0002, AC-18). The thread holds the model selection in its own settings, which only
 * the Mastra session reads and writes. The browser lists and opens them over the native session
 * routes; the Hub deletes them. Titles come from Mastra Memory's `generateTitle` (`memory.ts`).
 */
export const projectResourceId = (projectId: ProjectId): string => `project:${projectId}`

export type Conversations = ReturnType<typeof createConversations>

export function createConversations(memory: () => Promise<MemoryStorage>) {
  return Object.freeze({
    /** Whose thread the conversation id is: this Project's, another resource's, or nobody's yet. */
    ownerOf: async (projectId: ProjectId, conversationId: ConversationId): Promise<'PROJECT' | 'OTHER' | 'NONE'> => {
      const thread = await (await memory()).getThreadById({ threadId: conversationId })
      if (!thread) return 'NONE'
      return thread.resourceId === projectResourceId(projectId) ? 'PROJECT' : 'OTHER'
    },

    deleteAll: async ({ projectId, beforeDelete }: Readonly<{ projectId: ProjectId; beforeDelete(conversationIds: readonly ConversationId[]): Promise<void> }>): Promise<void> => {
      const store = await memory()
      const { threads } = await store.listThreads({ filter: { resourceId: projectResourceId(projectId) }, perPage: false })
      const conversationIds = threads.flatMap((thread) => {
        const id = ConversationId.safeParse(thread.id)
        return id.success ? [id.data] : []
      })
      await beforeDelete(conversationIds)
      for (const thread of threads) await store.deleteThread({ threadId: thread.id })
    },
  })
}
