import type { MemoryStorage } from '@mastra/core/storage'
import { ConversationId, type ProjectId } from '../../../../packages/contract/dist/index.js'

/**
 * A Project's conversations are Mastra threads under one resource per Project, shared by every
 * member (spec 0002, AC-18). The thread holds the model selection in its own settings, which only
 * the Mastra session reads and writes. The browser lists and opens them over the native session
 * routes; the Hub deletes them. Titles come from Mastra Memory's `generateTitle` (`memory.ts`).
 */
export const projectResourceId = (projectId: ProjectId): string => `project:${projectId}`

export type Conversations = ReturnType<typeof createConversations>

export const createConversations = (memory: () => Promise<MemoryStorage>) => {
  return Object.freeze({
    /** Whose thread the conversation id is: this Project's, another resource's, or nobody's yet. */
    ownerOf: async (projectId: ProjectId, conversationId: ConversationId): Promise<'PROJECT' | 'OTHER' | 'NONE'> => {
      const thread = await (await memory()).getThreadById({ threadId: conversationId })
      if (!thread) return 'NONE'
      return thread.resourceId === projectResourceId(projectId) ? 'PROJECT' : 'OTHER'
    },

    /** Deletes every conversation of a Project, with their messages, and answers their ids; repeating it converges. */
    deleteAll: async (projectId: ProjectId): Promise<readonly ConversationId[]> => {
      const store = await memory()
      const { threads } = await store.listThreads({ filter: { resourceId: projectResourceId(projectId) }, perPage: false })
      for (const thread of threads) await store.deleteThread({ threadId: thread.id })
      // A thread no conversation opened holds no session, so only conversation ids are answered.
      return threads.flatMap((thread) => {
        const id = ConversationId.safeParse(thread.id)
        return id.success ? [id.data] : []
      })
    },
  })
}
