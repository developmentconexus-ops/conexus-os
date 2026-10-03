import type { BuilderRunSummary } from './store.js'

export type BuilderFailureCategory =
  | 'ENVIRONMENT_PREPARATION_FAILED'
  | 'MODEL_CREDENTIAL_REFUSED'
  | 'MODEL_RATE_LIMITED'
  | 'MODEL_REQUEST_REFUSED'
  | 'SOURCE_RESULT_REJECTED'
  | 'SOURCE_BASE_MOVED'
  | 'PREVIEW_NOT_BUILT'
  | 'APPLICATION_BUILD_FAILED'
  | 'RUN_CANCELLED'
  | 'RUN_INTERRUPTED'
  | 'INTERNAL_ERROR'

export type WireBuilderRun = Omit<BuilderRunSummary, 'failureCode'> & Readonly<{
  failureCategory: BuilderFailureCategory | null
  failureCode: string | null
}>

const CATEGORY_BY_CODE: Readonly<Record<string, BuilderFailureCategory>> = Object.freeze({
  BUILDER_SOURCE_READ_REFUSED: 'ENVIRONMENT_PREPARATION_FAILED',
  BUILDER_SANDBOX_COMMAND_INTERFACE_REQUIRED: 'ENVIRONMENT_PREPARATION_FAILED',
  BUILDER_SANDBOX_ID_UNAVAILABLE: 'ENVIRONMENT_PREPARATION_FAILED',
  BUILDER_SANDBOX_INCARNATION_CHANGED: 'ENVIRONMENT_PREPARATION_FAILED',
  BUILDER_SANDBOX_KEEPALIVE_FAILED: 'ENVIRONMENT_PREPARATION_FAILED',
  BUILDER_SANDBOX_AGENT_USER_REQUIRED: 'ENVIRONMENT_PREPARATION_FAILED',
  BUILDER_CHECK_INSTALL_REFUSED: 'ENVIRONMENT_PREPARATION_FAILED',
  BUILDER_STARTER_ENTRY_INSPECTION_FAILED: 'ENVIRONMENT_PREPARATION_FAILED',
  BUILDER_STARTER_ENTRY_UNSAFE: 'ENVIRONMENT_PREPARATION_FAILED',
  BUILDER_STARTER_ROOT_REFUSED: 'ENVIRONMENT_PREPARATION_FAILED',
  CONEXUS_APP_ROOT_MISSING: 'ENVIRONMENT_PREPARATION_FAILED',
  APPLICATION_COMPILER_WORKSPACE_REFUSED: 'ENVIRONMENT_PREPARATION_FAILED',
  APPLICATION_CHECK_UNREADABLE: 'ENVIRONMENT_PREPARATION_FAILED',
  APPLICATION_CHECK_REPORT_UNREADABLE: 'ENVIRONMENT_PREPARATION_FAILED',
  APPLICATION_CHECK_TIMEOUT: 'ENVIRONMENT_PREPARATION_FAILED',
  BUILDER_SOURCE_BASE_PIN_REFUSED: 'ENVIRONMENT_PREPARATION_FAILED',

  BUILDER_MODEL_AUTH_FAILED: 'MODEL_CREDENTIAL_REFUSED',
  // No usable account for the model being called (the run's start model, or one chosen mid-run)
  // reads as a credential the run does not have.
  BUILDER_MODEL_NOT_SELECTED: 'MODEL_CREDENTIAL_REFUSED',

  BUILDER_MODEL_RATE_LIMITED: 'MODEL_RATE_LIMITED',

  BUILDER_MODEL_STREAM_FAILED: 'MODEL_REQUEST_REFUSED',
  BUILDER_AGENT_COMPLETION_UNAVAILABLE: 'MODEL_REQUEST_REFUSED',
  BUILDER_MODEL_INCOMPLETE: 'MODEL_REQUEST_REFUSED',
  BUILDER_MESSAGE_ID_UNAVAILABLE: 'MODEL_REQUEST_REFUSED',

  BUILDER_RESULT_MATERIALIZATION_REFUSED: 'SOURCE_RESULT_REJECTED',
  BUILDER_RESULT_BUNDLE_TOO_LARGE: 'SOURCE_RESULT_REJECTED',
  BUILDER_RESULT_CONTENT_TOO_LARGE: 'SOURCE_RESULT_REJECTED',
  BUILDER_RUNTIME_RESULT_SCOPE_REFUSED: 'SOURCE_RESULT_REJECTED',
  // The candidate broke the Project's own rules (AC-9): its check failed, or its AGENTS.md did.
  BUILDER_CHECK_FAILED: 'SOURCE_RESULT_REJECTED',
  BUILDER_APP_NOT_FIXED: 'SOURCE_RESULT_REJECTED',

  // The Project's repository moved while the run worked, so its result was not admitted and
  // nothing was overwritten.
  BUILDER_SOURCE_BASE_MOVED: 'SOURCE_BASE_MOVED',
  // The source was admitted, but the Hub restarted before the Preview was built from it.
  BUILDER_PREVIEW_NOT_BUILT: 'PREVIEW_NOT_BUILT',

  // The Hub could not reach its application runner. Nothing in the source can fix that, and naming
  // it a build failure sends the author to delete the server code that was correct.
  APPLICATION_RUNNER_UNAVAILABLE: 'ENVIRONMENT_PREPARATION_FAILED',
  // module.ts throws this for any /v1/prepare refusal that isn't one of the runner's own named
  // admission refusals below: a database or allocation fault, a malformed request, or anything else
  // the runner's process itself hit. Nothing in the source caused that either, so it is routed the
  // same as APPLICATION_RUNNER_UNAVAILABLE, not named a build failure.
  APPLICATION_SERVER_REFUSED: 'ENVIRONMENT_PREPARATION_FAILED',

  APPLICATION_MIGRATION_FAILED: 'APPLICATION_BUILD_FAILED',
  APPLICATION_MIGRATION_HISTORY_DIVERGED: 'APPLICATION_BUILD_FAILED',
  // The runner's own admission refused the Project's compiled server tree: a manifest or handler
  // bundling problem the Project's source caused. module.ts carries the runner's exact code here
  // instead of the generic APPLICATION_SERVER_REFUSED above.
  SERVER_TREE_REFUSED: 'APPLICATION_BUILD_FAILED',
  MANIFEST_REFUSED: 'APPLICATION_BUILD_FAILED',
  BUILDER_APPLICATION_SOURCE_REFUSED: 'APPLICATION_BUILD_FAILED',
  BUILDER_APPLICATION_REQUEST_REFUSED: 'APPLICATION_BUILD_FAILED',
  BUILDER_APPLICATION_RESULT_SCOPE_REFUSED: 'APPLICATION_BUILD_FAILED',
  APPLICATION_SMOKE_FAILED: 'APPLICATION_BUILD_FAILED',
  APPLICATION_COMPILER_OUTPUT_ENTRYPOINT_REFUSED: 'APPLICATION_BUILD_FAILED',
  APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED: 'APPLICATION_BUILD_FAILED',
  APPLICATION_COMPILER_OUTPUT_MEDIA_TYPE_REFUSED: 'APPLICATION_BUILD_FAILED',
  APPLICATION_COMPILER_OUTPUT_PATH_REFUSED: 'APPLICATION_BUILD_FAILED',
  APPLICATION_COMPILER_OUTPUT_SIZE_REFUSED: 'APPLICATION_BUILD_FAILED',
  APPLICATION_ENTRYPOINT_REFUSED: 'APPLICATION_BUILD_FAILED',
  APPLICATION_FILE_COUNT_REFUSED: 'APPLICATION_BUILD_FAILED',
  APPLICATION_FILE_DUPLICATE_REFUSED: 'APPLICATION_BUILD_FAILED',
  APPLICATION_FILE_ENCODING_REFUSED: 'APPLICATION_BUILD_FAILED',
  APPLICATION_FILE_HASH_REFUSED: 'APPLICATION_BUILD_FAILED',
  APPLICATION_FILE_ORDER_REFUSED: 'APPLICATION_BUILD_FAILED',
  APPLICATION_FILE_PATH_REFUSED: 'APPLICATION_BUILD_FAILED',
  APPLICATION_FILE_SHAPE_REFUSED: 'APPLICATION_BUILD_FAILED',
  APPLICATION_FILE_SIZE_REFUSED: 'APPLICATION_BUILD_FAILED',
  APPLICATION_MEDIA_TYPE_REFUSED: 'APPLICATION_BUILD_FAILED',
  APPLICATION_PAYLOAD_PIN_REFUSED: 'APPLICATION_BUILD_FAILED',
  APPLICATION_PAYLOAD_REFUSED: 'APPLICATION_BUILD_FAILED',
  APPLICATION_TOTAL_SIZE_REFUSED: 'APPLICATION_BUILD_FAILED',

  USER_CANCELLED: 'RUN_CANCELLED',
  HUB_RESTART: 'RUN_INTERRUPTED',
  // A question nobody answered for 7 days: the Hub let the run go so the Project is free.
  BUILDER_RUN_PARKED_EXPIRED: 'RUN_INTERRUPTED',
  BUILDER_RUN_CANCELLED: 'RUN_CANCELLED',
  BUILDER_LATE_RESULT_REFUSED: 'RUN_CANCELLED',

  // service.ts turns any error whose message is not an uppercase snake code into this one, so raw
  // E2B, Postgres and fetch faults arrive here. Calling it a preparation failure would name a cause
  // nobody established.
  BUILDER_PREPARATION_FAILED: 'INTERNAL_ERROR',
  BUILDER_AGENT_TRIPWIRE: 'INTERNAL_ERROR',
  // The agent loop's own storage or connection failed, after the continuations allowed; the model was not the cause.
  BUILDER_AGENT_PLATFORM_FAILED: 'INTERNAL_ERROR',
  // One model step ran past its time budget while streaming, so the Hub ended the run.
  BUILDER_MODEL_STEP_TIMEOUT: 'INTERNAL_ERROR',
  // The agent's session sent no event for the turn's silence limit while working, so the Hub ended the turn.
  BUILDER_AGENT_STALLED: 'INTERNAL_ERROR',
  // A question or plan card went unanswered past the answer wait, which ends before Mastra drops the parked run, so the Hub ended the run.
  BUILDER_RUN_INPUT_REFUSED: 'INTERNAL_ERROR',
  BUILDER_RUN_CREATE_FAILED: 'INTERNAL_ERROR',
  BUILDER_RUN_CLAIM_REFUSED: 'INTERNAL_ERROR',
  BUILDER_RUN_NOT_ADMITTED: 'INTERNAL_ERROR',
  BUILDER_RUN_PHASE_UPDATE_REFUSED: 'INTERNAL_ERROR',
  BUILDER_RUN_MESSAGE_BIND_REFUSED: 'INTERNAL_ERROR',
  BUILDER_RUN_SANDBOX_BIND_REFUSED: 'INTERNAL_ERROR',
  BUILDER_RUN_SETTLEMENT_REFUSED: 'INTERNAL_ERROR',
  BUILDER_RUN_SOURCE_SETTLEMENT_REFUSED: 'INTERNAL_ERROR',
  BUILDER_RUN_BUILD_SETTLEMENT_REFUSED: 'INTERNAL_ERROR',
  BUILDER_RUN_FAILURE_REFUSED: 'INTERNAL_ERROR',
  BUILDER_RUN_INTERRUPTION_REFUSED: 'INTERNAL_ERROR',
  BUILDER_RUN_CANCELLATION_REFUSED: 'INTERNAL_ERROR',
})

