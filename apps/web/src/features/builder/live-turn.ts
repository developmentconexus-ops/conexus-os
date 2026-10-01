import { isKnownAgentControllerEvent } from '@mastra/client-js'
import type { AgentControllerEvent, AgentControllerOMProgress, KnownAgentControllerEvent, MastraDBMessage } from '@mastra/client-js'

type DisplayState = Extract<KnownAgentControllerEvent, { type: 'display_state_changed' }>['displayState']
export type ActiveTool = DisplayState['activeTools'][string]
// The AgentController's own task-list snapshot (from @mastra/core's task_write/task_update/
// task_check/task_complete tools), already carried on every display_state_changed event: the
// canonical source the checklist reads, not something rebuilt from parsing tool-call args here.
type TaskSnapshot = DisplayState['tasks'][number]

// Observational memory as the controller reports it: the two budgets, from a run's display state
// or a conversation's session state, and whether either is being filled or drained in the background.
export type MemoryGauge = Readonly<{
  progress: Readonly<Pick<AgentControllerOMProgress, 'status' | 'pendingTokens' | 'threshold' | 'observationTokens' | 'reflectionThreshold'>>
  bufferingMessages: boolean
  bufferingObservations: boolean
}>

// The two things observational memory does to a conversation. A failed one stays marked until the
// same one succeeds, so a person who sees the ring warn knows the conversation is not being remembered.
export type MemoryOperation = 'observation' | 'reflection'

export type LiveTurn = Readonly<{
  runId: string | null
  status: 'CONNECTING' | 'LIVE' | 'ENDED' | 'LOST'
  messages: readonly MastraDBMessage[]
  tools: Readonly<Record<string, ActiveTool>>
  // Tool calls parked on the person, keyed by call id: an approval or a question from the agent.
  waiting: Readonly<Record<string, PendingAnswer>>
  // The agent's own task list for this turn, from the AgentController's display state.
  tasks: readonly TaskSnapshot[]
  // The run's memory from its latest display state; null until one arrives.
  memory: MemoryGauge | null
  // Set by the controller's om_*_failed events, which carry Mastra's data-om-*-failed parts.
  memoryFailed: MemoryOperation | null
  error: string | null
}>

// A call the run parked on the person: a tool to allow, a question to answer, or a plan to approve.
export type PendingAnswer = Readonly<{ kind: 'APPROVAL' | 'QUESTION' | 'PLAN'; toolCallId: string; toolName: string; args: unknown; prompt: unknown }>
// submit_plan resumes with the tool's own decision: approved lets the run build, rejected sends the
// person's feedback back to the model.
type PlanResume = Readonly<{ action: 'approved' | 'rejected'; feedback?: string }>
export type PendingReply = Readonly<{ approved: boolean }> | Readonly<{ answers: (string | string[])[] }> | Readonly<{ plan: PlanResume }>

export const idleTurn: LiveTurn = { runId: null, status: 'CONNECTING', messages: [], tools: {}, waiting: {}, tasks: [], memory: null, memoryFailed: null, error: null }

const parked = (state: DisplayState): LiveTurn['waiting'] => ({
  ...Object.fromEntries(Object.values(state.pendingSuspensions ?? {}).map((call): [string, PendingAnswer] =>
    [call.toolCallId, { kind: call.toolName === 'submit_plan' ? 'PLAN' : 'QUESTION', toolCallId: call.toolCallId, toolName: call.toolName, args: call.args, prompt: call.suspendPayload }])),
  ...(state.pendingApproval ? { [state.pendingApproval.toolCallId]: { kind: 'APPROVAL' as const, toolCallId: state.pendingApproval.toolCallId, toolName: state.pendingApproval.toolName, args: state.pendingApproval.args, prompt: null } } : {}),
})

const without = (waiting: LiveTurn['waiting'], toolCallId: string): LiveTurn['waiting'] =>
  Object.fromEntries(Object.entries(waiting).filter(([id]) => id !== toolCallId))

export type TurnAction = Readonly<{ runId: string }> & (
  | Readonly<{ kind: 'connected' }>
  | Readonly<{ kind: 'lost' }>
  | Readonly<{ kind: 'event'; event: AgentControllerEvent }>
)

const upsertMessage = (messages: readonly MastraDBMessage[], message: MastraDBMessage): readonly MastraDBMessage[] => {
  const index = messages.findIndex((item) => item.id === message.id)
  return index === -1 ? [...messages, message] : messages.map((item, position) => position === index ? message : item)
}

