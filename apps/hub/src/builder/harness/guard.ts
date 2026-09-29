import { posix } from 'node:path'
import type { RequestContext } from '@mastra/core/request-context'
import type { Workspace, WorkspaceToolBeforeHookResult, WorkspaceToolHookContext, WorkspaceToolHooks } from '@mastra/core/workspace'
import { readMethodology } from './methodology.js'
import { BUILDER_MODES, PATH_CHECKED_WORKSPACE_TOOLS, type BuilderModeDefinition, type BuilderModeId } from './modes.js'
import { readModeId } from './request-context.js'

type WorkspaceExecutionContext = Readonly<{ requestContext?: RequestContext }>

const refuse = (reason: string): WorkspaceToolBeforeHookResult => ({ proceed: false, output: `Refused by the Conexus mode guard: ${reason}` })

const pathOf = (input: unknown): string => {
  const path = (input as { path?: unknown } | undefined)?.path
  return typeof path === 'string' ? path : ''
}

/** Where the run's checkout sits in the sandbox; a workspace tool path is read against it. */
export const DEFAULT_REPOSITORY_ROOT = '/workspace/repo'

/**
 * A path a workspace tool received, as a path inside the repository, or null when it climbs out
 * of it. It reads a path the way the sandbox filesystem resolves one: an absolute path under the
 * repository root is that path, and any other leading `/` means the repository root. Every
 * write-root check reads this, never the raw string, so `.conexus/plans/../../app/x` is `app/x`.
 */
const repositoryPath = (path: string, repositoryRoot: string = DEFAULT_REPOSITORY_ROOT): string | null => {
  const underRoot = path === repositoryRoot || path.startsWith(`${repositoryRoot}/`)
  const relative = posix.normalize(underRoot ? posix.relative(repositoryRoot, path) : path.replace(/^\/+/, ''))
  if (relative === '' || relative === '.' || relative === '..' || relative.startsWith('../')) return null
  return relative
}

/** Whether a tool path lands under a write root, such as `.conexus/plans/`, once normalized. */
export const isUnderWriteRoot = (path: string, writeRoot: string, repositoryRoot: string = DEFAULT_REPOSITORY_ROOT): boolean =>
  repositoryPath(path, repositoryRoot)?.startsWith(writeRoot) === true

/**
 * @public Tests import this at runtime from the built module.
 *
 * The one mode guard (Key invariants, Tool contract). It runs before every workspace tool call
 * (`Workspace`'s own `beforeToolCall` hook, evaluated at execution time, not a listing snapshot), so
 * it stays correct across a suspend/resume where a mode's `availableTools` narrowing does not (blast
 * radius of slices 0 and 1). It refuses a tool the current mode's table does not allow, and refuses a
 * write, edit, or `mkdir` in a mode that writes only plans unless the path, normalized against the
 * repository root, lies under the run's methodology `planRoot`.
 */
export const createBuilderModeGuard = (
  modes: Readonly<Record<BuilderModeId, BuilderModeDefinition>> = BUILDER_MODES,
  repositoryRoot: string = DEFAULT_REPOSITORY_ROOT,
): NonNullable<WorkspaceToolHooks['beforeToolCall']> => (hookContext: WorkspaceToolHookContext) => {
  const requestContext = (hookContext.context as WorkspaceExecutionContext | undefined)?.requestContext
  const modeId = readModeId(requestContext)
  const mode = modeId ? modes[modeId] : undefined
  if (!mode) return refuse('the session has no known Conexus mode')
  const methodology = readMethodology(requestContext)
  if (!methodology) return refuse('the run names no known methodology')
  if (!mode.allowedWorkspaceTools.has(hookContext.workspaceToolName)) {
    return refuse(`${hookContext.workspaceToolName} is not available in ${mode.displayName}`)
  }
  if (mode.writesPlanOnly && PATH_CHECKED_WORKSPACE_TOOLS.has(hookContext.workspaceToolName)) {
    if (!isUnderWriteRoot(pathOf(hookContext.input), methodology.planRoot, repositoryRoot)) return refuse(`${mode.displayName} may only write under ${methodology.planRoot}`)
  }
  return undefined
}

/**
 * Attaches the mode guard to a concrete `Workspace` instance, preserving whatever tool config it
 * already carries. The guard runs first and a refusal is final; only a call it allows reaches the
 * hook the workspace already had. `Workspace.setToolsConfig` takes effect on the next tool listing,
 * so this is safe to call as soon as the instance exists.
 */
export const attachBuilderModeGuard = (
  workspace: Workspace,
  modes: Readonly<Record<BuilderModeId, BuilderModeDefinition>> = BUILDER_MODES,
  repositoryRoot: string = DEFAULT_REPOSITORY_ROOT,
): void => {
  const existing = workspace.getToolsConfig() ?? {}
  const guard = createBuilderModeGuard(modes, repositoryRoot)
  const priorBeforeToolCall = existing.hooks?.beforeToolCall
  workspace.setToolsConfig({
    ...existing,
    hooks: {
      ...existing.hooks,
      beforeToolCall: async (hookContext) => guard(hookContext) ?? priorBeforeToolCall?.(hookContext),
    },
  })
}
