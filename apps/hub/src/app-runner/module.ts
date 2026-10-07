import http from 'node:http'
import { RESET_STATEMENT_TIMEOUT_MS } from './requests.js'
import { invokeAnswerSchema, prepareAnswerSchema } from './wire.js'
import type { InvokeInput, OnDivergence, ServerFile } from './supervisor.js'
import { Failure } from '../platform/failure.js'
import { Problem } from '@conexus/contract'
import type { InvokeAnswer, PrepareAnswer } from './server-manifest.js'

/** The Hub's only way to the application runner: HTTP over its owner-only unix socket. */
export type ApplicationRunnerClient = Readonly<{
  /**
   * RESET lets a divergent history erase the Preview schema. The caller must keep the Project
   * without an application until this settles: a reset starts only within RESET_WINDOW_MS and its
   * DROP is bounded, so it cannot still be running once the call times out.
   */
  prepare(input: Readonly<{ projectId: string; files: readonly ServerFile[]; onDivergence: 'RESET' | 'REFUSE'; signal?: AbortSignal }>): Promise<PrepareAnswer>
  invoke(input: InvokeInput): Promise<InvokeAnswer>
  /** Drops a Project's Preview schema and roles for good. Called once, when the Project itself is deleted. */
  release(input: Readonly<{ projectId: string }>): Promise<void>
}>

const PREPARE_TIMEOUT_MS = 120_000
const RESET_WINDOW_MS = PREPARE_TIMEOUT_MS - RESET_STATEMENT_TIMEOUT_MS - 40_000

const call = (socketPath: string, path: string, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<Response> => new Promise((resolve, reject) => {
  const rejectTransport = (cause: unknown): void => {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      reject(cause)
      return
    }
    reject(cause instanceof Failure ? cause : new Failure('APPLICATION_RUNNER_UNAVAILABLE', { cause }))
  }
  const payload = Buffer.from(JSON.stringify(body))
  const outgoing = http.request({
    socketPath, path, method: 'POST', timeout: timeoutMs, ...(signal ? { signal } : {}),
    headers: { 'content-type': 'application/json', 'content-length': payload.byteLength },
  }, (response) => {
    const chunks: Buffer[] = []
    response.on('data', (chunk: Buffer) => chunks.push(chunk))
    response.on('end', () => {
      const contentType = response.headers['content-type']
      resolve(new Response(Buffer.concat(chunks), {
        status: response.statusCode ?? 502,
        ...(typeof contentType === 'string' ? { headers: { 'content-type': contentType } } : {}),
      }))
    })
    response.on('error', rejectTransport)
    response.on('aborted', () => rejectTransport(new Failure('APPLICATION_RUNNER_UNAVAILABLE')))
  })
  outgoing.on('timeout', () => outgoing.destroy(new Failure('APPLICATION_RUNNER_UNAVAILABLE')))
  outgoing.on('error', rejectTransport)
  outgoing.end(payload)
})

const responseJson = async (response: Response): Promise<unknown> => response.json().catch(() => null)
const mediaType = (response: Response): string | null => response.headers.get('content-type')?.split(';', 1)[0]?.trim() ?? null

const nativeFailure = async (response: Response): Promise<Failure> => {
  if (mediaType(response) !== 'application/problem+json') return new Failure('APPLICATION_RUNNER_UNAVAILABLE')
  const problem = Problem.safeParse(await responseJson(response))
  if (!problem.success || problem.data.status !== response.status) return new Failure('APPLICATION_RUNNER_UNAVAILABLE')
  return new Failure(problem.data.code)
}

export const createApplicationRunnerClient = (socketPath: string): ApplicationRunnerClient => Object.freeze({
  prepare: async ({ signal, ...input }) => {
    const onDivergence: OnDivergence = input.onDivergence === 'RESET' ? { resetBefore: Date.now() + RESET_WINDOW_MS } : 'REFUSE'
    const reply = await call(socketPath, '/v1/prepare', { ...input, onDivergence }, PREPARE_TIMEOUT_MS, signal)
    if (reply.status !== 200) throw await nativeFailure(reply)
    if (mediaType(reply) === 'application/json') {
      const result = prepareAnswerSchema.safeParse(await responseJson(reply))
      if (!result.success) throw new Failure('APPLICATION_RUNNER_UNAVAILABLE', { cause: result.error })
      return result.data
    }
    throw new Failure('APPLICATION_RUNNER_UNAVAILABLE')
  },
  invoke: async (input): Promise<InvokeAnswer> => {
    const response = await call(socketPath, '/v1/invoke', input, 15_000)
    if (response.status !== 200) throw await nativeFailure(response)
    if (mediaType(response) !== 'application/json') throw new Failure('APPLICATION_RUNNER_UNAVAILABLE')
    const answer = invokeAnswerSchema.safeParse(await responseJson(response))
    if (!answer.success) throw new Failure('APPLICATION_RUNNER_UNAVAILABLE', { cause: answer.error })
    return answer.data
  },
  release: async (input) => {
    const reply = await call(socketPath, '/v1/release', input, 30_000)
    if (reply.status !== 200) throw await nativeFailure(reply)
  },
})
