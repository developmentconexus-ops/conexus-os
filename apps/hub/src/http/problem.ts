import type { FastifyReply } from 'fastify'

export type ProblemDetails = Readonly<{ type: string; title: string; status: number; detail?: string }>

export const problem = (status: number, type: string, title: string, detail?: string): ProblemDetails => ({
  type: `urn:conexus:problem:${type}`,
  title,
  status,
  ...(detail ? { detail } : {}),
})

export const sendProblem = (reply: FastifyReply, status: number, type: string, title: string, detail?: string) => reply
  .type('application/problem+json')
  .code(status)
  .send(problem(status, type, title, detail))