// Source read errors have no closed member list; the code itself never reaches the wire.
const CATEGORY_BY_PREFIX: readonly (readonly [string, BuilderFailureCategory])[] = Object.freeze([
  ['BUILDER_SOURCE_READ_', 'ENVIRONMENT_PREPARATION_FAILED'],
])

const declared = (code: string | null): boolean => code !== null && Object.hasOwn(CATEGORY_BY_CODE, code)

export const builderFailureCategory = (code: string | null): BuilderFailureCategory | null => {
  if (code === null) return null
  if (declared(code)) return CATEGORY_BY_CODE[code] as BuilderFailureCategory
  return CATEGORY_BY_PREFIX.find(([prefix]) => code.startsWith(prefix))?.[1] ?? 'INTERNAL_ERROR'
}

/** The one place a run becomes wire shape: an unmapped internal code never survives it. */
export const projectBuilderRun = (run: BuilderRunSummary): WireBuilderRun => Object.freeze({
  ...run,
  // An interruption the Hub made says so; any other is the person's stop.
  failureCategory: run.state === 'INTERRUPTED' && builderFailureCategory(run.failureCode) !== 'RUN_INTERRUPTED' ? 'RUN_CANCELLED' : builderFailureCategory(run.failureCode),
  failureCode: declared(run.failureCode) ? run.failureCode : null,
})
