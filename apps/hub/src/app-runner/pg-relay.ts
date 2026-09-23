import { readdirSync, readFileSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import net from 'node:net'
import tls from 'node:tls'

/**
 * One invocation's database path. The sandbox has an empty network namespace; the only way out is
 * this unix socket, bound into it. The relay terminates authentication: the worker connects with no
 * credential, and the relay opens the upstream session over TLS with the runner's client
 * certificate, which never enters the sandbox. Project roles have no usable password and the
 * cluster admits them only with that certificate (scripts/confine-application-cluster.mjs), so a
 * password a Project role sets for itself opens nothing. The relay admits only a session for the
 * pinned role on the pinned database, records each session's BackendKeyData and, when the invocation
 * ends, cancels whatever that backend is still running, so a killed worker leaves no statement
 * executing.
 */
export type PgRelay = Readonly<{
  sessions(): number
  refused(): readonly string[]
  close(): Promise<void>
}>

/** The runner's client certificate and the CA that signed both it and the cluster's server certificate. */
export type RelayTls = Readonly<{ ca: string; cert: string; key: string }>

const RELAY_FILES = ['ca.pem', 'relay-key.pem', 'relay.pem']

/**
 * Reads the relay's TLS material from a directory holding exactly those three files that only this OS
 * user opens. The CA key and the server key live elsewhere (scripts/confine-application-cluster.mjs):
 * whoever reads either could mint relay certificates or impersonate the cluster.
 */
export const readRelayTls = (directory: string): RelayTls => {
  if ((statSync(directory).mode & 0o077) !== 0) throw new Error('RUNNER_RELAY_TLS_DIR_PERMISSIONS')
  const present = readdirSync(directory).sort()
  if (present.join(',') !== RELAY_FILES.join(',')) throw new Error(`RUNNER_RELAY_TLS_DIR_REFUSED: ${present.join(',')}`)
  if ((statSync(join(directory, 'relay-key.pem')).mode & 0o077) !== 0) throw new Error('RUNNER_RELAY_KEY_PERMISSIONS')
  const read = (file: string): string => readFileSync(join(directory, file), 'utf8')
  return Object.freeze({ ca: read('ca.pem'), cert: read('relay.pem'), key: read('relay-key.pem') })
}

export type PgRelayConfig = Readonly<{
  socketPath: string
  upstream: Readonly<{ host: string; port: number }>
  pin: Readonly<{ user: string; database: string }>
  tls: RelayTls
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

/** Reads the first client message the relay must judge before it opens anything upstream. */
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

const AUTH_OK = (() => { const packet = Buffer.alloc(9); packet.write('R', 0, 'latin1'); packet.writeInt32BE(8, 1); packet.writeInt32BE(0, 5); return packet })()

const startupPacket = (parameters: ReadonlyMap<string, string>): Buffer => {
  const fields = [...parameters].flatMap(([name, value]) => [name, value])
  const body = Buffer.concat([Buffer.from([0, 3, 0, 0]), Buffer.from(`${fields.join('\0')}\0\0`, 'utf8')])
  const length = Buffer.alloc(4)
  length.writeInt32BE(body.length + 4)
  return Buffer.concat([length, body])
}

const cancelRequest = (key: Buffer): Buffer => {
  const packet = Buffer.alloc(8)
  packet.writeInt32BE(16, 0)
  packet.writeInt32BE(CANCEL_REQUEST, 4)
  return Buffer.concat([packet, key])
}

// A typed backend message ('type' byte + int32 length including the length field).
type Message = Readonly<{ type: string; body: Buffer }>
const takeMessage = (buffer: Buffer): Readonly<{ message: Message; rest: Buffer }> | null => {
  if (buffer.length < 5) return null
  const length = buffer.readInt32BE(1)
  if (length < 4 || buffer.length < length + 1) return null
  return { message: { type: String.fromCharCode(buffer[0] as number), body: buffer.subarray(5, length + 1) }, rest: buffer.subarray(length + 1) }
}

const sslRequest = (): Buffer => {
  const packet = Buffer.alloc(8)
  packet.writeInt32BE(8, 0)
  packet.writeInt32BE(SSL_REQUEST, 4)
  return packet
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
    if (closed) { client.destroy(); return }
    const refuse = (reason: string): void => { refused.push(reason); client.removeAllListeners('data'); client.end(fatal('conexus: session refused')) }
    let pending = Buffer.alloc(0)
    const judge = (chunk: Buffer): void => {
      pending = Buffer.concat([pending, chunk])
      if (pending.length > MAX_STARTUP_BYTES) { refuse('STARTUP_LENGTH'); return }
      const startup = readStartup(pending)
      if (startup.kind === 'INCOMPLETE') return
      if (startup.kind === 'REFUSED') { refuse(startup.reason); return }
      if (startup.kind === 'NEGOTIATE') {
        pending = pending.subarray(startup.length)
        client.write('N')
        if (pending.length > 0) judge(Buffer.alloc(0))
        return
      }
      const user = startup.parameters.get('user')
      const database = startup.parameters.get('database') ?? user
      if (user !== config.pin.user || database !== config.pin.database) { refuse('IDENTITY'); return }
      client.removeListener('data', judge)
      if (sessions >= config.maxSessions) { refused.push('SESSION_LIMIT'); client.end(fatal('conexus: session limit')); return }
      sessions += 1
      // The worker's own startup and auth are consumed here and never forwarded; the relay opens its
      // own upstream session as the pinned role with the runner certificate.
      pending = Buffer.alloc(0)
      client.pause()
      connectUpstream(client, startup.parameters)
    }
    client.on('data', judge)
  }

  const connectUpstream = (client: net.Socket, parameters: ReadonlyMap<string, string>): void => {
    const raw = net.connect(config.upstream.port, config.upstream.host)
    sockets.add(raw)
    const drop = (): void => { raw.destroy(); client.destroy() }
    raw.on('error', drop)
    raw.on('close', () => { sockets.delete(raw); client.destroy() })
    client.on('close', () => raw.destroy())
    const startAuth = new Map<string, string>([['user', config.pin.user], ['database', config.pin.database]])
    const applicationName = parameters.get('application_name')
    if (applicationName) startAuth.set('application_name', applicationName)

    raw.once('connect', () => raw.write(sslRequest()))
    // The server answers the SSLRequest with exactly one byte. Anything more is bytes an attacker in the
    // path injected before encryption, so it ends the session.
    raw.once('data', (answer: Buffer) => {
      if (answer.length !== 1 || answer[0] !== 0x53) { drop(); return }
      const upstream = tls.connect({ socket: raw, host: config.upstream.host, ca: config.tls.ca, cert: config.tls.cert, key: config.tls.key, minVersion: 'TLSv1.2' })
      upstream.on('error', drop)
      upstream.once('secureConnect', () => upstream.write(startupPacket(startAuth)))
      // With certificate authentication the server's first reply is AuthenticationOk or an error.
      let buffered: Buffer = Buffer.alloc(0)
      const awaitAuth = (data: Buffer): void => {
        buffered = Buffer.concat([buffered, data])
        const taken = takeMessage(buffered)
        if (!taken) return
        upstream.removeListener('data', awaitAuth)
        if (taken.message.type !== 'R' || taken.message.body.length < 4 || taken.message.body.readInt32BE(0) !== 0) { drop(); return }
        beginRelay(upstream, taken.rest)
      }
      upstream.on('data', awaitAuth)
    })

    const beginRelay = (upstream: tls.TLSSocket, tail: Buffer): void => {
      client.write(AUTH_OK)
      // Everything after AuthenticationOk (ParameterStatus, BackendKeyData, ReadyForQuery, then query
      // results) is forwarded verbatim, watched only for the backend key. Backpressure holds both ways.
      let watching = true
      let buffered: Buffer = Buffer.alloc(0)
      const forward = (data: Buffer): void => {
        if (!client.write(data)) upstream.pause()
        if (!watching) return
        buffered = Buffer.concat([buffered, data])
        for (let taken = takeMessage(buffered); taken; taken = takeMessage(buffered)) {
          if (taken.message.type === 'K' && taken.message.body.length === 8) keys.push(Buffer.from(taken.message.body))
          buffered = taken.rest
          if (taken.message.type === 'Z') { watching = false; buffered = Buffer.alloc(0); break }
        }
      }
      upstream.on('data', forward)
      client.on('drain', () => upstream.resume())
      client.on('data', (data: Buffer) => { if (!upstream.write(data)) client.pause() })
      upstream.on('drain', () => client.resume())
      if (tail.length > 0) forward(tail)
      client.resume()
    }
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
