import { trace } from '@opentelemetry/api'
import type { FastifyReply } from 'fastify'
import { TraceId } from '@conexus/contract'
import { failureRow, type FailureCode } from '../platform/failure.js'

export type TraceReference = TraceId | null

export function currentTraceReference(): TraceReference {
  const parsed = TraceId.safeParse(trace.getActiveSpan()?.spanContext().traceId)
  return parsed.success ? parsed.data : null
}

export function failureBody({ code, traceId }: Readonly<{ code: FailureCode; traceId: TraceReference }>) {
  const row = failureRow(code)
  return {
    type: `urn:conexus:problem:${code}`,
    title: code,
    status: row.status,
    code,
    ...(row.category === 'SYSTEM' && traceId ? { traceId } : {}),
  }
}

export function failureResponse(input: Readonly<{ code: FailureCode; traceId: TraceReference }>): Response {
  const body = failureBody(input)
  return Response.json(body, { status: body.status, headers: { 'content-type': 'application/problem+json' } })
}

export function sendFailureResponse(reply: FastifyReply, response: Response): FastifyReply {
  return reply.code(response.status).headers(Object.fromEntries(response.headers)).send(response.body)
}
