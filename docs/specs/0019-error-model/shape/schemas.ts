import { z } from 'zod'
import { FAILURE_CODES, FAILURE_STATUS } from '../../../../packages/contract/src/failures.generated.js'
import type { WorkerAnswer, WorkerCode } from './types.js'

export const traceIdSchema = z.string().regex(/^[0-9a-f]{32}$/).refine(value => value !== '0'.repeat(32)).brand<'TraceId'>()
export type TraceId = z.output<typeof traceIdSchema>
export const sqlStateSchema = z.string().regex(/^[0-9A-Z]{5}$/).brand<'SqlState'>()
export type SqlState = z.output<typeof sqlStateSchema>
const sqlstate = sqlStateSchema.nullable()
const migration = z.string().regex(/^[0-9]{3,6}_[a-z0-9_]{1,60}\.sql$/)

// Runtime literals live here because the restricted worker stages Zod, not the contract runtime.
const codeOnly = ['HANDLER_EXPORT_MISSING', 'HANDLER_OUTPUT_UNSERIALIZABLE', 'WORKER_FAILED', 'WORKER_JOB_REFUSED', 'RESPONSE_TOO_LARGE'] as const satisfies readonly WorkerCode[]
const workerError = z.union([
  z.strictObject({ code: z.enum(codeOnly) }).readonly(),
  z.strictObject({ code: z.enum(['HANDLER_FAILED', 'HANDLER_LOAD_FAILED', 'DATABASE_UNAVAILABLE']), sqlstate }).readonly(),
  z.strictObject({ code: z.literal('APPLICATION_MIGRATION_FAILED'), migration: migration.nullable(), sqlstate }).readonly(),
])
export const workerAnswerSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), result: z.unknown() }).readonly(),
  z.strictObject({ ok: z.literal(false), error: workerError }).readonly(),
]).refine(value => !value.ok || Object.hasOwn(value, 'result')) satisfies z.ZodType<WorkerAnswer>

// Public Problem still derives its code/status from the generated table in production.
export const publicProblemSchema = z.object({
  type: z.string(), title: z.string(), status: z.int().min(100).max(599),
  code: z.enum([...FAILURE_CODES, 'BUILDER_SANDBOX_OPEN_FAILED']), traceId: traceIdSchema.optional(),
}).refine(value => value.status === (value.code === 'BUILDER_SANDBOX_OPEN_FAILED' ? 503 : FAILURE_STATUS[value.code]))

const admissionCode = z.strictObject({ code: z.enum(['MANIFEST_REFUSED', 'SERVER_TREE_REFUSED']) }).readonly()
const prepareError = z.union([
  admissionCode,
  z.strictObject({ code: z.literal('APPLICATION_MIGRATION_FAILED'), migration: migration.nullable(), sqlstate }).readonly(),
  z.strictObject({ code: z.literal('APPLICATION_MIGRATION_HISTORY_DIVERGED'), migration }).readonly(),
])
export const prepareAnswerSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), result: z.strictObject({ reset: z.boolean(), applied: z.array(migration).readonly() }).readonly() }).readonly(),
  z.strictObject({ ok: z.literal(false), error: prepareError }).readonly(),
]) satisfies z.ZodType<import('./types.js').PrepareAnswer>
const invokeError = z.union([
  admissionCode,
  z.strictObject({ code: z.enum(['INPUT_REFUSED', 'HANDLER_OUTPUT_REFUSED']), violation: z.strictObject({ pointer: z.string(), rule: z.string() }).readonly() }).readonly(),
  z.strictObject({ code: z.literal('HANDLER_EXPORT_MISSING'), export: z.string() }).readonly(),
  z.strictObject({ code: z.literal('HANDLER_CRASHED'), exitCode: z.int().nullable(), signal: z.string().nullable() }).readonly(),
  z.strictObject({ code: z.enum(['HANDLER_FAILED', 'HANDLER_LOAD_FAILED', 'DATABASE_UNAVAILABLE']), sqlstate }).readonly(),
  z.strictObject({ code: z.enum(['HANDLER_OUTPUT_UNSERIALIZABLE', 'WORKER_FAILED', 'WORKER_JOB_REFUSED', 'RESPONSE_TOO_LARGE', 'OPERATION_NOT_FOUND', 'INPUT_TOO_LARGE', 'CONNECTOR_SOCKET_REFUSED', 'APPLICATION_RUNNER_BUSY', 'APPLICATION_PROJECT_BUSY', 'HANDLER_TIMEOUT']) }).readonly(),
])
export const invokeAnswerSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), result: z.unknown() }).readonly(),
  z.strictObject({ ok: z.literal(false), error: invokeError }).readonly(),
]).refine(value => !value.ok || Object.hasOwn(value, 'result')) satisfies z.ZodType<import('./types.js').InvokeAnswer>
