import type { MemoryStorage } from '@mastra/core/storage'

/**
 * A Project's conversations are Mastra threads under one resource per Project, shared by every
 * member (spec 0002, AC-18). The thread holds the model selection in its own settings, which only
 * the Mastra session reads and writes. The browser lists and opens them over the native session
 * routes; the Hub deletes them. Titles come from Mastra Memory's `generateTitle` (`memory.ts`).
 */
export const projectResourceId = (projectId: string): string => `project:${projectId}`

export type Conversations = ReturnType<typeof createConversations>

export const createConversations = (memory: () => Promise<MemoryStorage>) => {
  return Object.freeze({
    /** Whose thread the conversation id is: this Project's, another resource's, or nobody's yet. */
    ownerOf: async (projectId: string, conversationId: string): Promise<'PROJECT' | 'OTHER' | 'NONE'> => {
      const thread = await (await memory()).getThreadById({ threadId: conversationId })
      if (!thread) return 'NONE'
      return thread.resourceId === projectResourceId(projectId) ? 'PROJECT' : 'OTHER'
    },

    /** Deletes every conversation of a Project, with their messages, and answers their ids; repeating it converges. */
    deleteAll: async (projectId: string): Promise<readonly string[]> => {
      const store = await memory()
      const { threads } = await store.listThreads({ filter: { resourceId: projectResourceId(projectId) }, perPage: false })
      for (const thread of threads) await store.deleteThread({ threadId: thread.id })
      return threads.map((thread) => thread.id)
    },
  })
}
