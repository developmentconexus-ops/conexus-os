import { createServer, type IncomingMessage, request as forward, type ServerResponse } from 'node:http'
import { parseKey } from './credential.js'
import type { CliproxyPool, Lease } from './pool.js'

const refuse = (response: ServerResponse, status: number, message: string): void => {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ error: { message, type: 'invalid_request_error' } }))
}

const BEARER = /^Bearer\s+(\S+)$/i

// The Factory's gateway calls this with the person's credential as the bearer. The router swaps it
// for the person's proxy key and streams the call through. It never logs a header: the bearer is the
// person's Google sign-in.
const route = (pool: Pick<CliproxyPool, 'acquire'>) => async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  const bearer = BEARER.exec(request.headers.authorization ?? '')?.[1]
  const key = bearer ? parseKey(bearer) : null
  if (!key) return refuse(response, 401, 'Conecte o Google AI Pro nas Configurações.')
  if (!request.url?.startsWith('/v1/')) return refuse(response, 404, 'Not found')
  let lease: Lease
  try {
    lease = await pool.acquire(key)
  } catch {
    return refuse(response, 503, 'O Google AI Pro não iniciou. Tente novamente.')
  }
  response.once('close', lease.release)
  const upstream = new URL(lease.url)
  const outgoing = forward({
    hostname: upstream.hostname,
    port: upstream.port,
    method: request.method,
    path: request.url,
    headers: { ...request.headers, host: upstream.host, authorization: `Bearer ${lease.proxyKey}` },
  }, (answer) => {
    // The proxy key is always right, so a 401 means Google refused the stored sign-in.
    if (answer.statusCode === 401) {
      answer.resume()
      return refuse(response, 401, 'Reconecte o Google AI Pro nas Configurações.')
    }
    response.writeHead(answer.statusCode ?? 502, answer.headers)
    answer.pipe(response)
  })
  outgoing.once('error', () => {
    if (response.headersSent) response.destroy()
    else refuse(response, 502, 'O Google AI Pro não respondeu. Tente novamente.')
  })
  response.once('close', () => { if (!response.writableFinished) outgoing.destroy() })
  request.pipe(outgoing)
}

export const startModelRouter = (pool: Pick<CliproxyPool, 'acquire'>): Promise<Readonly<{ url: string; close(): Promise<void> }>> =>
  new Promise((resolve, reject) => {
    const handle = route(pool)
    const server = createServer((request, response) => { void handle(request, response) })
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (typeof address !== 'object' || !address) return reject(new Error('GOOGLE_AI_PRO_ROUTER_UNAVAILABLE'))
      resolve(Object.freeze({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((done) => {
          server.closeAllConnections()
          server.close(() => done())
        }),
      }))
    })
  })
