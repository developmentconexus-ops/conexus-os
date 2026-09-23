import { rm } from 'node:fs/promises'
import net from 'node:net'

/**
 * One invocation's database path. The sandbox has an empty network namespace; the only way out is
 * this unix socket, bound into it, which relays to the application cluster over TCP. The relay reads
 * the Postgres startup packet and admits only a session for the pinned role on the pinned database,
 * so a worker holding any other credential still cannot open it. It records each session's
 * BackendKeyData and, when the invocation ends, cancels whatever that backend is still running: a
 * killed worker otherwise leaves its statement executing.
 */
export type PgRelay = Readonly<{
  sessions(): number
  refused(): readonly string[]
  close(): Promise<void>
}>

export type PgRelayConfig = Readonly<{
  socketPath: string
  upstream: Readonly<{ host: string; port: number }>
  pin: Readonly<{ user: string; database: string }>
  maxSessions: number
}>

const PROTOCOL_3_0 = 196_608
const SSL_REQUEST = 80_877_103
const GSS_REQUEST = 80_877_104
const CANCEL_REQUEST = 80_877_102
const MAX_STARTUP_BYTES = 8192
const ALLOWED_PARAMETERS = new Set(['user', 'database', 'application_name', 'client_encoding'])

type Startup =
  | Readonly<{ kind: 'NEGOTIATE'; length: number }>
  | Readonly<{ kind: 'STARTUP'; length: number; parameters: ReadonlyMap<string, string> }>
  | Readonly<{ kind: 'REFUSED'; reason: string }>
  | Readonly<{ kind: 'INCOMPLETE' }>

/** Reads the first client message the relay must judge before any byte reaches Postgres. */
export const readStartup = (buffer: Buffer): Startup => {
  if (buffer.length < 8) return { kind: 'INCOMPLETE' }
  const length = buffer.readInt32BE(0)
  if (length < 8 || length > MAX_STARTUP_BYTES) return { kind: 'REFUSED', reason: 'STARTUP_LENGTH' }
  if (buffer.length < length) return { kind: 'INCOMPLETE' }
  const code = buffer.readInt32BE(4)
  if (length === 8 && (code === SSL_REQUEST || code === GSS_REQUEST)) return { kind: 'NEGOTIATE', length }
  if (code === CANCEL_REQUEST) return { kind: 'REFUSED', reason: 'CANCEL_REQUEST' }
  if (code !== PROTOCOL_3_0) return { kind: 'REFUSED', reason: 'PROTOCOL' }
  const fields = buffer.subarray(8, length).toString('utf8').split('\0')
  // name\0value\0 ... name\0value\0 \0 splits into pairs followed by two empty strings.
  if (fields.length < 2 || fields.at(-1) !== '' || fields.at(-2) !== '' || (fields.length - 2) % 2 !== 0) return { kind: 'REFUSED', reason: 'STARTUP_FORMAT' }
  const parameters = new Map<string, string>()
  for (let index = 0; index < fields.length - 2; index += 2) {
    const name = fields[index] as string
    if (!ALLOWED_PARAMETERS.has(name) || parameters.has(name)) return { kind: 'REFUSED', reason: `PARAMETER:${name.slice(0, 40)}` }
    parameters.set(name, fields[index + 1] as string)
  }
  return { kind: 'STARTUP', length, parameters }
}

const fatal = (message: string): Buffer => {
  const fields = Buffer.from(`SFATAL\0VFATAL\0C28000\0M${message}\0\0`, 'utf8')
  const header = Buffer.alloc(5)
  header.write('E', 0, 'latin1')
  header.writeInt32BE(fields.length + 4, 1)
  return Buffer.concat([header, fields])
}

const cancelRequest = (key: Buffer): Buffer => {
  const packet = Buffer.alloc(8)
  packet.writeInt32BE(16, 0)
  packet.writeInt32BE(CANCEL_REQUEST, 4)
  return Buffer.concat([packet, key])
}

