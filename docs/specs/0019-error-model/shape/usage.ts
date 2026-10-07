import type { FastifyReply } from 'fastify'
import type { Runner } from './operations.js'
import { admitManifest, runnerCall } from './operations.js'
import { Failure, failureResponse, sendFailureResponse, toFailure, recordRunnerException } from './server.js'
import { readFailure, ReceivedFailure } from './client.js'
import type { AccountConnectionAnswer, InvokeAnswer, TraceReference } from './types.js'
import { publicProblemSchema, prepareAnswerSchema, invokeAnswerSchema } from './schemas.js'

export function prepareManifest(value: unknown, reply: FastifyReply) {
  const admitted = admitManifest(value, 'server')
  if (!admitted.ok) return sendFailureResponse(reply, failureResponse({ code: admitted.error.code, traceId: null }))
  return admitted.result.operations
}
export function serveInvocation(answer: InvokeAnswer, traceId: TraceReference): Response {
  if (!answer.ok) return failureResponse({ code: answer.error.code, traceId })
  return Response.json(answer.result ?? null)
}
export function repairFacts(answer: InvokeAnswer) {
  if (answer.ok) return answer.result
  return answer.error
}
export async function callGeneratedOperation(fetchOperation: () => Promise<Response>) {
  let response: Response
  try { response = await fetchOperation() }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ReceivedFailure({ code: 'HUB_UNREACHABLE', status: null, traceId: null })
  }
  if (!response.ok) throw await readFailure(response)
  return response.json()
}
export async function preparePreview(runner: Runner, input: Parameters<Runner['prepare']>[0]) {
  const prepared = await runner.prepare(input)
  if (!prepared.ok) throw new Failure(prepared.error.code, { cause: prepared.error })
  return prepared.result.reset
}
export function accountConnection(answer: AccountConnectionAnswer) {
  if (!answer.ok) return answer.error.code
  return 'CONNECTED' as const
}


// This is the private request boundary; default Fastify logging must not log this caught fault.
export function runnerNativeFault(error: unknown, reply: FastifyReply, traceId: TraceReference) {
  const failure = toFailure(error)
  recordRunnerException(failure)
  return sendFailureResponse(reply, failureResponse({ code: failure.id, traceId }))
}

// One module-local decoder for native exceptions; no private diagnosis/origin role is transported.
async function runnerNativeFailure(response: Response): Promise<Failure> {
  const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim()
  if (mediaType !== 'application/problem+json') return new Failure('APPLICATION_RUNNER_UNAVAILABLE')
  const body: unknown = await response.json().catch(() => null)
  const parsed = publicProblemSchema.safeParse(body)
  if (!parsed.success || parsed.data.status !== response.status) return new Failure('APPLICATION_RUNNER_UNAVAILABLE')
  return new Failure(parsed.data.code)
}

export async function runnerPrepare(body: unknown, signal?: AbortSignal) {
  const response = await runnerCall('/v1/prepare', body, signal)
  if (!response.ok) throw await runnerNativeFailure(response)
  if (response.status !== 200 || response.headers.get('content-type')?.split(';', 1)[0]?.trim() !== 'application/json') throw new Failure('APPLICATION_RUNNER_UNAVAILABLE')
  const parsed = prepareAnswerSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new Failure('APPLICATION_RUNNER_UNAVAILABLE', { cause: parsed.error })
  return parsed.data
}
export async function runnerInvoke(body: unknown) {
  const response = await runnerCall('/v1/invoke', body)
  if (!response.ok) throw await runnerNativeFailure(response)
  if (response.status !== 200 || response.headers.get('content-type')?.split(';', 1)[0]?.trim() !== 'application/json') throw new Failure('APPLICATION_RUNNER_UNAVAILABLE')
  const parsed = invokeAnswerSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new Failure('APPLICATION_RUNNER_UNAVAILABLE', { cause: parsed.error })
  return parsed.data
}
export async function runnerRelease(body: unknown) {
  const response = await runnerCall('/v1/release', body)
  if (!response.ok) throw await runnerNativeFailure(response)
  if (response.status !== 200) throw new Failure('APPLICATION_RUNNER_RELEASE_REFUSED')
  // Existing release success/body semantics stay unchanged.
}
export async function invokeFromHost(invoke: () => Promise<InvokeAnswer>) {
  try { return await invoke() }
  catch (error) {
    if (error instanceof Failure) throw error
    throw new Failure('APPLICATION_RUNNER_UNAVAILABLE', { cause: error })
  }
}
// Existing Hub error/terminal owners receive this escaping Failure and log it once.
// Their active context already joins the runner cause event through native unix trace propagation.
