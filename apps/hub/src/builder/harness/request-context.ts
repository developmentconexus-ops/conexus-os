import type { RequestContext } from '@mastra/core/request-context'
import { isBuilderModeId, type BuilderModeId } from './modes.js'

/**
 * Raw request-context keys the caller sets before a turn reaches the harness, so
 * `conexusInstructions` can read them without the harness knowing how the Hub sourced them (the
 * Project's `AGENTS.md` from `main`, and Q-5's connector brief for this run).
 */
export const CONEXUS_PROJECT_KNOWLEDGE_KEY = 'conexusProjectKnowledge'
export const CONEXUS_CONNECTOR_BRIEF_KEY = 'conexusConnectorBrief'

type ControllerContextValue = Readonly<{ session?: Readonly<{ modeId?: unknown }> }>

/**
 * Reads the session's live mode off the `controller` context `AgentController` sets on every call,
 * including a resumed one (`session.modeId`, built fresh by `buildRequestContext` each time). This is
 * what makes the mode guard correct across a suspend/resume, where a mode's own `availableTools` is
 * not (proven in the blast radius of slices 0 and 1).
 */
export const readModeId = (requestContext: RequestContext | undefined): BuilderModeId | undefined => {
  const controller = requestContext?.get('controller') as ControllerContextValue | undefined
  const modeId = controller?.session?.modeId
  return isBuilderModeId(modeId) ? modeId : undefined
}

const readRawString = (requestContext: RequestContext | undefined, key: string): string => {
  const value = requestContext?.getRaw(key)
  return typeof value === 'string' ? value : ''
}

/** The Project's `AGENTS.md` text from `main`, set by the caller for this turn (AC-8). */
export const readProjectKnowledge = (requestContext: RequestContext | undefined): string =>
  readRawString(requestContext, CONEXUS_PROJECT_KNOWLEDGE_KEY)

/** Q-5's connector brief for this run, set by the caller for this turn. */
export const readConnectorBrief = (requestContext: RequestContext | undefined): string =>
  readRawString(requestContext, CONEXUS_CONNECTOR_BRIEF_KEY)
