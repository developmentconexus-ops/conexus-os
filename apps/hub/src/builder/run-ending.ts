import { sql, type Sql } from '../platform/db.js'
import type { FailureCode } from '../platform/failure.js'

/** How a run stops holding its Project: the person's stop, a Hub that stopped, or a question nobody answered. */
export type InterruptionCode = Extract<FailureCode, 'USER_CANCELLED' | 'HUB_RESTART' | 'BUILDER_QUESTION_EXPIRED'>

/** The one set of final columns of a run: every ending writes its state, a null phase and its finish time together. */
export type RunEnding =
  | Readonly<{ state: 'SUCCEEDED'; resultKind: 'RESPONSE_ONLY' | 'SOURCE_CHANGED' }>
  | Readonly<{ state: 'FAILED'; failureCode: FailureCode; resultKind?: 'SOURCE_CHANGED_BUILD_FAILED' }>
  | Readonly<{ state: 'INTERRUPTED'; failureCode: InterruptionCode }>

/** The SET of an UPDATE of `builder.builder_run AS run` that ends the run; a stop keeps the first cancellation time and reason. */
export const endColumns = (ending: RunEnding): Sql => {
  switch (ending.state) {
    case 'SUCCEEDED':
      return sql`state = 'SUCCEEDED', phase = NULL, result_kind = ${ending.resultKind}, failure_code = NULL, finished_at = clock_timestamp()`
    case 'FAILED':
      return sql`state = 'FAILED', phase = NULL, failure_code = ${ending.failureCode}, result_kind = ${ending.resultKind ?? null}, finished_at = clock_timestamp()`
    case 'INTERRUPTED':
      return sql`state = 'INTERRUPTED', phase = NULL, failure_code = ${ending.failureCode},
        cancellation_requested_at = COALESCE(run.cancellation_requested_at, clock_timestamp()), cancellation_reason = COALESCE(run.cancellation_reason, ${ending.failureCode}),
        finished_at = clock_timestamp()`
  }
}
