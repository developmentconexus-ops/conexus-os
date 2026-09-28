import type { MastraDBMessage } from '@mastra/core/agent'
import type { MemoryStorage } from '@mastra/core/storage'
import { DEFAULT_BUILDER_MODE, isBuilderModeId, type BuilderModeId } from './harness/index.js'

/**
 * A Project's conversations are Mastra threads under one resource per Project, shared by every
 * member (spec 0002, AC-18). The thread holds the mode and the model selections in its own
 * settings. The browser lists and opens them over the native session routes; the Hub titles
 * and deletes them, and reads the mode a run starts in.
 */
export const projectResourceId = (projectId: string): string => `project:${projectId}`

// Where AgentController keeps a thread's current mode (its MODE_ID_KEY thread setting).
const MODE_SETTING = 'currentModeId'
const TITLE_LIMIT = 80

export type Conversations = ReturnType<typeof createConversations>

export const createConversations = (memory: () => Promise<MemoryStorage>) => {
  const threadOf = async (projectId: string, conversationId: string) => {
    const thread = await (await memory()).getThreadById({ threadId: conversationId })
    return thread && thread.resourceId === projectResourceId(projectId) ? thread : null
  }
  return Object.freeze({
    /** Whose thread the conversation id is: this Project's, another resource's, or nobody's yet. */
    ownerOf: async (projectId: string, conversationId: string): Promise<'PROJECT' | 'OTHER' | 'NONE'> => {
      const thread = await (await memory()).getThreadById({ threadId: conversationId })
      if (!thread) return 'NONE'
      return thread.resourceId === projectResourceId(projectId) ? 'PROJECT' : 'OTHER'
    },

    /** The mode a run in this conversation starts in; a new conversation starts in Planejar (AC-2). */
    modeOf: async (projectId: string, conversationId: string): Promise<BuilderModeId | null> => {
      const thread = await threadOf(projectId, conversationId)
      if (!thread) return null
      const mode = thread.metadata?.[MODE_SETTING]
      return isBuilderModeId(mode) ? mode : DEFAULT_BUILDER_MODE
    },

    /** Titles an untitled conversation from the first request sent in it. */
    titleFromRequest: async (projectId: string, conversationId: string, request: string): Promise<void> => {
      const thread = await threadOf(projectId, conversationId)
      if (!thread || thread.title?.trim()) return
      const title = request.trim().replace(/\s+/g, ' ').slice(0, TITLE_LIMIT)
      if (title) await (await memory()).patchThread({ id: conversationId, title })
    },

    /** Writes one message into a conversation, keyed by its id so a retry writes it once. */
    appendMessage: async (message: MastraDBMessage): Promise<void> => {
      await (await memory()).saveMessages({ messages: [message] })
    },

    /** Deletes every conversation of a Project, with their messages; repeating it converges. */
    deleteAll: async (projectId: string): Promise<void> => {
      const store = await memory()
      const { threads } = await store.listThreads({ filter: { resourceId: projectResourceId(projectId) }, perPage: false })
      for (const thread of threads) await store.deleteThread({ threadId: thread.id })
    },
  })
}
