import { failureProblem } from '../http/problem.js'
import { Failure } from '../platform/failure.js'
import type { FailureCode } from '../platform/failures.generated.js'
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
  callerLeft: AbortSignal
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
  // On the pilot a page's Connector read held its slot for up to 2 s; a call queued behind it runs.
  admissionQueueTimeoutMs: 3000,
  // Each Project's line and the runner's line hold up to this many. A page opens with a handful of calls,
  // so sixteen absorbs a few pages opening at once.
  admissionQueueLimit: 16,
})

// A line forms only while every slot is held, so a caller that takes a free slot never jumps the line.
type Gate = Readonly<{
  enter(signal: AbortSignal): Promise<boolean>
  leave(): void
  readonly idle: boolean
}>

const createGate = (capacity: number, lineLimit: number): Gate => {
  let held = 0
  const line = new Set<() => void>()
  return {
    enter: (signal) => {
      if (held < capacity) {
        held += 1
        return Promise.resolve(true)
      }
      if (line.size >= lineLimit || signal.aborted) return Promise.resolve(false)
      return new Promise<boolean>((resolve) => {
        const admit = (): void => {
          signal.removeEventListener('abort', abandon)
          resolve(true)
        }
        const abandon = (): void => {
          line.delete(admit)
          resolve(false)
        }
        line.add(admit)
        signal.addEventListener('abort', abandon, { once: true })
      })
    },
    leave: () => {
      const [next] = line
      if (!next) {
        held -= 1
        return
      }
      line.delete(next)
      next()
    },
    get idle() {
      return held === 0
    },
  }
}

const refusal = (code: FailureCode): Readonly<{ status: number; body: unknown }> => {
  const problem = failureProblem(new Failure(code))
  return Object.freeze({ status: problem.status, body: problem })
}

export const createApplicationInvoker = (dependencies: Readonly<{
  readFile: ApplicationFileReader
  invoke: ApplicationRunnerInvoke
  openConnectorPort?: ConnectorPortOpener
  limits?: ApplicationAdmissionLimits
}>): ApplicationInvoker => {
  const limits = dependencies.limits ?? DEFAULT_ADMISSION_LIMITS
  const runner = createGate(limits.globalConcurrency, limits.admissionQueueLimit)
  const projects = new Map<string, Gate>()

  return async (input) => {
    const { projectId } = input.source
    const waitEnds = AbortSignal.any([input.callerLeft, AbortSignal.timeout(limits.admissionQueueTimeoutMs)])
    const project = projects.get(projectId) ?? createGate(limits.perProjectConcurrency, limits.admissionQueueLimit)
    projects.set(projectId, project)
    const leaveProject = (): void => {
      project.leave()
      if (project.idle) projects.delete(projectId)
    }
    if (!(await project.enter(waitEnds))) return refusal('APPLICATION_PROJECT_BUSY')
    // The Project slot is taken first and held in the runner's line, which keeps each Project to its own
    // limit there.
    if (!(await runner.enter(waitEnds))) {
      leaveProject()
      return refusal('APPLICATION_RUNNER_BUSY')
    }
    try {
      // Sequential, not Promise.all: an oversized tree is refused as soon as the running total crosses
      // the limit, so memory per request is bounded by the limit plus at most one file, not the whole
      // tree.
      let totalBytes = 0
      const reads: { path: string; sha256: string; bytes: Uint8Array }[] = []
      for (const path of input.serverFiles) {
        const file = await dependencies.readFile({ source: input.source, path })
        if (!file) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'APPLICATION_SERVER_FILE_MISSING' } })
        totalBytes += file.bytes.byteLength
        if (totalBytes > limits.maxServerTreeBytes) return refusal('SERVER_TREE_TOO_LARGE')
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
      leaveProject()
    }
  }
}
