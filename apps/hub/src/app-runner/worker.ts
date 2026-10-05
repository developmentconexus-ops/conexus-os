import { writeSync } from 'node:fs'
import { request } from 'node:http'
import pg from 'pg'
import { applyPendingMigrations } from './data-plane.js'
import { connectorAnswer, workerJob } from './wire.js'
import type { ConnectorAnswer, WorkerJob, WorkerResult } from './wire.js'

/**
 * Runs inside one invocation's sandbox and nowhere else. The supervisor writes the job to stdin and
 * reads one result line from fd 3; stdout and stderr are the handler's own logs. The job names the
 * admitted module and export, the validated input and the database login the platform chose; nothing
 * the generated code does can change any of them before this process is gone. The handler runs in this
 * process and can write fd 3 itself, so the result line is handler-controlled text until the supervisor
 * checks it.
 */

const RESULT_FD = 3
const MAX_JOB_BYTES = 8 * 1024 * 1024
// Where the runner binds the Hub's connector port for this invocation (sandbox.ts binds exactly this).
const CONNECTOR_SOCKET = '/run/conexus/connector/.s.connector'
const CONNECTOR_BODY_BYTES = 64 * 1024
// The Hub bounds the answer to 256 KiB.
const CONNECTOR_ANSWER_BYTES = 256 * 1024

const refusal = (code: string): ConnectorAnswer => Object.freeze({ ok: false, code })
const unconfigured = refusal('CONNECTOR_UNCONFIGURED')

// One POST over the bound socket, answered by the Hub. The answer is the Hub's own JSON, passed through
// untouched: within the limit, and anything unreadable is the port not being there.
const post = (payload: Buffer): Promise<ConnectorAnswer> => new Promise((resolve) => {
  const outgoing = request({
    socketPath: CONNECTOR_SOCKET, path: '/v1/fetch', method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': payload.byteLength },
  }, (response) => {
    const chunks: Buffer[] = []
    let bytes = 0
    let tooLarge = false
    response.on('data', (chunk: Buffer) => {
      bytes += chunk.byteLength
      if (bytes > CONNECTOR_ANSWER_BYTES) {
        tooLarge = true
        response.destroy()
      } else chunks.push(chunk)
    })
    response.on('close', () => {
      if (tooLarge) return resolve(refusal('RESPONSE_TOO_LARGE'))
      try {
        const answer = connectorAnswer.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        if (answer.success) return resolve(Object.freeze(answer.data))
      } catch {
        // an unreadable answer is the port not being there
      }
      resolve(unconfigured)
    })
    response.on('error', () => resolve(unconfigured))
  })
  outgoing.on('error', () => resolve(unconfigured))
  outgoing.end(payload)
})

// A payload the handler gave, as bytes the port will take; the refusal code when it cannot be sent.
const encode = (value: unknown): Buffer | 'INPUT_REFUSED' => {
  try {
    const payload = Buffer.from(JSON.stringify(value) ?? 'null')
    return payload.byteLength > CONNECTOR_BODY_BYTES ? 'INPUT_REFUSED' : payload
  } catch {
    return 'INPUT_REFUSED'
  }
}

// The handler's way to a Connector. It never throws, and it carries nothing that names a Project, a
// Connection or a provider: only the Hub's port can resolve the request.
const connectorClient = (bound: boolean) => Object.freeze({
  fetch: async (value: unknown): Promise<ConnectorAnswer> => {
    if (!bound) return unconfigured
    const payload = encode(value)
    return typeof payload === 'string' ? refusal(payload) : post(payload)
  },
})

const detail = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error)
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? `${error.code} ` : ''
  return `${code}${message}`.slice(0, 400)
}

const finish = (result: WorkerResult): never => {
  writeSync(RESULT_FD, `${JSON.stringify(result)}\n`)
  process.exit(0)
}

const readJob = async (): Promise<WorkerJob> => {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of process.stdin) {
    if (!Buffer.isBuffer(chunk)) return finish({ ok: false, code: 'WORKER_JOB_REFUSED' })
    bytes += chunk.byteLength
    if (bytes > MAX_JOB_BYTES) finish({ ok: false, code: 'WORKER_JOB_REFUSED' })
    chunks.push(chunk)
  }
  const job = workerJob.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  return job.success ? job.data : finish({ ok: false, code: 'WORKER_JOB_REFUSED' })
}

const connect = async (login: WorkerJob['login']): Promise<pg.Client> => {
  const client = new pg.Client({ ...login, connectionTimeoutMillis: 3000 })
  await client.connect()
  return client
}

const run = async (): Promise<never> => {
  const job = await readJob()
  if (job.kind === 'migrate') {
    let client: pg.Client
    try {
      client = await connect(job.login)
    } catch (error) {
      return finish({ ok: false, code: 'DATABASE_UNAVAILABLE', detail: detail(error) })
    }
    try {
      await applyPendingMigrations(client, job.schema, job.plan)
    } catch (error) {
      return finish({ ok: false, code: 'APPLICATION_MIGRATION_FAILED', detail: detail(error) })
    }
    await client.end().catch(() => undefined)
    return finish({ ok: true, value: job.plan.map((migration) => migration.name) })
  }
  let handler: unknown
  try {
    handler = Reflect.get(await import(job.module), job.export)
  } catch (error) {
    return finish({ ok: false, code: 'HANDLER_LOAD_FAILED', detail: detail(error) })
  }
  if (typeof handler !== 'function') return finish({ ok: false, code: 'HANDLER_EXPORT_MISSING', detail: job.export })
  // The handler receives a query function and nothing that holds the connection or its login. The
  // connection opens on the first query, so a handler that only reads a Conexão runs even where the
  // Project has no database yet, as before its first Prévia with a server half.
  let session: Promise<pg.Client> | undefined
  let unavailable: unknown
  const db = Object.freeze({
    query: async (text: string, values?: readonly unknown[]) => {
      session ??= connect(job.login).catch((error: unknown) => {
        unavailable = error
        throw error
      })
      const result = await (await session).query(text, values && [...values])
      return { rows: result.rows }
    },
  })
  const caller = Object.freeze({ accountId: job.caller.accountId, email: job.caller.email, displayName: job.caller.displayName })
  const connectors = connectorClient(job.connector)
  let value: unknown
  try {
    value = await Reflect.apply(handler, undefined, [job.input, Object.freeze({ db, caller, connectors })])
  } catch (error) {
    return finish(unavailable === undefined
      ? { ok: false, code: 'HANDLER_FAILED', detail: detail(error) }
      : { ok: false, code: 'DATABASE_UNAVAILABLE', detail: detail(unavailable) })
  }
  let serialized: string
  try {
    serialized = JSON.stringify(value ?? null)
  } catch (error) {
    return finish({ ok: false, code: 'HANDLER_OUTPUT_UNSERIALIZABLE', detail: detail(error) })
  }
  if (Buffer.byteLength(serialized) > job.responseLimit) return finish({ ok: false, code: 'RESPONSE_TOO_LARGE' })
  await session?.then((client) => client.end()).catch(() => undefined)
  return finish({ ok: true, value: JSON.parse(serialized) })
}

run().catch((error: unknown) => finish({ ok: false, code: 'WORKER_FAILED', detail: detail(error) }))