export const openPgRelay = async (config: PgRelayConfig): Promise<PgRelay> => {
  const refused: string[] = []
  const keys: Buffer[] = []
  const sockets = new Set<net.Socket>()
  let sessions = 0
  let closed = false

  const admit = (client: net.Socket): void => {
    sockets.add(client)
    client.on('close', () => sockets.delete(client))
    client.on('error', () => client.destroy())
    if (closed) {
      client.destroy()
      return
    }
    let pending = Buffer.alloc(0)
    const judge = (chunk: Buffer): void => {
      pending = Buffer.concat([pending, chunk])
      if (pending.length > MAX_STARTUP_BYTES) { refused.push('STARTUP_LENGTH'); client.destroy(); return }
      const startup = readStartup(pending)
      if (startup.kind === 'INCOMPLETE') return
      if (startup.kind === 'REFUSED') {
        refused.push(startup.reason)
        client.removeListener('data', judge)
        client.end(fatal('conexus: session refused'))
        return
      }
      if (startup.kind === 'NEGOTIATE') {
        pending = pending.subarray(startup.length)
        client.write('N')
        if (pending.length > 0) judge(Buffer.alloc(0))
        return
      }
      const user = startup.parameters.get('user')
      const database = startup.parameters.get('database') ?? user
      if (user !== config.pin.user || database !== config.pin.database) {
        refused.push('IDENTITY')
        client.removeListener('data', judge)
        client.end(fatal('conexus: session refused'))
        return
      }
      client.removeListener('data', judge)
      if (sessions >= config.maxSessions) {
        refused.push('SESSION_LIMIT')
        client.end(fatal('conexus: session limit'))
        return
      }
      sessions += 1
      client.pause()
      const upstream = net.connect(config.upstream.port, config.upstream.host)
      sockets.add(upstream)
      upstream.on('close', () => { sockets.delete(upstream); client.destroy() })
      upstream.on('error', () => upstream.destroy())
      client.on('close', () => upstream.destroy())
      upstream.once('connect', () => {
        upstream.write(pending)
        // Only the server's messages up to its first ReadyForQuery are parsed, to find the backend
        // key; every byte is forwarded unchanged either way.
        let serverBytes = Buffer.alloc(0)
        let watching = true
        upstream.on('data', (data: Buffer) => {
          client.write(data)
          if (!watching) return
          serverBytes = Buffer.concat([serverBytes, data])
          while (serverBytes.length >= 5) {
            const type = String.fromCharCode(serverBytes[0] as number)
            const length = serverBytes.readInt32BE(1)
            if (serverBytes.length < length + 1) break
            if (type === 'K' && length === 12) keys.push(Buffer.from(serverBytes.subarray(5, 13)))
            serverBytes = serverBytes.subarray(length + 1)
            if (type === 'Z') { watching = false; serverBytes = Buffer.alloc(0); break }
          }
        })
        client.on('data', (data: Buffer) => upstream.write(data))
        client.resume()
      })
    }
    client.on('data', judge)
  }

  const server = net.createServer({ allowHalfOpen: false }, admit)
  server.maxConnections = config.maxSessions + 4
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.socketPath, () => { server.removeListener('error', reject); resolve() })
  })

  const cancel = (key: Buffer): Promise<void> => new Promise((resolve) => {
    const socket = net.connect(config.upstream.port, config.upstream.host)
    const done = (): void => { socket.destroy(); resolve() }
    socket.setTimeout(2000, done)
    socket.once('error', done)
    socket.once('close', done)
    socket.once('connect', () => socket.end(cancelRequest(key)))
  })

  return Object.freeze({
    sessions: () => sessions,
    refused: () => Object.freeze([...refused]),
    close: async () => {
      if (closed) return
      closed = true
      const stopped = new Promise<void>((resolve) => server.close(() => resolve()))
      await Promise.all(keys.map(cancel))
      for (const socket of sockets) socket.destroy()
      await stopped
      await rm(config.socketPath, { force: true })
    },
  })
}
