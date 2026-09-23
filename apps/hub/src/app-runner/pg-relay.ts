import { createHash, createHmac, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto'
import { rm } from 'node:fs/promises'
import net from 'node:net'

/**
 * One invocation's database path. The sandbox has an empty network namespace; the only way out is
 * this unix socket, bound into it. The relay terminates authentication: the worker connects with no
 * password, and the relay itself completes SCRAM-SHA-256 upstream with the Project role's credential,
 * which never enters the sandbox. A value leaked out of the worker therefore opens nothing. The relay
 * admits only a session for the pinned role on the pinned database, records each session's
 * BackendKeyData and, when the invocation ends, cancels whatever that backend is still running, so a
 * killed worker leaves no statement executing.
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
  password: string
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

const saslMessage = (type: 'p', payload: Buffer): Buffer => {
  const header = Buffer.alloc(5)
  header.write(type, 0, 'latin1')
  header.writeInt32BE(payload.length + 4, 1)
  return Buffer.concat([header, payload])
}

const pbkdf2Sha256 = (password: string, salt: Buffer, iterations: number): Promise<Buffer> =>
  new Promise((resolve, reject) => pbkdf2(password, salt, iterations, 32, 'sha256', (error, key) => (error ? reject(error) : resolve(key))))

// The SCRAM-SHA-256 client the relay runs upstream on the worker's behalf (RFC 5802 + Postgres
// framing). The credential is used only here, in the supervisor process, never in the sandbox.
type Scram = Readonly<{ initial: Buffer; onContinue(body: Buffer): Promise<Buffer>; verifyFinal(body: Buffer): boolean }>
const startScram = (password: string): Scram => {
  const clientNonce = randomBytes(18).toString('base64')
  const clientFirstBare = `n=,r=${clientNonce}`
  const mechanism = Buffer.from('SCRAM-SHA-256\0', 'utf8')
  const initialResponse = Buffer.from(`n,,${clientFirstBare}`, 'utf8')
  const initialLength = Buffer.alloc(4)
  initialLength.writeInt32BE(initialResponse.length)
  let serverSignature = Buffer.alloc(0)
  return Object.freeze({
    initial: saslMessage('p', Buffer.concat([mechanism, initialLength, initialResponse])),
    onContinue: async (body: Buffer): Promise<Buffer> => {
      const serverFirst = body.toString('utf8')
      const parts = new Map(serverFirst.split(',').map((pair) => [pair.slice(0, 1), pair.slice(2)]))
      const combinedNonce = parts.get('r') ?? ''
      const salt = Buffer.from(parts.get('s') ?? '', 'base64')
      const iterations = Number(parts.get('i'))
      if (!combinedNonce.startsWith(clientNonce) || salt.length === 0 || !Number.isInteger(iterations) || iterations <= 0) throw new Error('SCRAM_SERVER_FIRST')
      const saltedPassword = await pbkdf2Sha256(password, salt, iterations)
      const clientKey = createHmac('sha256', saltedPassword).update('Client Key').digest()
      const storedKey = createHash('sha256').update(clientKey).digest()
      const clientFinalWithoutProof = `c=biws,r=${combinedNonce}`
      const authMessage = `${clientFirstBare},${serverFirst},${clientFinalWithoutProof}`
      const clientSignature = createHmac('sha256', storedKey).update(authMessage).digest()
      const proof = Buffer.from(clientKey.map((byte, index) => byte ^ (clientSignature[index] as number)))
      const serverKey = createHmac('sha256', saltedPassword).update('Server Key').digest()
      serverSignature = createHmac('sha256', serverKey).update(authMessage).digest()
      return saslMessage('p', Buffer.from(`${clientFinalWithoutProof},p=${proof.toString('base64')}`, 'utf8'))
    },
    verifyFinal: (body: Buffer): boolean => {
      const value = Buffer.from((body.toString('utf8').split(',').find((pair) => pair.startsWith('v=')) ?? '').slice(2), 'base64')
      return value.length === serverSignature.length && value.length > 0 && timingSafeEqual(value, serverSignature)
    },
  })
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
      if (startup.kind === 'REFUSED') return refuse(startup.reason)
      if (startup.kind === 'NEGOTIATE') {
        pending = pending.subarray(startup.length)
        client.write('N')
        if (pending.length > 0) judge(Buffer.alloc(0))
        return
      }
      const user = startup.parameters.get('user')
      const database = startup.parameters.get('database') ?? user
      if (user !== config.pin.user || database !== config.pin.database) return refuse('IDENTITY')
      client.removeListener('data', judge)
      if (sessions >= config.maxSessions) { refused.push('SESSION_LIMIT'); client.end(fatal('conexus: session limit')); return }
      sessions += 1
      // The worker's own startup and auth are consumed here and never forwarded; the relay opens its
      // own upstream session as the pinned role and password.
      pending = Buffer.alloc(0)
      client.pause()
      connectUpstream(client, startup.parameters)
    }
    client.on('data', judge)
  }

  const connectUpstream = (client: net.Socket, parameters: ReadonlyMap<string, string>): void => {
    const upstream = net.connect(config.upstream.port, config.upstream.host)
    sockets.add(upstream)
    upstream.on('error', () => upstream.destroy())
    upstream.on('close', () => { sockets.delete(upstream); client.destroy() })
    client.on('close', () => upstream.destroy())
    const scram = startScram(config.password)
    let phase: 'auth' | 'relay' = 'auth'
    let buffered: Buffer = Buffer.alloc(0)
    const startAuth = new Map<string, string>([['user', config.pin.user], ['database', config.pin.database]])
    const applicationName = parameters.get('application_name')
    if (applicationName) startAuth.set('application_name', applicationName)

    const beginRelay = (tail: Buffer): void => {
      phase = 'relay'
      client.write(AUTH_OK)
      // Everything after AuthenticationOk (ParameterStatus, BackendKeyData, ReadyForQuery, then query
      // results) is forwarded verbatim, watched only for the backend key. Backpressure holds both ways.
      let watching = true
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
      upstream.removeAllListeners('data')
      upstream.on('data', forward)
      client.on('drain', () => upstream.resume())
      client.on('data', (data: Buffer) => { if (!upstream.write(data)) client.pause() })
      upstream.on('drain', () => client.resume())
      if (tail.length > 0) forward(tail)
      client.resume()
    }

    upstream.on('data', (data: Buffer) => {
      if (phase === 'relay') return
      buffered = Buffer.concat([buffered, data])
      void driveAuth()
    })

    let driving = false
    const driveAuth = async (): Promise<void> => {
      if (driving) return
      driving = true
      try {
        for (let taken = takeMessage(buffered); taken && phase === 'auth'; taken = takeMessage(buffered)) {
          const { type, body } = taken.message
          if (type === 'E') { upstream.destroy(); client.destroy(); return }
          if (type !== 'R') { buffered = taken.rest; continue }
          const sub = body.readInt32BE(0)
          if (sub === 0) { buffered = taken.rest; beginRelay(buffered); return }
          if (sub === 10) { buffered = taken.rest; upstream.write(scram.initial) }
          else if (sub === 11) { buffered = taken.rest; upstream.write(await scram.onContinue(body.subarray(4))) }
          else if (sub === 12) { buffered = taken.rest; if (!scram.verifyFinal(body.subarray(4))) { upstream.destroy(); client.destroy(); return } }
          else { upstream.destroy(); client.destroy(); return }
        }
      } catch { upstream.destroy(); client.destroy() } finally { driving = false }
    }

    upstream.once('connect', () => upstream.write(startupPacket(startAuth)))
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
