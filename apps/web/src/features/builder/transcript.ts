// Adapted from Mastra's Factory UI (mastracode/factory-ui/src/ui/domains/chat/services/transcript.ts,
// https://github.com/mastra-ai/mastra), licensed under the Apache License, Version 2.0
// (http://www.apache.org/licenses/LICENSE-2.0); see the repository's LICENSE.md. The window merge,
// the tool reconciliation, the message updates and the persisted suspension prompts are Mastra's.
// Changed: a conversation owns the transcript; a window drops the step-start parts the stream never
// sends; a local message is keyed by its send's idempotency key; a prompt also closes on tool_end, on a cancelled suspension and on a finished part in a merged
// window; errors become notices in Conexus's own words; the task list comes from the display state;
// subagents, goals, steering, files, authorship, notifications and thread events are left out.

import type { AgentControllerEvent, KnownAgentControllerEvent, MastraDBMessage } from '@mastra/client-js'
import { isKnownAgentControllerEvent } from '@mastra/client-js'
import { modelRetryNotice, modelStoppedNotice } from './failure-reasons.ts'
import { SUBMIT_PLAN_TOOL } from './mastra-tool-names.ts'

type MessagePart = MastraDBMessage['content']['parts'][number]
type ToolInvocationPart = Extract<MessagePart, { type: 'tool-invocation' }>
type DisplayState = Extract<KnownAgentControllerEvent, { type: 'display_state_changed' }>['displayState']
export type TaskSnapshot = DisplayState['tasks'][number]

/** A call as the stream reported it, kept beside the part it drew so its output survives a redraw. */
export type RuntimeTool = Readonly<{
  toolCallId: string
  toolName: string
  args?: unknown
  status: 'running' | 'done' | 'error'
  result?: unknown
  output: string
}>

export type MessageEntry = Readonly<{
  kind: 'message'
  id: string
  message: MastraDBMessage
  streaming?: boolean
  // A message the person sent from this page that the conversation has not shown back yet. Unknown
  // means the response was lost, so the Hub may hold it; failed means the Hub refused it.
  delivery?: 'pending' | 'unknown' | 'failed'
  runtimeTools?: Readonly<Record<string, RuntimeTool>>
  // Which of the server message's parts this entry draws, when a part was drawn by an earlier entry.
  sourcePartIndexes?: readonly number[]
}>

type NoticeEntry = Readonly<{ kind: 'notice'; id: string; level: 'info' | 'error'; text: string }>

/** A call the run parked on the person: a tool to allow, a question to answer, or a plan to approve. */
export type PromptEntry = Readonly<{
  kind: 'prompt'
  id: string
  ask: 'APPROVAL' | 'QUESTION' | 'PLAN'
  toolCallId: string
  toolName: string
  args: unknown
  prompt: unknown
  /** When the thread stored the call; null for one raised on the live stream, which belongs to the run being followed. */
  raisedAt: string | null
}>

type RunStart = Readonly<{ builderRunId: string; createdAt: string }>

/**
 * The run that raised a prompt the thread stored: the latest run that began no later than the call.
 * The thread does not name the run, so the card is placed by time. A prompt on the live stream
 * (`raisedAt` null), and one no known run began before (clocks differ a little between the Hub and
 * its database), has no known owner and stays with the run being followed.
 */
const promptRunId = (prompt: PromptEntry, runs: readonly RunStart[]): string | null => {
  if (prompt.raisedAt === null) return null
  const raised = Date.parse(prompt.raisedAt)
  const began = (run: RunStart): number => Date.parse(run.createdAt)
  const owner = runs.filter((run) => began(run) <= raised).sort((left, right) => began(right) - began(left))[0]
  return owner?.builderRunId ?? null
}

/** A card is open only for the run it was raised under; one left by an earlier run is not shown. */
export const promptIsOpenFor = (prompt: PromptEntry, current: RunStart, runs: readonly RunStart[]): boolean => {
  const owner = promptRunId(prompt, runs)
  return owner === null || owner === current.builderRunId
}

export type TranscriptEntry = MessageEntry | NoticeEntry | PromptEntry

export type TranscriptState = Readonly<{
  conversationId: string
  entries: readonly TranscriptEntry[]
  // The agent's own task list, from the controller's display state.
  tasks: readonly TaskSnapshot[]
}>

