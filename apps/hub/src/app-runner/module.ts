import { request } from 'node:http'
import type { InvokeInput, PrepareResult, Reply, ServerFile } from './supervisor.js'

/** The Hub's only way to the application runner: HTTP over its owner-only unix socket. */
export type ApplicationRunnerClient = Readonly<{
  prepare(input: Readonly<{ projectId: string; files: readonly ServerFile[] }>): Promise<PrepareResult>
  invoke(input: InvokeInput): Promise<Reply>
}>

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
    const reply = await call(socketPath, '/v1/prepare', input, 120_000)
    if (reply.status === 200) return reply.body as PrepareResult
    throw new Error('APPLICATION_SERVER_REFUSED', { cause: reply.body })
  },
  invoke: (input) => call(socketPath, '/v1/invoke', input, 15_000),
})
