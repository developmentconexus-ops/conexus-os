import { request } from 'node:http'
import { RESET_STATEMENT_TIMEOUT_MS } from './requests.js'
import type { InvokeInput, OnDivergence, PrepareResult, Reply, ServerFile } from './supervisor.js'
import { Failure } from '../platform/failure.js'

/** The Hub's only way to the application runner: HTTP over its owner-only unix socket. */
export type ApplicationRunnerClient = Readonly<{
  /**
   * RESET lets a divergent history erase the Preview schema. The caller must keep the Project
   * without an application until this settles: a reset starts only within RESET_WINDOW_MS and its
   * DROP is bounded, so it cannot still be running once the call times out.
   */
  prepare(input: Readonly<{ projectId: string; files: readonly ServerFile[]; onDivergence: 'RESET' | 'REFUSE' }>): Promise<PrepareResult>
  invoke(input: InvokeInput): Promise<Reply>
  /** Drops a Project's Preview schema and roles for good. Called once, when the Project itself is deleted. */
  release(input: Readonly<{ projectId: string }>): Promise<void>
}>

const PREPARE_TIMEOUT_MS = 120_000
const RESET_WINDOW_MS = PREPARE_TIMEOUT_MS - RESET_STATEMENT_TIMEOUT_MS - 40_000

// The runner's own admission names two refusals about the Project's compiled server tree:
// SERVER_TREE_REFUSED (admitServerTree, server-manifest.ts) and MANIFEST_REFUSED (admitManifest,
// server-manifest.ts). Both are facts about the Project's own build, so the Builder sees the exact
// code. Anything else prepare threw, a database or allocation fault, a malformed request, the
// runner's own generic PREPARE_FAILED, is not something the source caused, so it collapses to the
// generic code below (a platform row, like APPLICATION_RUNNER_UNAVAILABLE, not a build failure).

const call = (socketPath: string, path: string, body: unknown, timeoutMs: number): Promise<Reply> => new Promise((resolve, reject) => {
  const payload = Buffer.from(JSON.stringify(body))
  const outgoing = request({
    socketPath, path, method: 'POST', timeout: timeoutMs,
    headers: { 'content-type': 'application/json', 'content-length': payload.byteLength },
  }, (response) => {
    const chunks: Buffer[] = []
    response.on('data', (chunk: Buffer) => chunks.push(chunk))
    response.on('end', () => {
      try {
        // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
        resolve({ status: response.statusCode ?? 502, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown })
      } catch (cause) {
        reject(new Failure('APPLICATION_RUNNER_UNAVAILABLE', { cause }))
      }
    })
    response.on('error', (cause) => reject(new Failure('APPLICATION_RUNNER_UNAVAILABLE', { cause })))
  })
  outgoing.on('timeout', () => outgoing.destroy(new Failure('APPLICATION_RUNNER_UNAVAILABLE')))
  outgoing.on('error', (cause) => reject(new Failure('APPLICATION_RUNNER_UNAVAILABLE', { cause })))
  outgoing.end(payload)
})

export const createApplicationRunnerClient = (socketPath: string): ApplicationRunnerClient => Object.freeze({
  prepare: async (input) => {
    const onDivergence: OnDivergence = input.onDivergence === 'RESET' ? { resetBefore: Date.now() + RESET_WINDOW_MS } : 'REFUSE'
    const reply = await call(socketPath, '/v1/prepare', { ...input, onDivergence }, PREPARE_TIMEOUT_MS)
    // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
    if (reply.status === 200) return reply.body as PrepareResult
    const problem = typeof reply.body === 'object' && reply.body !== null ? reply.body : {}
    const runnerCode = 'code' in problem && typeof problem.code === 'string' ? problem.code : undefined
    const detail = 'detail' in problem && typeof problem.detail === 'string' ? problem.detail : undefined
    const code = runnerCode === 'SERVER_TREE_REFUSED' || runnerCode === 'MANIFEST_REFUSED' ? runnerCode : 'APPLICATION_SERVER_REFUSED'
    throw new Failure(code, { cause: detail ?? runnerCode ?? code })
  },
  invoke: (input) => call(socketPath, '/v1/invoke', input, 15_000),
  release: async (input) => {
    const reply = await call(socketPath, '/v1/release', input, 30_000)
    if (reply.status !== 200) throw new Failure('APPLICATION_RUNNER_RELEASE_REFUSED', { cause: reply.body })
  },
})
