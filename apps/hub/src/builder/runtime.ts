import type { AgentController, AgentControllerEvent } from '@mastra/core/agent-controller'
import { parseError } from '@mastra/code-sdk/utils/errors'
import { isMastraTimeoutError } from '@mastra/core/loop'
import type { RequestContext } from '@mastra/core/request-context'
import type { CompiledApplication } from './application-artifact-runtime.js'

type CodingWorkerResultScope = Readonly<{
  runtimeId: 'conexus-builder-e2b-v1'
  projectId: string
  executionId: string
  sandboxId: string
  baseSourceRevision: string
  summary: string
}>

// A failure the agent's work itself caused travels back as data, not as a rejected promise, so the
// admitted source still settles as a build failure. Anything else (a workspace fault, cancellation)
// is still a thrown failure.
export type ApplicationBuildOutcome =
  /** `bootProblems`: what the page did when opened that does not withhold the Preview, for the next turn. */
  | Readonly<{ kind: 'BUILT'; compiledApplication: CompiledApplication; bootProblems?: string }>
  | Readonly<{ kind: 'BUILD_FAILED'; code: string; detail?: string }>

export type CodingWorkerResult = CodingWorkerResultScope & Readonly<{ kind: 'RESPONSE_ONLY' }>

// A run that asked the person something ends its leg here, with nothing held; the answer starts the next.
export type ParkedResult = CodingWorkerResultScope & Readonly<{ kind: 'PARKED' }>

// A repository-hosted source is admitted by the runtime itself: the compare-and-swap on the
// default branch is the admission, so the service records it and never admits it again.
export type SourceAdmittedResult = CodingWorkerResultScope & Readonly<{
  kind: 'SOURCE_ADMITTED'
  resultSourceRevision: string
  applicationBuild: ApplicationBuildOutcome
}>

type BuilderSession = Awaited<ReturnType<AgentController['createSession']>>

type AgentEndReason = Extract<AgentControllerEvent, { type: 'agent_end' }>['reason']
type SendableAgentEndReason = Exclude<AgentEndReason, 'error'>

export const BUILDER_TRACE_REQUEST_CONTEXT_KEYS = Object.freeze([
  'conexusBuilderProjectId',
  'conexusBuilderRunId',
])

const NO_MODEL_ACCOUNT = 'BUILDER_MODEL_NOT_SELECTED'

// The resolver throws this when the model being called has no account; Mastra may wrap the throw.
const namesNoModelAccount = (error: unknown): boolean =>
  error instanceof Error && (error.message === NO_MODEL_ACCOUNT || namesNoModelAccount(error.cause))

const namesStepTimeout = (error: unknown): boolean =>
  isMastraTimeoutError(error) ? error.timeoutType === 'step' : error instanceof Error && error.cause !== undefined && namesStepTimeout(error.cause)

const MAX_CONTINUATION_DELAY_MS = 30_000

type AgentFailureCode = 'BUILDER_MODEL_RATE_LIMITED' | 'BUILDER_MODEL_AUTH_FAILED' | 'BUILDER_AGENT_PLATFORM_FAILED' | 'BUILDER_MODEL_STEP_TIMEOUT' | typeof NO_MODEL_ACCOUNT

/** A failure the agent ended with. `retryDelayMs` is set only when the same session may be continued. */
class BuilderAgentError extends Error {
  constructor(code: string, readonly retryDelayMs: number | null, options?: ErrorOptions) {
    super(code, options)
  }
}

const hasHttpStatus = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && ('statusCode' in error || 'status' in error)

// A timeout or dropped connection with no HTTP status never reached a provider, so it came from
// storage or the network under the loop, not from the model. Only that failure may be continued:
// the model's own transient failures (5xx, ECONNRESET, 529) are retried inside the call by Mastra's
// StreamErrorRetryProcessor (harness/error-processors.ts) before they ever reach this code.
const classifyAgentFailure = (error: unknown): Readonly<{ code: AgentFailureCode | null; retryDelayMs: number | null }> => {
  if (namesNoModelAccount(error)) return { code: NO_MODEL_ACCOUNT, retryDelayMs: null }
  // One model call outran its time budget (`BUILDER_MODEL_STEP_TIMEOUT_MS`); continuing would only run it again.
  if (namesStepTimeout(error)) return { code: 'BUILDER_MODEL_STEP_TIMEOUT', retryDelayMs: null }
  const { type, retryable, retryDelay } = parseError(error)
  if (type === 'rate_limit') return { code: 'BUILDER_MODEL_RATE_LIMITED', retryDelayMs: null }
  if (type === 'auth') return { code: 'BUILDER_MODEL_AUTH_FAILED', retryDelayMs: null }
  if ((type === 'timeout' || type === 'network') && !hasHttpStatus(error)) {
    return { code: 'BUILDER_AGENT_PLATFORM_FAILED', retryDelayMs: retryable ? Math.min(retryDelay ?? 0, MAX_CONTINUATION_DELAY_MS) : null }
  }
  return { code: null, retryDelayMs: null }
}

