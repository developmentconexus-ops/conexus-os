import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify'
import { Failure, logFailure, toFailure } from '../platform/failure.js'
import { logger } from '../platform/logger.js'
import type { EventLog } from '../platform/logger.js'
import { failureProblem, problemBody } from '../http/problem.js'
import { invokeBody, prepareBody, releaseBody } from './requests.js'
import type { InvokeInput, OnDivergence, Reply, ServerFile } from './supervisor.js'
import type { PrepareResult } from './requests.js'

export type ApplicationRunnerSupervisor = Readonly<{
  prepare(input: Readonly<{ projectId: string; files: readonly ServerFile[]; onDivergence: OnDivergence }>): Promise<PrepareResult>
  invoke(input: InvokeInput): Promise<Reply>
  release(input: Readonly<{ projectId: string }>): Promise<void>
}>

// The supervisor writes these two details itself, from the manifest's schema: a JSON pointer and
// the rule it broke, never a value the handler returned.
const SCHEMA_REFUSALS: ReadonlySet<string> = new Set(['INPUT_REFUSED', 'HANDLER_OUTPUT_REFUSED'])

// The two admitters run inside the build sandbox too, so they throw plain Errors that name their row first.
const ADMISSION_ROW = /^(MANIFEST_REFUSED|SERVER_TREE_REFUSED)\b/

const admissionFailure = (error: unknown): Failure => {
  const row = error instanceof Error ? ADMISSION_ROW.exec(error.message)?.[1] : undefined
  return row === 'MANIFEST_REFUSED' || row === 'SERVER_TREE_REFUSED' ? new Failure(row, { cause: error }) : toFailure(error)
}

const causeText = (failure: Failure): string | undefined =>
  failure.cause instanceof Error ? failure.cause.message.slice(0, 400) : undefined

/** The runner's wire to the Hub: the row's problem body, plus the platform's own text for the Hub's log. */
const sendInternal = (reply: FastifyReply, failure: Failure, detail?: string): FastifyReply => {
  const problem = failureProblem(failure)
  return reply.type('application/problem+json').code(problem.status).send(detail ? { ...problem, detail } : problem)
}

export const createApplicationRunnerApp = (input: Readonly<{
  supervisor: ApplicationRunnerSupervisor
  log: EventLog
}>): FastifyInstance => {
  const app = Fastify({ bodyLimit: 16 * 1024 * 1024, loggerInstance: logger, disableRequestLogging: true })
  app.get('/v1/health', async () => ({ ok: true }))
  app.post('/v1/prepare', async (request, reply) => {
    const body = prepareBody.safeParse(request.body)
    if (!body.success) {
      const refused = new Failure('RUNNER_REQUEST_REFUSED')
      logFailure(logger, refused)
      return sendInternal(reply, refused)
    }
    try {
      return await input.supervisor.prepare(body.data)
    } catch (error) {
      const failure = admissionFailure(error)
      const detail = causeText(failure)
      // The runner's own admission refusals (SERVER_TREE_REFUSED, MANIFEST_REFUSED) and its database
      // faults are both platform text: no vendor or business data reaches this catch (prepare never
      // runs generated handler code; invoke, below, is where that boundary actually is). Safe to log
      // and to hand back to the Hub in full.
      logFailure(logger, failure, { 'builder.project_id': body.data.projectId, ...(detail && detail !== failure.id ? { 'failure.detail': detail } : {}) })
      return sendInternal(reply, failure, detail)
    }
  })
  app.post('/v1/invoke', async (request, reply) => {
    const body = invokeBody.safeParse(request.body)
    if (!body.success) return sendInternal(reply, new Failure('RUNNER_REQUEST_REFUSED'))
    const started = performance.now()
    const result = await input.supervisor.invoke(body.data)
    // Only the error code is logged, never the reply body: a handler's own thrown message can carry
    // a value straight from the external system it just called (an ERP field, a customer name), and
    // that must never land in a platform log. A schema refusal's detail is the runner's own text.
    const problem = problemBody.safeParse(result.body).data
    const code = problem?.code
    const detail = code && SCHEMA_REFUSALS.has(code) ? problem?.detail : undefined
    input.log('RUNNER_INVOKE', {
      projectId: body.data.projectId, operation: body.data.operation, status: result.status,
      ...(code ? { code } : {}), ...(detail ? { detail } : {}), ms: Math.round(performance.now() - started),
    })
    return reply.type('application/problem+json').code(result.status).send(result.body)
  })
  app.post('/v1/release', async (request, reply) => {
    const body = releaseBody.safeParse(request.body)
    if (!body.success) return sendInternal(reply, new Failure('RUNNER_REQUEST_REFUSED'))
    try {
      await input.supervisor.release(body.data)
      return reply.code(200).send({ ok: true })
    } catch (error) {
      const failure = toFailure(error)
      logFailure(logger, failure)
      return sendInternal(reply, failure, causeText(failure))
    }
  })
  return app
}
