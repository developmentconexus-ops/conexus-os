import { MarkdownRenderer } from '@mastra/playground-ui/components/MarkdownRenderer'
import {
  ToolCall, ToolCallCommand, ToolCallContent, ToolCallEdit, ToolCallMono, ToolCallPresentedHeader, ToolCallTrigger,
  presentTool, stringifyToolValue, stripAnsi, toolEdit,
} from '@mastra/playground-ui/components/ai/tool-call'
import { Brain, Check, ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { ConexusMark } from '../../../../../../packages/brand/src/index'
import { providerIcon, providerLabel } from '../composer/model-order'
import { humanizeModelName } from '../composer/model-display-name'
import type { ActiveTool, BuilderModel, LiveTurn, MastraDBMessage } from '../mastra-session'
import { type BuilderFailureCategory, failureReason } from '../failure-reasons'
import { clockLabel } from '../construir/run-state'
import { TASK_TOOL_NAMES, toolSentence } from '../construir/tool-sentences'

export type PersistedRequest = Readonly<{ runId: string; text: string; createdAt: string; reason: string | null }>
type MessagePart = MastraDBMessage['content']['parts'][number]
type ToolInvocationPart = Extract<MessagePart, { type: 'tool-invocation' }>
type ReasoningPart = Extract<MessagePart, { type: 'reasoning' }>

const isUserAuthored = (message: MastraDBMessage): boolean => {
  if (message.role === 'user') return true
  if (message.role !== 'signal') return false
  const signal = message.content.metadata?.signal
  const type = typeof signal === 'object' && signal !== null && 'type' in signal ? signal.type : undefined
  return type === 'user' || type === 'user-message'
}

const reasoningText = (part: ReasoningPart): string =>
  part.reasoning || part.details.flatMap((detail) => detail.type === 'text' ? [detail.text] : []).join('')

function ToolInvocation({ part, live }: Readonly<{ part: ToolInvocationPart; live: ActiveTool | undefined }>) {
  const { toolName, args, state } = part.toolInvocation
  const result = state === 'result' ? part.toolInvocation.result : live?.result
  const running = state !== 'result' && live?.status !== 'completed' && live?.status !== 'error'
  const failed = live?.isError === true || live?.status === 'error'
  const presentation = presentTool(toolName, args)
  const edit = toolEdit(toolName, args)
  const output = live?.shellOutput ?? live?.partialResult
  const resultText = result === undefined ? '' : stringifyToolValue(result)
  return <ToolCall status={failed ? 'error' : running ? 'running' : 'idle'}>
    <ToolCallTrigger>
      <ToolCallPresentedHeader icon={presentation.icon} label={toolSentence(toolName, running)} {...(presentation.detail ? { detail: presentation.detail } : {})} disclosure />
    </ToolCallTrigger>
    <ToolCallContent>
      {presentation.command && <ToolCallCommand command={presentation.command} />}
      {edit ? <ToolCallEdit edit={edit} /> : !presentation.command && <ToolCallMono copyText={stringifyToolValue(args)}>{stringifyToolValue(args)}</ToolCallMono>}
      {running && output && <ToolCallMono copyText={stripAnsi(output)}>{stripAnsi(output)}</ToolCallMono>}
      {resultText && <ToolCallMono copyText={stripAnsi(resultText)}>{stripAnsi(resultText)}</ToolCallMono>}
    </ToolCallContent>
  </ToolCall>
}

function Reasoning({ part, streaming }: Readonly<{ part: ReasoningPart; streaming: boolean }>) {
  const text = reasoningText(part)
  if (!text && !streaming) return null
  return <ToolCall status={streaming ? 'running' : 'idle'}>
    <ToolCallTrigger>
      <ToolCallPresentedHeader icon={Brain} label={streaming ? 'Pensando' : 'Raciocínio'} disclosure={Boolean(text)} />
    </ToolCallTrigger>
    {text && <ToolCallContent><MarkdownRenderer streaming={streaming}>{text}</MarkdownRenderer></ToolCallContent>}
  </ToolCall>
}

const userText = (message: MastraDBMessage): string =>
  message.content.parts.flatMap((part) => part.type === 'text' ? [part.text] : []).join('')

/** An assistant message's own text, empty for anything else (a tool-only step has none to match on). */
const assistantReplyText = (message: MastraDBMessage): string =>
  message.role === 'assistant' ? userText(message) : ''

const messageTime = (message: MastraDBMessage): number => {
  const at = new Date(message.createdAt).getTime()
  return Number.isNaN(at) ? 0 : at
}

function UserBubble({ text, at }: Readonly<{ text: string; at: number | null }>) {
  return <div className="builder-turn builder-turn-user-row">
    <div className="builder-turn builder-turn-user"><MarkdownRenderer>{text}</MarkdownRenderer></div>
    {at !== null && <span className="builder-turn-time">{clockLabel(new Date(at).toISOString())}</span>}
  </div>
}

function RequestTurn({ entry }: Readonly<{ entry: PersistedRequest }>) {
  return <>
    <UserBubble text={entry.text} at={new Date(entry.createdAt).getTime()} />
    {entry.reason && <p className="builder-turn-reason" role="note">{entry.reason}</p>}
  </>
}

const isRunningInvocation = (part: ToolInvocationPart, tools: LiveTurn['tools']): boolean => {
  const live = tools[part.toolInvocation.toolCallId]
  return part.toolInvocation.state !== 'result' && live?.status !== 'completed' && live?.status !== 'error'
}

// Every tool call the agent ran for this turn reads as one action, not a scroll of individual
// steps or one disclosure per message the Factory happened to split the turn across.
function ToolGroup({ parts, tools }: Readonly<{ parts: readonly ToolInvocationPart[]; tools: LiveTurn['tools'] }>) {
  const running = parts.filter((part) => isRunningInvocation(part, tools)).length
  const label = running > 0 ? `Executando ${parts.length} ${parts.length === 1 ? 'ação' : 'ações'}` : `${parts.length} ${parts.length === 1 ? 'ação concluída' : 'ações concluídas'}`
  return <details className="cx-tool-group">
    <summary>
      {running > 0 ? <span className="cx-tool-group-spinner" aria-hidden="true" /> : <Check size={13} className="cx-tool-group-check" aria-hidden="true" />}
      <span>{label}</span>
      <ChevronDown size={13} aria-hidden="true" />
    </summary>
    <div className="cx-tool-group-body">
      {parts.map((part) => <ToolInvocation key={part.toolInvocation.toolCallId} part={part} live={tools[part.toolInvocation.toolCallId]} />)}
    </div>
  </details>
}

function ModelChip({ model }: Readonly<{ model: BuilderModel | null }>) {
  if (!model) return null
  const Icon = providerIcon(model.provider)
  return <span className="builder-turn-model" title={`${providerLabel(model.provider)} · ${model.modelName}`}>
    <Icon width={12} height={12} aria-hidden="true" />
    {humanizeModelName(model.modelName)}
  </span>
}

function AssistantTurn({ model, children }: Readonly<{ model: BuilderModel | null; children: readonly ReactNode[] }>) {
  return <div className="builder-turn builder-turn-assistant">
    <div className="builder-turn-head">
      <ConexusMark size={20} />
      <span className="builder-turn-author">Conexus</span>
      <ModelChip model={model} />
    </div>
    <div className="builder-turn-body">{children}</div>
  </div>
}

// One flat sequence of pieces, built once from settled history, orphan requests and the live turn
// in order, so a run of tool calls groups across whatever message ids the Factory split it into.
type Piece =
  | Readonly<{ kind: 'user'; key: string; text: string; at: number | null }>
  | Readonly<{ kind: 'request'; key: string; entry: PersistedRequest }>
  | Readonly<{ kind: 'tool'; key: string; part: ToolInvocationPart }>
  | Readonly<{ kind: 'text'; key: string; text: string; streaming: boolean }>
  | Readonly<{ kind: 'reasoning'; key: string; part: ReasoningPart; streaming: boolean }>
  | Readonly<{ kind: 'error'; key: string; text: string }>

const flattenMessage = (message: MastraDBMessage, streamingId: string | undefined, reason: string): readonly Piece[] => {
  if (isUserAuthored(message)) {
    const text = userText(message)
    return text ? [{ kind: 'user', key: message.id, text, at: messageTime(message) || null }] : []
  }
  if (message.role !== 'assistant') return []
  const parts = message.content.parts
  const streaming = message.id === streamingId
  return parts.flatMap((part, index): Piece[] => {
    const key = `${message.id}-${index}`
    const last = streaming && index === parts.length - 1
    // A task tool call drives the pinned checklist (construir.tsx, from the AgentController's own
    // display state), not a conversation row: rendering it here too would repeat what the
    // checklist already shows, one row per task_write/task_update/task_check/task_complete call.
    if (part.type === 'tool-invocation') return TASK_TOOL_NAMES.has(part.toolInvocation.toolName) ? [] : [{ kind: 'tool', key, part }]
    if (part.type === 'text') return part.text ? [{ kind: 'text', key, text: part.text, streaming: last }] : []
    if (part.type === 'reasoning') return [{ kind: 'reasoning', key, part, streaming: last }]
    // The provider's own words name sandboxes, ids and stack frames. The category is what the
    // operator is told.
    if (part.type === 'error') return [{ kind: 'error', key, text: reason }]
    return []
  })
}

function renderPieces(pieces: readonly Piece[], tools: LiveTurn['tools'], model: BuilderModel | null): ReactNode[] {
  const out: ReactNode[] = []
  let turnBuffer: ReactNode[] = []
  let toolBuffer: ToolInvocationPart[] = []
  let turnKey = ''
  const flushTools = () => {
    if (!toolBuffer.length) return
    turnBuffer.push(<ToolGroup key={`${turnKey}-tools-${turnBuffer.length}`} parts={toolBuffer} tools={tools} />)
    toolBuffer = []
  }
  const flushTurn = () => {
    flushTools()
    if (turnBuffer.length) out.push(<AssistantTurn key={turnKey} model={model}>{turnBuffer}</AssistantTurn>)
    turnBuffer = []
  }
  for (const piece of pieces) {
    if (piece.kind === 'user') { flushTurn(); out.push(<UserBubble key={piece.key} text={piece.text} at={piece.at} />); continue }
    if (piece.kind === 'request') { flushTurn(); out.push(<RequestTurn key={piece.key} entry={piece.entry} />); continue }
    if (!turnBuffer.length && !toolBuffer.length) turnKey = piece.key
    if (piece.kind === 'tool') { toolBuffer.push(piece.part); continue }
    flushTools()
    if (piece.kind === 'text') turnBuffer.push(<MarkdownRenderer key={piece.key} streaming={piece.streaming}>{piece.text}</MarkdownRenderer>)
    else if (piece.kind === 'reasoning') turnBuffer.push(<Reasoning key={piece.key} part={piece.part} streaming={piece.streaming} />)
    else turnBuffer.push(<p key={piece.key} className="builder-turn-reason" role="note">{piece.text}</p>)
  }
  flushTurn()
  return out
}

export function BuilderConversation({ history, turn, pendingRequest, persistedRequests, failureCategory, model }: Readonly<{
  history: readonly MastraDBMessage[]
  turn: LiveTurn
  pendingRequest: string | null
  persistedRequests: readonly PersistedRequest[]
  failureCategory: BuilderFailureCategory | null
  model: BuilderModel | null
}>) {
  const liveIds = new Set(turn.messages.map((message) => message.id))
  const settled = history.filter((message) => !liveIds.has(message.id))
  // Once a run's turn has ended, the Factory may have finalized its reply under a different message
  // id than the one the live stream used (it can persist the whole tool loop under its own id, with
  // more tool steps than the live copy had captured). Id matching alone then misses the duplicate,
  // so a live assistant reply whose own text already showed up in the settled history is dropped
  // too: the settled copy is the authoritative, complete one.
  const settledReplies = new Set(settled.map(assistantReplyText).filter(Boolean))
  const liveMessages = turn.status !== 'ENDED' ? turn.messages
    : turn.messages.filter((message) => {
      const text = assistantReplyText(message)
      return !text || !settledReplies.has(text)
    })
  const spoken = new Set([...settled, ...liveMessages].filter(isUserAuthored).map(userText))
  const requestVisible = pendingRequest !== null && spoken.has(pendingRequest)
  const orphans = persistedRequests.filter((entry) => !spoken.has(entry.text) && entry.text !== pendingRequest)
  const timeline = [
    ...settled.map((message) => ({ at: messageTime(message), key: message.id, message, entry: null as PersistedRequest | null })),
    ...orphans.map((entry) => ({ at: new Date(entry.createdAt).getTime(), key: `request-${entry.runId}`, message: null, entry })),
  ].sort((left, right) => left.at - right.at)
  const reason = failureReason(failureCategory)
  const streamingId = turn.status === 'LIVE' ? turn.messages.at(-1)?.id : undefined

  const pieces: Piece[] = []
  for (const item of timeline) {
    if (item.entry) pieces.push({ kind: 'request', key: item.key, entry: item.entry })
    else if (item.message) pieces.push(...flattenMessage(item.message, undefined, reason))
  }
  if (pendingRequest !== null && !requestVisible) pieces.push({ kind: 'user', key: 'pending-request', text: pendingRequest, at: null })
  for (const message of liveMessages) pieces.push(...flattenMessage(message, streamingId, reason))

  const rendered = renderPieces(pieces, turn.tools, model)
  return <>
    {rendered}
    {turn.error && <p className="builder-turn-error" role="alert">{reason}</p>}
    {!rendered.length && <p className="builder-conversation-empty">Descreva o aplicativo que você quer criar.</p>}
  </>
}
