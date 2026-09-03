import type { FastifyReply } from 'fastify'

export type ProblemDetails = Readonly<{ type: string; title: string; status: number }>

export const problem = (status: number, type: string, title: string): ProblemDetails => ({
  type: `urn:conexus:problem:${type}`,
  title,
  status,
})

export const sendProblem = (reply: FastifyReply, status: number, type: string, title: string) => reply
  .type('application/problem+json')
  .code(status)
  .send(problem(status, type, title))
