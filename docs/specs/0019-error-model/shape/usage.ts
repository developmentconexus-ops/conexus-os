import type { FastifyReply } from 'fastify'
import { admitManifest } from './operations.js'
import type { Runner } from './operations.js'
import { Failure, failureResponse, sendFailureResponse } from './server.js'
import { readFailure } from './client.js'
import type { AccountConnectionAnswer } from './types.js'

export function prepareManifest(value: unknown, reply: FastifyReply) {
  const admitted = admitManifest(value, 'server')
  if (!admitted.ok) return sendFailureResponse(reply, failureResponse({ code: admitted.error.code, traceId: null }))
  return admitted.result.operations
}

export async function callGeneratedOperation(response: Response) {
  if (!response.ok) throw await readFailure(response)
  return response.json()
}

export async function preparePreview(runner: Runner, input: Parameters<Runner['prepare']>[0]) {
  const prepared = await runner.prepare(input)
  if (!prepared.ok) throw new Failure(prepared.error.code)
  return prepared.result.reset
}

export function accountConnection(answer: AccountConnectionAnswer) {
  if (!answer.ok) return answer.error.code
  return 'CONNECTED' as const
}
