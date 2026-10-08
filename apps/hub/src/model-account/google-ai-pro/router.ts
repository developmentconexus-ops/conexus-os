import { GoogleAiProKey } from '../credential.js'
import { createServer, type IncomingMessage, request as forward, type ServerResponse } from 'node:http'
import type { CliproxyPool, Lease, PersistGoogleAiProRefresh } from './pool.js'
import { Failure } from '../../platform/failure.js'

// In the shape of Gemini's own errors, which Mastra's Google provider reads the message from.
function refuse(response: ServerResponse, status: number, code: string, message: string): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ error: { code: status, message, status: code } }))
}

const API_KEY_HEADER = 'x-goog-api-key'
const GEMINI_API = '/v1beta/'

// A run's model calls reach this on Gemini's API with the person's credential as the API key. The
// router swaps it for the person's proxy key and streams the call through. It never logs a header:
// the key is the person's Google sign-in.
function route(pool: Pick<CliproxyPool, 'acquire'>, persistFor: PersistFor) { return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  const credential = request.headers[API_KEY_HEADER]
  const key = typeof credential === 'string' ? GoogleAiProKey.safeParse(credential) : null
  if (!key?.success) return refuse(response, 401, 'UNAUTHENTICATED', 'Conecte o Google AI Pro nas Configurações.')
  if (!request.url?.startsWith(GEMINI_API)) return refuse(response, 404, 'NOT_FOUND', 'Not found')
  let lease: Lease
  try {
    lease = await pool.acquire(key.data, persistFor(key.data))
  } catch {
    return refuse(response, 503, 'UNAVAILABLE', 'O Google AI Pro não iniciou.')
  }
  response.once('close', lease.release)
  const upstream = new URL(lease.url)
  const outgoing = forward({
    hostname: upstream.hostname,
    port: upstream.port,
    method: request.method,
    path: request.url,
    headers: { ...request.headers, host: upstream.host, [API_KEY_HEADER]: lease.proxyKey },
  }, (answer) => {
    // The proxy key is always right, so a 401 means Google refused the stored sign-in.
    if (answer.statusCode === 401) {
      answer.resume()
      return refuse(response, 401, 'UNAUTHENTICATED', 'Reconecte o Google AI Pro nas Configurações.')
    }
    response.writeHead(answer.statusCode ?? 502, answer.headers)
    answer.pipe(response)
  })
  outgoing.once('error', () => {
    if (response.headersSent) response.destroy()
    else refuse(response, 502, 'UNAVAILABLE', 'O Google AI Pro não respondeu.')
  })
  response.once('close', () => { if (!response.writableFinished) outgoing.destroy() })
  request.pipe(outgoing)
} }

/** The write-back for a key's refreshed record, when the key's row is known (write-back.ts). */
type PersistFor = (key: GoogleAiProKey) => PersistGoogleAiProRefresh | undefined

export function startModelRouter(pool: Pick<CliproxyPool, 'acquire'>, persistFor: PersistFor): Promise<Readonly<{ url: string; close(): Promise<void> }>> { return new Promise((resolve, reject) => {
    const handle = route(pool, persistFor)
    const server = createServer((request, response) => { void handle(request, response) })
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (typeof address !== 'object' || !address) return reject(new Failure('GOOGLE_AI_PRO_ROUTER_UNAVAILABLE'))
      resolve(Object.freeze({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((done) => {
          server.closeAllConnections()
          server.close(() => done())
        }),
      }))
    })
  }) }