export type TranscriptAction =
  | Readonly<{ type: 'event'; event: AgentControllerEvent }>
  | Readonly<{ type: 'localUser'; id: string; text: string }>
  | Readonly<{ type: 'unknownLocalUser'; id: string }>
  | Readonly<{ type: 'failLocalUser'; id: string }>
  | Readonly<{ type: 'dropLocalUser'; id: string }>
  | Readonly<{ type: 'resolvePrompt'; toolCallId: string }>
  | Readonly<{ type: 'mergeWindow'; messages: readonly MastraDBMessage[] }>
  | Readonly<{ type: 'reset'; conversationId: string }>

export const emptyTranscript = (conversationId: string): TranscriptState => ({ conversationId, entries: [], tasks: [] })

/** The local message of the send made under this idempotency key; a retry of it reuses the entry. */
export const localMessageId = (idempotencyKey: string): string => `local-${idempotencyKey}`

const RETRY_NOTICE_ID = 'model-retry'
let noticeSeq = 0

export const transcriptReducer = (state: TranscriptState, action: TranscriptAction): TranscriptState => {
  switch (action.type) {
    case 'reset':
      return emptyTranscript(action.conversationId)
    case 'localUser': {
      const entry: MessageEntry = {
        kind: 'message', id: action.id, delivery: 'pending',
        message: { id: action.id, role: 'user', createdAt: new Date(), content: { format: 2, parts: [{ type: 'text', text: action.text }] } },
      }
      const index = state.entries.findIndex((candidate) => candidate.id === action.id)
      const entries = index === -1 ? [...state.entries, entry] : state.entries.map((candidate, position) => position === index ? entry : candidate)
      // A new send is a new run, and the previous run's task list is not its own.
      return { ...state, entries, tasks: [] }
    }
    case 'unknownLocalUser':
      return settleLocalUser(state, action.id, 'unknown')
    case 'failLocalUser':
      return settleLocalUser(state, action.id, 'failed')
    case 'dropLocalUser':
      return { ...state, entries: state.entries.filter((entry) => !(entry.kind === 'message' && entry.id === action.id && entry.delivery !== undefined)) }
    case 'resolvePrompt':
      return withoutPrompt(state, action.toolCallId)
    case 'mergeWindow':
      return mergeServerWindow(state, action.messages.map(withoutStepStarts))
    case 'event':
      return applyEvent(state, action.event)
  }
}

const settleLocalUser = (state: TranscriptState, id: string, delivery: 'unknown' | 'failed'): TranscriptState => ({
  ...state,
  entries: state.entries.map((entry) => entry.kind === 'message' && entry.id === id && entry.delivery !== undefined ? { ...entry, delivery } : entry),
})

// The model spoke again, or the run ended: a retry the thread showed is over.
const RETRY_ENDED: ReadonlySet<string> = new Set(['message_start', 'message_update', 'agent_end'])

