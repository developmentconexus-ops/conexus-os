import { z } from 'zod'
import { callerSchema } from '../platform/caller.js'
import { isMigrationName } from './server-manifest.js'
import type { InvokeAnswer, PrepareAnswer, SqlState, WorkerAnswer } from './server-manifest.js'

/**
 * What crosses the worker's pipes, and only that: the job the supervisor writes to its stdin, the one
 * result line it writes to fd 3, and the Hub's answer on the connector socket. The worker is staged
 * into the sandbox with this module, so it imports nothing the sandbox does not mount.
 */
// No password: the worker reaches the database only through the relay socket, which authenticates
// upstream itself. Nothing in the sandbox holds a usable credential.
const login = z.strictObject({ host: z.string().min(1).max(107), user: z.string().min(1).max(63), database: z.string().min(1).max(63) }).readonly()

const plannedMigration = z.strictObject({
  name: z.string().min(1).max(71), sha256: z.string().regex(/^[0-9a-f]{64}$/), sql: z.string().min(1).max(256 * 1024), position: z.number().int().positive(),
}).readonly()
export type PlannedMigration = z.infer<typeof plannedMigration>

export const workerJob = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('invoke'), login, module: z.string().min(1).max(300), export: z.string().min(1).max(64), input: z.unknown(),
    caller: callerSchema, responseLimit: z.number().int().positive(), connector: z.boolean(),
  }).readonly(),
  z.strictObject({ kind: z.literal('migrate'), login, schema: z.string().min(1).max(63), plan: z.array(plannedMigration).max(64).readonly() }).readonly(),
])
export type WorkerJob = z.infer<typeof workerJob>

export const sqlStateSchema = z.custom<SqlState>((value): value is SqlState => typeof value === 'string' && /^[0-9A-Z]{5}$/.test(value))
const sqlstate = sqlStateSchema.nullable()
const migrationName = z.custom<string>(isMigrationName)

const workerError = z.union([
  z.strictObject({ code: z.enum(['HANDLER_EXPORT_MISSING', 'HANDLER_OUTPUT_UNSERIALIZABLE', 'WORKER_FAILED', 'WORKER_JOB_REFUSED', 'RESPONSE_TOO_LARGE']) }).readonly(),
  z.strictObject({ code: z.enum(['HANDLER_FAILED', 'HANDLER_LOAD_FAILED', 'DATABASE_UNAVAILABLE']), sqlstate }).readonly(),
  z.strictObject({ code: z.literal('APPLICATION_MIGRATION_FAILED'), migration: migrationName.nullable(), sqlstate }).readonly(),
])
export const workerAnswerSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), result: z.unknown() }).readonly(),
  z.strictObject({ ok: z.literal(false), error: workerError }).readonly(),
]) satisfies z.ZodType<WorkerAnswer>

const admissionError = z.strictObject({ code: z.enum(['MANIFEST_REFUSED', 'SERVER_TREE_REFUSED']) }).readonly()
const prepareError = z.union([
  admissionError,
  z.strictObject({ code: z.literal('APPLICATION_MIGRATION_FAILED'), migration: migrationName.nullable(), sqlstate }).readonly(),
  z.strictObject({ code: z.literal('APPLICATION_MIGRATION_HISTORY_DIVERGED'), migration: migrationName }).readonly(),
])
export const prepareAnswerSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), result: z.strictObject({ reset: z.boolean(), applied: z.array(migrationName).readonly() }).readonly() }).readonly(),
  z.strictObject({ ok: z.literal(false), error: prepareError }).readonly(),
]) satisfies z.ZodType<PrepareAnswer>

const invokeError = z.union([
  admissionError,
  z.strictObject({ code: z.enum(['INPUT_REFUSED', 'HANDLER_OUTPUT_REFUSED']), violation: z.strictObject({ pointer: z.string(), rule: z.string() }).readonly() }).readonly(),
  z.strictObject({ code: z.literal('HANDLER_EXPORT_MISSING'), export: z.string() }).readonly(),
  z.strictObject({ code: z.literal('HANDLER_CRASHED'), exitCode: z.int().nullable(), signal: z.string().nullable() }).readonly(),
  z.strictObject({ code: z.enum(['HANDLER_FAILED', 'HANDLER_LOAD_FAILED', 'DATABASE_UNAVAILABLE']), sqlstate }).readonly(),
  z.strictObject({ code: z.enum(['HANDLER_OUTPUT_UNSERIALIZABLE', 'WORKER_FAILED', 'WORKER_JOB_REFUSED', 'RESPONSE_TOO_LARGE', 'OPERATION_NOT_FOUND', 'INPUT_TOO_LARGE', 'CONNECTOR_SOCKET_REFUSED', 'APPLICATION_RUNNER_BUSY', 'APPLICATION_PROJECT_BUSY', 'HANDLER_TIMEOUT']) }).readonly(),
])
export const invokeAnswerSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), result: z.unknown() }).readonly(),
  z.strictObject({ ok: z.literal(false), error: invokeError }).readonly(),
]) satisfies z.ZodType<InvokeAnswer>

export const connectorAnswer = z.discriminatedUnion('ok', [
  z.looseObject({ ok: z.literal(true) }).readonly(),
  z.looseObject({ ok: z.literal(false), code: z.string() }).readonly(),
])
export type ConnectorAnswer = z.infer<typeof connectorAnswer>
