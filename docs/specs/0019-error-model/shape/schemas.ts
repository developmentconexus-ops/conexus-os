import { z } from 'zod'
import type { WorkerAnswer } from './types.js'

// The worker owns a narrow set. The final schema spells every table-backed variant.
const workerError = z.union([
  z.strictObject({ code: z.literal('HANDLER_FAILED') }),
  z.strictObject({ code: z.literal('HANDLER_LOAD_FAILED') }),
  z.strictObject({ code: z.literal('HANDLER_EXPORT_MISSING') }),
  z.strictObject({ code: z.literal('HANDLER_OUTPUT_UNSERIALIZABLE') }),
  z.strictObject({ code: z.literal('WORKER_FAILED') }),
  z.strictObject({ code: z.literal('WORKER_JOB_REFUSED') }),
  z.strictObject({ code: z.literal('RESPONSE_TOO_LARGE') }),
  z.strictObject({ code: z.literal('DATABASE_UNAVAILABLE') }),
  z.strictObject({ code: z.literal('APPLICATION_MIGRATION_FAILED') }),
])
export const workerAnswerSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), result: z.unknown() }),
  z.strictObject({ ok: z.literal(false), error: workerError }),
]) satisfies z.ZodType<WorkerAnswer>
