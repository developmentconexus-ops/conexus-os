import type { AgentControllerEvent } from '@mastra/core/agent-controller'
import { isMastraTimeoutError } from '@mastra/core/loop'
import { isBadRequestError, PrefillErrorHandler, ProviderHistoryCompat, StreamErrorRetryProcessor } from '@mastra/core/processors'
import type { RequestContext } from '@mastra/core/request-context'

/*
 * The retry policy below is Mastra Code's, from `createMastraCode` in `@mastra/code-sdk`
 * (`dist/index.js`, Apache License 2.0, https://github.com/mastra-ai/mastra): its constants, its two
 * matchers and its delay. The package does not export them, so they are copied here. The processor
 * that applies them, `StreamErrorRetryProcessor`, is Mastra's own.
 */

/** `MASTRACODE_TRANSIENT_CONNECTION_MAX_RETRIES`: a dropped connection or a 5xx is retried this many times. */
const TRANSIENT_MAX_RETRIES = 10
/** `MASTRACODE_MAX_PROCESSOR_RETRIES`: the cap on all error-processor retries in one turn; core's fallback is 3, which would cut the 10 above short. */
export const BUILDER_MAX_PROCESSOR_RETRIES = 64
const TRANSIENT_INITIAL_DELAY_MS = 500
const TRANSIENT_MAX_DELAY_MS = 30_000

const TRANSIENT_CONNECTION_CODES: ReadonlySet<string> = new Set(['ECONNRESET', 'EPIPE'])
const TRANSIENT_CONNECTION_MESSAGE = /econnreset|socket hang up|write epipe|other side closed/i
const TRANSIENT_SERVER_MESSAGE = /internal server|server error|api may be experiencing issues/i

/** Mastra Code's `isTransientConnectionError`. `StreamErrorRetryProcessor` calls a matcher at every level of the error's cause chain. */
const isTransientConnectionError = (error: unknown): boolean => {
  if (!error) return false
  const code = typeof error === 'object' && 'code' in error ? error.code : undefined
  if (typeof code === 'string' && TRANSIENT_CONNECTION_CODES.has(code.toUpperCase())) return true
  return error instanceof Error && TRANSIENT_CONNECTION_MESSAGE.test(error.message)
}

/** Mastra Code's `isTransientServerError`. */
const isTransientServerError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown }
  if ((typeof status === 'number' && status >= 500 && status < 600) || (typeof statusCode === 'number' && statusCode >= 500 && statusCode < 600)) return true
  return error instanceof Error && TRANSIENT_SERVER_MESSAGE.test(error.message)
}

/**
 * Ours, not Mastra Code's: a call that got no response at all. `@ai-sdk/provider-utils` turns Node's
 * `fetch failed` (DNS failure, refused or unreachable network, timeout, whatever the cause code) into an
 * `APICallError` that is retryable and has no HTTP status. A provider answer always carries a status.
 */
const isNoResponseError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const { isRetryable, statusCode } = error as { isRetryable?: unknown; statusCode?: unknown }
  return isRetryable === true && statusCode === undefined
}

/** Mastra Code's `getTransientRetryDelay`. */
const transientRetryDelayMs = (retryCount: number): number => Math.min(TRANSIENT_INITIAL_DELAY_MS * 2 ** retryCount, TRANSIENT_MAX_DELAY_MS)

type RetryEvent = Extract<AgentControllerEvent, { type: 'error' }>

/**
 * The only facts about a failed provider call that may reach a session subscriber. A provider's
 * message and response body can echo the account key, so the event carries a fresh error built
 * from the status or code alone, never the provider's error.
 */
const retryNoticeError = (error: unknown): Error => {
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const { status, statusCode, code } = (typeof error === 'object' && error !== null ? error : {}) as { status?: unknown; statusCode?: unknown; code?: unknown }
  const http = [statusCode, status].find((value): value is number => typeof value === 'number')
  return new Error(http !== undefined ? `MODEL_CALL_RETRYING_HTTP_${http}` : typeof code === 'string' && /^[A-Z_]+$/.test(code) ? `MODEL_CALL_RETRYING_${code}` : 'MODEL_CALL_RETRYING')
}

/** Mastra Code's `emitTransientRetry`: a retryable `error` event on the controller's event stream, which `AgentControllerEvent` already types with `retryAttempt`, `retryDelay` and `maxRetries`. */
const emitTransientRetry = (error: unknown, retryCount: number, delayMs: number, requestContext: RequestContext | undefined): void => {
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const controller = requestContext?.get('controller') as { emitEvent?: (event: RetryEvent) => void } | undefined
  controller?.emitEvent?.({
    type: 'error',
    error: retryNoticeError(error),
    retryable: true,
    retryDelay: delayMs,
    retryAttempt: retryCount + 1,
    maxRetries: TRANSIENT_MAX_RETRIES,
  })
}

const transientMatcher = (match: (error: unknown) => boolean, delayFor: (retryCount: number) => number) => ({
  match,
  maxRetries: TRANSIENT_MAX_RETRIES,
  delayMs: ({ retryCount }: { retryCount: number }) => delayFor(retryCount),
  onRetry: ({ error, retryCount, delayMs, requestContext }: { error: unknown; retryCount: number; delayMs: number; requestContext?: RequestContext }) =>
    emitTransientRetry(error, retryCount, delayMs, requestContext),
})

/**
 * Core's `defaultErrorProcessors` (`createCodingAgent`) with Mastra Code's transient-failure policy
 * in place of its ECONNRESET one, and one matcher of ours first: a call that ran past
 * `BUILDER_MODEL_STEP_TIMEOUT_MS` is not retried. Retrying replays the same request, and a step
 * that ran away once would run away again, holding the run for several budgets instead of one.
 */
export const builderErrorProcessors = (delayFor: (retryCount: number) => number = transientRetryDelayMs) => [
  new ProviderHistoryCompat(),
  new PrefillErrorHandler(),
  new StreamErrorRetryProcessor({
    retryUnknownErrors: true,
    maxRetries: 2,
    delayMs: 3000,
    matchers: [
      { match: (error: unknown) => isMastraTimeoutError(error), maxRetries: 0 },
      { match: isBadRequestError, maxRetries: 1, delayMs: 2000 },
      transientMatcher(isTransientConnectionError, delayFor),
      transientMatcher(isTransientServerError, delayFor),
      transientMatcher(isNoResponseError, delayFor),
    ],
  }),
]
