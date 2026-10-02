// Adapted from Mastra's Factory UI (mastracode/factory-ui/src/ui/domains/chat/services/runtime.ts,
// https://github.com/mastra-ai/mastra), licensed under the Apache License, Version 2.0
// (http://www.apache.org/licenses/LICENSE-2.0); see the repository's LICENSE.md. Changed: it keeps
// only observational memory, and remembers which memory operation failed until the same one succeeds.

import type { AgentControllerEvent, AgentControllerOMProgress } from '@mastra/client-js'
import { isKnownAgentControllerEvent } from '@mastra/client-js'

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

export type RuntimeState = Readonly<{
  // The run's memory from its latest display state; null until one arrives.
  memory: MemoryGauge | null
  // Set by the controller's om_*_failed events, which carry Mastra's data-om-*-failed parts.
  memoryFailed: MemoryOperation | null
}>

export const emptyRuntime: RuntimeState = { memory: null, memoryFailed: null }

export const runtimeReducer = (state: RuntimeState, event: AgentControllerEvent): RuntimeState => {
  if (!isKnownAgentControllerEvent(event)) return state
  switch (event.type) {
    case 'display_state_changed': {
      const { omProgress, bufferingMessages, bufferingObservations } = event.displayState
      return omProgress ? { ...state, memory: { progress: omProgress, bufferingMessages: bufferingMessages ?? false, bufferingObservations: bufferingObservations ?? false } } : state
    }
    case 'om_observation_failed':
      return { ...state, memoryFailed: 'observation' }
    case 'om_reflection_failed':
      return { ...state, memoryFailed: 'reflection' }
    case 'om_buffering_failed':
      return { ...state, memoryFailed: event.operationType }
    case 'om_observation_end':
      return state.memoryFailed === 'observation' ? { ...state, memoryFailed: null } : state
    case 'om_reflection_end':
      return state.memoryFailed === 'reflection' ? { ...state, memoryFailed: null } : state
    case 'om_buffering_end':
      return state.memoryFailed === event.operationType ? { ...state, memoryFailed: null } : state
    default:
      return state
  }
}
