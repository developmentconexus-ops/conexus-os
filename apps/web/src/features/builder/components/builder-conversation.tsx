import { MarkdownRenderer } from '@mastra/playground-ui/components/MarkdownRenderer'
import { Notice } from '@mastra/playground-ui/components/Notice'
import { ScrollArea } from '@mastra/playground-ui/components/ScrollArea'
import { Shimmer } from '@mastra/playground-ui/components/Shimmer'
import { Tooltip, TooltipContent, TooltipTrigger } from '@mastra/playground-ui/components/Tooltip'
import { useRevealedParts } from '@mastra/playground-ui/components/ai/message-reveal'
import {
  TOOL_GROUP_MIN, ToolCall, ToolCallCommand, ToolCallContent, ToolCallDetail, ToolCallDisclosure, ToolCallEdit, ToolCallHeader, ToolCallIcon,
  ToolCallLabel, ToolCallMono, ToolCallPresentedHeader, ToolCallSpacer, ToolCallTrailing, ToolCallTrigger,
  presentTool, stringifyToolValue, stripAnsi, toolEdit,
} from '@mastra/playground-ui/components/ai/tool-call'
import { Brain, Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { ConexusMark } from '../../../../../../packages/brand/src/index'
import { providerIcon } from '../composer/model-order'
import { humanizeModelName } from '../composer/model-display-name'
import type { MastraDBMessage } from '@mastra/client-js'
import type { BuilderRun } from '../api'
import type { BuilderModel } from '../mastra-session'
import type { MessageEntry, PromptEntry, RuntimeTool, TranscriptEntry } from '../transcript.ts'
import { ASK_USER_TOOL } from '../mastra-tool-names.ts'
import { mergeCalls } from './merge-calls'
import { RunFailure } from '../construir/run-failure'
import { clockLabel, failureOutcome } from '../construir/run-state'
import { TASK_TOOL_NAMES, UNGROUPED_TOOL_NAMES, groupSummary, toolSentence } from '../construir/tool-sentences'

export type PersistedRequest = Readonly<{ runId: string; text: string; createdAt: string }>
type MessagePart = MastraDBMessage['content']['parts'][number]
type ToolInvocationPart = Extract<MessagePart, { type: 'tool-invocation' }>

const signalType = (message: MastraDBMessage): unknown => {
  const signal = message.content.metadata?.signal
  return message.role === 'signal' && typeof signal === 'object' && signal !== null && 'type' in signal ? signal.type : undefined
}

const isUserAuthored = (message: MastraDBMessage): boolean =>
  message.role === 'user' || signalType(message) === 'user' || signalType(message) === 'user-message'

// The Hub tells the thread what happened to a run with a Mastra `notification` signal, written for the
// next model turn. The person reads a Conexus signal by its `outcome`, never from its words, and never
// as something the Builder said. Mastra's completion check writes its verdict as an assistant message;
// it is the Conexus check speaking, so it is a notice too, in the check's own words.
const isCompletionCheck = (message: MastraDBMessage): boolean =>
  message.role === 'assistant' && typeof message.content.metadata === 'object' && message.content.metadata !== null && 'completionResult' in message.content.metadata
const isNotice = (message: MastraDBMessage): boolean => signalType(message) === 'notification' || isCompletionCheck(message)

// The five outcomes that are a run's failure have no entry here: `RunFailure` already says that run.
const CONEXUS_OUTCOME_NOTICE: Readonly<Record<string, string>> = {
  BOOT_PROBLEMS: 'O app abriu, mas com problemas. Peça ao Builder para corrigir.',
  PREVIEW_DATA_RESET: 'Os dados da Prévia foram apagados porque migrações já aplicadas mudaram.',
}

const signalAttribute = (message: MastraDBMessage, name: 'source' | 'outcome'): unknown => {
  const signal = message.content.metadata?.signal
  const attributes = typeof signal === 'object' && signal !== null && 'attributes' in signal ? signal.attributes : null
  return typeof attributes === 'object' && attributes !== null ? Object.entries(attributes).find(([key]) => key === name)?.[1] : undefined
}

const noticeText = (message: MastraDBMessage): string => {
  if (isCompletionCheck(message)) return completionCheckText(message)
  if (signalAttribute(message, 'source') !== 'conexus') return userText(message)
  const outcome = signalAttribute(message, 'outcome')
  return (typeof outcome === 'string' ? CONEXUS_OUTCOME_NOTICE[outcome] : undefined) ?? ''
}

// The check's reason, without Mastra's scoring frame around it: everything from `Reason:` to the
// verdict line Mastra closes the message with, blank lines in the reason included.
const COMPLETION_CHECK_REASON = /Reason: ([\s\S]*?)\n+(?:✅|⚠️|🔄)[^\n]*\s*$/u
const completionCheckText = (message: MastraDBMessage): string =>
  COMPLETION_CHECK_REASON.exec(userText(message))?.[1]?.trim() ?? 'O Conexus verificou o app.'

type CallState = 'running' | 'failed' | 'done'

const isErrorResult = (result: unknown): boolean =>
  typeof result === 'object' && result !== null && (('isError' in result && result.isError === true) || ('error' in result && result.error === true))

// The part the thread holds is the truth about a call. One still open when no run works here was
// cut short with its run.
const callState = (part: ToolInvocationPart, working: boolean): CallState => {
  const { state } = part.toolInvocation
  if (state === 'output-error' || state === 'output-denied') return 'failed'
  if (state === 'result') return isErrorResult(part.toolInvocation.result) || ('isError' in part.toolInvocation && part.toolInvocation.isError === true) ? 'failed' : 'done'
  return working ? 'running' : 'failed'
}

// Whether a run works here, and the output the stream reported for each call by its id.
type Calls = Readonly<{ working: boolean; runtime: ReadonlyMap<string, RuntimeTool> }>

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
function ToolInvocation({ part, calls }: Readonly<{ part: ToolInvocationPart; calls: Calls }>) {
  const { toolName, args } = part.toolInvocation
  const state = callState(part, calls.working)
  const live = calls.runtime.get(part.toolInvocation.toolCallId)
  const result = part.toolInvocation.state === 'result' ? part.toolInvocation.result : live?.result
  const presentation = presentTool(toolName, args)
  const edit = toolEdit(toolName, args)
  const resultText = result === undefined ? '' : stringifyToolValue(result)
  const running = live?.output || (typeof live?.result === 'string' ? live.result : '')
  const output = presentation.command ? (state === 'running' ? running : resultText) : state === 'failed' ? resultText : ''
  return <ToolCall status={state === 'done' ? 'idle' : state === 'failed' ? 'error' : 'running'}>
    <ToolCallTrigger>
      <ToolCallPresentedHeader icon={presentation.icon} label={toolSentence(toolName, state === 'running')} {...(presentation.detail ? { detail: presentation.detail } : {})} disclosure />
    </ToolCallTrigger>
    <ToolCallContent>
      {presentation.command && <ToolCallCommand command={presentation.command} />}
      {toolName === ASK_USER_TOOL ? <AskedAndAnswered asked={askedAndAnswered(args, result)} />
        : edit ? <ToolCallEdit edit={edit} /> : !presentation.command && <ToolCallMono copyText={stringifyToolValue(args)}>{stringifyToolValue(args)}</ToolCallMono>}
      {output && <ToolCallMono copyText={stripAnsi(output)}>{preview(output)}</ToolCallMono>}
    </ToolCallContent>
  </ToolCall>
}

// While the agent thinks the thread says so; a thought that settled is a collapsed row that opens to
// the provider's own words, the way a tool call opens to its arguments.
function Thinking() {
  return <p className="cx-thinking" role="status"><Shimmer active>Pensando…</Shimmer></p>
}

function Thought({ text }: Readonly<{ text: string }>) {
  return <ToolCall status="idle">
    <ToolCallTrigger>
      <ToolCallPresentedHeader icon={Brain} label="Pensou" disclosure />
    </ToolCallTrigger>
    <ToolCallContent>
      <ToolCallMono copyText={text}>{text}</ToolCallMono>
    </ToolCallContent>
  </ToolCall>
}

const userText = (message: MastraDBMessage): string =>
  message.content.parts.flatMap((part) => part.type === 'text' ? [part.text] : []).join('')

const messageTime = (message: MastraDBMessage): number => {
  const at = new Date(message.createdAt).getTime()
  return Number.isNaN(at) ? 0 : at
}

// A message this page sent that never reached the Hub keeps its place and its words, marked unsent.
function UserBubble({ text, at, delivery }: Readonly<{ text: string; at: number | null; delivery?: 'unknown' | 'failed' | undefined }>) {
  return <div className="builder-turn builder-turn-user-row">
    <div className="builder-turn builder-turn-user"><MarkdownRenderer>{text}</MarkdownRenderer></div>
    {delivery === 'failed' ? <span className="builder-turn-unsent">Não enviado</span>
      : delivery === 'unknown' ? <span className="builder-turn-unsent">Sem confirmação</span>
      : at !== null && <span className="builder-turn-time">{clockLabel(new Date(at).toISOString())}</span>}
  </div>
}

// What the thread says about the model in Conexus's words while it retries.
function TurnNotice({ text }: Readonly<{ text: string }>) {
  return <div className="builder-turn-status" role="status">
    <Notice variant="info"><Notice.Message>{text}</Notice.Message></Notice>
  </div>
}

function RequestTurn({ entry }: Readonly<{ entry: PersistedRequest }>) {
  return <UserBubble text={entry.text} at={new Date(entry.createdAt).getTime()} />
}

// Three or more calls in a row fold into one line. Closed, it names the call running now and how many
// are done; settled, it says what the calls did. Opened, the rows scroll in a fixed height and follow
// the newest while the agent works.
function ToolGroup({ parts, calls }: Readonly<{ parts: readonly ToolInvocationPart[]; calls: Calls }>) {
  const states = parts.map((part) => callState(part, calls.working))
  const runningIndex = states.lastIndexOf('running')
  const current = runningIndex === -1 ? undefined : parts[runningIndex]
  const presentation = current && presentTool(current.toolInvocation.toolName, current.toolInvocation.args)
  const failed = states.filter((state) => state === 'failed').length
  return <ToolCall status={current ? 'running' : 'idle'}>
    <ToolCallTrigger>
      <ToolCallHeader>
        <ToolCallIcon>{presentation ? <presentation.icon size={14} strokeWidth={1.75} aria-hidden="true" /> : <Check size={14} className="cx-tool-group-check" aria-hidden="true" />}</ToolCallIcon>
        <ToolCallLabel className="max-w-full">{current ? toolSentence(current.toolInvocation.toolName, true) : groupSummary(parts.map((part) => part.toolInvocation.toolName), failed)}</ToolCallLabel>
        {presentation?.detail && <ToolCallDetail>{presentation.detail}</ToolCallDetail>}
        <ToolCallSpacer />
        {current && <ToolCallTrailing className="cx-tool-group-count">{parts.length - states.filter((state) => state === 'running').length}/{parts.length}</ToolCallTrailing>}
        <ToolCallDisclosure />
      </ToolCallHeader>
    </ToolCallTrigger>
    <ToolCallContent>
      <ScrollArea maxHeight="18rem" autoScroll={current !== undefined}>
        {parts.map((part) => <ToolInvocation key={part.toolInvocation.toolCallId} part={part} calls={calls} />)}
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
    <TooltipContent>{`${model.providerName} · ${model.modelName}`}</TooltipContent>
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


// One flat sequence of pieces, built once from the transcript and the orphan requests in order, so a
// run of tool calls groups across whatever message ids the controller split it into.
type Piece =
  | Readonly<{ kind: 'user'; key: string; text: string; at: number | null; delivery?: 'unknown' | 'failed' | undefined }>
  | Readonly<{ kind: 'request'; key: string; entry: PersistedRequest }>
  | Readonly<{ kind: 'notice'; key: string; text: string }>
  | Readonly<{ kind: 'status'; key: string; text: string }>
  | Readonly<{ kind: 'failure'; key: string; run: BuilderRun }>
  | Readonly<{ kind: 'prompt'; key: string; prompt: PromptEntry }>
  | Readonly<{ kind: 'tool'; key: string; part: ToolInvocationPart }>
  | Readonly<{ kind: 'text'; key: string; text: string; streaming: boolean }>
  | Readonly<{ kind: 'thinking'; key: string }>
  | Readonly<{ kind: 'thought'; key: string; text: string }>

const flattenMessage = (entry: MessageEntry, message: MastraDBMessage, streaming: boolean, awaited: ReadonlySet<string>): readonly Piece[] => {
  const key = entry.id
  if (isUserAuthored(message)) {
    const text = userText(message)
    return text ? [{ kind: 'user', key, text, at: messageTime(message) || null, delivery: entry.delivery === 'unknown' || entry.delivery === 'failed' ? entry.delivery : undefined }] : []
  }
  if (isNotice(message)) {
    const text = noticeText(message)
    return text ? [{ kind: 'notice', key, text }] : []
  }
  if (message.role !== 'assistant') return []
  const parts = message.content.parts
  return parts.flatMap((part, index): Piece[] => {
    const partKey = `${key}-${index}`
    const last = streaming && index === parts.length - 1
    // A task tool call drives the pinned checklist (construir.tsx, from the AgentController's own
    // display state), not a conversation row: rendering it here too would repeat what the
    // checklist already shows, one row per task_write/task_update/task_check/task_complete call.
    // A call the run waits on the person for is answered on its card, so it has no row yet.
    if (part.type === 'tool-invocation') return TASK_TOOL_NAMES.has(part.toolInvocation.toolName) || awaited.has(part.toolInvocation.toolCallId) ? [] : [{ kind: 'tool', key: partKey, part }]
    if (part.type === 'text') return part.text ? [{ kind: 'text', key: partKey, text: part.text, streaming: last }] : []
    // The part still streaming says the agent is thinking; a settled one is a row that opens to its text.
    if (part.type === 'reasoning') return last ? [{ kind: 'thinking', key: partKey }] : part.reasoning.trim() ? [{ kind: 'thought', key: partKey, text: part.reasoning }] : []
    // Mastra's stored error part carries the provider's own words, which name sandboxes, ids and
    // stack frames. The run's failure is `RunFailure`'s to say, so the part draws nothing.
    return []
  })
}

function renderPieces(pieces: readonly Piece[], calls: Calls, model: BuilderModel | null, renderPrompt: (prompt: PromptEntry) => ReactNode): ReactNode[] {
  const out: ReactNode[] = []
  let turnBuffer: ReactNode[] = []
  let toolBuffer: ToolInvocationPart[] = []
  let turnKey = ''
  const flushTools = () => {
    if (!toolBuffer.length) return
    const key = `${turnKey}-tools-${turnBuffer.length}`
    turnBuffer.push(toolBuffer.length >= TOOL_GROUP_MIN
      ? <ToolGroup key={key} parts={toolBuffer} calls={calls} />
      : <div key={key} className="cx-tool-rows">{toolBuffer.map((part) => <ToolInvocation key={part.toolInvocation.toolCallId} part={part} calls={calls} />)}</div>)
    toolBuffer = []
  }
  const flushTurn = () => {
    flushTools()
    if (turnBuffer.length) out.push(<AssistantTurn key={turnKey} model={model}>{turnBuffer}</AssistantTurn>)
    turnBuffer = []
  }
  for (const piece of pieces) {
    if (piece.kind === 'user') { flushTurn(); out.push(<UserBubble key={piece.key} text={piece.text} at={piece.at} delivery={piece.delivery} />); continue }
    if (piece.kind === 'request') { flushTurn(); out.push(<RequestTurn key={piece.key} entry={piece.entry} />); continue }
    if (piece.kind === 'notice') { flushTurn(); out.push(<div key={piece.key} className="builder-turn-notice" role="note"><Notice variant="note"><Notice.Message>{piece.text}</Notice.Message></Notice></div>); continue }
    if (piece.kind === 'prompt') { flushTurn(); out.push(<div key={piece.key}>{renderPrompt(piece.prompt)}</div>); continue }
    if (piece.kind === 'status') { flushTurn(); out.push(<TurnNotice key={piece.key} text={piece.text} />); continue }
    if (piece.kind === 'failure') { flushTurn(); out.push(<RunFailure key={piece.key} run={piece.run} />); continue }
    if (!turnBuffer.length && !toolBuffer.length) turnKey = piece.key
    if (piece.kind === 'tool' && !UNGROUPED_TOOL_NAMES.has(piece.part.toolInvocation.toolName)) { toolBuffer.push(piece.part); continue }
    flushTools()
    if (piece.kind === 'tool') { toolBuffer.push(piece.part); flushTools(); continue }
    if (piece.kind === 'text') turnBuffer.push(<MarkdownRenderer key={piece.key} streaming={piece.streaming}>{piece.text}</MarkdownRenderer>)
    else if (piece.kind === 'thinking') turnBuffer.push(<Thinking key={piece.key} />)
    else turnBuffer.push(<div key={piece.key} className="cx-tool-rows"><Thought text={piece.text} /></div>)
  }
  flushTurn()
  return out
}

// The reply the run here is writing, paced by Mastra's message reveal. Every assistant message since
// the person last spoke is one script, so a message that starts mid-turn continues the clock rather
// than restarting it, and the person's next message empties the script and starts a new one.
const useRevealedTurn = (messages: readonly MessageEntry[], merged: ReadonlyMap<string, MastraDBMessage>, working: boolean): Readonly<{ revealed: ReadonlyMap<string, MessagePart[]>; caughtUp: boolean }> => {
  let start = 0
  messages.forEach((entry, index) => { if (isUserAuthored(entry.message)) start = index + 1 })
  const turn = messages.slice(start).flatMap((entry) => {
    const message = merged.get(entry.id) ?? entry.message
    return message.role === 'assistant' && !isNotice(message) ? [{ id: entry.id, parts: message.content.parts }] : []
  })
  const script = turn.flatMap((message) => message.parts)
  const shown = useRevealedParts(script, working)
  // A part is the same object once fully revealed and a copy while it is typed out.
  const caughtUp = shown.length === script.length && shown.every((part, index) => part === script[index])
  const revealed = new Map<string, MessagePart[]>()
  let at = 0
  for (const message of turn) {
    revealed.set(message.id, shown.slice(at, at + message.parts.length))
    at += message.parts.length
  }
  return { revealed, caughtUp }
}

// Which persisted request each message the thread showed back answers, one message to one request.
// A local bubble still waiting on its send never stands in for the Hub's own row, which stays an orphan.
const matchRequests = (messages: readonly MessageEntry[], requests: readonly PersistedRequest[]): Readonly<{ owner: ReadonlyMap<string, PersistedRequest>; orphans: readonly PersistedRequest[] }> => {
  const shown = messages.filter((entry) => entry.delivery === undefined && isUserAuthored(entry.message))
  const owner = new Map<string, PersistedRequest>()
  const orphans: PersistedRequest[] = []
  for (const request of requests) {
    const bubble = shown.find((entry) => !owner.has(entry.id) && userText(entry.message) === request.text)
    if (bubble) owner.set(bubble.id, request)
    else orphans.push(request)
  }
  return { owner, orphans }
}

export function BuilderConversation({ entries, persistedRequests, runs, model, working, renderPrompt }: Readonly<{
  entries: readonly TranscriptEntry[]
  persistedRequests: readonly PersistedRequest[]
  // The conversation's runs, oldest first. Each run that settled in a failure ends its own turn with it.
  runs: readonly BuilderRun[]
  model: BuilderModel | null
  // The run here is in its agent step: until it speaks after the person, the thread says it is thinking.
  working: boolean
  // Draws a call the run here waits on the person for; absent while no run here waits.
  renderPrompt?: (prompt: PromptEntry) => ReactNode
}>) {
  const messages = entries.filter((entry): entry is MessageEntry => entry.kind === 'message')
  const merged = new Map(mergeCalls(messages.map((entry) => entry.message)).map((message, index) => [messages[index]?.id ?? '', message]))
  const { owner, orphans: unspoken } = matchRequests(messages, persistedRequests)
  const orphans = unspoken.map((entry) => ({ at: new Date(entry.createdAt).getTime(), entry })).sort((left, right) => left.at - right.at)
  const prompts = renderPrompt ? entries.filter((entry): entry is PromptEntry => entry.kind === 'prompt') : []
  const awaited = new Set(prompts.map((prompt) => prompt.toolCallId))
  const { revealed, caughtUp } = useRevealedTurn(messages, merged, working)
  const runtime = new Map(messages.flatMap((entry) => Object.values(entry.runtimeTools ?? {}).map((tool): [string, RuntimeTool] => [tool.toolCallId, tool])))

  const pieces: Piece[] = []
  let spokeSinceUser = false
  // A run's failure ends its turn: it comes before the request that began a later run, and the newest
  // run's comes last. A bubble no request answers is the send still on its way, so it begins the newest run.
  const owed = runs.filter((run) => failureOutcome(run) !== null)
  const newest = runs.at(-1)?.createdAt ?? null
  const failuresBefore = (boundary: string | null): void => {
    while (owed.length && (boundary === null || (owed[0]?.createdAt ?? '') < boundary)) {
      const run = owed.shift()
      if (run) pieces.push({ kind: 'failure', key: `failure-${run.builderRunId}`, run })
    }
  }
  const requestsBefore = (at: number): void => {
    while (orphans.length && (orphans[0]?.at ?? 0) < at) {
      const next = orphans.shift()
      if (!next) continue
      failuresBefore(next.entry.createdAt)
      pieces.push({ kind: 'request', key: `request-${next.entry.runId}`, entry: next.entry })
    }
  }
  for (const entry of entries) {
    if (entry.kind === 'prompt') {
      // The card waits for the words above it: shown first, it would be pushed down as they are revealed.
      if (renderPrompt && caughtUp) pieces.push({ kind: 'prompt', key: entry.id, prompt: entry })
      continue
    }
    if (entry.kind === 'notice') {
      pieces.push({ kind: 'status', key: entry.id, text: entry.text })
      continue
    }
    const whole = merged.get(entry.id) ?? entry.message
    const parts = revealed.get(entry.id)
    const message = parts ? { ...whole, content: { ...whole.content, parts } } : whole
    requestsBefore(messageTime(message))
    if (isUserAuthored(message)) failuresBefore(owner.get(entry.id)?.createdAt ?? newest)
    const flat = flattenMessage(entry, message, working && entry.streaming === true, awaited)
    for (const piece of flat) spokeSinceUser = piece.kind === 'user' ? false : piece.kind === 'notice' ? spokeSinceUser : true
    pieces.push(...flat)
  }
  requestsBefore(Number.POSITIVE_INFINITY)
  failuresBefore(null)
  if (working && prompts.length === 0 && !spokeSinceUser) pieces.push({ kind: 'thinking', key: 'awaiting-first-part' })

  const rendered = renderPieces(pieces, { working, runtime }, model, renderPrompt ?? (() => null))
  return <>
    {rendered}
    {!rendered.length && <p className="builder-conversation-empty">Descreva o aplicativo que você quer criar.</p>}
  </>
}