const applyEvent = (previous: TranscriptState, event: AgentControllerEvent): TranscriptState => {
  if (!isKnownAgentControllerEvent(event)) return previous
  const state = RETRY_ENDED.has(event.type) ? withoutEntry(previous, RETRY_NOTICE_ID) : previous
  switch (event.type) {
    case 'agent_end':
      return state
    case 'message_start':
      return upsertMessage(state, event.message, true)
    case 'message_update': {
      const entryIndex = state.entries.findIndex((entry) => entry.kind === 'message' && (entry.id === event.id || entry.message.id === event.id))
      const entry = state.entries[entryIndex]
      if (entry?.kind !== 'message') return state
      const parts = [...entry.message.content.parts]
      if (event.event.type === 'text-delta') {
        if (event.event.delta.length === 0) return state
        const partIndex = lastIndexWhere(parts, (part) => part.type === 'text')
        const part = parts[partIndex]
        if (part?.type !== 'text') return state
        parts[partIndex] = { ...part, text: part.text + event.event.delta }
      } else {
        const mappedIndex = entry.sourcePartIndexes?.indexOf(event.event.index)
        if (mappedIndex === -1) return state
        const partIndex = mappedIndex ?? event.event.index
        if (event.event.type === 'reasoning-delta') {
          const part = parts[partIndex]
          if (part?.type !== 'reasoning') return state
          const reasoning = part.reasoning + event.event.delta
          parts[partIndex] = { ...part, reasoning, details: [{ type: 'text', text: reasoning }] }
        } else {
          // A tab that was hidden missed the parts before this one. Writing past the end would leave a
          // hole that the next copy of the array turns into undefined; the window refetch brings the part.
          if (partIndex > parts.length) return state
          if (mappedIndex !== undefined && partIndex === parts.length) return state
          parts[partIndex] = event.event.part
        }
      }
      const message = { ...entry.message, content: { ...entry.message.content, parts } }
      const next = { ...state, entries: state.entries.map((candidate, index) => index === entryIndex ? { ...entry, message, streaming: true } : candidate) }
      return next
    }
    case 'message_end': {
      const entryIndex = state.entries.findIndex((entry) => entry.kind === 'message' && (entry.id === event.id || entry.message.id === event.id))
      const entry = state.entries[entryIndex]
      if (entry?.kind !== 'message') return state
      const entries = state.entries.map((candidate, index) => index === entryIndex ? { ...entry, streaming: false } : candidate)
      return { ...state, entries }
    }
    case 'tool_start':
      return withTool(state, event.toolCallId, (tool) => ({ ...tool, toolName: event.toolName, args: event.args, status: 'running' }), { toolName: event.toolName, args: event.args })
    case 'shell_output':
      return withTool(state, event.toolCallId, (tool) => ({ ...tool, output: tool.output + event.output }))
    case 'tool_update':
      return withTool(state, event.toolCallId, (tool) => ({ ...tool, result: event.partialResult }))
    case 'tool_end':
      return withoutPrompt(withTool(state, event.toolCallId, (tool) => ({ ...tool, status: event.isError ? 'error' : 'done', result: event.result })), event.toolCallId)
    case 'tool_approval_required':
      return pushPrompt(state, { kind: 'prompt', id: promptId(event.toolCallId), ask: 'APPROVAL', toolCallId: event.toolCallId, toolName: event.toolName, args: event.args, prompt: null, raisedAt: null })
    case 'tool_suspended':
      return pushPrompt(state, suspensionPrompt(event.toolCallId, event.toolName, event.args, event.suspendPayload))
    case 'tool_suspension_cancelled':
      return withoutPrompt(state, event.toolCallId)
    case 'display_state_changed':
      return { ...state, tasks: event.displayState.tasks }
    // The provider's own words name sandboxes, ids and stack frames; the thread says it in ours.
    case 'error': {
      const attempt = event.retryAttempt ?? 1
      const maxRetries = event.maxRetries ?? null
      if (event.retryable && (maxRetries === null || attempt < maxRetries)) {
        return upsertNotice(state, { kind: 'notice', id: RETRY_NOTICE_ID, level: 'info', text: modelRetryNotice(attempt, maxRetries) })
      }
      return upsertNotice(withoutEntry(state, RETRY_NOTICE_ID), { kind: 'notice', id: `notice-${noticeSeq++}`, level: 'error', text: modelStoppedNotice(event.retryable ? attempt : null) })
    }
    default:
      return state
  }
}

const promptId = (toolCallId: string): string => `prompt-${toolCallId}`

const suspensionPrompt = (toolCallId: string, toolName: string, args: unknown, prompt: unknown, raisedAt: string | null = null): PromptEntry =>
  ({ kind: 'prompt', id: promptId(toolCallId), ask: toolName === SUBMIT_PLAN_TOOL ? 'PLAN' : 'QUESTION', toolCallId, toolName, args, prompt, raisedAt })

const withoutEntry = (state: TranscriptState, id: string): TranscriptState =>
  state.entries.some((entry) => entry.id === id) ? { ...state, entries: state.entries.filter((entry) => entry.id !== id) } : state

const withoutPrompt = (state: TranscriptState, toolCallId: string): TranscriptState => withoutEntry(state, promptId(toolCallId))

const pushPrompt = (state: TranscriptState, prompt: PromptEntry): TranscriptState =>
  state.entries.some((entry) => entry.id === prompt.id) ? state : { ...state, entries: [...state.entries, prompt] }

const upsertNotice = (state: TranscriptState, notice: NoticeEntry): TranscriptState => {
  const index = state.entries.findIndex((entry) => entry.id === notice.id)
  return { ...state, entries: index === -1 ? [...state.entries, notice] : state.entries.map((entry, position) => position === index ? notice : entry) }
}

