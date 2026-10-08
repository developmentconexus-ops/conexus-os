import { trace } from '@opentelemetry/api'
import type { FastifyReply } from 'fastify'
import { TraceId } from '@conexus/contract'
import { failureRow, type FailureCode } from '../platform/failure.js'

export type TraceReference = TraceId | null

export function currentTraceReference(): TraceReference {
  const parsed = TraceId.safeParse(trace.getActiveSpan()?.spanContext().traceId)
  return parsed.success ? parsed.data : null
}

export function failureResponse(input: Readonly<{ code: FailureCode; traceId: TraceReference }>): Response {
  const row = failureRow(input.code)
  const body = {
    type: `urn:conexus:problem:${input.code}`,
    title: input.code,
    status: row.status,
    code: input.code,
    ...(row.category === 'SYSTEM' && input.traceId ? { traceId: input.traceId } : {}),
  }
  return Response.json(body, { status: row.status, headers: { 'content-type': 'application/problem+json' } })
}

export function sendFailureResponse(reply: FastifyReply, response: Response): FastifyReply {
  return reply.code(response.status).headers(Object.fromEntries(response.headers)).send(reply.request.method === 'HEAD' ? response.body : response)
}
