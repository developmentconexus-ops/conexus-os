import { z } from 'zod'
import { callerSchema } from '../platform/caller.js'

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

export const workerResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: z.unknown() }).readonly(),
  z.object({ ok: z.literal(false), code: z.string(), detail: z.string().exactOptional() }).readonly(),
])
export type WorkerResult = z.infer<typeof workerResult>

export const connectorAnswer = z.discriminatedUnion('ok', [
  z.looseObject({ ok: z.literal(true) }).readonly(),
  z.looseObject({ ok: z.literal(false), code: z.string() }).readonly(),
])
export type ConnectorAnswer = z.infer<typeof connectorAnswer>