// Storage marks each step's start with a part the stream never sends, so a window copy is lined up
// with the streamed one, part for part, without it.
const withoutStepStarts = (message: MastraDBMessage): MastraDBMessage => message.content.parts.some((part) => part.type === 'step-start')
  ? { ...message, content: { ...message.content, parts: message.content.parts.filter((part) => part.type !== 'step-start') } }
  : message

const messagesToEntries = (messages: readonly MastraDBMessage[]): TranscriptEntry[] =>
  messages.flatMap((message) => [toMessageEntry(message, { streaming: false }), ...persistedSuspensionPrompts(message)])

// A thread parked on the person keeps the open call in its message's metadata until the answer
// clears it, so a page opened while the run waits draws the card from the window alone.
const persistedSuspensionPrompts = (message: MastraDBMessage): PromptEntry[] => {
  const suspendedTools: unknown = message.content.metadata?.suspendedTools
  if (!suspendedTools || typeof suspendedTools !== 'object' || Array.isArray(suspendedTools)) return []
  return Object.values(suspendedTools).flatMap((suspension: unknown) => {
    if (!suspension || typeof suspension !== 'object' || Array.isArray(suspension) || !('toolCallId' in suspension) || !('toolName' in suspension)
      || typeof suspension.toolCallId !== 'string' || typeof suspension.toolName !== 'string') return []
    // A call a stop denied keeps its record on the message; the tool part says it no longer waits.
    const callId = suspension.toolCallId
    if (message.content.parts.some((part) => part.type === 'tool-invocation' && part.toolInvocation.toolCallId === callId && part.toolInvocation.state !== 'call')) return []
    return [suspensionPrompt(suspension.toolCallId, suspension.toolName, 'args' in suspension ? suspension.args : undefined, 'suspendPayload' in suspension ? suspension.suspendPayload : undefined, new Date(message.createdAt).toISOString())]
  })
}

const mergeServerWindow = (state: TranscriptState, messages: readonly MastraDBMessage[]): TranscriptState => {
  if (messages.length === 0) return state
  const onScreenIndex = claimOnScreenEntries(state.entries, messages)
  const confirmed = confirmPendingUserMessages(state, onScreenIndex)
  const reconciled = withoutFinishedPrompts(reconcileToolResults(adoptCoveringWindowCopies(confirmed, onScreenIndex), messages), messages)
  if (messages.every((message) => onScreenIndex.has(message))) return withPersistedPrompts(reconciled, messages)

  const drawnPrompts = new Set(reconciled.entries.flatMap((entry) => entry.kind === 'prompt' ? [entry.id] : []))
  const added = (missing: readonly MastraDBMessage[]): TranscriptEntry[] =>
    messagesToEntries(missing).filter((entry) => entry.kind !== 'prompt' || (!drawnPrompts.has(entry.id) && !finishedCallIds(messages).has(entry.toolCallId)))
  const entries: TranscriptEntry[] = []
  let cursor = 0
  let missing: MastraDBMessage[] = []
  for (const message of messages) {
    const anchorIndex = onScreenIndex.get(message)
    if (anchorIndex === undefined) {
      missing.push(message)
      continue
    }
    if (anchorIndex < cursor) continue
    entries.push(...reconciled.entries.slice(cursor, anchorIndex), ...added(missing))
    missing = []
    cursor = anchorIndex
  }
  entries.push(...reconciled.entries.slice(cursor), ...added(missing))
  return withPersistedPrompts({ ...reconciled, entries }, messages)
}

// A message already on screen can gain its suspension after it was drawn: a resumed run asks again in
// the message the first leg wrote. Every window message is read for its open calls, once per call.
const withPersistedPrompts = (state: TranscriptState, messages: readonly MastraDBMessage[]): TranscriptState => {
  const finished = finishedCallIds(messages)
  return messages.flatMap(persistedSuspensionPrompts)
    .filter((prompt) => !finished.has(prompt.toolCallId))
    .reduce(pushPrompt, state)
}

const finishedCallIds = (messages: readonly MastraDBMessage[]): ReadonlySet<string> =>
  new Set(messages.flatMap((message) => message.content.parts.flatMap((part) =>
    part.type === 'tool-invocation' && isTerminalInvocationState(part.toolInvocation.state) ? [part.toolInvocation.toolCallId] : [])))

