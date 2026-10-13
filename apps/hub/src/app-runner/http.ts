import type { ProjectId } from '@conexus/contract'
import Fastify, { type FastifyInstance } from 'fastify'
import { SpanStatusCode, trace } from '@opentelemetry/api'
import { Failure } from '../platform/failure.js'
import { failureFromFastify } from '../http/fastify-failure.js'
import { logger } from '../platform/logger.js'
import type { EventLog } from '../platform/logger.js'
import { currentTraceReference, failureResponse, sendFailureResponse } from '../http/problem.js'
import { invokeBody, preparePreviewBody, disposePreviewBody } from './requests.js'
import type { InvokeInput, OnDivergence, ServerFile } from './supervisor.js'
import type { InvokeAnswer, PrepareAnswer } from './server-manifest.js'

export type ApplicationRunnerSupervisor = Readonly<{
  preparePreview(input: Readonly<{ projectId: ProjectId; files: readonly ServerFile[]; onDivergence: OnDivergence }>): Promise<PrepareAnswer>
  invoke(input: InvokeInput): Promise<InvokeAnswer>
  disposePreview(input: Readonly<{ projectId: ProjectId }>): Promise<void>
}>

function recordRunnerException(failure: Failure): void {
  const span = trace.getActiveSpan()
  if (!span) return
  span.recordException(failure.cause instanceof Error ? failure.cause : failure)
  if (failure.category === 'SYSTEM') span.setStatus({ code: SpanStatusCode.ERROR })
}

export function createApplicationRunnerApp(input: Readonly<{
  supervisor: ApplicationRunnerSupervisor
  log: EventLog
}>): FastifyInstance {
  const app = Fastify({ bodyLimit: 16 * 1024 * 1024, loggerInstance: logger, disableRequestLogging: true })
  app.setErrorHandler((error, _request, reply) => {
    const failure = failureFromFastify(error)
    recordRunnerException(failure)
    return sendFailureResponse(reply, failureResponse({ code: failure.id, traceId: currentTraceReference() }))
  })
  app.get('/v1/health', async () => ({ ok: true }))
  app.post('/v1/prepare-preview', async (request, reply) => {
    const body = preparePreviewBody.safeParse(request.body)
    if (!body.success) throw new Failure('RUNNER_REQUEST_REFUSED')
    return reply.type('application/json').code(200).send(await input.supervisor.preparePreview(body.data))
  })
  app.post('/v1/invoke', async (request, reply) => {
    const body = invokeBody.safeParse(request.body)
    if (!body.success) throw new Failure('RUNNER_REQUEST_REFUSED')
    const started = performance.now()
    const answer = await input.supervisor.invoke(body.data)
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
  app.post('/v1/dispose-preview', async (request, reply) => {
    const body = disposePreviewBody.safeParse(request.body)
    if (!body.success) throw new Failure('RUNNER_REQUEST_REFUSED')
    await input.supervisor.disposePreview(body.data)
    return reply.code(200).send({ ok: true })
  })
  return app
}
