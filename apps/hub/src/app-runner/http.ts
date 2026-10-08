import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify'
import { SpanStatusCode, trace } from '@opentelemetry/api'
import { Failure, toFailure } from '../platform/failure.js'
import { logger } from '../platform/logger.js'
import type { EventLog } from '../platform/logger.js'
import { currentTraceReference, failureResponse, sendFailureResponse } from '../http/problem.js'
import { invokeBody, prepareBody, releaseBody } from './requests.js'
import type { InvokeInput, OnDivergence, ServerFile } from './supervisor.js'
import type { InvokeAnswer, PrepareAnswer } from './server-manifest.js'

export type ApplicationRunnerSupervisor = Readonly<{
  prepare(input: Readonly<{ projectId: string; files: readonly ServerFile[]; onDivergence: OnDivergence }>): Promise<PrepareAnswer>
  invoke(input: InvokeInput): Promise<InvokeAnswer>
  release(input: Readonly<{ projectId: string }>): Promise<void>
}>

function recordRunnerException(failure: Failure): void {
  const span = trace.getActiveSpan()
  if (!span) return
  span.recordException(failure.cause instanceof Error ? failure.cause : failure)
  if (failure.category === 'SYSTEM') span.setStatus({ code: SpanStatusCode.ERROR })
}

function escapedFailure(reply: FastifyReply, error: unknown): FastifyReply {
  const failure = toFailure(error)
  recordRunnerException(failure)
  return sendFailureResponse(reply, failureResponse({ code: failure.id, traceId: currentTraceReference() }))
}

function refusedRequest(reply: FastifyReply): FastifyReply {
  const failure = new Failure('RUNNER_REQUEST_REFUSED')
  recordRunnerException(failure)
  return sendFailureResponse(reply, failureResponse({ code: failure.id, traceId: currentTraceReference() }))
}

export const createApplicationRunnerApp = (input: Readonly<{
  supervisor: ApplicationRunnerSupervisor
  log: EventLog
}>): FastifyInstance => {
  const app = Fastify({ bodyLimit: 16 * 1024 * 1024, loggerInstance: logger, disableRequestLogging: true })
  app.get('/v1/health', async () => ({ ok: true }))
  app.post('/v1/prepare', async (request, reply) => {
    const body = prepareBody.safeParse(request.body)
    if (!body.success) return refusedRequest(reply)
    try {
      return reply.type('application/json').code(200).send(await input.supervisor.prepare(body.data))
    } catch (error) {
      return escapedFailure(reply, error)
    }
  })
  app.post('/v1/invoke', async (request, reply) => {
    const body = invokeBody.safeParse(request.body)
    if (!body.success) return refusedRequest(reply)
    const started = performance.now()
    let answer: InvokeAnswer
    try {
      answer = await input.supervisor.invoke(body.data)
    } catch (error) {
      return escapedFailure(reply, error)
    }
    input.log('RUNNER_INVOKE', {
      projectId: body.data.projectId,
      operation: body.data.operation,
      status: 200,
      ...(answer.ok ? {} : {
        code: answer.error.code,
        ...(answer.error.code === 'INPUT_REFUSED' || answer.error.code === 'HANDLER_OUTPUT_REFUSED'
          ? { pointer: answer.error.violation.pointer, rule: answer.error.violation.rule }
          : {}),
      }),
      ms: Math.round(performance.now() - started),
    })
    return reply.type('application/json').code(200).send(answer)
  })
  app.post('/v1/release', async (request, reply) => {
    const body = releaseBody.safeParse(request.body)
    if (!body.success) return refusedRequest(reply)
    try {
      await input.supervisor.release(body.data)
      return reply.code(200).send({ ok: true })
    } catch (error) {
      return escapedFailure(reply, error)
    }
  })
  return app
}
