import type { Caller } from '../platform/caller.js'

/** One file of the admitted artifact's `conexus-server/` tree, exactly as the runner expects it. */
type ServerFile = Readonly<{ path: string; sha256: string; content: string }>

/**
 * Which artifact a request's server tree is read from, and on whose authority: a developer's Preview
 * (Project visibility, exact source revision) or an application host (access to the application, the
 * artifact it serves).
 */
type ArtifactSource =
  | Readonly<{ via: 'PREVIEW'; accountId: string; projectId: string; sourceRevision: string; artifactRevisionId: string }>
  | Readonly<{ via: 'APPLICATION'; accountId: string; projectId: string; artifactRevisionId: string }>

export type ApplicationFileReader = (input: Readonly<{ source: ArtifactSource; path: string }>) =>
  Promise<Readonly<{ path: string; sha256: string; bytes: Uint8Array }> | null>

export type ApplicationRunnerInvoke = (input: Readonly<{
  projectId: string
  operation: string
  input: unknown
  files: readonly ServerFile[]
  caller: Caller
  connectorSocket?: string
}>) => Promise<Readonly<{ status: number; body: unknown }>>

/**
 * Opens the Connector broker's port for one invocation, under a scope the Connector owner mints from
 * this source; null when the installation serves no connector port. The port dies with the
 * invocation.
 */
export type ConnectorPortOpener = (source: ArtifactSource) => Promise<Readonly<{ socketPath: string; close(): Promise<void> }> | null>

export type ApplicationInvoker = (input: Readonly<{
  source: ArtifactSource
  serverFiles: readonly string[]
  operation: string
  input: unknown
  caller: Caller
  /** Ends this call's wait for a slot; an admitted call runs to its end. */
  signal: AbortSignal
}>) => Promise<Readonly<{ status: number; body: unknown }>>

export type ApplicationAdmissionLimits = Readonly<{
  globalConcurrency: number
  perProjectConcurrency: number
  maxServerTreeBytes: number
  admissionQueueTimeoutMs: number
  admissionQueueLimit: number
}>

const DEFAULT_ADMISSION_LIMITS: ApplicationAdmissionLimits = Object.freeze({
  // The runner's own cap (DEFAULT_LIMITS.concurrency in app-runner/supervisor.ts, 4), so the Hub never
  // admits more work than the runner could service at once. The import law keeps the MAR owner from
  // importing the runner's supervisor, so the number is restated here.
  globalConcurrency: 4,
  // Half the global bound: one flooding Preview cannot occupy the whole shared admission budget.
  perProjectConcurrency: 2,
  // Generous for source code, far under the runner's own worst case (128 files * 4 MiB = 512 MiB).
  maxServerTreeBytes: 8 * 1024 * 1024,
  // A Connector read can hold its slot for about 2 s; a call queued behind one still gets its turn.
  admissionQueueTimeoutMs: 3000,
  // A page opens with a handful of calls; sixteen absorbs a few pages opening at once and bounds memory.
  admissionQueueLimit: 16,
})

/**
 * A counting limit whose excess callers wait in a bounded first-in, first-out line. The line is
 * non-empty only while every slot is held, so a free slot means nobody is waiting.
 */
type Gate = Readonly<{
  /** True once a slot is held; false when the line was full or the signal aborted first. */
  enter(signal: AbortSignal): Promise<boolean>
  /** Frees a slot, handing it straight to the head of the line. */
  leave(): void
  readonly idle: boolean
}>

const createGate = (capacity: number, lineLimit: number): Gate => {
  let held = 0
  const line: (() => void)[] = []
  return {
    enter: (signal) => {
      if (held < capacity) {
        held += 1
        return Promise.resolve(true)
      }
      if (line.length >= lineLimit || signal.aborted) return Promise.resolve(false)
      return new Promise<boolean>((resolve) => {
        const admit = (): void => {
          signal.removeEventListener('abort', abandon)
          resolve(true)
        }
        const abandon = (): void => {
          line.splice(line.indexOf(admit), 1)
          resolve(false)
        }
        line.push(admit)
        signal.addEventListener('abort', abandon, { once: true })
      })
    },
    leave: () => {
      const next = line.shift()
      if (next) next()
      else held -= 1
    },
    get idle() {
      return held === 0
    },
  }
}

const refusal = (status: number, code: string): Readonly<{ status: number; body: unknown }> =>
  Object.freeze({ status, body: { error: { code } } })

export const createApplicationInvoker = (dependencies: Readonly<{
  readFile: ApplicationFileReader
  invoke: ApplicationRunnerInvoke
  openConnectorPort?: ConnectorPortOpener
  limits?: ApplicationAdmissionLimits
}>): ApplicationInvoker => {
  const limits = dependencies.limits ?? DEFAULT_ADMISSION_LIMITS
  const runner = createGate(limits.globalConcurrency, limits.admissionQueueLimit)
  // A Project's gate is dropped once idle, so the Map holds only Projects with a call in flight.
  const projects = new Map<string, Gate>()

  return async (input) => {
    const { projectId } = input.source
    // One deadline for both lines. The wait comes before the runner is invoked, so it spends the
    // caller's request, not the sandbox's invocation timeout.
    const signal = AbortSignal.any([input.signal, AbortSignal.timeout(limits.admissionQueueTimeoutMs)])
    const project = projects.get(projectId) ?? createGate(limits.perProjectConcurrency, limits.admissionQueueLimit)
    projects.set(projectId, project)
    if (!(await project.enter(signal))) return refusal(429, 'APPLICATION_PROJECT_BUSY')
    try {
      // The Project slot stays held while this call waits for the runner, so one Project has at most its
      // own limit in the runner's line and a freed runner slot never waits on a Project.
      if (!(await runner.enter(signal))) return refusal(429, 'APPLICATION_RUNNER_BUSY')
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
        const port = dependencies.openConnectorPort ? await dependencies.openConnectorPort(input.source) : null
        try {
          return await dependencies.invoke({
            projectId, operation: input.operation, input: input.input, files, caller: input.caller, ...(port ? { connectorSocket: port.socketPath } : {}),
          })
        } finally {
          await port?.close()
        }
      } finally {
        runner.leave()
      }
    } finally {
      project.leave()
      if (project.idle) projects.delete(projectId)
    }
  }
}
