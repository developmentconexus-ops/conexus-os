import { hubModuleUrl } from './hub-build.mjs'

const { createLiveConversations } = await import(hubModuleUrl('builder/conversation.js'))

/**
 * A Builder controller's live conversations for a test: each conversation's sandbox is only the
 * workspace `workspaceOf` gives it, and a kill lets the conversation go. The controller's workspace
 * resolver is `conversations.workspace`, bound after both exist.
 */
export const testConversations = (controller, workspaceOf, options = {}) => createLiveConversations({
  controller,
  sandboxes: { open: ({ conversationId, retire }) => ({ sandboxId: undefined, workspace: workspaceOf(conversationId), kill: () => retire(async () => undefined) }) },
  readSandboxId: async () => null,
  runOpen: () => false,
  ...options,
})
