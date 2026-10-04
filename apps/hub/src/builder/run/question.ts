import type { AgentController } from '@mastra/core/agent-controller'
import { z } from 'zod'
import { Failure } from '../../platform/failure.js'
import type { StopReason, WaitEnd } from './ports.js'

type ControllerSession = Awaited<ReturnType<AgentController['createSession']>>

/** A call the thread stores as still waiting on the person (`state: 'call'`). */
type OpenCall = Readonly<{ toolCallId: string; toolName: string; runId: string }>

const suspendedTools = z.record(z.string(), z.object({ toolCallId: z.string(), toolName: z.string(), runId: z.string() }).loose())
const suspendedToolsOf = (metadata: unknown): readonly OpenCall[] => {
  const parsed = z.object({ suspendedTools: suspendedTools }).loose().safeParse(metadata)
  return parsed.success ? Object.values(parsed.data.suspendedTools) : []
}

/**
 * The calls a run suspended on, as Mastra stored them on the thread's assistant message
 * (`metadata.suspendedTools`, written with the suspended snapshot), that still wait. A call a stop
 * denied keeps its record in the metadata, so a call counts only while its tool part is `call`.
 */
const readOpenCalls = async (session: ControllerSession): Promise<readonly OpenCall[]> => {
  const messages = await session.thread.listActiveMessages()
  for (const message of [...messages].reverse()) {
    const waiting = (toolCallId: string): boolean => message.content.parts.some((part) =>
      part.type === 'tool-invocation' && part.toolInvocation.toolCallId === toolCallId && part.toolInvocation.state === 'call')
    const calls = suspendedToolsOf(message.content.metadata).filter((call) => waiting(call.toolCallId))
    if (calls.length > 0) return calls
  }
  return []
}

const POLL_MS = 10

const until = async (holds: () => Promise<boolean>, bound: Readonly<{ ms: number }>): Promise<void> => {
  const deadline = Date.now() + bound.ms
  while (!await holds()) {
    if (Date.now() > deadline) throw new Failure('BUILDER_QUESTION_NOT_RELEASED')
    await new Promise((wake) => { setTimeout(wake, POLL_MS) })
  }
}

/**
 * Resolves once every call the live session holds is stored on the thread. Mastra emits the
 * suspension 13 to 19 ms before it saves the assistant message that holds it, and an abort in that
 * window is overwritten back to `call`.
 */
export const untilQuestionStored = (session: ControllerSession, bound: Readonly<{ ms: number }>): Promise<void> =>
  until(async () => {
    const stored = new Set((await readOpenCalls(session)).map((call) => call.toolCallId))
    return [...session.displayState.get().pendingSuspensions.keys()].every((toolCallId) => stored.has(toolCallId))
  }, bound)

const LOOP_WORKFLOWS = ['agentic-loop', 'executionWorkflow'] as const

/**
 * Ends every open question without an answer: the live one through Mastra's abort, which stores the
 * call as denied, and one a stopped Hub left on the thread through Mastra's deny. Then it waits until
 * Mastra lets go of the thread, and releases what Mastra 1.71 keeps of a suspended run that never
 * resumes (Mastra issue #25903): the `agentic-loop` registration and the two snapshot rows. With
 * nothing open it reads the thread once and changes nothing.
 */
export const endQuestions = async (controller: Pick<AgentController, 'getMastra'>, session: ControllerSession, bound: Readonly<{ ms: number }>): Promise<void> => {
  const threadId = session.thread.requireId()
  const resourceId = session.identity.getResourceId()
  const agent = session.machinery.getAgent()
  if (session.suspensions.hasPending()) {
    await untilQuestionStored(session, bound)
    session.abort()
  } else {
    const lost = await readOpenCalls(session)
    if (lost.length > 0) await session.runEngine.settleSuspendedToolCallsAsDenied(lost.map((call) => ({ ...call, threadId, resourceId })))
  }
  await until(async () => (await readOpenCalls(session)).length === 0 && !agent.listActiveThreadRuns().some((run) => run.threadId === threadId), bound)
  const { runs } = await agent.listSuspendedRuns({ threadId, resourceId })
  if (runs.length === 0) return
  const mastra = controller.getMastra()
  const workflows = await mastra?.getStorage()?.getStore('workflows')
  for (const { runId } of runs) {
    mastra?.__unregisterInternalWorkflow('agentic-loop', runId)
    for (const workflowName of LOOP_WORKFLOWS) await workflows?.deleteWorkflowRunById({ runId, workflowName })
  }
}

type Inbox = Readonly<{
  /** The person's answer to a call pending on the live session. */
  answer(toolCallId: string, resumeData: unknown): AnswerOutcome
  /** A message typed while the run waits; a run that is not waiting is busy. */
  message(content: string, idempotencyKey: string): 'ACCEPTED' | 'BUSY'
  /** The run waits here until the first `WaitEnd`: a reply, the expiry or a stop. */
  wait(input: Readonly<{ waitMs: number; signal: AbortSignal }>): Promise<WaitEnd>
}>

export type AnswerOutcome = 'ACCEPTED' | 'ALREADY_ANSWERED' | 'UNKNOWN_CALL' | 'ENDED'

/**
 * The run's one-slot inbox. Routes, the wait timer and a stop offer a `WaitEnd`; the first one in
 * the slot wins, with no await between the check and the take. Whether a call is pending is read
 * from the session each time, never copied.
 */
export const createInbox = (pending: (toolCallId: string) => boolean, stopReason: (signal: AbortSignal) => StopReason): Inbox => {
  let slot: WaitEnd | null = null
  let waiting = false
  let take: ((end: WaitEnd) => void) | null = null
  const answered = new Set<string>()
  const offer = (end: WaitEnd): boolean => {
    if (slot) return false
    slot = end
    if (take) take(end)
    return true
  }
  return Object.freeze({
    answer: (toolCallId, resumeData) => {
      if (answered.has(toolCallId)) return 'ALREADY_ANSWERED'
      if (!pending(toolCallId)) return 'UNKNOWN_CALL'
      if (!offer({ kind: 'ANSWER', toolCallId, resumeData })) return 'ENDED'
      answered.add(toolCallId)
      return 'ACCEPTED'
    },
    message: (content, idempotencyKey) => (waiting && offer({ kind: 'MESSAGE', content, idempotencyKey }) ? 'ACCEPTED' : 'BUSY'),
    wait: ({ waitMs, signal }) => new Promise<WaitEnd>((resolve) => {
      const expiry = setTimeout(() => { offer({ kind: 'EXPIRED' }) }, waitMs)
      const stopped = (): void => { offer({ kind: 'STOPPED', reason: stopReason(signal) }) }
      take = (end) => {
        clearTimeout(expiry)
        signal.removeEventListener('abort', stopped)
        waiting = false
        take = null
        slot = null
        resolve(end)
      }
      waiting = true
      if (signal.aborted) stopped()
      else signal.addEventListener('abort', stopped, { once: true })
      if (slot) take(slot)
    }),
  })
}
