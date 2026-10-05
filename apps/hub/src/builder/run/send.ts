import type { AgentControllerEvent } from '@mastra/core/agent-controller'
import type { RequestContext } from '@mastra/core/request-context'
import { classifyAgentFailure, safeCause } from '../runtime.js'
import { Failure } from '../../platform/failure.js'
import type { ControllerSession, SendableAgentEndReason, Step } from './ports.js'

type AgentEndReason = Extract<AgentControllerEvent, { type: 'agent_end' }>['reason']

type Tripwire = Readonly<{ processorId: string | undefined; reason: string }>

// A processor that aborts (observational memory does when it cannot reach its store) ends the run
// with a lone `tripwire` chunk that Mastra's AgentController has no case for, so sendMessage
// never settles (docs/reference/mastra/boundary.md, U6).
const watchTripwire = async (session: ControllerSession, onTripwire: (tripwire: Tripwire) => void): Promise<() => void> => {
  const subscription = await session.machinery.subscribeToThread({
    resourceId: session.identity.getResourceId(),
    threadId: session.thread.requireId(),
  })
  void (async () => {
    for await (const chunk of subscription.stream) {
      if (chunk.type === 'tripwire' && !chunk.payload.retry) onTripwire({ processorId: chunk.payload.processorId, reason: chunk.payload.reason })
    }
  })().catch(() => undefined)
  return () => subscription.unsubscribe()
}

// The one place the Hub sends a message or an answer to the agent. A message goes only once every
// open question has ended: Mastra drops a message sent while a question waits, without an error.
export const driveStep = async (session: ControllerSession, step: Step, requestContext: RequestContext, endOpenQuestions: () => Promise<void>): Promise<SendableAgentEndReason> => {
  if (step.kind === 'SEND') await endOpenQuestions()
  let terminalReason: AgentEndReason | undefined
  let agentError: Error | undefined
  let tripwire: Tripwire | undefined
  let ended: () => void = () => undefined
  const runEnded = new Promise<void>((resolve) => { ended = resolve })
  const stopWatching = await watchTripwire(session, (tripped) => {
    tripwire = tripped
    session.abort()
  })
  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'agent_end') { terminalReason = event.reason; ended() }
    if (event.type === 'error') agentError = event.error
  })
  try {
    try {
      if (step.kind === 'ANSWER') {
        await session.respondToToolSuspension({ toolCallId: step.toolCallId, resumeData: step.resumeData, requestContext })
        await runEnded
      } else {
        await session.sendMessage({ content: step.content, requestContext })
      }
    } catch (error) {
      const code = classifyAgentFailure(error)
      throw code ? new Failure(code, { cause: safeCause(error) }) : error
    }
    if (tripwire) throw new Failure('BUILDER_AGENT_TRIPWIRE', { cause: tripwire, ...(tripwire.processorId ? { details: { processorId: tripwire.processorId } } : {}) })
    if (!terminalReason) throw new Failure('BUILDER_AGENT_COMPLETION_UNAVAILABLE')
    if (terminalReason === 'error') {
      throw new Failure((agentError ? classifyAgentFailure(agentError) : null) ?? 'BUILDER_MODEL_STREAM_FAILED', { cause: safeCause(agentError) })
    }
    return terminalReason
  } finally {
    unsubscribe()
    stopWatching()
  }
}
