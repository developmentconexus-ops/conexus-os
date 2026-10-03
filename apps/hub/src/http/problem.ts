import { trace } from '@opentelemetry/api'
import type { FastifyReply } from 'fastify'
import { type Failure, failureRow } from '../platform/failure.js'

type ProblemDetails = Readonly<{ type: string; title: string; status: number; code: string; traceId?: string }>

/** The problem+json body of a failure: its row's status, the code as type, title and `code`, and the trace id for a Conexus fault. */
export const failureProblem = (failure: Failure): ProblemDetails => {
  const { category, status } = failureRow(failure)
  const traceId = category === 'SYSTEM' ? trace.getActiveSpan()?.spanContext().traceId : undefined
  return { type: `urn:conexus:problem:${failure.id}`, title: failure.id, status, code: failure.id, ...(traceId ? { traceId } : {}) }
}

export const sendFailure = (reply: FastifyReply, failure: Failure) => {
  const body = failureProblem(failure)
  return reply.type('application/problem+json').code(body.status).send(body)
}
