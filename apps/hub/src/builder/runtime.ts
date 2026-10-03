import type { AgentController, AgentControllerEvent } from '@mastra/core/agent-controller'
import { parseError } from '@mastra/code-sdk/utils/errors'
import { isMastraTimeoutError } from '@mastra/core/loop'
import type { RequestContext } from '@mastra/core/request-context'
import type { CompiledApplication, CompiledApplicationThumbnail } from './application-artifact-runtime.js'

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
export const UNRENDERED_FAILURE_CODE = 'APPLICATION_SMOKE_FAILED'

export type ApplicationBuildOutcome =
  /** `bootProblems`: what the page did when opened that does not withhold the Preview, for the next turn. */
  | Readonly<{ kind: 'BUILT'; compiledApplication: CompiledApplication; thumbnail?: CompiledApplicationThumbnail; bootProblems?: string }>
  // C-033: the blocking steps passed and the page did not render. The only admitted source without a
  // Preview; a source the check refuses is never admitted, so no "built and failed" outcome exists.
  | Readonly<{ kind: 'UNRENDERED'; code: typeof UNRENDERED_FAILURE_CODE; detail: string }>

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

type AgentFailureCode = 'BUILDER_MODEL_RATE_LIMITED' | 'BUILDER_MODEL_AUTH_FAILED' | 'BUILDER_AGENT_PLATFORM_FAILED' | 'BUILDER_MODEL_STEP_TIMEOUT' | typeof NO_MODEL_ACCOUNT

/**
 * What a failed model call leaves in the run's log: its HTTP status only. The provider's own error
 * carries a message and a response body that can echo the account key, and `BUILDER_RUN_FAILED`
 * logs the cause of what the run throws.
 */
const safeCause = (error: unknown): Readonly<{ statusCode: number }> | undefined => {
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const { statusCode, status } = (typeof error === 'object' && error !== null ? error : {}) as { statusCode?: unknown; status?: unknown }
  const http = [statusCode, status].find((value): value is number => typeof value === 'number')
  return http === undefined ? undefined : { statusCode: http }
}

const hasHttpStatus = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && ('statusCode' in error || 'status' in error)

