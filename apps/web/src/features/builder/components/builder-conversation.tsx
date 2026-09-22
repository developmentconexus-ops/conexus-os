import { MarkdownRenderer } from '@mastra/playground-ui/components/MarkdownRenderer'
import {
  ToolCall, ToolCallCommand, ToolCallContent, ToolCallEdit, ToolCallMono, ToolCallPresentedHeader, ToolCallTrigger,
  presentTool, stringifyToolValue, stripAnsi, toolEdit,
} from '@mastra/playground-ui/components/ai/tool-call'
import { Brain, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ActiveTool, LiveTurn, MastraDBMessage } from '../mastra-session'
import { type BuilderFailureCategory, failureReason } from '../failure-reasons'
import { toolSentence } from '../construir/tool-sentences'

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

const messageTime = (message: MastraDBMessage): number => {
  const at = new Date(message.createdAt).getTime()
  return Number.isNaN(at) ? 0 : at
}

function RequestTurn({ entry }: Readonly<{ entry: PersistedRequest }>) {
  return <>
    <div className="builder-turn builder-turn-user"><MarkdownRenderer>{entry.text}</MarkdownRenderer></div>
    {entry.reason && <p className="builder-turn-reason" role="note">{entry.reason}</p>}
  </>
}

const isRunningInvocation = (part: ToolInvocationPart, tools: LiveTurn['tools']): boolean => {
  const live = tools[part.toolInvocation.toolCallId]
  return part.toolInvocation.state !== 'result' && live?.status !== 'completed' && live?.status !== 'error'
}

// Consecutive tool calls read as one action, not a scroll of individual steps: a single disclosure
// named by how many ran and whether any of them is still going.
function ToolGroup({ parts, tools }: Readonly<{ parts: readonly ToolInvocationPart[]; tools: LiveTurn['tools'] }>) {
  const only = parts.length === 1 ? parts[0] : undefined
  if (only) return <ToolInvocation part={only} live={tools[only.toolInvocation.toolCallId]} />
  const running = parts.filter((part) => isRunningInvocation(part, tools)).length
  const label = running > 0 ? `Executando ${parts.length} ações` : `${parts.length} ações concluídas`
  return <details className="cx-tool-group">
    <summary><ChevronRight size={13} aria-hidden="true" />{label}</summary>
    <div className="cx-tool-group-body">
      {parts.map((part) => <ToolInvocation key={part.toolInvocation.toolCallId} part={part} live={tools[part.toolInvocation.toolCallId]} />)}
    </div>
  </details>
}

function Message({ message, tools, streaming, reason }: Readonly<{ message: MastraDBMessage; tools: LiveTurn['tools']; streaming: boolean; reason: string }>) {
  const parts = message.content.parts
  if (isUserAuthored(message)) {
    const text = userText(message)
    return text ? <div className="builder-turn builder-turn-user"><MarkdownRenderer>{text}</MarkdownRenderer></div> : null
  }
  if (message.role !== 'assistant') return null
  // Runs of tool-invocation parts are rendered as one group; anything else renders on its own.
  const rendered: ReactNode[] = []
  let toolRun: ToolInvocationPart[] = []
  const flushTools = (key: string) => {
    if (!toolRun.length) return
    rendered.push(<ToolGroup key={key} parts={toolRun} tools={tools} />)
    toolRun = []
  }
  parts.forEach((part, index) => {
    const last = streaming && index === parts.length - 1
    const key = `${message.id}-${index}`
    if (part.type === 'tool-invocation') { toolRun.push(part); return }
    flushTools(`${key}-tools`)
    if (part.type === 'text') { if (part.text) rendered.push(<MarkdownRenderer key={key} streaming={last}>{part.text}</MarkdownRenderer>) }
    else if (part.type === 'reasoning') rendered.push(<Reasoning key={key} part={part} streaming={last} />)
    // The provider's own words name sandboxes, ids and stack frames. The category is what the
    // operator is told.
    else if (part.type === 'error') rendered.push(<p key={key} className="builder-turn-reason" role="note">{reason}</p>)
  })
  flushTools(`${message.id}-tools-tail`)
  return <div className="builder-turn builder-turn-assistant">{rendered}</div>
}

export function BuilderConversation({ history, turn, pendingRequest, persistedRequests, failureCategory }: Readonly<{
  history: readonly MastraDBMessage[]
  turn: LiveTurn
  pendingRequest: string | null
  persistedRequests: readonly PersistedRequest[]
  failureCategory: BuilderFailureCategory | null
}>) {
  const liveIds = new Set(turn.messages.map((message) => message.id))
  const settled = history.filter((message) => !liveIds.has(message.id))
  const spoken = new Set([...settled, ...turn.messages].filter(isUserAuthored).map(userText))
  const requestVisible = pendingRequest !== null && spoken.has(pendingRequest)
  const orphans = persistedRequests.filter((entry) => !spoken.has(entry.text) && entry.text !== pendingRequest)
  const timeline = [
    ...settled.map((message) => ({ at: messageTime(message), key: message.id, message, entry: null as PersistedRequest | null })),
    ...orphans.map((entry) => ({ at: new Date(entry.createdAt).getTime(), key: `request-${entry.runId}`, message: null, entry })),
  ].sort((left, right) => left.at - right.at)
  const reason = failureReason(failureCategory)
  const streamingId = turn.status === 'LIVE' ? turn.messages.at(-1)?.id : undefined
  return <>
    {timeline.map((item) => item.message
      ? <Message key={item.key} message={item.message} tools={turn.tools} streaming={false} reason={reason} />
      : item.entry && <RequestTurn key={item.key} entry={item.entry} />)}
    {pendingRequest !== null && !requestVisible && <div className="builder-turn builder-turn-user"><MarkdownRenderer>{pendingRequest}</MarkdownRenderer></div>}
    {turn.messages.map((message) => <Message key={message.id} message={message} tools={turn.tools} streaming={message.id === streamingId} reason={reason} />)}
    {turn.error && <p className="builder-turn-error" role="alert">{reason}</p>}
    {!timeline.length && !turn.messages.length && pendingRequest === null && <p className="builder-conversation-empty">Descreva o aplicativo que você quer criar.</p>}
  </>
}
