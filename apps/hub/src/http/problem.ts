import type { FastifyReply } from 'fastify'

export type ProblemDetails = Readonly<{ type: string; title: string; status: number; detail?: string }> & Readonly<Record<string, unknown>>

const problem = (status: number, type: string, title: string, detail?: string, extra?: Readonly<Record<string, unknown>>): ProblemDetails => ({
  type: `urn:conexus:problem:${type}`,
  title,
  status,
  ...(detail ? { detail } : {}),
  ...extra,
})

export const sendProblem = (reply: FastifyReply, status: number, type: string, title: string, detail?: string, extra?: Readonly<Record<string, unknown>>) => reply
  .type('application/problem+json')
  .code(status)
  .send(problem(status, type, title, detail, extra))
