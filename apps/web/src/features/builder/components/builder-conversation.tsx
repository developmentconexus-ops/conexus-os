import { MarkdownRenderer } from '@mastra/playground-ui/components/MarkdownRenderer'
import { ScrollArea } from '@mastra/playground-ui/components/ScrollArea'
import { Shimmer } from '@mastra/playground-ui/components/Shimmer'
import { Tooltip, TooltipContent, TooltipTrigger } from '@mastra/playground-ui/components/Tooltip'
import {
  TOOL_GROUP_MIN, ToolCall, ToolCallCommand, ToolCallContent, ToolCallDetail, ToolCallDisclosure, ToolCallEdit, ToolCallHeader, ToolCallIcon,
  ToolCallLabel, ToolCallMono, ToolCallPresentedHeader, ToolCallSpacer, ToolCallTrailing, ToolCallTrigger,
  presentTool, stringifyToolValue, stripAnsi, toolEdit,
} from '@mastra/playground-ui/components/ai/tool-call'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { ConexusMark } from '../../../../../../packages/brand/src/index'
import { providerIcon } from '../composer/model-order'
import { humanizeModelName } from '../composer/model-display-name'
import { providerName } from '../../settings/provider-names'
import type { ActiveTool, BuilderModel, LiveTurn, MastraDBMessage } from '../mastra-session'
import { type BuilderFailureCategory, failureReason } from '../failure-reasons'
import { clockLabel } from '../construir/run-state'
import { TASK_TOOL_NAMES, UNGROUPED_TOOL_NAMES, groupSummary, toolSentence } from '../construir/tool-sentences'

export type PersistedRequest = Readonly<{ runId: string; text: string; createdAt: string; reason: string | null }>
type MessagePart = MastraDBMessage['content']['parts'][number]
type ToolInvocationPart = Extract<MessagePart, { type: 'tool-invocation' }>

const signalType = (message: MastraDBMessage): unknown => {
  const signal = message.content.metadata?.signal
  return message.role === 'signal' && typeof signal === 'object' && signal !== null && 'type' in signal ? signal.type : undefined
}

const isUserAuthored = (message: MastraDBMessage): boolean =>
  message.role === 'user' || signalType(message) === 'user' || signalType(message) === 'user-message'

// The Hub tells the thread what happened to a run with a Mastra `notification` signal. The model reads it
// as context; the person reads it as a notice, never as something the Builder said.
const isNotice = (message: MastraDBMessage): boolean => signalType(message) === 'notification'

type CallState = 'running' | 'failed' | 'done'

// The result the thread records is the truth about a call that has one: a call parked for the person
// and stopped with the run reads "error" in the controller's display state (agent_end marks every
// tool still running that way), yet the person's answer is the call's ordinary result.
const isErrorResult = (result: unknown): boolean =>
  typeof result === 'object' && result !== null && 'isError' in result && result.isError === true

const callState = (part: ToolInvocationPart, live: ActiveTool | undefined): CallState => {
  const { state, result } = part.toolInvocation
  if (state === 'result') return isErrorResult(result) || live?.isError === true ? 'failed' : 'done'
  if (live?.isError === true || live?.status === 'error') return 'failed'
  return live?.status === 'completed' ? 'done' : 'running'
}

const emptyArgs = (args: unknown): boolean =>
  args === null || args === undefined || (typeof args === 'object' && Object.keys(args).length === 0)

// A call is one thing however many snapshots of it the message carries: the controller can append the
// resolved result of a parked call as a new part, with no arguments, after the part that asked. The
// call keeps the place and the arguments of its first snapshot and takes the state of its last.
const mergeCalls = (parts: readonly MessagePart[]): readonly MessagePart[] => {
  const merged: MessagePart[] = []
  const at = new Map<string, number>()
  for (const part of parts) {
    if (part.type !== 'tool-invocation') { merged.push(part); continue }
    const first = at.get(part.toolInvocation.toolCallId)
    const earlier = first === undefined ? undefined : merged[first]
    if (first === undefined || earlier?.type !== 'tool-invocation') { at.set(part.toolInvocation.toolCallId, merged.push(part) - 1); continue }
    merged[first] = { ...part, toolInvocation: { ...part.toolInvocation, args: emptyArgs(part.toolInvocation.args) ? earlier.toolInvocation.args : part.toolInvocation.args } }
  }
  return merged
}

// What the person asked and was answered: the controller words the answer in English, one
// "question: answer" line per question.
const askedAndAnswered = (args: unknown, result: unknown): readonly Readonly<{ question: string; answer: string }>[] => {
  const list = typeof args === 'object' && args !== null && 'questions' in args && Array.isArray(args.questions) ? args.questions : []
  const questions = list.flatMap((entry: unknown) => (typeof entry === 'object' && entry !== null && 'question' in entry && typeof entry.question === 'string' ? [entry.question] : []))
  const content = typeof result === 'object' && result !== null && 'content' in result && typeof result.content === 'string' ? result.content : ''
  const lines = content.replace(/^User answered:\s*/, '').split('\n')
  return questions.map((question, index) => {
    const line = lines[index] ?? ''
    return { question, answer: line.startsWith(`${question}: `) ? line.slice(question.length + 2) : '' }
  })
}

