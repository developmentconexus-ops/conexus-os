import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import staticFiles from '@fastify/static'

const cert = readFileSync(process.env.R1F_CERT_FILE)
const key = readFileSync(process.env.R1F_KEY_FILE)
const origin = 'https://127.0.0.1:4443'
const sessions = new Map()
let mutationCount = 0

const app = Fastify({ logger: false, https: { cert, key } })
await app.register(cookie)

const session = request => sessions.get(request.cookies.sid)
const deny = reply => reply.code(403).send({ problem: 'DENIED' })

app.get('/api/session', async (_request, reply) => {
  const sid = randomBytes(32).toString('base64url')
  const csrf = randomBytes(24).toString('base64url')
  sessions.set(sid, { csrf, projectIds: new Set(['project-a']) })
  reply.setCookie('sid', sid, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' })
  return { csrf }
})

app.get('/api/projects/:projectId', async (request, reply) => {
  const current = session(request)
  if (!current?.projectIds.has(request.params.projectId)) return deny(reply)
  return { id: request.params.projectId, name: 'Project A' }
})

app.post('/api/projects/:projectId/save', {
  schema: {
    body: {
      type: 'object', additionalProperties: false, required: ['expectedRevision'],
      properties: { expectedRevision: { const: 1 } },
    },
  },
}, async (request, reply) => {
  const current = session(request)
  if (
    request.headers.origin !== origin ||
    request.headers['sec-fetch-site'] !== 'same-origin' ||
    !current ||
    request.headers['x-csrf-token'] !== current.csrf ||
    !current.projectIds.has(request.params.projectId)
  ) return deny(reply)
  mutationCount += 1
  return { mutationCount }
})

app.get('/__evidence/mutations', async () => ({ mutationCount }))
await app.register(staticFiles, { root: fileURLToPath(new URL('./dist/', import.meta.url)), wildcard: false })
app.get('/*', async (_request, reply) => reply.sendFile('index.html'))

const evil = Fastify({ logger: false, https: { cert, key } })
evil.get('/', async (_request, reply) => reply.type('text/html').send('<!doctype html><title>other origin</title><h1>Other origin</h1>'))

await app.listen({ host: '127.0.0.1', port: 4443 })
await evil.listen({ host: '127.0.0.1', port: 4444 })

const close = async () => { await Promise.allSettled([app.close(), evil.close()]) }
process.once('SIGTERM', close)
process.once('SIGINT', close)
