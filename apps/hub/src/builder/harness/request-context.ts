import { isThinkingLevelSetting, type ThinkingLevelSetting } from '@mastra/code-sdk/thinking'
import type { RequestContext } from '@mastra/core/request-context'

/**
 * Raw request-context keys the caller sets before a turn reaches the harness, so
 * `conexusInstructions` can read them without the harness knowing how the Hub sourced them: the
 * Project's name, today's date, its `AGENTS.md` and `MEMORY.md` from `main`, the Conexões section
 * for this run, and the paths a turn's start left in conflict.
 */
export const CONEXUS_PROJECT_NAME_KEY = 'conexusProjectName'
export const CONEXUS_TURN_DATE_KEY = 'conexusTurnDate'
/** `'true'` while the Project's `main` is still the starter commit; absent otherwise. */
export const CONEXUS_PROJECT_NEW_KEY = 'conexusProjectNew'
export const CONEXUS_PROJECT_INSTRUCTIONS_KEY = 'conexusProjectInstructions'
export const CONEXUS_PROJECT_MEMORY_KEY = 'conexusProjectMemory'
export const CONEXUS_CONNECTOR_BRIEF_KEY = 'conexusConnectorBrief'
/** The paths the turn's start left with conflict markers when it brought `main` in, newline separated. */
export const CONEXUS_TURN_CONFLICTS_KEY = 'conexusTurnConflicts'

type ControllerContextValue = Readonly<{ session?: Readonly<{ modelId?: unknown }>; getState?: () => Readonly<Record<string, unknown>> }>

/** The thinking levels the composer offers and the session state route admits, lowest first: Mastra Code's levels without `off` and `max`. */
export const BUILDER_THINKING_LEVELS = ['low', 'medium', 'high', 'xhigh'] as const satisfies readonly ThinkingLevelSetting[]
export type BuilderThinkingLevel = typeof BUILDER_THINKING_LEVELS[number]

/** The level a conversation runs at until the person picks one; the composer shows the same. */
const DEFAULT_THINKING_LEVEL: BuilderThinkingLevel = 'medium'

/**
 * The thinking level the conversation's session runs at, read on every call as Mastra Code's
 * `resolveRequestThinkingLevel` does: the session state's `thinkingLevel`, which the composer sets
 * and `AgentController` restores from the thread when a run's session loads it.
 */
export const readSessionThinkingLevel = (requestContext: RequestContext | undefined): ThinkingLevelSetting => {
  const level = (requestContext?.get('controller') as ControllerContextValue | undefined)?.getState?.().thinkingLevel
  return isThinkingLevelSetting(level) ? level : DEFAULT_THINKING_LEVEL
}

/** The model the conversation's session runs on, from the `controller` context `AgentController` sets on every call. */
export const readSessionModelId = (requestContext: RequestContext | undefined): string | undefined => {
  const modelId = (requestContext?.get('controller') as ControllerContextValue | undefined)?.session?.modelId
  return typeof modelId === 'string' && modelId ? modelId : undefined
}

export const readRawString = (requestContext: RequestContext | undefined, key: string): string => {
  const value = requestContext?.getRaw(key)
  return typeof value === 'string' ? value : ''
}

/** The paths holding conflict markers at this turn's start, set by the caller; empty on a clean start. */
export const readTurnConflicts = (requestContext: RequestContext | undefined): readonly string[] =>
  readRawString(requestContext, CONEXUS_TURN_CONFLICTS_KEY).split('\n').filter(Boolean)
