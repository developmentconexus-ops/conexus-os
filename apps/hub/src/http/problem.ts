import { trace } from '@opentelemetry/api'
import type { FastifyReply } from 'fastify'
import { TraceId } from '@conexus/contract'
import { failureRow, type FailureCode } from '../platform/failure.js'

export type TraceReference = TraceId | null

export function currentTraceReference(): TraceReference {
  const parsed = TraceId.safeParse(trace.getActiveSpan()?.spanContext().traceId)
  return parsed.success ? parsed.data : null
}

export function failureResponse({ code, traceId }: Readonly<{ code: FailureCode; traceId: TraceReference }>): Response {
  const row = failureRow(code)
  const problem = {
    type: `urn:conexus:problem:${code}`,
    title: code,
    status: row.status,
    code,
    ...(row.category === 'SYSTEM' && traceId ? { traceId } : {}),
  }
  return Response.json(problem, { status: row.status, headers: { 'content-type': 'application/problem+json' } })
}

export function sendFailureResponse(reply: FastifyReply, response: Response): FastifyReply {
  return reply.code(response.status).headers(Object.fromEntries(response.headers)).send(response.body)
}