type Tripwire = Readonly<{ processorId: string | undefined; reason: string }>

// A processor that aborts (observational memory does when it cannot reach its store) ends the run
// with a lone `tripwire` chunk that Mastra's AgentController has no case for, so sendMessage
// never settles (docs/reference/mastra-boundary.md, U6).
const watchTripwire = async (session: BuilderSession, onTripwire: (tripwire: Tripwire) => void): Promise<() => void> => {
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

/** What starts an agent step: the person's message, or the answer to the call a parked run waits on. */
export type BuilderStep = Readonly<{ content: string }> | Readonly<{ resume: Readonly<{ toolCallId: string; resumeData: unknown }> }>

type ParkedCall = Readonly<{ toolCallId: string; toolName: string; runId: string }>

/**
 * The calls a run parked on, as Mastra recorded them on the thread's assistant message
 * (`metadata.suspendedTools`, written with the suspended snapshot), so they can be read in a Hub
 * that never saw the suspension.
 */
export const readParkedCalls = async (session: BuilderSession): Promise<readonly ParkedCall[]> => {
  const messages = await session.thread.listActiveMessages() as readonly Readonly<{ content?: { metadata?: unknown } }>[]
  for (const message of [...messages].reverse()) {
    const suspended = (message.content?.metadata as { suspendedTools?: Readonly<Record<string, { toolCallId?: unknown; toolName?: unknown; runId?: unknown }>> } | undefined)?.suspendedTools
    const calls = Object.values(suspended ?? {}).flatMap((call) =>
      typeof call.toolCallId === 'string' && typeof call.toolName === 'string' && typeof call.runId === 'string' ? [{ toolCallId: call.toolCallId, toolName: call.toolName, runId: call.runId }] : [])
    if (calls.length > 0) return calls
  }
  return []
}

/** Tells a new session of the calls a run parked on: Mastra's own list of them lives in the session that saw the suspension. */
const registerParkedCalls = (session: BuilderSession, calls: readonly ParkedCall[]): void => {
  for (const call of calls) session.suspensions.register({ ...call, threadId: session.thread.requireId(), resourceId: session.identity.getResourceId() })
}

/** @public Tests import this at runtime from the built module. */
export const sendBuilderSessionMessage = async (
  session: BuilderSession,
  step: BuilderStep,
  requestContext?: RequestContext,
): Promise<SendableAgentEndReason> => {
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
      if ('resume' in step) {
        const { toolCallId, resumeData } = step.resume
        const call = (await readParkedCalls(session)).find((parked) => parked.toolCallId === toolCallId)
        if (!call) throw new Error('BUILDER_SUSPENSION_NOT_FOUND')
        // The session is new, so Mastra's in-memory list of parked calls is empty; the call is
        // registered from its stored record, and Mastra resumes the run from its stored snapshot.
        registerParkedCalls(session, [call])
        await session.respondToToolSuspension({ toolCallId, resumeData, ...(requestContext ? { requestContext } : {}) })
        await runEnded
      } else {
        await session.sendMessage({ ...step, ...(requestContext ? { requestContext } : {}) })
      }
    } catch (error) {
      const { code, retryDelayMs } = classifyAgentFailure(error)
      throw code ? new BuilderAgentError(code, retryDelayMs, { cause: error }) : error
    }
    if (tripwire) throw new Error('BUILDER_AGENT_TRIPWIRE', { cause: tripwire })
    if (!terminalReason) throw new Error('BUILDER_AGENT_COMPLETION_UNAVAILABLE')
    if (terminalReason === 'error') {
      const { code, retryDelayMs } = agentError ? classifyAgentFailure(agentError) : { code: null, retryDelayMs: null }
      throw new BuilderAgentError(code ?? 'BUILDER_MODEL_STREAM_FAILED', retryDelayMs, agentError ? { cause: agentError } : undefined)
    }
    return terminalReason
  } finally {
    unsubscribe()
    stopWatching()
  }
}

