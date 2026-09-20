import { MastraClient, isKnownAgentControllerEvent } from '@mastra/client-js'
import type { AgentControllerEvent, KnownAgentControllerEvent, MastraDBMessage } from '@mastra/client-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useReducer } from 'react'

export type { MastraDBMessage }
type DisplayState = Extract<KnownAgentControllerEvent, { type: 'display_state_changed' }>['displayState']
export type ActiveTool = DisplayState['activeTools'][string]

const BUILDER_CONTROLLER_ID = 'conexus-builder-controller'

const csrf = (): string => decodeURIComponent(document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=') ?? '')

const client = new MastraClient({
  baseUrl: window.location.origin,
  apiPrefix: '/api/mastra',
  credentials: 'same-origin',
  retries: 0,
  fetch: (input, init) => fetch(input, {
    ...init,
    headers: { ...Object.fromEntries(new Headers(init?.headers).entries()), ...((init?.method ?? 'GET').toUpperCase() === 'GET' ? {} : { 'x-conexus-csrf': csrf() }) },
  }),
})

const controller = client.getAgentController(BUILDER_CONTROLLER_ID)

export const builderRunScope = (builderRunId: string): string => `builder:${builderRunId}`
export const builderThreadMessagesKey = (projectId: string, threadId: string) => ['builder-thread-messages', projectId, threadId] as const

export const useBuilderThreadMessages = (projectId: string, threadId: string | undefined) => useQuery({
  queryKey: builderThreadMessagesKey(projectId, threadId ?? ''),
  queryFn: () => controller.session(projectId).listMessages(threadId ?? '', 200),
  enabled: Boolean(threadId),
})

export type LiveTurn = Readonly<{
  runId: string | null
  status: 'CONNECTING' | 'LIVE' | 'ENDED' | 'LOST'
  messages: readonly MastraDBMessage[]
  tools: Readonly<Record<string, ActiveTool>>
  error: string | null
}>

const idleTurn: LiveTurn = { runId: null, status: 'CONNECTING', messages: [], tools: {}, error: null }

type TurnAction = Readonly<{ runId: string }> & (
  | Readonly<{ kind: 'connected' }>
  | Readonly<{ kind: 'lost' }>
  | Readonly<{ kind: 'event'; event: AgentControllerEvent }>
)

const upsertMessage = (messages: readonly MastraDBMessage[], message: MastraDBMessage): readonly MastraDBMessage[] => {
  const index = messages.findIndex((item) => item.id === message.id)
  return index === -1 ? [...messages, message] : messages.map((item, position) => position === index ? message : item)
}

// A turn belongs to one run. The first action of another run starts from empty, so a settled run's
// messages stay on screen until the next run actually speaks.
const reduceTurn = (previous: LiveTurn, action: TurnAction): LiveTurn => {
  const turn = previous.runId === action.runId ? previous : { ...idleTurn, runId: action.runId }
  if (action.kind === 'connected') return { ...turn, status: 'LIVE' }
  if (action.kind === 'lost') return { ...turn, status: 'LOST' }
  const event = action.event
  if (!isKnownAgentControllerEvent(event)) return turn
  switch (event.type) {
    case 'message_start':
    case 'message_update':
    case 'message_end':
      return { ...turn, messages: upsertMessage(turn.messages, event.message) }
    case 'display_state_changed':
      return { ...turn, tools: { ...turn.tools, ...event.displayState.activeTools } }
    case 'error':
      return { ...turn, error: event.error.message }
    case 'agent_end':
      return { ...turn, status: 'ENDED' }
    default:
      return turn
  }
}

/** Follows one run's Mastra session for as long as the agent owns the turn. */
export const useBuilderLiveTurn = (projectId: string, builderRunId: string | undefined, agentActive: boolean): LiveTurn => {
  const [turn, dispatch] = useReducer(reduceTurn, idleTurn)
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!builderRunId || !agentActive) return undefined
    const session = controller.session(projectId, builderRunScope(builderRunId))
    let closed = false
    let unsubscribe = () => {}
    let retry: ReturnType<typeof setTimeout> | undefined
    const resync = (): void => { void queryClient.invalidateQueries({ queryKey: ['builder-thread-messages', projectId] }) }
    const connect = async (): Promise<void> => {
      try {
        const subscription = await session.subscribe({
          onEvent: (event) => {
            dispatch({ runId: builderRunId, kind: 'event', event })
            if (event.type === 'agent_end') resync()
          },
          onReconnect: resync,
          onError: () => dispatch({ runId: builderRunId, kind: 'lost' }),
          reconnect: { maxRetries: 8 },
        })
        if (closed) return subscription.unsubscribe()
        unsubscribe = subscription.unsubscribe
        dispatch({ runId: builderRunId, kind: 'connected' })
      } catch {
        if (!closed) retry = setTimeout(() => { void connect() }, 1_000)
      }
    }
    void connect()
    return () => {
      closed = true
      if (retry) clearTimeout(retry)
      unsubscribe()
    }
  }, [agentActive, builderRunId, projectId, queryClient])
  return turn.runId === builderRunId ? turn : idleTurn
}