const withoutFinishedPrompts = (state: TranscriptState, messages: readonly MastraDBMessage[]): TranscriptState => {
  const finished = finishedCallIds(messages)
  return state.entries.some((entry) => entry.kind === 'prompt' && finished.has(entry.toolCallId))
    ? { ...state, entries: state.entries.filter((entry) => entry.kind !== 'prompt' || !finished.has(entry.toolCallId)) }
    : state
}

type OnScreenMessage = Readonly<{ entry: MessageEntry; toolCallIds: ReadonlySet<string>; texts: ReadonlySet<string> }>

// The stream uses one assistant message per run; storage uses one per step.
const claimOnScreenEntries = (
  entries: readonly TranscriptEntry[],
  messages: readonly MastraDBMessage[],
  eligible?: (entry: MessageEntry) => boolean,
): Map<MastraDBMessage, number> => {
  const onScreen = entries.map(indexMessageEntry)
  const anchors = new Map<MastraDBMessage, number>()
  const claimedEntries = new Set<number>()
  const claimedTexts = new Set<string>()
  for (const message of messages) {
    const displayed = toMessageEntry(message).message
    const toolCallIds = toolCallIdsOf(displayed.content.parts)
    const texts = drawableTexts(message)
    const textClaim = (index: number): string => `${index} ${texts.join('\n')}`
    for (const [index, candidate] of onScreen.entries()) {
      if (!candidate || (eligible && !eligible(candidate.entry))) continue
      const sameMessage = candidate.entry.id === message.id || candidate.entry.message.id === message.id || toolCallIds.some((toolCallId) => candidate.toolCallIds.has(toolCallId))
      const alreadyDrawn = redrawsEntry(candidate, displayed, texts, toolCallIds)
      const claimsIdentity = sameMessage && !claimedEntries.has(index)
      const claimsText = alreadyDrawn && !claimedTexts.has(textClaim(index))
      if (!claimsIdentity && !claimsText) continue
      anchors.set(message, index)
      claimedEntries.add(index)
      if (texts.length > 0) claimedTexts.add(textClaim(index))
      break
    }
  }
  return anchors
}

const isUnconfirmed = (entry: MessageEntry): boolean => entry.delivery !== undefined

// The conversation showed back a message this page sent: it is the conversation's now, under the
// local id so the row does not remount.
const confirmPendingUserMessages = (state: TranscriptState, anchors: ReadonlyMap<MastraDBMessage, number>): TranscriptState => {
  const confirmed = new Map<number, MessageEntry>()
  for (const [message, index] of anchors) {
    const current = state.entries[index]
    if (current?.kind !== 'message' || !isUnconfirmed(current)) continue
    const canonical = toMessageEntry(message, { streaming: current.streaming, runtimeTools: current.runtimeTools })
    if (canonical.message.role === 'user') confirmed.set(index, { ...canonical, id: current.id })
  }
  if (confirmed.size === 0) return state
  return { ...state, entries: state.entries.map((entry, index) => confirmed.get(index) ?? entry) }
}

const redrawsEntry = (candidate: OnScreenMessage, displayed: MastraDBMessage, texts: readonly string[], toolCallIds: readonly string[]): boolean => {
  if (texts.length === 0 || candidate.entry.message.role !== displayed.role) return false
  if (!texts.every((text) => drawsText(candidate, text))) return false
  return toolCallIds.length === 0 || windowCopyCovers(candidate.entry.message.content.parts, displayed.content.parts)
}

const drawsText = (candidate: OnScreenMessage, text: string): boolean => {
  if (candidate.texts.has(text)) return true
  if (!candidate.entry.streaming) return false
  return [...candidate.texts].some((drawn) => drawn.startsWith(text) || text.startsWith(drawn))
}

const indexMessageEntry = (entry: TranscriptEntry): OnScreenMessage | undefined => entry.kind !== 'message' ? undefined : {
  entry,
  toolCallIds: new Set(toolCallIdsOf(entry.message.content.parts)),
  texts: new Set(drawableTexts(entry.message)),
}