// A call's output is a preview, not the full text: the whole result stays in the run's record.
const OUTPUT_LIMIT = 800
const preview = (text: string): string => {
  const plain = stripAnsi(text)
  return plain.length > OUTPUT_LIMIT ? `${plain.slice(0, OUTPUT_LIMIT)}…` : plain
}

function AskedAndAnswered({ asked }: Readonly<{ asked: readonly Readonly<{ question: string; answer: string }>[] }>) {
  return <>{asked.map(({ question, answer }) => <p key={question} className="cx-asked">{question}{answer && <strong>{answer}</strong>}</p>)}</>
}

// A row is one line, opened on click. An edit opens to its diff and a command to the command with
// its output; any other call opens to its arguments. Only a failure adds the result to a row that
// would not show it.
function ToolInvocation({ part, live }: Readonly<{ part: ToolInvocationPart; live: ActiveTool | undefined }>) {
  const { toolName, args } = part.toolInvocation
  const state = callState(part, live)
  const result = part.toolInvocation.state === 'result' ? part.toolInvocation.result : live?.result
  const presentation = presentTool(toolName, args)
  const edit = toolEdit(toolName, args)
  const resultText = result === undefined ? '' : stringifyToolValue(result)
  const output = presentation.command ? (state === 'running' ? live?.shellOutput ?? live?.partialResult ?? '' : resultText) : state === 'failed' ? resultText : ''
  return <ToolCall status={state === 'done' ? 'idle' : state === 'failed' ? 'error' : 'running'}>
    <ToolCallTrigger>
      <ToolCallPresentedHeader icon={presentation.icon} label={toolSentence(toolName, state === 'running')} {...(presentation.detail ? { detail: presentation.detail } : {})} disclosure />
    </ToolCallTrigger>
    <ToolCallContent>
      {presentation.command && <ToolCallCommand command={presentation.command} />}
      {toolName === 'ask_user' ? <AskedAndAnswered asked={askedAndAnswered(args, result)} />
        : edit ? <ToolCallEdit edit={edit} /> : !presentation.command && <ToolCallMono copyText={stringifyToolValue(args)}>{stringifyToolValue(args)}</ToolCallMono>}
      {output && <ToolCallMono copyText={stripAnsi(output)}>{preview(output)}</ToolCallMono>}
    </ToolCallContent>
  </ToolCall>
}

