import { MastraError } from '@mastra/core/error'
import type { FastifyReply, FastifyBaseLogger } from 'fastify'
import type { Attributes } from '@opentelemetry/api'
import type { FailureCode, FailureDetails, TraceReference } from './types.js'

export declare class Failure extends MastraError {
  readonly id: FailureCode
  constructor(code: FailureCode, options?: Readonly<{ cause?: unknown; details?: FailureDetails }>)
}

export declare function failureResponse(input: Readonly<{ code: FailureCode; traceId: TraceReference }>): Response

// Native Response does not set Reply's status before onSend. The bridge does.
export function sendFailureResponse(reply: FastifyReply, response: Response): FastifyReply {
  return reply.code(response.status).headers(Object.fromEntries(response.headers)).send(response)
}

export declare function toFailure(error: unknown): Failure
export declare function logFailure(log: Pick<FastifyBaseLogger, 'error' | 'warn' | 'info'>, failure: Failure, fields?: Attributes): void
