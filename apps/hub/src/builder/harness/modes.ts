import { WORKSPACE_TOOLS } from '@mastra/core/workspace'

/**
 * The Builder's two modes. The mode lives only in the Mastra thread setting (AC-2); this table is
 * the single source for everything else a mode decides: its prompt file, which workspace tools its
 * guard allows, where it may write, and what approving `submit_plan` transitions it to.
 */
export type BuilderModeId = 'plan' | 'build'

/** Plan mode may write only under this prefix; nothing under it is ever committed. */
export const PLAN_WRITE_ROOT = '.conexus/plans/'

export type BuilderModeDefinition = Readonly<{
  id: BuilderModeId
  /** Shown to the person: Planejar or Construir. */
  displayName: string
  /** File under harness/prompt/<variant>/ layered after the Conexus prompt while the thread is in this mode. */
  promptFile: string
  /** Exposed workspace tool names (`mastra_workspace_*`) the mode guard allows for this mode. */
  allowedWorkspaceTools: ReadonlySet<string>
  /** When set, a write/edit/mkdir call in this mode is refused unless its path starts with this prefix. */
  writeRoot: string | null
  /** Whether `submit_plan` may run in this mode. Only `plan` allows it (Tool contract). */
  allowsSubmitPlan: boolean
  /**
   * The exact tool names this mode exposes to the model (Tool contract), set as the
   * `AgentController` mode's own `availableTools`. This trims what the model is shown; it is not the
   * enforcement (Key invariants) because it is not reapplied on a resumed call (blast radius of
   * slices 0 and 1). The guard, not this list, is what a test asserts a refusal against.
   */
  availableTools: ReadonlySet<string>
  /** Approving a plan submitted in this mode switches the session to this mode. */
  transitionsTo?: BuilderModeId
}>

/** Tool names every mode exposes: task list tools, agent skills, `ask_user`, and the Q-5/web tools. */
const SHARED_TOOLS = Object.freeze([
  'task_write', 'task_update', 'task_complete', 'task_check',
  'skill', 'skill_read', 'skill_search',
  'ask_user', 'connector_fetch', 'web_search', 'web_fetch',
])

const READ_TOOLS = Object.freeze([
  WORKSPACE_TOOLS.FILESYSTEM.READ_FILE,
  WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES,
  WORKSPACE_TOOLS.FILESYSTEM.GREP,
  WORKSPACE_TOOLS.FILESYSTEM.FILE_STAT,
])

const WRITE_TOOLS = Object.freeze([
  WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE,
  WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE,
  WORKSPACE_TOOLS.FILESYSTEM.MKDIR,
])

const COMMAND_TOOLS = Object.freeze([
  WORKSPACE_TOOLS.FILESYSTEM.DELETE,
  WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND,
  WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT,
  WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS,
])

/** Workspace write tools whose input carries a `path` the mode guard checks against `writeRoot`. */
export const PATH_CHECKED_WORKSPACE_TOOLS: ReadonlySet<string> = new Set(WRITE_TOOLS)

export const BUILDER_MODES: Readonly<Record<BuilderModeId, BuilderModeDefinition>> = Object.freeze({
  plan: Object.freeze({
    id: 'plan',
    displayName: 'Planejar',
    promptFile: 'plan.md',
    allowedWorkspaceTools: new Set([...READ_TOOLS, ...WRITE_TOOLS]),
    writeRoot: PLAN_WRITE_ROOT,
    allowsSubmitPlan: true,
    availableTools: new Set([...READ_TOOLS, ...WRITE_TOOLS, ...SHARED_TOOLS, 'submit_plan']),
    transitionsTo: 'build',
  }),
  build: Object.freeze({
    id: 'build',
    displayName: 'Construir',
    promptFile: 'build.md',
    allowedWorkspaceTools: new Set([...READ_TOOLS, ...WRITE_TOOLS, ...COMMAND_TOOLS]),
    writeRoot: null,
    allowsSubmitPlan: false,
    availableTools: new Set([...READ_TOOLS, ...WRITE_TOOLS, ...COMMAND_TOOLS, ...SHARED_TOOLS]),
  }),
})

/** A new conversation starts in Planejar (AC-2). */
export const DEFAULT_BUILDER_MODE: BuilderModeId = 'plan'

export const isBuilderModeId = (value: unknown): value is BuilderModeId => value === 'plan' || value === 'build'
