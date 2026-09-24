import { writeSync } from 'node:fs'
import pg from 'pg'
import { applyPendingMigrations } from './data-plane.js'
import type { MigrationPlan } from './data-plane.js'

/**
 * Runs inside one invocation's sandbox and nowhere else. The supervisor writes the job to stdin and
 * reads one result line from fd 3; stdout and stderr are the handler's own logs. The job names the
 * admitted module and export, the validated input and the database login the platform chose; nothing
 * the generated code does can change any of them before this process is gone.
 */
// No password: the worker reaches the database only through the relay socket, which authenticates
// upstream itself. Nothing in the sandbox holds a usable credential.
export type WorkerLogin = Readonly<{ host: string; user: string; database: string }>
/** The person using the app, as the Hub resolved them from a session. Never read from the input. */
export type WorkerCaller = Readonly<{ accountId: string; email: string | null; displayName: string }>
export type WorkerJob =
  | Readonly<{ kind: 'invoke'; login: WorkerLogin; module: string; export: string; input: unknown; caller: WorkerCaller; responseLimit: number }>
  | Readonly<{ kind: 'migrate'; login: WorkerLogin; schema: string; plan: MigrationPlan['pending'] }>
export type WorkerResult =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false; code: string; detail?: string }>

const RESULT_FD = 3
const MAX_JOB_BYTES = 8 * 1024 * 1024

const detail = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error)
  const code = typeof (error as { code?: unknown })?.code === 'string' ? `${(error as { code: string }).code} ` : ''
  return `${code}${message}`.slice(0, 400)
}

const finish = (result: WorkerResult): never => {
  writeSync(RESULT_FD, `${JSON.stringify(result)}\n`)
  process.exit(0)
}

const readJob = async (): Promise<WorkerJob> => {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
    bytes += chunk.byteLength
    if (bytes > MAX_JOB_BYTES) finish({ ok: false, code: 'WORKER_JOB_REFUSED' })
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as WorkerJob
}

const connect = async (login: WorkerLogin): Promise<pg.Client> => {
  const client = new pg.Client({ ...login, connectionTimeoutMillis: 3000 })
  await client.connect()
  return client
}

const run = async (): Promise<never> => {
  const job = await readJob()
  let client: pg.Client
  try {
    client = await connect(job.login)
  } catch (error) {
    return finish({ ok: false, code: 'DATABASE_UNAVAILABLE', detail: detail(error) })
  }
  if (job.kind === 'migrate') {
    try {
      await applyPendingMigrations(client, job.schema, job.plan)
    } catch (error) {
      return finish({ ok: false, code: 'MIGRATION_FAILED', detail: detail(error) })
    }
    await client.end().catch(() => undefined)
    return finish({ ok: true, value: job.plan.map((migration) => migration.name) })
  }
  let handler: unknown
  try {
    handler = (await import(job.module) as Record<string, unknown>)[job.export]
  } catch (error) {
    return finish({ ok: false, code: 'HANDLER_LOAD_FAILED', detail: detail(error) })
  }
  if (typeof handler !== 'function') return finish({ ok: false, code: 'HANDLER_EXPORT_MISSING', detail: job.export })
  // The handler receives a query function and nothing that holds the connection or its login.
  const db = Object.freeze({
    query: async (text: string, values?: readonly unknown[]) => {
      const result = await client.query(text, values as unknown[] | undefined)
      return { rows: result.rows }
    },
  })
  const caller = Object.freeze({ accountId: job.caller.accountId, email: job.caller.email, displayName: job.caller.displayName })
  let value: unknown
  try {
    value = await (handler as (input: unknown, context: unknown) => unknown)(job.input, Object.freeze({ db, caller }))
  } catch (error) {
    return finish({ ok: false, code: 'HANDLER_FAILED', detail: detail(error) })
  }
  let serialized: string
  try {
    serialized = JSON.stringify(value ?? null)
  } catch (error) {
    return finish({ ok: false, code: 'HANDLER_OUTPUT_UNSERIALIZABLE', detail: detail(error) })
  }
  if (Buffer.byteLength(serialized) > job.responseLimit) return finish({ ok: false, code: 'RESPONSE_TOO_LARGE' })
  await client.end().catch(() => undefined)
  return finish({ ok: true, value: JSON.parse(serialized) as unknown })
}

run().catch((error: unknown) => finish({ ok: false, code: 'WORKER_FAILED', detail: detail(error) }))
