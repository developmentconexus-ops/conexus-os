import type { FailureCode as CurrentCode } from '../../../../packages/contract/src/failures.generated.js'

// The new row is generated from the table in U3, never a second production registry.
export type FailureCode = CurrentCode | 'BUILDER_SANDBOX_OPEN_FAILED'
export type Result<T, E extends { readonly code: FailureCode }> =
  | { readonly ok: true; readonly result: T }
  | { readonly ok: false; readonly error: E }

export type Code<C extends FailureCode> = Readonly<{ code: C }>
export type TraceReference = string | null
export type FailureDetails = Readonly<Record<string, string | number | boolean>>
export type ManifestRefusal = Readonly<{ code: 'MANIFEST_REFUSED'; where: string; diagnostic: string }>
export type TreeRefusal = Readonly<{ code: 'SERVER_TREE_REFUSED'; where: string; diagnostic: string }>
export type WorkerCode = Extract<FailureCode,
  'HANDLER_FAILED' | 'HANDLER_LOAD_FAILED' | 'HANDLER_EXPORT_MISSING'
  | 'HANDLER_OUTPUT_UNSERIALIZABLE' | 'WORKER_FAILED' | 'WORKER_JOB_REFUSED'
  | 'RESPONSE_TOO_LARGE' | 'DATABASE_UNAVAILABLE' | 'APPLICATION_MIGRATION_FAILED'>
export type WorkerAnswer = Result<unknown, Code<WorkerCode>>
export type PrepareCode = Extract<FailureCode,
  'MANIFEST_REFUSED' | 'SERVER_TREE_REFUSED' | 'APPLICATION_MIGRATION_FAILED' | 'APPLICATION_MIGRATION_HISTORY_DIVERGED'>
export type PrepareAnswer = Result<Readonly<{ reset: boolean; applied: readonly string[] }>, Code<PrepareCode>>

// Consumer signature for the next model wave and the model-accounts wave.
// This spec creates Result, but does not implement account connection.
export type AccountConnectionAnswer = Result<void, Code<'ACCOUNT_INACTIVE' | 'ACCOUNT_NOT_FOUND'>>
