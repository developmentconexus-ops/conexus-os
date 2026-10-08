import { writeSync } from 'node:fs'
import { request } from 'node:http'
import pg from 'pg'
import { applyPendingMigrations } from './data-plane.js'
import { connectorAnswer, sqlStateSchema, workerJob } from './wire.js'
import type { ConnectorAnswer, WorkerJob } from './wire.js'
import type { WorkerAnswer, WorkerRefusal } from './server-manifest.js'

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

const finish = (result: WorkerAnswer): never => {
  writeSync(RESULT_FD, `${JSON.stringify(result)}\n`)
  process.exit(0)
}

function refuse(error: WorkerRefusal): never {
  return finish(Object.freeze({ ok: false, error: Object.freeze(error) }))
}

function accept(result: unknown): never {
  return finish(Object.freeze({ ok: true, result }))
}

function sqlstate(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null
  const parsed = sqlStateSchema.safeParse(error.code)
  return parsed.success ? parsed.data : null
}

const readJob = async (): Promise<WorkerJob> => {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of process.stdin) {
    if (!Buffer.isBuffer(chunk)) return refuse({ code: 'WORKER_JOB_REFUSED' })
    bytes += chunk.byteLength
    if (bytes > MAX_JOB_BYTES) refuse({ code: 'WORKER_JOB_REFUSED' })
    chunks.push(chunk)
  }
  let value: unknown
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return refuse({ code: 'WORKER_JOB_REFUSED' })
  }
  const job = workerJob.safeParse(value)
  return job.success ? job.data : refuse({ code: 'WORKER_JOB_REFUSED' })
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
      return refuse({ code: 'DATABASE_UNAVAILABLE', sqlstate: sqlstate(error) })
    }
    const applied = await applyPendingMigrations(client, job.schema, job.plan)
    await client.end().catch(() => undefined)
    if (!applied.ok) return refuse({ code: applied.error.code, migration: applied.error.migration, sqlstate: sqlstate(applied.error.cause) })
    return accept(job.plan.map((migration) => migration.name))
  }
  let handler: unknown
  try {
    handler = Reflect.get(await import(job.module), job.export)
  } catch (error) {
    return refuse({ code: 'HANDLER_LOAD_FAILED', sqlstate: sqlstate(error) })
  }
  if (typeof handler !== 'function') return refuse({ code: 'HANDLER_EXPORT_MISSING' })
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
      ? { ok: false, error: { code: 'HANDLER_FAILED', sqlstate: sqlstate(error) } }
      : { ok: false, error: { code: 'DATABASE_UNAVAILABLE', sqlstate: sqlstate(unavailable) } })
  }
  let serialized: string
  try {
    serialized = JSON.stringify(value ?? null)
  } catch {
    return refuse({ code: 'HANDLER_OUTPUT_UNSERIALIZABLE' })
  }
  if (Buffer.byteLength(serialized) > job.responseLimit) return refuse({ code: 'RESPONSE_TOO_LARGE' })
  await session?.then((client) => client.end()).catch(() => undefined)
  return accept(JSON.parse(serialized))
}

run().catch(() => refuse({ code: 'WORKER_FAILED' }))