// The provider's reasoning summary is in its own language and not written for this person, so the
// thread says only that the agent is thinking, and only while it is.
function Thinking() {
  return <p className="cx-thinking" role="status"><Shimmer active>Pensando…</Shimmer></p>
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

// Three or more calls in a row fold into one line. Closed, it names the call running now and how many
// are done; settled, it says what the calls did. Opened, the rows scroll in a fixed height and follow
// the newest while the agent works.
function ToolGroup({ parts, tools }: Readonly<{ parts: readonly ToolInvocationPart[]; tools: LiveTurn['tools'] }>) {
  const states = parts.map((part) => callState(part, tools[part.toolInvocation.toolCallId]))
  const runningIndex = states.lastIndexOf('running')
  const current = runningIndex === -1 ? undefined : parts[runningIndex]
  const presentation = current && presentTool(current.toolInvocation.toolName, current.toolInvocation.args)
  const failed = states.filter((state) => state === 'failed').length
  return <ToolCall status={current ? 'running' : 'idle'}>
    <ToolCallTrigger>
      <ToolCallHeader>
        <ToolCallIcon>{presentation ? <presentation.icon size={14} strokeWidth={1.75} className="text-icon2" aria-hidden="true" /> : <Check size={14} className="cx-tool-group-check" aria-hidden="true" />}</ToolCallIcon>
        <ToolCallLabel className="max-w-full">{current ? toolSentence(current.toolInvocation.toolName, true) : groupSummary(parts.map((part) => part.toolInvocation.toolName), failed)}</ToolCallLabel>
        {presentation?.detail && <ToolCallDetail>{presentation.detail}</ToolCallDetail>}
        <ToolCallSpacer />
        {current && <ToolCallTrailing className="cx-tool-group-count">{parts.length - states.filter((state) => state === 'running').length}/{parts.length}</ToolCallTrailing>}
        <ToolCallDisclosure />
      </ToolCallHeader>
    </ToolCallTrigger>
    <ToolCallContent>
      <ScrollArea maxHeight="18rem" autoScroll={current !== undefined}>
        {parts.map((part) => <ToolInvocation key={part.toolInvocation.toolCallId} part={part} live={tools[part.toolInvocation.toolCallId]} />)}
      </ScrollArea>
    </ToolCallContent>
  </ToolCall>
}

function ModelChip({ model }: Readonly<{ model: BuilderModel | null }>) {
  if (!model) return null
  const Icon = providerIcon(model.provider)
  return <Tooltip>
    <TooltipTrigger render={<span className="builder-turn-model" />}>
      <Icon width={12} height={12} aria-hidden="true" />
      {humanizeModelName(model.modelName)}
    </TooltipTrigger>
    <TooltipContent>{`${providerName(model.provider)} · ${model.modelName}`}</TooltipContent>
  </Tooltip>
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
  | Readonly<{ kind: 'notice'; key: string; text: string }>
  | Readonly<{ kind: 'tool'; key: string; part: ToolInvocationPart }>
  | Readonly<{ kind: 'text'; key: string; text: string; streaming: boolean }>
  | Readonly<{ kind: 'thinking'; key: string }>
  | Readonly<{ kind: 'error'; key: string; text: string }>

const flattenMessage = (message: MastraDBMessage, streamingId: string | undefined, reason: string, parked: ReadonlySet<string>): readonly Piece[] => {
  if (isUserAuthored(message)) {
    const text = userText(message)
    return text ? [{ kind: 'user', key: message.id, text, at: messageTime(message) || null }] : []
  }
  if (isNotice(message)) {
    const text = userText(message)
    return text ? [{ kind: 'notice', key: message.id, text }] : []
  }
  if (message.role !== 'assistant') return []
  const parts = mergeCalls(message.content.parts)
  const streaming = message.id === streamingId
  return parts.flatMap((part, index): Piece[] => {
    const key = `${message.id}-${index}`
    const last = streaming && index === parts.length - 1
    // A task tool call drives the pinned checklist (construir.tsx, from the AgentController's own
    // display state), not a conversation row: rendering it here too would repeat what the
    // checklist already shows, one row per task_write/task_update/task_check/task_complete call.
    // A call parked for the person is answered on its card below the thread, so it has no row yet.
    if (part.type === 'tool-invocation') return TASK_TOOL_NAMES.has(part.toolInvocation.toolName) || parked.has(part.toolInvocation.toolCallId) ? [] : [{ kind: 'tool', key, part }]
    if (part.type === 'text') return part.text ? [{ kind: 'text', key, text: part.text, streaming: last }] : []
    // Only the part still streaming shows: a settled reasoning summary is the provider's own words.
    if (part.type === 'reasoning') return last ? [{ kind: 'thinking', key }] : []
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
    const key = `${turnKey}-tools-${turnBuffer.length}`
    turnBuffer.push(toolBuffer.length >= TOOL_GROUP_MIN
      ? <ToolGroup key={key} parts={toolBuffer} tools={tools} />
      : <div key={key} className="cx-tool-rows">{toolBuffer.map((part) => <ToolInvocation key={part.toolInvocation.toolCallId} part={part} live={tools[part.toolInvocation.toolCallId]} />)}</div>)
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
    if (piece.kind === 'notice') { flushTurn(); out.push(<p key={piece.key} className="builder-turn-reason builder-turn-notice" role="note">{piece.text}</p>); continue }
    if (!turnBuffer.length && !toolBuffer.length) turnKey = piece.key
    if (piece.kind === 'tool' && !UNGROUPED_TOOL_NAMES.has(piece.part.toolInvocation.toolName)) { toolBuffer.push(piece.part); continue }
    flushTools()
    if (piece.kind === 'tool') { toolBuffer.push(piece.part); flushTools(); continue }
    if (piece.kind === 'text') turnBuffer.push(<MarkdownRenderer key={piece.key} streaming={piece.streaming}>{piece.text}</MarkdownRenderer>)
    else if (piece.kind === 'thinking') turnBuffer.push(<Thinking key={piece.key} />)
    else turnBuffer.push(<p key={piece.key} className="builder-turn-reason" role="note">{piece.text}</p>)
  }
  flushTurn()
  return out
}

export function BuilderConversation({ history, turn, pendingRequest, persistedRequests, failure, model }: Readonly<{
  history: readonly MastraDBMessage[]
  turn: LiveTurn
  pendingRequest: string | null
  persistedRequests: readonly PersistedRequest[]
  failure: Readonly<{ failureCategory: BuilderFailureCategory | null; failureCode: string | null }> | null
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
  const reason = failureReason(failure)
  const parked = new Set(Object.keys(turn.waiting))
  const streamingId = turn.status === 'LIVE' ? turn.messages.at(-1)?.id : undefined

  const pieces: Piece[] = []
  for (const item of timeline) {
    if (item.entry) pieces.push({ kind: 'request', key: item.key, entry: item.entry })
    else if (item.message) pieces.push(...flattenMessage(item.message, undefined, reason, parked))
  }
  if (pendingRequest !== null && !requestVisible) pieces.push({ kind: 'user', key: 'pending-request', text: pendingRequest, at: null })
  for (const message of liveMessages) pieces.push(...flattenMessage(message, streamingId, reason, parked))

  const rendered = renderPieces(pieces, turn.tools, model)
  return <>
    {rendered}
    {turn.error && <p className="builder-turn-error" role="alert">{reason}</p>}
    {!rendered.length && <p className="builder-conversation-empty">Descreva o aplicativo que você quer criar.</p>}
  </>
}
