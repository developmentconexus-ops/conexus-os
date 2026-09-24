import { chmodSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import Fastify from 'fastify'
import { readRelayTls } from './pg-relay.js'
import { invokeBody, prepareBody } from './requests.js'
import { assertUserNamespaces, stageWorkerRuntime } from './sandbox.js'
import { createSupervisor } from './supervisor.js'

/**
 * The application runner: a process of its own, outside the Hub, that owns the application data
 * plane. The Hub reaches it only through a unix socket only their shared OS user can open, and sends
 * it platform-issued facts (Project id, admitted server tree, operation, input, caller); generated code runs
 * only in the per-invocation sandbox this process starts.
 */
const required = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_CONFIG_${name}`)
  return value
}
const secret = (name: string): string => readFileSync(required(name), 'utf8').trim()

assertUserNamespaces()
const stateDir = required('CONEXUS_APP_RUNNER_STATE_DIR')
const socketPath = required('CONEXUS_APP_RUNNER_SOCKET')
mkdirSync(stateDir, { recursive: true, mode: 0o700 })
chmodSync(stateDir, 0o700)
rmSync(join(stateDir, 'i'), { recursive: true, force: true })
const startedAt = performance.now()
const supervisor = createSupervisor({
  stateDir,
  runtimeDir: stageWorkerRuntime(join(stateDir, 'runtime')),
  cluster: { host: required('CONEXUS_APP_DB_HOST'), port: Number(required('CONEXUS_APP_DB_PORT')) },
  database: required('CONEXUS_APP_DB_NAME'),
  provisionerPassword: secret('CONEXUS_DB_APP_PROVISIONER_PASSWORD_FILE'),
  relayTls: readRelayTls(required('CONEXUS_APP_RELAY_TLS_DIR')),
})

await supervisor.checkProvisioner()

const app = Fastify({ bodyLimit: 16 * 1024 * 1024, logger: false })
app.get('/v1/health', async () => ({ ok: true }))
app.post('/v1/prepare', async (request, reply) => {
  const body = prepareBody.safeParse(request.body)
  if (!body.success) return reply.code(400).send({ error: { code: 'PREPARE_REFUSED' } })
  try {
    return await supervisor.prepare(body.data)
  } catch (error) {
    const code = error instanceof Error && /^[A-Z_]+/.test(error.message) ? error.message.split(':', 1)[0] : 'PREPARE_FAILED'
    return reply.code(422).send({ error: { code, detail: error instanceof Error ? error.message.slice(0, 400) : undefined } })
  }
})
app.post('/v1/invoke', async (request, reply) => {
  const body = invokeBody.safeParse(request.body)
  if (!body.success) return reply.code(400).send({ error: { code: 'INVOKE_REFUSED' } })
  const started = performance.now()
  const result = await supervisor.invoke(body.data)
  process.stderr.write(`${JSON.stringify({ event: 'invoke', projectId: body.data.projectId, operation: body.data.operation, status: result.status, ms: Math.round(performance.now() - started) })}\n`)
  return reply.code(result.status).send(result.body)
})

rmSync(socketPath, { force: true })
await app.listen({ path: socketPath })
chmodSync(socketPath, 0o600)
process.stderr.write(`${JSON.stringify({ event: 'ready', socketPath, startMs: Math.round(performance.now() - startedAt) })}\n`)

let closing = false
const close = async (): Promise<void> => {
  if (closing) return
  closing = true
  await app.close()
  await supervisor.close()
}
process.once('SIGINT', close)
process.once('SIGTERM', close)
