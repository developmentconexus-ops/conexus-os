import { randomBytes, randomUUID } from 'node:crypto'
import { chmod, lstat, mkdir, readdir, rm, unlink } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import { join } from 'node:path'
import type { Broker } from './broker.js'
import { refused } from './errors.js'
import type { FetchResult } from './native.js'
import type { ConsumerScope } from './scope.js'

// One owner-only unix socket per invocation, served by the Hub, closed over the scope the Hub minted.
// Nothing on the wire names a Project.

/** `answerBytes` bounds the serialized answer. `invocationMs` is the runner's invocation timeout (`invokeTimeoutMs` in
 * app-runner/supervisor.ts), and `marginMs` is what a fetch leaves for the handler to answer before the runner stops it. */
export type HandlerPortLimits = Readonly<{ bodyBytes: number; calls: number; concurrent: number; answerBytes: number; invocationMs: number; marginMs: number }>

const DEFAULT_PORT_LIMITS: HandlerPortLimits = Object.freeze({
  bodyBytes: 64 * 1024, calls: 8, concurrent: 2, answerBytes: 256 * 1024, invocationMs: 5000, marginMs: 250,
})

type FetchRefusal = Extract<FetchResult, { ok: false }>
/** What a handler sees of a fetch: the executor's result without the vendor's error body, which only the Builder's model needs. */
type HandlerFetchResult = Extract<FetchResult, { ok: true }> | Readonly<Omit<FetchRefusal, 'body'>>

const forHandler = (result: FetchResult): HandlerFetchResult => {
  if (result.ok) return result
  const { body: _vendorErrorBody, ...refusal } = result
  return Object.freeze(refusal)
}

export type HandlerPort = Readonly<{
  socketPath: string
  /** Stops accepting, destroys open connections and unlinks the socket. Idempotent. */
  close(): Promise<void>
}>

export type HandlerPorts = Readonly<{
  open(scope: ConsumerScope): Promise<HandlerPort>
  /** Empties the directory: run once at Hub startup, so no orphan socket of a previous process remains. */
  sweep(): Promise<void>
}>

const FETCH_PATH = '/v1/fetch'

const answer = (response: ServerResponse, result: HandlerFetchResult, answerBytes = Infinity): void => {
  let payload = JSON.stringify(result)
  if (Buffer.byteLength(payload) > answerBytes) payload = JSON.stringify(refused('RESPONSE_TOO_LARGE'))
  response.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) })
  response.end(payload)
}

const readBody = (request: IncomingMessage, limit: number): Promise<Buffer | null> => new Promise((resolve) => {
  const chunks: Buffer[] = []
  let bytes = 0
  // An oversized body is drained and dropped, so the refusal still reaches the client as an answer.
  request.on('data', (chunk: Buffer) => {
    bytes += chunk.byteLength
    if (bytes <= limit) chunks.push(chunk)
  })
  request.on('end', () => resolve(bytes <= limit ? Buffer.concat(chunks) : null))
  request.on('error', () => resolve(null))
})

const PORT_SOCKET_NAME = /^[A-Za-z0-9_-]{12}\.s$/

/** Unlinks the port sockets a previous Hub left behind. It creates the directory owner-only when absent,
 * refuses one this process does not own with mode 0700, and touches no entry that is not a port socket,
 * so a misconfigured shared directory keeps its data. */
const sweepSocketDirectory = async (directory: string): Promise<void> => {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const stat = await lstat(directory)
  if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700) throw new Error('CONNECTOR_SOCKET_DIR_REFUSED')
  for (const entry of await readdir(directory)) {
    if (!PORT_SOCKET_NAME.test(entry)) continue
    const path = join(directory, entry)
    if ((await lstat(path)).isSocket()) await unlink(path)
  }
}

export const createHandlerPorts = ({ directory, broker, limits: overrides }: Readonly<{
  directory: string
  broker: Broker
  limits?: Partial<HandlerPortLimits>
}>): HandlerPorts => Object.freeze({
  sweep: () => sweepSocketDirectory(directory),
  async open(scope: ConsumerScope): Promise<HandlerPort> {
    const limits: HandlerPortLimits = { ...DEFAULT_PORT_LIMITS, ...overrides }
    const invocationEnds = Date.now() + limits.invocationMs
    const invocationId = randomUUID()
    // A unix socket path is capped at 107 bytes, so the name stays short.
    const socketPath = join(directory, `${randomBytes(9).toString('base64url')}.s`)
    const connections = new Set<Socket>()
    let calls = 0
    let active = 0

    const consumer = { kind: 'handler', invocationId, scope } as const
    // The executor's strict parse of the request is the boundary; the port only carries the JSON. The fetch gets
    // what is left of the invocation, so the executor aborts it and frees its capacity before the runner stops the worker.
    const forward = async (body: unknown): Promise<HandlerFetchResult> => {
      const deadlineMs = invocationEnds - Date.now() - limits.marginMs
      if (deadlineMs <= 0) return refused('PROVIDER_TIMEOUT')
      return forHandler(await broker.fetch(consumer, body, { deadlineMs }))
    }

    const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
      if (request.method !== 'POST' || request.url !== FETCH_PATH) {
        response.writeHead(404).end()
        return
      }
      if (calls >= limits.calls || active >= limits.concurrent) {
        answer(response, refused('CALL_LIMIT'))
        return
      }
      calls += 1
      active += 1
      try {
        const bytes = await readBody(request, limits.bodyBytes)
        let body: unknown
        try {
          body = bytes ? JSON.parse(bytes.toString('utf8')) : undefined
        } catch {
          body = undefined
        }
        answer(response, body === undefined ? refused('INPUT_REFUSED') : await forward(body), limits.answerBytes)
      } finally {
        active -= 1
      }
    }

    const server = createServer({ requestTimeout: 30_000 }, (request, response) => {
      handle(request, response).catch(() => { if (!response.headersSent) answer(response, refused('PROVIDER_UNAVAILABLE')) })
    })
    server.on('connection', (socket: Socket) => {
      connections.add(socket)
      socket.on('close', () => connections.delete(socket))
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen({ path: socketPath }, () => { server.off('error', reject); resolve() })
    })
    let closing: Promise<void> | null = null
    const close = (): Promise<void> => {
      closing ??= (async () => {
        const stopped = new Promise<void>((resolve) => server.close(() => resolve()))
        for (const socket of connections) socket.destroy()
        await stopped
        await rm(socketPath, { force: true })
      })()
      return closing
    }
    try {
      await chmod(socketPath, 0o600)
    } catch (error) {
      await close()
      throw error
    }
    return Object.freeze({ socketPath, close })
  },
})
