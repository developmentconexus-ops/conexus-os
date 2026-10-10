import { ReceivedFailure } from '@conexus/contract'
import type { Result, TraceId } from '@conexus/contract'
import { failureResponse } from '../../apps/hub/src/http/problem.js'
import type { InvokeAnswer, PrepareAnswer, SqlState, WorkerAnswer } from '../../apps/hub/src/app-runner/server-manifest.js'
import type { ConnectResult } from '../../apps/hub/src/model-account/store.js'
import { Failure } from '../../apps/hub/src/platform/failure.js'

export type ManifestRefusal = Readonly<{ code: 'MANIFEST_REFUSED'; where: string; diagnostic: string }>
export type AccountConnectionError = Readonly<{ code: 'ACCOUNT_INACTIVE' | 'ACCOUNT_NOT_FOUND' }>

// @ts-expect-error A plain string is not a validated trace id.
export const unvalidatedTraceId: TraceId = '0123456789abcdef0123456789abcdef'

// @ts-expect-error Unknown codes are not part of the failure table.
export type UnknownCode = Result<string, { readonly code: 'UNREGISTERED_CODE' }>
// @ts-expect-error Success carries result, not value.
export const flatSuccess: Result<string, ManifestRefusal> = { ok: true, value: 'accepted' }
// @ts-expect-error Failure carries error, not a flat code.
export const flatFailure: Result<string, ManifestRefusal> = { ok: false, code: 'MANIFEST_REFUSED' }
// @ts-expect-error A refusal can use only its operation's codes.
export const unrelated: Result<string, ManifestRefusal> = { ok: false, error: { code: 'NOT_FOUND', where: '', diagnostic: '' } }
export declare const result: Result<string, ManifestRefusal>
// @ts-expect-error The success payload is unavailable until the result is narrowed.
result.result
if (!result.ok) {
  // @ts-expect-error Result variants are readonly.
  result.error = { code: 'MANIFEST_REFUSED', where: '', diagnostic: '' }
}

// @ts-expect-error SQLSTATE text must be parsed before it enters the runner contract.
export const unparsedSqlState: SqlState = '42601'

// @ts-expect-error A prepare refusal cannot use a worker-only failure code.
export const wrongPrepareCode: PrepareAnswer = { ok: false, error: { code: 'HANDLER_FAILED', sqlstate: null } }

// @ts-expect-error An operation-not-found refusal cannot carry migration identity.
export const wrongInvokeFacts: InvokeAnswer = { ok: false, error: { code: 'OPERATION_NOT_FOUND', migration: '001_notes.sql' } }

// @ts-expect-error A worker refusal carries no free text.
export const workerText: WorkerAnswer = { ok: false, error: { code: 'HANDLER_FAILED', sqlstate: null, detail: 'PRIVATE_DIAGNOSTIC_MARKER' } }

// @ts-expect-error A worker cannot emit another operation's refusal.
export const wrongWorkerCode: WorkerAnswer = { ok: false, error: { code: 'MANIFEST_REFUSED' } }

// @ts-expect-error A failed preparation carries no successful result.
export const failedPrepareResult: PrepareAnswer = { ok: false, result: { reset: true, applied: [] }, error: { code: 'MANIFEST_REFUSED' } }

// @ts-expect-error The account connection refuses only with its own codes.
export const wrongAccountCode: ConnectResult = { ok: false, error: { code: 'PROJECT_NOT_FOUND' } }

// @ts-expect-error Logged failure details are scalar.
new Failure('INTERNAL_UNEXPECTED', { details: { values: ['PRIVATE_DIAGNOSTIC_MARKER'] } })

declare const workerAnswer: WorkerAnswer
// @ts-expect-error Success data is unavailable until the answer is narrowed.
workerAnswer.result
if (!workerAnswer.ok) {
  // @ts-expect-error Runner refusal facts are readonly.
  workerAnswer.error.code = 'WORKER_FAILED'
}

declare const invokeAnswer: InvokeAnswer
if (!invokeAnswer.ok && invokeAnswer.error.code === 'HANDLER_EXPORT_MISSING') {
  // @ts-expect-error Variant facts are readonly.
  invokeAnswer.error.export = 'replacement'
}

// @ts-expect-error The public failure writer does not accept private runner diagnosis.
failureResponse({ code: 'INTERNAL_UNEXPECTED', traceId: null, migration: '001_notes.sql' })

export function accountConnection(): Result<void, AccountConnectionError> {
  return { ok: true, result: undefined }
}

// @ts-expect-error A received failure accepts only a validated trace id.
new ReceivedFailure('INTERNAL_UNEXPECTED', 500, 'PRIVATE_DIAGNOSTIC_MARKER')