const MAX_CONTINUATIONS = 2
// A storage fault ends the loop step, and a session has no call to carry on a turn: sendMessage
// takes content and nothing else. So the continuation sends this one line, and the model resumes
// from the thread's last saved message. It names the storage fault because that is the only fault
// that reaches it; the model's own failures are retried by Mastra, with no message at all.
const CONTINUE_MESSAGE = 'Uma falha passageira de armazenamento interrompeu a execução. Continue de onde parou.'

const wait = (ms: number, signal: AbortSignal | undefined): Promise<void> => new Promise((resolve) => {
  if (signal?.aborted) return resolve()
  const done = (): void => { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve() }
  const timer = setTimeout(done, ms)
  signal?.addEventListener('abort', done, { once: true })
})

/**
 * Sends the message, and when the agent ends on a platform fault under the loop (storage or the
 * network, never the model), continues the same session up to MAX_CONTINUATIONS times. Auth, tripwires, cancellation and everything
 * else that carries no retry delay end the turn on the first failure.
 */
export const sendBuilderTurnMessage = async (
  session: BuilderSession,
  step: BuilderStep,
  { requestContext, signal, onContinuation }: Readonly<{ requestContext?: RequestContext; signal?: AbortSignal; onContinuation?: (continuations: number) => void }> = {},
): Promise<SendableAgentEndReason> => {
  for (let continuations = 0; ; continuations += 1) {
    try {
      return await sendBuilderSessionMessage(session, continuations === 0 ? step : { content: CONTINUE_MESSAGE }, requestContext)
    } catch (error) {
      const delay = error instanceof BuilderAgentError ? error.retryDelayMs : null
      if (delay === null || continuations === MAX_CONTINUATIONS || signal?.aborted) throw error
      await wait(delay, signal)
      if (signal?.aborted) throw error
      onContinuation?.(continuations + 1)
    }
  }
}

export const messageText = (message: Readonly<{ content?: Readonly<{ parts?: readonly unknown[] }> }>): string => {
  const parts = Array.isArray(message.content?.parts) ? message.content.parts : []
  return parts.flatMap((part) => {
    if (typeof part !== 'object' || part === null || !('type' in part) || part.type !== 'text' || !('text' in part) || typeof part.text !== 'string') return []
    return [part.text]
  }).join('')
}

export const isUserAuthoredMessage = (message: Readonly<{ role?: string; content?: unknown }>): boolean => {
  if (message.role === 'user') return true
  if (message.role !== 'signal' || typeof message.content !== 'object' || message.content === null) return false
  const content = message.content as Record<string, unknown>
  const metadata = content.metadata
  if (typeof metadata !== 'object' || metadata === null) return false
  const signal = (metadata as Record<string, unknown>).signal
  if (typeof signal !== 'object' || signal === null) return false
  const type = (signal as Record<string, unknown>).type
  return type === 'user' || type === 'user-message'
}

/** `git ls-tree -r -l HEAD app/` output, held to the limits the compile input has always had. */
// The server half of the source a build compiles; the rest of conexus/ (its check) is not built.
const SERVER_SOURCE = /^conexus\/(?:manifest\.json|handlers\/.+|migrations\/.+)$/
export const SERVER_SOURCE_ROOTS = Object.freeze(['conexus/manifest.json', 'conexus/handlers', 'conexus/migrations'])

export const admitApplicationTree = (listing: string): readonly string[] => {
  const paths: string[] = []
  let totalBytes = 0
  for (const line of listing.split('\n').filter(Boolean)) {
    // Only regular files. A symlink or a submodule refuses here rather than compiling into an
    // artifact that does not match the admitted tree.
    const entry = /^(?:100644|100755) blob [0-9a-f]{40} +(\d+)\t(.+)$/.exec(line)
    if (entry && !(entry[2] as string).startsWith('app/') && !SERVER_SOURCE.test(entry[2] as string)) continue
    if (!entry) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
    const bytes = Number(entry[1])
    if (!Number.isSafeInteger(bytes) || bytes > 1024 * 1024) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
    totalBytes += bytes
    paths.push(entry[2] as string)
  }
  if (paths.length > 256 || totalBytes > 12 * 1024 * 1024) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
  if (new Set(paths).size !== paths.length || !paths.includes('app/index.html')) {
    throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
  }
  return Object.freeze(paths)
}
