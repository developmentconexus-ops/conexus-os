import type { FailureCode as CurrentCode } from '../../../../packages/contract/src/failures.generated.js'
import type { SqlState, TraceId } from './schemas.js'

// The planned row is generated from the existing table in U3.
export type FailureCode = CurrentCode | 'BUILDER_SANDBOX_OPEN_FAILED'
export type Result<T, E extends { readonly code: FailureCode }> =
  | Readonly<{ ok: true; result: T }>
  | Readonly<{ ok: false; error: E }>
export type Code<C extends FailureCode> = Readonly<{ code: C }>
export type TraceReference = TraceId | null
export type FailureDetails = Readonly<Record<string, string | number | boolean>>
export type ManifestRefusal = Readonly<{ code: 'MANIFEST_REFUSED'; where: string; diagnostic: string }>
export type TreeRefusal = Readonly<{ code: 'SERVER_TREE_REFUSED'; where: string; diagnostic: string }>
export type SchemaViolation = Readonly<{ pointer: string; rule: string }>

export type WorkerCode = Extract<FailureCode,
  'HANDLER_FAILED' | 'HANDLER_LOAD_FAILED' | 'HANDLER_EXPORT_MISSING'
  | 'HANDLER_OUTPUT_UNSERIALIZABLE' | 'WORKER_FAILED' | 'WORKER_JOB_REFUSED'
  | 'RESPONSE_TOO_LARGE' | 'DATABASE_UNAVAILABLE' | 'APPLICATION_MIGRATION_FAILED'>
export type WorkerRefusal =
  | Readonly<{ code: Exclude<WorkerCode, 'HANDLER_FAILED' | 'HANDLER_LOAD_FAILED' | 'DATABASE_UNAVAILABLE' | 'APPLICATION_MIGRATION_FAILED'> }>
  | Readonly<{ code: 'HANDLER_FAILED' | 'HANDLER_LOAD_FAILED' | 'DATABASE_UNAVAILABLE'; sqlstate: SqlState | null }>
  | Readonly<{ code: 'APPLICATION_MIGRATION_FAILED'; migration: string | null; sqlstate: SqlState | null }>
export type WorkerAnswer = Result<unknown, WorkerRefusal>
export type PrepareRefusal =
  | Code<'MANIFEST_REFUSED' | 'SERVER_TREE_REFUSED'>
  | Readonly<{ code: 'APPLICATION_MIGRATION_FAILED'; migration: string | null; sqlstate: SqlState | null }>
  | Readonly<{ code: 'APPLICATION_MIGRATION_HISTORY_DIVERGED'; migration: string }>
export type PrepareAnswer = Result<Readonly<{ reset: boolean; applied: readonly string[] }>, PrepareRefusal>
export type InvokeRefusal =
  | Code<'MANIFEST_REFUSED' | 'SERVER_TREE_REFUSED'>
  | Readonly<{ code: 'INPUT_REFUSED' | 'HANDLER_OUTPUT_REFUSED'; violation: SchemaViolation }>
  | Readonly<{ code: 'HANDLER_EXPORT_MISSING'; export: string }>
  | Readonly<{ code: 'HANDLER_CRASHED'; exitCode: number | null; signal: string | null }>
  | Extract<WorkerRefusal, { code: 'HANDLER_FAILED' | 'HANDLER_LOAD_FAILED' | 'DATABASE_UNAVAILABLE' }>
  | Code<Exclude<WorkerCode, 'HANDLER_FAILED' | 'HANDLER_LOAD_FAILED' | 'DATABASE_UNAVAILABLE' | 'HANDLER_EXPORT_MISSING' | 'APPLICATION_MIGRATION_FAILED'>
    | 'OPERATION_NOT_FOUND' | 'INPUT_TOO_LARGE' | 'CONNECTOR_SOCKET_REFUSED' | 'APPLICATION_RUNNER_BUSY' | 'HANDLER_TIMEOUT' | 'APPLICATION_PROJECT_BUSY'>
export type InvokeAnswer = Result<unknown, InvokeRefusal>
export type AccountConnectionAnswer = Result<void, Code<'ACCOUNT_INACTIVE' | 'ACCOUNT_NOT_FOUND'>>