const drawableTexts = (message: MastraDBMessage): string[] => {
  const textParts = message.content.parts.flatMap((part) => part.type === 'text' && part.text.trim().length > 0 ? [part.text.trim()] : [])
  if (textParts.length > 0 || message.role !== 'signal') return textParts
  return message.content.parts.flatMap((part) => {
    if (part.type !== 'data-user-message' || !('data' in part)) return []
    const text = signalContentsToText(part.data).trim()
    return text ? [text] : []
  })
}

const toolCallIdOf = (part: MessagePart): string | undefined => part.type === 'tool-invocation' ? part.toolInvocation.toolCallId : undefined

const toolCallIdsOf = (parts: readonly MessagePart[]): string[] => parts.flatMap((part) => {
  const toolCallId = toolCallIdOf(part)
  return toolCallId === undefined ? [] : [toolCallId]
})

const isTerminalInvocationState = (state: ToolInvocationPart['toolInvocation']['state']): boolean =>
  state === 'result' || state === 'output-error' || state === 'output-denied'

const adoptCoveringWindowCopies = (state: TranscriptState, anchors: ReadonlyMap<MastraDBMessage, number>): TranscriptState => {
  const copyByEntry = new Map<number, MastraDBMessage>()
  for (const [message, index] of anchors) {
    if (message.role === 'assistant') copyByEntry.set(index, message)
  }
  let changed = false
  const entries = state.entries.map((entry, index) => {
    const copy = copyByEntry.get(index)
    if (!copy || entry.kind !== 'message' || entry.message.role !== 'assistant') return entry
    const onScreenParts = entry.message.content.parts
    const covers = windowCopyCovers(onScreenParts, copy.content.parts)
    const identical = covers && windowCopyCovers(copy.content.parts, onScreenParts)
    if (!covers || identical) return entry
    changed = true
    return { ...entry, message: { ...entry.message, content: { ...entry.message.content, parts: copy.content.parts } } }
  })
  return changed ? { ...state, entries } : state
}

const windowCopyCovers = (onScreen: readonly MessagePart[], persisted: readonly MessagePart[]): boolean => {
  if (persisted.length < onScreen.length) return false
  return onScreen.every((part, index) => {
    const counterpart = persisted[index]
    if (!counterpart) return false
    if (part.type === 'text' && counterpart.type === 'text') return counterpart.text.startsWith(part.text)
    if (part.type === 'tool-invocation' && counterpart.type === 'tool-invocation') {
      if (part.toolInvocation.toolCallId !== counterpart.toolInvocation.toolCallId) return false
      return !isTerminalInvocationState(part.toolInvocation.state) || isTerminalInvocationState(counterpart.toolInvocation.state)
    }
    return JSON.stringify(counterpart) === JSON.stringify(part)
  })
}

// Gaps in the stream can swallow tool_end; persisted results settle the row.
const reconcileToolResults = (state: TranscriptState, messages: readonly MastraDBMessage[]): TranscriptState => {
  const serverTerminalParts = new Map<string, ToolInvocationPart>()
  for (const message of messages) {
    for (const part of message.content.parts) {
      if (part.type !== 'tool-invocation' || !isTerminalInvocationState(part.toolInvocation.state)) continue
      serverTerminalParts.set(part.toolInvocation.toolCallId, part)
    }
  }
  if (serverTerminalParts.size === 0) return state
  let changed = false
  const entries = state.entries.map((entry) => {
    if (entry.kind !== 'message' || entry.message.role !== 'assistant') return entry
    let entryChanged = false
    const parts = entry.message.content.parts.map((part) => {
      if (part.type !== 'tool-invocation' || isTerminalInvocationState(part.toolInvocation.state)) return part
      const serverPart = serverTerminalParts.get(part.toolInvocation.toolCallId)
      if (!serverPart) return part
      entryChanged = true
      return serverPart
    })
    if (!entryChanged) return entry
    changed = true
    return { ...entry, message: { ...entry.message, content: { ...entry.message.content, parts } } }
  })
  return changed ? { ...state, entries } : state
}

// Live user signals carry text in data.contents; persisted signals use text parts.
const withRenderableSignalText = (message: MastraDBMessage): MastraDBMessage => {
  const parts = message.content.parts
  if (parts.some((part) => part.type === 'text' && part.text.trim().length > 0)) return message
  const text = parts.map((part) => part.type === 'data-user-message' && 'data' in part ? signalContentsToText(part.data) : '').filter(Boolean).join('\n')
  if (!text) return message
  return { ...message, content: { ...message.content, parts: [{ type: 'text', text }] } }
}

