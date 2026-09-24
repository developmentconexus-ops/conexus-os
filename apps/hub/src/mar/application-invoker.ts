/** One file of the admitted artifact's `conexus-server/` tree, exactly as the runner expects it. */
export type ServerFile = Readonly<{ path: string; sha256: string; content: string }>

/** The person a request acts for, resolved by the platform from a session. It never comes from input. */
export type ApplicationCaller = Readonly<{ accountId: string; email: string | null; displayName: string }>

/**
 * Which artifact a request's server tree is read from, and on whose authority: a developer's Preview
 * (Project visibility, exact source revision) or an application host (access to the application, the
 * artifact it serves).
 */
export type ArtifactSource =
  | Readonly<{ via: 'PREVIEW'; accountId: string; projectId: string; sourceRevision: string; artifactRevisionId: string }>
  | Readonly<{ via: 'APPLICATION'; accountId: string; projectId: string; artifactRevisionId: string }>

export type ApplicationFileReader = (input: Readonly<{ source: ArtifactSource; path: string }>) =>
  Promise<Readonly<{ path: string; sha256: string; bytes: Uint8Array }> | null>

export type ApplicationRunnerInvoke = (input: Readonly<{
  projectId: string
  operation: string
  input: unknown
  files: readonly ServerFile[]
  caller: ApplicationCaller
}>) => Promise<Readonly<{ status: number; body: unknown }>>

export type ApplicationInvoker = (input: Readonly<{
  source: ArtifactSource
  serverFiles: readonly string[]
  operation: string
  input: unknown
  caller: ApplicationCaller
}>) => Promise<Readonly<{ status: number; body: unknown }>>

export type ApplicationAdmissionLimits = Readonly<{
  globalConcurrency: number
  perProjectConcurrency: number
  maxServerTreeBytes: number
}>

export const DEFAULT_ADMISSION_LIMITS: ApplicationAdmissionLimits = Object.freeze({
  // The runner's own cap (DEFAULT_LIMITS.concurrency in app-runner/supervisor.ts, 4), so the Hub never
  // admits more work than the runner could service at once. The import law keeps the MAR owner from
  // importing the runner's supervisor, so the number is restated here.
  globalConcurrency: 4,
  // Half the global bound: one flooding Preview cannot occupy the whole shared admission budget.
  perProjectConcurrency: 2,
  // Generous for source code, far under the runner's own worst case (128 files * 4 MiB = 512 MiB).
  maxServerTreeBytes: 8 * 1024 * 1024,
})

const refusal = (status: number, code: string): Readonly<{ status: number; body: unknown }> =>
  Object.freeze({ status, body: { error: { code } } })

export const createApplicationInvoker = (dependencies: Readonly<{
  readFile: ApplicationFileReader
  invoke: ApplicationRunnerInvoke
  limits?: ApplicationAdmissionLimits
}>): ApplicationInvoker => {
  const limits = dependencies.limits ?? DEFAULT_ADMISSION_LIMITS
  let globalInFlight = 0
  const perProjectInFlight = new Map<string, number>()

  return async (input) => {
    const { projectId } = input.source
    if (globalInFlight >= limits.globalConcurrency) return refusal(429, 'APPLICATION_RUNNER_BUSY')
    const projectInFlight = perProjectInFlight.get(projectId) ?? 0
    if (projectInFlight >= limits.perProjectConcurrency) return refusal(429, 'APPLICATION_PROJECT_BUSY')
    globalInFlight += 1
    perProjectInFlight.set(projectId, projectInFlight + 1)
    try {
      // Sequential, not Promise.all: an oversized tree is refused as soon as the running total crosses
      // the limit, so memory per request is bounded by the limit plus at most one file, not the whole
      // tree.
      let totalBytes = 0
      const reads: { path: string; sha256: string; bytes: Uint8Array }[] = []
      for (const path of input.serverFiles) {
        const file = await dependencies.readFile({ source: input.source, path })
        if (!file) throw new Error('APPLICATION_SERVER_FILE_MISSING')
        totalBytes += file.bytes.byteLength
        if (totalBytes > limits.maxServerTreeBytes) return refusal(413, 'SERVER_TREE_TOO_LARGE')
        reads.push({ path, sha256: file.sha256, bytes: file.bytes })
      }
      const files = reads.map((file) => ({ path: file.path, sha256: file.sha256, content: Buffer.from(file.bytes).toString('base64') }))
      return await dependencies.invoke({ projectId, operation: input.operation, input: input.input, files, caller: input.caller })
    } finally {
      globalInFlight -= 1
      const remaining = (perProjectInFlight.get(projectId) ?? 1) - 1
      if (remaining <= 0) perProjectInFlight.delete(projectId)
      else perProjectInFlight.set(projectId, remaining)
    }
  }
}