type MessageUpdate = Extract<KnownAgentControllerEvent, { type: 'message_update' }>['event']

// The controller sends a message whole once, then only id-addressed deltas, the way the
// @mastra/client-js agent controller reference rebuilds it.
const applyUpdate = (message: MastraDBMessage, update: MessageUpdate): MastraDBMessage => {
  const parts = [...message.content.parts]
  if (update.type === 'text-delta') {
    const index = parts.map((part) => part.type).lastIndexOf('text')
    const part = parts[index]
    if (part?.type === 'text') parts[index] = { ...part, text: part.text + update.delta }
    else parts.push({ type: 'text', text: update.delta })
  } else if (update.type === 'reasoning-delta') {
    const part = parts[update.index]
    const reasoning = part?.type === 'reasoning' ? part.reasoning + update.delta : update.delta
    parts[update.index] = { ...(part?.type === 'reasoning' ? part : { type: 'reasoning' as const }), reasoning, details: [{ type: 'text', text: reasoning }] }
  } else {
    parts[update.index] = update.part
  }
  return { ...message, content: { ...message.content, parts } }
}

// A turn belongs to one run. The first action of another run starts from empty, so a settled run's
// messages stay on screen until the next run actually speaks.
export const reduceTurn = (previous: LiveTurn, action: TurnAction): LiveTurn => {
  const turn = previous.runId === action.runId ? previous : { ...idleTurn, runId: action.runId }
  if (action.kind === 'connected') return { ...turn, status: 'LIVE' }
  if (action.kind === 'lost') return { ...turn, status: 'LOST' }
  const event = action.event
  if (!isKnownAgentControllerEvent(event)) return turn
  switch (event.type) {
    case 'message_start':
      return { ...turn, messages: upsertMessage(turn.messages, event.message) }
    case 'message_update': {
      const message = turn.messages.find((item) => item.id === event.id)
      return message ? { ...turn, messages: upsertMessage(turn.messages, applyUpdate(message, event.event)) } : turn
    }
    case 'display_state_changed':
      // A page opened while the run is parked on the person never saw the tool_suspended event, so the
      // snapshot the subscription starts with is what brings the question card back.
      return { ...turn, tools: { ...turn.tools, ...event.displayState.activeTools }, waiting: { ...turn.waiting, ...parked(event.displayState) }, tasks: event.displayState.tasks,
        memory: event.displayState.omProgress
          ? { progress: event.displayState.omProgress, bufferingMessages: event.displayState.bufferingMessages ?? false, bufferingObservations: event.displayState.bufferingObservations ?? false }
          : turn.memory }
    case 'om_observation_failed':
      return { ...turn, memoryFailed: 'observation' }
    case 'om_reflection_failed':
      return { ...turn, memoryFailed: 'reflection' }
    case 'om_buffering_failed':
      return { ...turn, memoryFailed: event.operationType }
    case 'om_observation_end':
      return turn.memoryFailed === 'observation' ? { ...turn, memoryFailed: null } : turn
    case 'om_reflection_end':
      return turn.memoryFailed === 'reflection' ? { ...turn, memoryFailed: null } : turn
    case 'om_buffering_end':
      return turn.memoryFailed === event.operationType ? { ...turn, memoryFailed: null } : turn
    case 'tool_approval_required':
      return { ...turn, waiting: { ...turn.waiting, [event.toolCallId]: { kind: 'APPROVAL', toolCallId: event.toolCallId, toolName: event.toolName, args: event.args, prompt: null } } }
    case 'tool_suspended':
      return { ...turn, waiting: { ...turn.waiting, [event.toolCallId]: { kind: event.toolName === 'submit_plan' ? 'PLAN' : 'QUESTION', toolCallId: event.toolCallId, toolName: event.toolName, args: event.args, prompt: event.suspendPayload } } }
    case 'tool_end':
    case 'tool_suspension_cancelled':
      return { ...turn, waiting: without(turn.waiting, event.toolCallId) }
    case 'error':
      return { ...turn, error: event.error.message }
    // A turn parked on the person ends its agent run as suspended; the call stays open until they
    // answer, and the same run goes on.
    case 'agent_end':
      return event.reason === 'suspended' ? turn : { ...turn, status: 'ENDED', waiting: {} }
    default:
      return turn
  }
}

