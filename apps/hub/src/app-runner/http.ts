import Fastify, { type FastifyInstance } from 'fastify'
import { invokeBody, prepareBody, releaseBody } from './requests.js'
import type { InvokeInput, OnDivergence, PrepareResult, Reply, ServerFile } from './supervisor.js'

export type ApplicationRunnerSupervisor = Readonly<{
  prepare(input: Readonly<{ projectId: string; files: readonly ServerFile[]; onDivergence: OnDivergence }>): Promise<PrepareResult>
  invoke(input: InvokeInput): Promise<Reply>
  release(input: Readonly<{ projectId: string }>): Promise<void>
}>

const errorCode = (body: unknown): string | undefined => {
  const code = (body as Readonly<{ error?: Readonly<{ code?: unknown }> }> | undefined)?.error?.code
  return typeof code === 'string' ? code : undefined
}

export const createApplicationRunnerApp = (input: Readonly<{
  supervisor: ApplicationRunnerSupervisor
  log: (line: string) => void
}>): FastifyInstance => {
  const app = Fastify({ bodyLimit: 16 * 1024 * 1024, logger: false })
  app.get('/v1/health', async () => ({ ok: true }))
  app.post('/v1/prepare', async (request, reply) => {
    const body = prepareBody.safeParse(request.body)
    if (!body.success) {
      input.log(JSON.stringify({ event: 'prepare_failed', code: 'PREPARE_REFUSED' }))
      return reply.code(400).send({ error: { code: 'PREPARE_REFUSED' } })
    }
    try {
      return await input.supervisor.prepare(body.data)
    } catch (error) {
      const code = error instanceof Error && /^[A-Z_]+/.test(error.message) ? error.message.split(':', 1)[0] : 'PREPARE_FAILED'
      const detail = error instanceof Error ? error.message.slice(0, 400) : undefined
      // The runner's own admission refusals (SERVER_TREE_REFUSED, MANIFEST_REFUSED) and its database
      // faults are both platform text: no vendor or business data reaches this catch (prepare never
      // runs generated handler code; invoke, below, is where that boundary actually is). Safe to log
      // and to hand back to the Hub in full.
      input.log(JSON.stringify({ event: 'prepare_failed', projectId: body.data.projectId, code, ...(detail && detail !== code ? { detail } : {}) }))
      return reply.code(422).send({ error: detail ? { code, detail } : { code } })
    }
  })
  app.post('/v1/invoke', async (request, reply) => {
    const body = invokeBody.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: { code: 'INVOKE_REFUSED' } })
    const started = performance.now()
    const result = await input.supervisor.invoke(body.data)
    // Only the error code is logged, never the reply body: a handler's own thrown message can carry
    // a value straight from the external system it just called (an ERP field, a customer name), and
    // that must never land in a platform log.
    const code = errorCode(result.body)
    input.log(JSON.stringify({
      event: 'invoke', projectId: body.data.projectId, operation: body.data.operation, status: result.status,
      ...(code ? { code } : {}), ms: Math.round(performance.now() - started),
    }))
    return reply.code(result.status).send(result.body)
  })
  app.post('/v1/release', async (request, reply) => {
    const body = releaseBody.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: { code: 'RELEASE_REFUSED' } })
    try {
      await input.supervisor.release(body.data)
      return reply.code(200).send({ ok: true })
    } catch (error) {
      const code = error instanceof Error && /^[A-Z_]+/.test(error.message) ? error.message.split(':', 1)[0] : 'RELEASE_FAILED'
      return reply.code(422).send({ error: { code, detail: error instanceof Error ? error.message.slice(0, 400) : undefined } })
    }
  })
  return app
}