// Signal contents may be text or an array from partsToSignalContents.
const signalContentsToText = (data: unknown): string => {
  if (!data || typeof data !== 'object') return ''
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const contents = (data as { contents?: unknown }).contents
  if (typeof contents === 'string') return contents
  if (!Array.isArray(contents)) return ''
  return contents.map((entry: unknown) => {
    if (typeof entry === 'string') return entry
    // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
    if (entry && typeof entry === 'object' && typeof (entry as { text?: unknown }).text === 'string') return (entry as { text: string }).text
    return ''
  }).filter(Boolean).join('\n')
}

const signalType = (message: MastraDBMessage): unknown => {
  const signal = message.role === 'signal' ? message.content.metadata?.signal : undefined
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return signal && typeof signal === 'object' && !Array.isArray(signal) ? (signal as Record<string, unknown>).type : undefined
}

const toMessageEntry = (message: MastraDBMessage, options: Readonly<{ streaming?: boolean | undefined; runtimeTools?: MessageEntry['runtimeTools'] | undefined }> = {}): MessageEntry => {
  const userSignal = signalType(message) === 'user' || signalType(message) === 'user-message'
  return {
    kind: 'message',
    id: message.id,
    message: userSignal ? { ...withRenderableSignalText(message), role: 'user' } : message,
    ...(options.streaming !== undefined ? { streaming: options.streaming } : {}),
    ...(options.runtimeTools ? { runtimeTools: options.runtimeTools } : {}),
  }
}

const lastIndexWhere = <T,>(items: readonly T[], matches: (item: T) => boolean): number => items.map(matches).lastIndexOf(true)

const latestAssistantIndex = (entries: readonly TranscriptEntry[]): number =>
  lastIndexWhere(entries, (entry) => entry.kind === 'message' && entry.message.role === 'assistant')

const indexOfSameTurn = (entries: readonly TranscriptEntry[], message: MastraDBMessage): number => {
  const index = latestAssistantIndex(entries)
  const entry = entries[index]
  if (entry?.kind !== 'message') return -1
  if (entry.message.id.startsWith('assistant-tools-')) return index
  return entry.streaming && windowCopyCovers(entry.message.content.parts, message.content.parts) ? index : -1
}

const upsertMessage = (state: TranscriptState, message: MastraDBMessage, streaming: boolean): TranscriptState => {
  if (message.role !== 'assistant' && message.role !== 'signal') return state
  const entries = [...state.entries]
  let index = entries.findIndex((entry) => entry.kind === 'message' && (entry.id === message.id || entry.message.id === message.id))
  if (message.role === 'assistant' && index === -1) index = indexOfSameTurn(entries, message)
  if (message.role === 'signal' && index === -1) index = claimOnScreenEntries(entries, [message], isUnconfirmed).get(message) ?? -1
  const previous = index === -1 ? undefined : entries[index]
  const previousEntry = previous?.kind === 'message' ? previous : undefined
  const filtered = message.role === 'assistant' ? withoutToolPartsDrawnElsewhere(preserveRuntimeToolParts(message, previousEntry?.message), entries, index) : undefined
  const canonical = toMessageEntry(filtered?.message ?? message, { streaming, ...(previousEntry?.runtimeTools ? { runtimeTools: previousEntry.runtimeTools } : {}) })
  // Changing the entry id remounts open cards.
  const entry: MessageEntry = {
    ...canonical,
    ...(previousEntry ? { id: previousEntry.id } : {}),
    ...(filtered?.sourcePartIndexes ? { sourcePartIndexes: filtered.sourcePartIndexes } : {}),
  }
  if (index === -1) entries.push(entry)
  else entries[index] = entry
  const next = { ...state, entries }
  return message.role === 'assistant' ? reconcileToolResults(next, [message]) : next
}

