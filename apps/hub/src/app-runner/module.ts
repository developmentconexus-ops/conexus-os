import { request } from 'node:http'
import { RESET_STATEMENT_TIMEOUT_MS } from './requests.js'
import type { InvokeInput, OnDivergence, PrepareResult, Reply, ServerFile } from './supervisor.js'

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
// SERVER_TREE_REFUSED (admitServerTree, supervisor.ts) and MANIFEST_REFUSED (admitManifest,
// server-manifest.ts). Both are facts about the Project's own build, so the Builder sees the exact
// code. Anything else prepare threw, a database or allocation fault, a malformed request, the
// runner's own generic PREPARE_FAILED, is not something the source caused, so it collapses to the
// generic code below (failure-vocabulary.ts routes it like APPLICATION_RUNNER_UNAVAILABLE, not a
// build failure).
const SOURCE_REFUSAL_CODES = new Set(['SERVER_TREE_REFUSED', 'MANIFEST_REFUSED'])

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
        resolve({ status: response.statusCode ?? 502, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown })
      } catch {
        reject(new Error('APPLICATION_RUNNER_UNAVAILABLE'))
      }
    })
    response.on('error', () => reject(new Error('APPLICATION_RUNNER_UNAVAILABLE')))
  })
  outgoing.on('timeout', () => outgoing.destroy(new Error('APPLICATION_RUNNER_UNAVAILABLE')))
  outgoing.on('error', () => reject(new Error('APPLICATION_RUNNER_UNAVAILABLE')))
  outgoing.end(payload)
})

export const createApplicationRunnerClient = (socketPath: string): ApplicationRunnerClient => Object.freeze({
  prepare: async (input) => {
    const onDivergence: OnDivergence = input.onDivergence === 'RESET' ? { resetBefore: Date.now() + RESET_WINDOW_MS } : 'REFUSE'
    const reply = await call(socketPath, '/v1/prepare', { ...input, onDivergence }, PREPARE_TIMEOUT_MS)
    if (reply.status === 200) return reply.body as PrepareResult
    const error = (reply.body as Readonly<{ error?: Readonly<{ code?: unknown; detail?: unknown }> }> | undefined)?.error
    const runnerCode = typeof error?.code === 'string' && /^[A-Z_]+$/.test(error.code) ? error.code : undefined
    const detail = typeof error?.detail === 'string' ? error.detail : undefined
    const code = runnerCode && SOURCE_REFUSAL_CODES.has(runnerCode) ? runnerCode : 'APPLICATION_SERVER_REFUSED'
    throw new Error(code, { cause: detail ?? runnerCode ?? code })
  },
  invoke: (input) => call(socketPath, '/v1/invoke', input, 15_000),
  release: async (input) => {
    const reply = await call(socketPath, '/v1/release', input, 30_000)
    if (reply.status !== 200) throw new Error('APPLICATION_RUNNER_RELEASE_REFUSED', { cause: reply.body })
  },
})
