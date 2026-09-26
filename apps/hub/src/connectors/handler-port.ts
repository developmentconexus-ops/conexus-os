import { randomBytes, randomUUID } from 'node:crypto'
import { chmod, lstat, mkdir, readdir, rm, unlink } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import { join } from 'node:path'
import { z } from 'zod'
import type { Broker } from './broker.js'
import { refused } from './errors.js'
import type { BrokerResult } from './errors.js'
import type { ConsumerScope } from './scope.js'

// One owner-only unix socket per invocation, served by the Hub, closed over the scope the Hub minted.
// Nothing on the wire names a Project.

export type HandlerPortLimits = Readonly<{ bodyBytes: number; calls: number; concurrent: number }>

export const DEFAULT_PORT_LIMITS: HandlerPortLimits = Object.freeze({ bodyBytes: 64 * 1024, calls: 8, concurrent: 2 })

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

const callBody = z.strictObject({ operation: z.string().max(200), input: z.unknown() })

const answer = (response: ServerResponse, result: BrokerResult<unknown>): void => {
  const payload = JSON.stringify(result)
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
export const sweepSocketDirectory = async (directory: string): Promise<void> => {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const stat = await lstat(directory)
  if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700) throw new Error('CONNECTOR_SOCKET_DIR_REFUSED')
  for (const entry of await readdir(directory)) {
    if (!PORT_SOCKET_NAME.test(entry)) continue
    const path = join(directory, entry)
    if ((await lstat(path)).isSocket()) await unlink(path)
  }
}

export const createHandlerPorts = ({ directory, broker, limits = DEFAULT_PORT_LIMITS }: Readonly<{
  directory: string
  broker: Broker
  limits?: HandlerPortLimits
}>): HandlerPorts => Object.freeze({
  sweep: () => sweepSocketDirectory(directory),
  async open(scope: ConsumerScope): Promise<HandlerPort> {
    const invocationId = randomUUID()
    // A unix socket path is capped at 107 bytes, so the name stays short.
    const socketPath = join(directory, `${randomBytes(9).toString('base64url')}.s`)
    const connections = new Set<Socket>()
    let calls = 0
    let active = 0

    const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
      if (request.method !== 'POST' || request.url !== '/v1/call') {
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
        let body: unknown = null
        try { body = bytes ? JSON.parse(bytes.toString('utf8')) : null } catch { body = null }
        const parsed = callBody.safeParse(body)
        if (!parsed.success) {
          answer(response, refused('INPUT_REFUSED'))
          return
        }
        answer(response, await broker.call({ kind: 'handler', invocationId, scope }, parsed.data.operation, parsed.data.input))
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