const withoutToolPartsDrawnElsewhere = (message: MastraDBMessage, entries: readonly TranscriptEntry[], own: number): Readonly<{ message: MastraDBMessage; sourcePartIndexes?: number[] }> => {
  const drawnElsewhere = new Set<string>()
  for (const [index, entry] of entries.entries()) {
    if (index === own || entry.kind !== 'message' || entry.message.role !== 'assistant') continue
    for (const part of entry.message.content.parts) {
      const toolCallId = toolCallIdOf(part)
      if (toolCallId) drawnElsewhere.add(toolCallId)
    }
  }
  const sourcePartIndexes = message.content.parts.flatMap((part, index) => {
    const toolCallId = toolCallIdOf(part)
    return toolCallId && drawnElsewhere.has(toolCallId) ? [] : [index]
  })
  if (sourcePartIndexes.length === message.content.parts.length) return { message }
  const parts = sourcePartIndexes.flatMap((index) => message.content.parts[index] ?? [])
  return { message: { ...message, content: { ...message.content, parts } }, sourcePartIndexes }
}

const preserveRuntimeToolParts = (message: MastraDBMessage, previous?: MastraDBMessage): MastraDBMessage => {
  if (!previous) return message
  const parts = [...message.content.parts]
  const existingToolIds = new Set(parts.map(toolCallIdOf).filter((id): id is string => Boolean(id)))
  for (const [index, part] of previous.content.parts.entries()) {
    const currentPart = parts[index]
    if (part.type === 'text' && currentPart?.type === 'text' && currentPart.text === '' && part.text) {
      parts[index] = part
      continue
    }
    const toolCallId = toolCallIdOf(part)
    if (toolCallId && !existingToolIds.has(toolCallId)) {
      parts.push(part)
      existingToolIds.add(toolCallId)
    }
  }
  return { ...message, content: { ...message.content, parts } }
}

const toolAnchorIndex = (entries: readonly TranscriptEntry[], toolCallId: string): number => {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry?.kind !== 'message') continue
    if (entry.runtimeTools?.[toolCallId]) return index
    if (entry.message.content.parts.some((part) => toolCallIdOf(part) === toolCallId)) return index
  }
  return latestAssistantIndex(entries)
}

const toolCallFromPart = (part: MessagePart | undefined): RuntimeTool | undefined => {
  if (part?.type !== 'tool-invocation') return undefined
  const invocation = part.toolInvocation
  return {
    toolCallId: invocation.toolCallId,
    toolName: invocation.toolName,
    args: 'args' in invocation ? invocation.args : undefined,
    status: invocation.state === 'result' ? 'done' : 'running',
    result: 'result' in invocation ? invocation.result : undefined,
    output: '',
  }
}

const toolPart = (tool: RuntimeTool): MessagePart => tool.status === 'running'
  ? { type: 'tool-invocation', toolInvocation: { state: 'call', toolCallId: tool.toolCallId, toolName: tool.toolName, args: tool.args } }
  : { type: 'tool-invocation', toolInvocation: { state: 'result', toolCallId: tool.toolCallId, toolName: tool.toolName, args: tool.args, result: tool.result, ...(tool.status === 'error' ? { isError: true } : {}) } }

const withTool = (state: TranscriptState, toolCallId: string, update: (tool: RuntimeTool) => RuntimeTool, seed?: Partial<RuntimeTool>): TranscriptState => {
  const entries = [...state.entries]
  let index = toolAnchorIndex(entries, toolCallId)
  if (index === -1) {
    entries.push(toMessageEntry({ id: `assistant-tools-${toolCallId}`, role: 'assistant', createdAt: new Date(), content: { format: 2, parts: [] } }, { streaming: true }))
    index = entries.length - 1
  }
  const entry = entries[index]
  if (entry?.kind !== 'message') return state
  const parts = [...entry.message.content.parts]
  const runtimeTools = { ...entry.runtimeTools }
  const existing = runtimeTools[toolCallId] ?? toolCallFromPart(parts.find((part) => toolCallIdOf(part) === toolCallId))
  const tool = update(existing ?? { toolCallId, toolName: seed?.toolName ?? 'tool', args: seed?.args, status: 'running', output: '' })
  runtimeTools[toolCallId] = tool
  const partIndex = parts.findIndex((part) => toolCallIdOf(part) === toolCallId)
  if (partIndex === -1) parts.push(toolPart(tool))
  else parts[partIndex] = toolPart(tool)
  entries[index] = { ...entry, runtimeTools, message: { ...entry.message, content: { ...entry.message.content, parts } } }
  return { ...state, entries }
}