// A timeout or dropped connection with no HTTP status never reached a provider, so it came from
// storage or the network under the loop, not from the model. The model's own transient failures
// (5xx, ECONNRESET, 529) are retried inside the call by Mastra's StreamErrorRetryProcessor
// (harness/error-processors.ts) before they ever reach this code.
const classifyAgentFailure = (error: unknown): AgentFailureCode | null => {
  if (namesNoModelAccount(error)) return NO_MODEL_ACCOUNT
  // One model call outran its time budget (`BUILDER_MODEL_STEP_TIMEOUT_MS`).
  if (namesStepTimeout(error)) return 'BUILDER_MODEL_STEP_TIMEOUT'
  const { type } = parseError(error)
  if (type === 'rate_limit') return 'BUILDER_MODEL_RATE_LIMITED'
  if (type === 'auth') return 'BUILDER_MODEL_AUTH_FAILED'
  if ((type === 'timeout' || type === 'network') && !hasHttpStatus(error)) return 'BUILDER_AGENT_PLATFORM_FAILED'
  return null
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
 * that never saw the suspension. A call a stop denied keeps its record until Mastra tears down the
 * run that held it, which a Hub that restarted never does, so a call counts only while its tool part
 * still waits (`state: 'call'`).
 */
export const readParkedCalls = async (session: BuilderSession): Promise<readonly ParkedCall[]> => {
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const messages = await session.thread.listActiveMessages() as readonly Readonly<{ content?: { metadata?: unknown; parts?: readonly Readonly<{ type?: string; toolInvocation?: Readonly<{ toolCallId?: string; state?: string }> }>[] } }>[]
  for (const message of [...messages].reverse()) {
    // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
    const suspended = (message.content?.metadata as { suspendedTools?: Readonly<Record<string, { toolCallId?: unknown; toolName?: unknown; runId?: unknown }>> } | undefined)?.suspendedTools
    const waiting = (toolCallId: string): boolean => message.content?.parts?.some((part) => part.type === 'tool-invocation' && part.toolInvocation?.toolCallId === toolCallId && part.toolInvocation.state === 'call') === true
    const calls = Object.values(suspended ?? {}).flatMap((call) =>
      typeof call.toolCallId === 'string' && typeof call.toolName === 'string' && typeof call.runId === 'string' && waiting(call.toolCallId) ? [{ toolCallId: call.toolCallId, toolName: call.toolName, runId: call.runId }] : [])
    if (calls.length > 0) return calls
  }
  return []
}

/** Where a call stands on its thread: still waiting on the person, answered, or neither (never asked there, or denied by a stop). */
export type ParkedCallStanding = 'PARKED' | 'ANSWERED' | 'ABSENT'

export const parkedCallStanding = async (session: BuilderSession, toolCallId: string): Promise<ParkedCallStanding> => {
  if ((await readParkedCalls(session)).some((call) => call.toolCallId === toolCallId)) return 'PARKED'
  const answered = (await session.thread.listActiveMessages()).some((message) => message.content.parts.some((part) =>
    part.type === 'tool-invocation' && part.toolInvocation.toolCallId === toolCallId && part.toolInvocation.state === 'result'))
  return answered ? 'ANSWERED' : 'ABSENT'
}

/** Tells a new session of the calls a run parked on: Mastra's own list of them lives in the session that saw the suspension. */
const registerParkedCalls = (session: BuilderSession, calls: readonly ParkedCall[]): void => {
  for (const call of calls) session.suspensions.register({ ...call, threadId: session.thread.requireId(), resourceId: session.identity.getResourceId() })
}

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
      const code = classifyAgentFailure(error)
      throw code ? new Error(code, { cause: safeCause(error) }) : error
    }
    if (tripwire) throw new Error('BUILDER_AGENT_TRIPWIRE', { cause: tripwire })
    if (!terminalReason) throw new Error('BUILDER_AGENT_COMPLETION_UNAVAILABLE')
    if (terminalReason === 'error') {
      throw new Error((agentError ? classifyAgentFailure(agentError) : null) ?? 'BUILDER_MODEL_STREAM_FAILED', { cause: safeCause(agentError) })
    }
    return terminalReason
  } finally {
    unsubscribe()
    stopWatching()
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
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const content = message.content as Record<string, unknown>
  const metadata = content.metadata
  if (typeof metadata !== 'object' || metadata === null) return false
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const signal = (metadata as Record<string, unknown>).signal
  if (typeof signal !== 'object' || signal === null) return false
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const type = (signal as Record<string, unknown>).type
  return type === 'user' || type === 'user-message'
}

/**
 * The application tree: `app/` and all of `conexus/`, and nothing from the repository root. The
 * check builds it, so one check result is both the admission and the Preview build. A root file
 * never reaches the build: Vite reads the nearest `package.json` and `tsconfig.json` from `app/`
 * upward, so a root one would change the build. A handler may import any file under `conexus/`.
 */
export const APPLICATION_TREE_ROOTS = Object.freeze(['app', 'conexus'])
const IN_APPLICATION_TREE = /^(?:app|conexus)\//

/** `git ls-tree -r -l` output of the application tree, held to the limits the compile input has always had. */
export const admitApplicationTree = (listing: string): readonly string[] => {
  const paths: string[] = []
  let totalBytes = 0
  for (const line of listing.split('\n').filter(Boolean)) {
    // Only regular files. A symlink or a submodule refuses here rather than compiling into an
    // artifact that does not match the admitted tree.
    const entry = /^(?:100644|100755) blob [0-9a-f]{40} +(\d+)\t(.+)$/.exec(line)
    // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
    if (entry && !IN_APPLICATION_TREE.test(entry[2] as string)) continue
    if (!entry) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
    const bytes = Number(entry[1])
    if (!Number.isSafeInteger(bytes) || bytes > 1024 * 1024) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
    totalBytes += bytes
    // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
    paths.push(entry[2] as string)
  }
  if (paths.length > 256 || totalBytes > 12 * 1024 * 1024) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
  if (new Set(paths).size !== paths.length || !paths.includes('app/index.html')) {
    throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
  }
  return Object.freeze(paths)
}
