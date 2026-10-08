import type { AccountId, ProjectId, Result } from '@conexus/contract'
import { currentTraceReference, failureResponse } from '../http/problem.js'
import { Failure, logFailure } from '../platform/failure.js'
import type { FailureCode } from '../platform/failures.generated.js'
import { logger } from '../platform/logger.js'
import type { Caller } from '../platform/caller.js'
import type { ServerFile } from './server-tree.js'

/** On whose authority a request reaches the runner: a developer's Preview or an application host. */
type ArtifactSource = Readonly<{ via: 'PREVIEW' | 'APPLICATION'; accountId: AccountId; projectId: ProjectId }>
type RunnerAnswer = Result<unknown, Readonly<{ code: FailureCode }>>

export type ApplicationRunnerInvoke = (input: Readonly<{
  projectId: string
  operation: string
  input: unknown
  files: readonly ServerFile[]
  caller: Caller
  connectorSocket?: string
}>) => Promise<RunnerAnswer>

/**
 * Opens the Connector broker's port for one invocation, under a scope the Connector owner mints from
 * this source; null when the installation serves no connector port. The port dies with the
 * invocation.
 */
export type ConnectorPortOpener = (source: ArtifactSource) => Promise<Readonly<{ socketPath: string; close(): Promise<void> }> | null>

export type ApplicationInvoker = (input: Readonly<{
  source: ArtifactSource
  files: readonly ServerFile[]
  operation: string
  input: unknown
  caller: Caller
  callerLeft: AbortSignal
}>) => Promise<Response>

export type ApplicationAdmissionLimits = Readonly<{
  globalConcurrency: number
  perProjectConcurrency: number
  admissionQueueTimeoutMs: number
  admissionQueueLimit: number
}>

const DEFAULT_ADMISSION_LIMITS: ApplicationAdmissionLimits = Object.freeze({
  // The runner's own cap (DEFAULT_LIMITS.concurrency in app-runner/supervisor.ts, 4), so the Hub never
  // admits more work than the runner could service at once. The import law keeps the hosting owner from
  // importing the runner's supervisor, so the number is restated here.
  globalConcurrency: 4,
  // Half the global bound: one flooding Preview cannot occupy the whole shared admission budget.
  perProjectConcurrency: 2,
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

function refusal(code: FailureCode): Response {
  const failure = new Failure(code)
  logFailure(logger, failure)
  return failureResponse({ code, traceId: currentTraceReference() })
}

export function createApplicationInvoker(dependencies: Readonly<{
  invoke: ApplicationRunnerInvoke
  openConnectorPort?: ConnectorPortOpener
  limits?: ApplicationAdmissionLimits
}>): ApplicationInvoker {
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
      const port = dependencies.openConnectorPort ? await dependencies.openConnectorPort(input.source) : null
      try {
        const answer = await dependencies.invoke({
          projectId, operation: input.operation, input: input.input, files: input.files, caller: input.caller, ...(port ? { connectorSocket: port.socketPath } : {}),
        })
        return answer.ok ? Response.json(answer.result) : refusal(answer.error.code)
      } catch (error) {
        if (error instanceof Failure) throw error
        throw new Failure('APPLICATION_RUNNER_UNAVAILABLE', { cause: error, details: { project: projectId, operation: input.operation } })
      } finally {
        await port?.close()
      }
    } finally {
      runner.leave()
      leaveProject()
    }
  }
}
