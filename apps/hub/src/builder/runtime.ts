import type { AgentController, AgentControllerEvent } from '@mastra/core/agent-controller'
import type { MastraCodeState } from '@mastra/code-sdk/schema'
import type { RequestContext } from '@mastra/core/request-context'
import type { CompiledApplication } from './application-artifact-runtime.js'

type CodingWorkerResultScope = Readonly<{
  runtimeId: 'mastra-factory-e2b-v1'
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
  | Readonly<{ kind: 'BUILT'; compiledApplication: CompiledApplication }>
  | Readonly<{ kind: 'BUILD_FAILED'; code: string }>

export type CodingWorkerResult = CodingWorkerResultScope & Readonly<{ kind: 'RESPONSE_ONLY' }>

// A repository-hosted source is admitted by the runtime itself: the compare-and-swap on the
// default branch is the admission, so the service records it and never admits it again.
export type SourceAdmittedResult = CodingWorkerResultScope & Readonly<{
  kind: 'SOURCE_ADMITTED'
  resultSourceRevision: string
  applicationBuild: ApplicationBuildOutcome
}>

/** The Builder's controller is Mastra Code's, so it carries Mastra Code's own session state. */
export type BuilderAgentController = AgentController<MastraCodeState>
type BuilderSession = Awaited<ReturnType<BuilderAgentController['createSession']>>

type AgentEndReason = Extract<AgentControllerEvent, { type: 'agent_end' }>['reason']
type SendableAgentEndReason = Exclude<AgentEndReason, 'error'>

export const BUILDER_TRACE_REQUEST_CONTEXT_KEYS = Object.freeze([
  'conexusBuilderProjectId',
  'conexusBuilderRunId',
])

const isRateLimitError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false
  const statusCode = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : undefined
  const messageText = 'message' in error && typeof error.message === 'string' ? error.message : ''
  return statusCode === 429 || /rate.?limit|too many requests/i.test(messageText)
}

// Mastra Code's words when the person has no account of their own for the model's provider and none
// is shared with the installation. It carries no status code, so its text is the only signal.
const NO_MODEL_ACCOUNT = /^No usable \S+ credential is configured/
const isMissingModelAccount = (error: unknown): boolean => error instanceof Error && NO_MODEL_ACCOUNT.test(error.message)

const classifyAgentError = (error: Error): string => {
  const statusCode = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : undefined
  if (statusCode === 401 || statusCode === 403 || isMissingModelAccount(error)) return 'BUILDER_MODEL_AUTH_FAILED'
  return 'BUILDER_MODEL_STREAM_FAILED'
}

export const sendBuilderSessionMessage = async (
  session: BuilderSession,
  message: Readonly<{ content: string }>,
  requestContext?: RequestContext,
): Promise<SendableAgentEndReason> => {
  let terminalReason: AgentEndReason | undefined
  let agentError: Error | undefined
  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'agent_end') terminalReason = event.reason
    if (event.type === 'error') agentError = event.error
  })
  try {
    try {
      await session.sendMessage({ ...message, ...(requestContext ? { requestContext } : {}) })
    } catch (error) {
      if (isRateLimitError(error)) throw new Error('BUILDER_MODEL_RATE_LIMITED')
      if (isMissingModelAccount(error)) throw new Error('BUILDER_MODEL_AUTH_FAILED')
      throw error
    }
    if (!terminalReason) throw new Error('BUILDER_AGENT_COMPLETION_UNAVAILABLE')
    if (terminalReason === 'error') {
      if (agentError && isRateLimitError(agentError)) throw new Error('BUILDER_MODEL_RATE_LIMITED')
      throw new Error(agentError ? classifyAgentError(agentError) : 'BUILDER_MODEL_STREAM_FAILED')
    }
    return terminalReason
  } finally {
    unsubscribe()
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
export const admitApplicationTree = (listing: string): readonly string[] => {
  const paths: string[] = []
  let totalBytes = 0
  for (const line of listing.split('\n').filter(Boolean)) {
    // Only regular files. A symlink or a submodule refuses here rather than compiling into an
    // artifact that does not match the admitted tree.
    const entry = /^(?:100644|100755) blob [0-9a-f]{40} +(\d+)\t(.+)$/.exec(line)
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
