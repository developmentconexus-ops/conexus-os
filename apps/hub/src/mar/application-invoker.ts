import { DEFAULT_LIMITS } from '../app-runner/supervisor.js'

/** One file of the admitted artifact's `conexus-server/` tree, exactly as the runner expects it. */
export type ServerFile = Readonly<{ path: string; sha256: string; content: string }>

export type ApplicationFileReader = (input: Readonly<{
  accountId: string
  projectId: string
  sourceRevision: string
  artifactRevisionId: string
  path: string
}>) => Promise<Readonly<{ path: string; sha256: string; bytes: Uint8Array }> | null>

export type ApplicationRunnerInvoke = (input: Readonly<{
  projectId: string
  operation: string
  input: unknown
  files: readonly ServerFile[]
}>) => Promise<Readonly<{ status: number; body: unknown }>>

export type ApplicationInvoker = (input: Readonly<{
  accountId: string
  projectId: string
  sourceRevision: string
  artifactRevisionId: string
  serverFiles: readonly string[]
  operation: string
  input: unknown
}>) => Promise<Readonly<{ status: number; body: unknown }>>

export type ApplicationAdmissionLimits = Readonly<{
  globalConcurrency: number
  perProjectConcurrency: number
  maxServerTreeBytes: number
}>

// The runner services at most `DEFAULT_LIMITS.concurrency` invocations at once, whatever Project they
// come from, and refuses the rest with 429 once its own `running` counter is at that bound
// (supervisor.ts, `running >= limits.concurrency`). `main.ts` starts the runner with no `limits`
// override, so that constant is the real ceiling in force today. Admitting more concurrent work than
// the runner can ever run only pays for reads, copies and base64 encodes whose outcome downstream is
// already decided; the Hub's own admission ceiling matches it instead of guessing a separate number
// that could drift from the runner's actual bound.
//
// A single Preview issuing a flood of same-origin requests is the scenario this closes (round-2
// review, Claude N8 / Sol finding 2): it must not be able to occupy the whole shared budget by itself,
// so no Project may hold more than half of the global ceiling at once.
export const DEFAULT_ADMISSION_LIMITS: ApplicationAdmissionLimits = Object.freeze({
  globalConcurrency: DEFAULT_LIMITS.concurrency,
  perProjectConcurrency: Math.max(1, Math.ceil(DEFAULT_LIMITS.concurrency / 2)),
  // Server trees are source code, not payloads: 8 MiB is generous for that, and stays far under the
  // runner's own worst case per request (MAX_FILES * MAX_FILE_BYTES = 128 * 4 MiB = 512 MiB), which
  // every concurrently admitted request would otherwise be free to approach at once in Hub memory.
  maxServerTreeBytes: 8 * 1024 * 1024,
})

const refusal = (status: number, code: string): Readonly<{ status: number; body: unknown }> =>
  Object.freeze({ status, body: { error: { code } } })

/**
 * Builds the Preview application API's `invokeApplication`. It bounds in-flight work and the total
 * server-tree size before any artifact file is read, so a request that is going to be refused never
 * first costs the Hub a full read, copy and base64 encode of the tree (round-2 review finding: the
 * Hub used to do that work for every request, ahead of the runner's own concurrency cap).
 */
export const createApplicationInvoker = (dependencies: Readonly<{
  readFile: ApplicationFileReader
  invoke: ApplicationRunnerInvoke
  limits?: ApplicationAdmissionLimits
}>): ApplicationInvoker => {
  const limits = dependencies.limits ?? DEFAULT_ADMISSION_LIMITS
  let globalInFlight = 0
  const perProjectInFlight = new Map<string, number>()

  return async (input) => {
    if (globalInFlight >= limits.globalConcurrency) return refusal(429, 'APPLICATION_RUNNER_BUSY')
    const projectInFlight = perProjectInFlight.get(input.projectId) ?? 0
    if (projectInFlight >= limits.perProjectConcurrency) return refusal(429, 'APPLICATION_PROJECT_BUSY')
    globalInFlight += 1
    perProjectInFlight.set(input.projectId, projectInFlight + 1)
    try {
      let totalBytes = 0
      const reads = await Promise.all(input.serverFiles.map(async (path) => {
        const file = await dependencies.readFile({
          accountId: input.accountId, projectId: input.projectId, sourceRevision: input.sourceRevision,
          artifactRevisionId: input.artifactRevisionId, path,
        })
        if (!file) throw new Error('APPLICATION_SERVER_FILE_MISSING')
        totalBytes += file.bytes.byteLength
        return { path, sha256: file.sha256, bytes: file.bytes }
      }))
      // Checked before any file is base64-encoded: encoding duplicates each buffer (~1.33x) and the
      // result is what crosses the socket to the runner, so this is the step worth not paying for.
      if (totalBytes > limits.maxServerTreeBytes) return refusal(413, 'SERVER_TREE_TOO_LARGE')
      const files = reads.map((file) => ({ path: file.path, sha256: file.sha256, content: Buffer.from(file.bytes).toString('base64') }))
      return await dependencies.invoke({ projectId: input.projectId, operation: input.operation, input: input.input, files })
    } finally {
      globalInFlight -= 1
      const remaining = (perProjectInFlight.get(input.projectId) ?? 1) - 1
      if (remaining <= 0) perProjectInFlight.delete(input.projectId)
      else perProjectInFlight.set(input.projectId, remaining)
    }
  }
}
