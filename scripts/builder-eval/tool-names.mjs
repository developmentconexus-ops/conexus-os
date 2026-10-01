import { askUserTool, submitPlanTool } from '@mastra/core/agent-controller'
import { WORKSPACE_TOOLS } from '@mastra/core/workspace'

// The names a trace carries for the tools the scorers read, as Mastra names them.
export const ASK_USER_TOOL = askUserTool.id
export const SUBMIT_PLAN_TOOL = submitPlanTool.id
export const READ_FILE_TOOL = WORKSPACE_TOOLS.FILESYSTEM.READ_FILE
export const WRITE_FILE_TOOL = WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE
export const EDIT_FILE_TOOL = WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE
