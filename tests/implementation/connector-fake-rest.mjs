import { createServer } from 'node:http'
import { z } from 'zod'
import { hubModuleUrl } from './hub-build.mjs'

const { AdapterFailure } = await import(hubModuleUrl('connectors/errors.js'))
const { AccessToken } = await import(hubModuleUrl('connectors/token-cache.js'))

// A synthetic REST vendor on 127.0.0.1 and its test-fixture integrator, registered only by tests. The
// vendor issues a client-credentials token per account and answers `GET /v1/records` with that
// account's own records. It is not a second production integrator (C-030): it proves that a second
// integrator follows the same executor without a change to it. Every value is invented.

export const REST_ACCOUNTS = Object.freeze({
  'account-a': Object.freeze({ clientId: 'rest-client-a', clientSecret: 'rest-secret-a-41c7', records: [{ id: 'a-1', name: 'Registro A1' }] }),
  'account-b': Object.freeze({ clientId: 'rest-client-b', clientSecret: 'rest-secret-b-93d2', records: [{ id: 'b-1', name: 'Registro B1' }, { id: 'b-2', name: 'Registro B2' }] }),
})

export const startFakeRest = async () => {
  const requests = []
  const accountOfToken = new Map()
  let issued = 0
  const server = createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      const url = new URL(request.url, 'http://fake')
      const authorization = request.headers.authorization ?? null
      const account = authorization?.startsWith('Bearer ') ? accountOfToken.get(authorization.slice('Bearer '.length)) ?? null : null
      requests.push({ origin: `http://${request.headers.host}`, method: request.method, path: url.pathname, account })
      const send = (status, body) => {
        response.writeHead(status, { 'content-type': 'application/json' })
        response.end(JSON.stringify(body))
      }
      if (request.method === 'POST' && url.pathname === '/oauth/token') {
        const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
        const found = Object.entries(REST_ACCOUNTS).find(([, entry]) => entry.clientId === form.get('client_id') && entry.clientSecret === form.get('client_secret'))
        if (!found || form.get('grant_type') !== 'client_credentials') return send(401, { error: 'invalid_client' })
        issued += 1
        const token = `rest-token-${issued}`
        accountOfToken.set(token, found[0])
        return send(200, { access_token: token, token_type: 'Bearer', expires_in: 3600 })
      }
      if (!account) return send(401, { error: 'invalid_token' })
      if (request.method === 'GET' && url.pathname === '/v1/records') return send(200, { account, records: REST_ACCOUNTS[account].records })
      return send(404, { error: 'not_found' })
    })
  })
  const sockets = new Set()
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

export const REST_CONNECTOR_ID = 'synthetic-rest'

/** A GET-only read rule: any path under /v1/, no body. */
export const restDefinition = Object.freeze({
  id: REST_CONNECTOR_ID,
  credential: z.strictObject({ clientId: z.string().min(1), clientSecret: z.string().min(1) }),
  operations: Object.freeze([]),
  events: Object.freeze([]),
  builderSkill: '',
  secretFields: Object.freeze(['clientId', 'clientSecret']),
  native: Object.freeze({
    admit: ({ method, url, body }) => {
      if (method !== 'GET' || !url.pathname.startsWith('/v1/')) return { ok: false, code: 'SERVICE_REFUSED' }
      if (body !== undefined) return { ok: false, code: 'INPUT_REFUSED', issues: ['/body'] }
      return { ok: true, service: 'rest.get' }
    },
    answer: () => ({ kind: 'success' }),
    oneRequestPerToken: false,
  }),
})

export const createRestAdapter = ({ origin }) => Object.freeze({
  origin: new URL(origin).origin,
  authenticate: (credential, signal, trace) => trace.request('authenticate', async (answer) => {
    const { clientId, clientSecret } = credential.reveal()
    let response
    try {
      response = await fetch(`${origin}/oauth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString(),
        signal,
        redirect: 'error',
      })
    } catch {
      throw new AdapterFailure(signal.aborted ? 'TIMEOUT' : 'UNAVAILABLE')
    }
    answer.httpStatus = response.status
    if (!response.ok) {
      await response.body?.cancel()
      throw new AdapterFailure('AUTHENTICATION_REFUSED')
    }
    const issued = await response.json()
    return { token: new AccessToken(issued.access_token), expiresInSeconds: issued.expires_in }
  }),
  open: () => {
    throw new Error('the synthetic REST integrator has no operations')
  },
})
