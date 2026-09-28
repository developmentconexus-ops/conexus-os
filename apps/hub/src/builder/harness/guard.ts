import type { RequestContext } from '@mastra/core/request-context'
import type { Workspace, WorkspaceToolBeforeHookResult, WorkspaceToolHookContext, WorkspaceToolHooks } from '@mastra/core/workspace'
import { BUILDER_MODES, PATH_CHECKED_WORKSPACE_TOOLS, type BuilderModeDefinition, type BuilderModeId } from './modes.js'
import { readModeId } from './request-context.js'

type WorkspaceExecutionContext = Readonly<{ requestContext?: RequestContext }>

const refuse = (reason: string): WorkspaceToolBeforeHookResult => ({ proceed: false, output: `Refused by the Conexus mode guard: ${reason}` })

const pathOf = (input: unknown): string => {
  const path = (input as { path?: unknown } | undefined)?.path
  return typeof path === 'string' ? path : ''
}

/**
 * The one mode guard (Key invariants, Tool contract). It runs before every workspace tool call
 * (`Workspace`'s own `beforeToolCall` hook, evaluated at execution time, not a listing snapshot), so
 * it stays correct across a suspend/resume where a mode's `availableTools` narrowing does not (blast
 * radius of slices 0 and 1). It refuses a tool the current mode's table does not allow, and refuses a
 * write, edit, or `mkdir` in a mode with a `writeRoot` unless the path starts with it.
 */
export const createBuilderModeGuard = (
  modes: Readonly<Record<BuilderModeId, BuilderModeDefinition>> = BUILDER_MODES,
): NonNullable<WorkspaceToolHooks['beforeToolCall']> => (hookContext: WorkspaceToolHookContext) => {
  const requestContext = (hookContext.context as WorkspaceExecutionContext | undefined)?.requestContext
  const modeId = readModeId(requestContext)
  const mode = modeId ? modes[modeId] : undefined
  if (!mode) return refuse('the session has no known Conexus mode')
  if (!mode.allowedWorkspaceTools.has(hookContext.workspaceToolName)) {
    return refuse(`${hookContext.workspaceToolName} is not available in ${mode.displayName}`)
  }
  if (mode.writeRoot && PATH_CHECKED_WORKSPACE_TOOLS.has(hookContext.workspaceToolName)) {
    const path = pathOf(hookContext.input)
    if (!path.startsWith(mode.writeRoot)) return refuse(`${mode.displayName} may only write under ${mode.writeRoot}`)
  }
  return undefined
}

/**
 * Attaches the mode guard to a concrete `Workspace` instance, preserving whatever tool config it
 * already carries. `Workspace.setToolsConfig` takes effect on the next tool listing, so this is safe
 * to call as soon as the instance exists.
 */
export const attachBuilderModeGuard = (
  workspace: Workspace,
  modes: Readonly<Record<BuilderModeId, BuilderModeDefinition>> = BUILDER_MODES,
): void => {
  const existing = workspace.getToolsConfig() ?? {}
  const guard = createBuilderModeGuard(modes)
  const priorBeforeToolCall = existing.hooks?.beforeToolCall
  workspace.setToolsConfig({
    ...existing,
    hooks: {
      ...existing.hooks,
      beforeToolCall: async (hookContext) => (await priorBeforeToolCall?.(hookContext)) ?? guard(hookContext),
    },
  })
}
