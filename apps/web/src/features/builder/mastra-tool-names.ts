import type { BuiltinToolId } from '@mastra/core/agent-controller'

// The names of Mastra's built-in tools the screens branch on. `satisfies` pins each to Mastra's
// own `BuiltinToolId`, so a rename fails to compile here. The web cannot import the tools'
// runtime `id` (@mastra/core's agent-controller entry pulls Node-only modules).
export const ASK_USER_TOOL = 'ask_user' satisfies BuiltinToolId
export const SUBMIT_PLAN_TOOL = 'submit_plan' satisfies BuiltinToolId
