import type { RequestContext } from '@mastra/core/request-context'
import { isBuilderModeId, type BuilderModeId } from './modes.js'

/**
 * Raw request-context keys the caller sets before a turn reaches the harness, so
 * `conexusInstructions` can read them without the harness knowing how the Hub sourced them (the
 * Project's `AGENTS.md` from `main`, and Q-5's connector brief for this run).
 */
export const CONEXUS_PROJECT_KNOWLEDGE_KEY = 'conexusProjectKnowledge'
export const CONEXUS_CONNECTOR_BRIEF_KEY = 'conexusConnectorBrief'
/** The paths the turn's start left with conflict markers when it brought `main` in, newline separated. */
export const CONEXUS_TURN_CONFLICTS_KEY = 'conexusTurnConflicts'
/**
 * Which prompt variant the run's instructions load (`prompt/<variant>/`); absent means the default.
 * @public Tests import this at runtime from the built module.
 */
export const CONEXUS_PROMPT_VARIANT_KEY = 'conexusPromptVariant'

type SessionStateAccess = Readonly<{ get(): Record<string, unknown>; set(updates: Record<string, unknown>): Promise<void> }>
type ControllerContextValue = Readonly<{ session?: Readonly<{ modeId?: unknown; state?: SessionStateAccess }> }>

const sessionOf = (requestContext: RequestContext | undefined) =>
  (requestContext?.get('controller') as ControllerContextValue | undefined)?.session

/**
 * Reads the session's live mode off the `controller` context `AgentController` sets on every call,
 * including a resumed one (`session.modeId`, built fresh by `buildRequestContext` each time). This is
 * what makes the mode guard correct across a suspend/resume, where a mode's own `availableTools` is
 * not (proven in the blast radius of slices 0 and 1).
 */
export const readModeId = (requestContext: RequestContext | undefined): BuilderModeId | undefined => {
  const modeId = sessionOf(requestContext)?.modeId
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

/** The paths holding conflict markers at this turn's start, set by the caller; empty on a clean start. */
export const readTurnConflicts = (requestContext: RequestContext | undefined): readonly string[] =>
  readRawString(requestContext, CONEXUS_TURN_CONFLICTS_KEY).split('\n').filter(Boolean)

/** The run's prompt variant as the caller set it, unchecked; `conexusInstructions` refuses one it does not know. */
export const readPromptVariant = (requestContext: RequestContext | undefined): string | undefined => {
  const value = requestContext?.getRaw(CONEXUS_PROMPT_VARIANT_KEY)
  return typeof value === 'string' ? value : undefined
}

/**
 * The plan last sent to the person with `submit_plan`, kept in the session's state the way Mastra
 * Code keeps its `activePlan`. It is written when the plan is submitted, not when it is approved,
 * because a resumed call resolves its instructions before the approved tool call runs: approval
 * switches to Construir and the build continues in that same resumed call. A rejection clears it, so
 * in Construir it is the approved plan.
 */
const SUBMITTED_PLAN_STATE_KEY = 'conexusSubmittedPlan'

export type SubmittedPlan = Readonly<{ path: string; title: string; plan: string }>

export const readSubmittedPlan = (requestContext: RequestContext | undefined): SubmittedPlan | undefined => {
  const value = sessionOf(requestContext)?.state?.get()[SUBMITTED_PLAN_STATE_KEY] as Partial<SubmittedPlan> | null | undefined
  return typeof value?.path === 'string' && typeof value.title === 'string' && typeof value.plan === 'string'
    ? { path: value.path, title: value.title, plan: value.plan }
    : undefined
}

export const writeSubmittedPlan = async (requestContext: RequestContext | undefined, plan: SubmittedPlan | null): Promise<void> => {
  await sessionOf(requestContext)?.state?.set({ [SUBMITTED_PLAN_STATE_KEY]: plan })
}
