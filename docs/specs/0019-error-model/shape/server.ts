import { MastraError } from '@mastra/core/error'
import type { FastifyReply, FastifyBaseLogger } from 'fastify'
import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api'
import type { FailureCode, FailureDetails, TraceReference } from './types.js'

export declare class Failure extends MastraError {
  readonly id: FailureCode
  constructor(code: FailureCode, options?: Readonly<{ cause?: unknown; details?: FailureDetails }>)
}

export declare function failureResponse(input: Readonly<{ code: FailureCode; traceId: TraceReference }>): Response

// Mirror status/headers before onSend; Fastify's HEAD hook accepts the native body stream.
export function sendFailureResponse(reply: FastifyReply, response: Response): FastifyReply {
  return reply.code(response.status).headers(Object.fromEntries(response.headers)).send(reply.request.method === 'HEAD' ? response.body : response)
}

export declare function toFailure(error: unknown): Failure
export declare function logFailure(log: Pick<FastifyBaseLogger, 'error' | 'warn' | 'info'>, failure: Failure, fields?: Attributes): void

// Existing native span/exporter owns local cause diagnosis, not another failure log.
export function recordRunnerException(failure: Failure): void {
  const span = trace.getActiveSpan()
  if (!span) return
  span.recordException(failure.cause instanceof Error ? failure.cause : failure)
  if (failure.category === 'SYSTEM') span.setStatus({ code: SpanStatusCode.ERROR })
}
