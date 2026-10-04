import { type ErrorType, parseError } from '@mastra/code-sdk/utils/errors'
import { isMastraTimeoutError } from '@mastra/core/loop'
import type { CompiledApplication, CompiledApplicationThumbnail } from './application-artifact-runtime.js'
import { fieldOf } from '../platform/field-of.js'
import { Failure, type FailureCode } from '../platform/failure.js'

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

export const BUILDER_TRACE_REQUEST_CONTEXT_KEYS = Object.freeze([
  'conexusBuilderProjectId',
  'conexusBuilderRunId',
])

const NO_MODEL_ACCOUNT = 'BUILDER_MODEL_NOT_SELECTED' satisfies FailureCode

// The resolver throws this when the model being called has no account; Mastra may wrap the throw.
const namesNoModelAccount = (error: unknown): boolean =>
  error instanceof Error && (error.message === NO_MODEL_ACCOUNT || namesNoModelAccount(error.cause))

const namesStepTimeout = (error: unknown): boolean =>
  isMastraTimeoutError(error) ? error.timeoutType === 'step' : error instanceof Error && error.cause !== undefined && namesStepTimeout(error.cause)

/**
 * What a failed model call leaves in the run's log: its HTTP status only. The provider's own error
 * carries a message and a response body that can echo the account key, and `BUILDER_RUN_FAILED`
 * logs the cause of what the run throws.
 */
export const safeCause = (error: unknown): Readonly<{ statusCode: number }> | undefined => {
  const http = [fieldOf(error, 'statusCode'), fieldOf(error, 'status')].find((value): value is number => typeof value === 'number')
  return http === undefined ? undefined : { statusCode: http }
}

const hasHttpStatus = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && ('statusCode' in error || 'status' in error)

// A timeout or dropped connection with no HTTP status never reached a provider, so it came from
// storage or the network under the loop, not from the model. The model's own transient failures
// (5xx, ECONNRESET, 529) are retried inside the call by Mastra's StreamErrorRetryProcessor
// (harness/error-processors.ts) before they ever reach this code.
// Every type Mastra's classifier names has a row or is a decision to leave the failure unnamed, so
// a type added to the SDK stops the build here.
const failureOfType = (type: ErrorType, error: unknown): FailureCode | null => {
  switch (type) {
    case 'rate_limit': return 'BUILDER_MODEL_RATE_LIMITED'
    case 'auth': return 'BUILDER_MODEL_AUTH_FAILED'
    case 'context_length': return 'BUILDER_MODEL_CONTEXT_LENGTH'
    case 'content_filter': return 'BUILDER_MODEL_CONTENT_FILTERED'
    case 'model_not_found': return 'BUILDER_GATEWAY_MODEL_REFUSED'
    case 'timeout':
    case 'network': return hasHttpStatus(error) ? null : 'BUILDER_AGENT_PLATFORM_FAILED'
    case 'invalid_request':
    case 'server_error':
    case 'unknown': return null
    default: return type satisfies never
  }
}

export const classifyAgentFailure = (error: unknown): FailureCode | null => {
  if (namesNoModelAccount(error)) return NO_MODEL_ACCOUNT
  // One model call outran its time budget (`BUILDER_MODEL_STEP_TIMEOUT_MS`).
  if (namesStepTimeout(error)) return 'BUILDER_MODEL_STEP_TIMEOUT'
  return failureOfType(parseError(error).type, error)
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
    const [, size, path] = /^(?:100644|100755) blob [0-9a-f]{40} +(\d+)\t(.+)$/.exec(line) ?? []
    if (size === undefined || path === undefined) throw new Failure('BUILDER_APPLICATION_SOURCE_REFUSED')
    if (!IN_APPLICATION_TREE.test(path)) continue
    const bytes = Number(size)
    if (!Number.isSafeInteger(bytes) || bytes > 1024 * 1024) throw new Failure('BUILDER_APPLICATION_SOURCE_REFUSED')
    totalBytes += bytes
    paths.push(path)
  }
  if (paths.length > 256 || totalBytes > 12 * 1024 * 1024) throw new Failure('BUILDER_APPLICATION_SOURCE_REFUSED')
  if (new Set(paths).size !== paths.length || !paths.includes('app/index.html')) {
    throw new Failure('BUILDER_APPLICATION_SOURCE_REFUSED')
  }
  return Object.freeze(paths)
}
