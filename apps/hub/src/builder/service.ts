import type { ConexusGit } from './conexus-git.js'
import type { Conversations } from './conversations.js'
import { CandidateRefused } from './run-runtime.js'
import type { BuilderRunRuntime } from './run-runtime.js'
import type { ParkedCallStanding } from './runtime.js'
import type { BuilderSourceComparison, BuilderSourceFile, BuilderSourceTree, ProjectSourceReads } from './source.js'
import type { BuilderRunningPhase, BuilderRunSummary, BuilderStore } from './store.js'
import { prepareApplicationServer, prepareBuilderRunApplicationArtifact } from './application-build.js'
import { builderFailureCategory } from './failure-vocabulary.js'
import type { ApplicationArtifactMetadata, ApplicationArtifactReadResult, ApplicationServerPort, BuilderApplicationArtifacts } from './application-build.js'
import { logLine } from '../platform/logger.js'

/** What became of a person's answer to a parked run. Only `RESUMED` took the run out of PARKED. */
export type BuilderAnswerOutcome = 'RESUMED' | 'ALREADY_ANSWERED' | 'NOT_PARKED'

export type BuilderService = Readonly<{
  createBuilderRun(input: Readonly<{ accountId: string; projectId: string; conversationId: string; idempotencyKey: string; content: string }>): Promise<BuilderRunSummary>
  cancelBuilderRun(input: Readonly<{ accountId: string; projectId: string; builderRunId: string }>): Promise<BuilderRunSummary>
  /**
   * The person's answer to the call a parked run waits on, which takes the run back to work. An
   * answer to any other call leaves the run parked, so the same answer sent twice resumes it once.
   */
  answerBuilderRun(input: Readonly<{ accountId: string; projectId: string; builderRunId: string; toolCallId: string; resumeData: unknown }>): Promise<BuilderAnswerOutcome>
  listSourceTree(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string }>): Promise<BuilderSourceTree>
  getSourceFile(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string; path: string }>): Promise<BuilderSourceFile>
  compareSourceRevisions(input: Readonly<{ accountId: string; projectId: string; baseSourceRevision: string; resultSourceRevision: string }>): Promise<BuilderSourceComparison>
  getApplicationBySource(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string }>): Promise<ApplicationArtifactMetadata | null>
  readApplicationFileBySource(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string; artifactRevisionId: string; path: string }>): Promise<ApplicationArtifactReadResult | null>
  recover(): Promise<void>
  /** Aborts every running leg for a Hub that is stopping; each settles its run INTERRUPTED HUB_RESTART. */
  stopLegs(): void
  close(): Promise<void>
}>

/** A note in the run's conversation thread, keyed by run and code so a retry writes it once. */
export type RunNote = Readonly<{
  projectId: string
  conversationId: string
  builderRunId: string
  code: string
  outcome: 'SOURCE_BASE_MOVED' | 'RUN_NOT_FINISHED' | 'CANDIDATE_REFUSED' | 'BUILD_FAILED' | 'PLATFORM_FAILED' | 'PREVIEW_DATA_RESET' | 'BOOT_PROBLEMS'
  // `main` after the run: its base when nothing was admitted, its result when admitted.
  sourceRevision: string
  // The Project's own diagnostic, such as the database's error for its migration.
  detail?: string
}>

type DiagnosticAppender = (note: RunNote) => Promise<void>

// A run works on its Project's repository in the Conexus Git, whose `main` is the admitted source.
export type BuilderRunDependencies = Readonly<{
  runtime: BuilderRunRuntime
  git: Pick<ConexusGit, 'readMain' | 'mainContains'>
  conversations: Pick<Conversations, 'ownerOf'>
  source: ProjectSourceReads
  appendDiagnostic: DiagnosticAppender
  /** Where a call stands in the conversation's thread, read from what Mastra stored. */
  findParkedCall(input: Readonly<{ projectId: string; conversationId: string; toolCallId: string }>): Promise<ParkedCallStanding>
  /** Hands the run, as the builder-session read serves it, to a browser following its conversation. */
  publishRun(run: BuilderRunSummary): Promise<void>
  reconcileEveryMs?: number
  /** The wait before a failed settle write is tried again; it is tried three times. */
  settleRetryMs?: number
}>

/**
 * Settles every running run with a candidate that no run in this process still owns, whatever phase
 * it stopped in; the candidate may be on `main`. When the run already recorded its advance, or
 * `main`'s history holds the candidate, the run is admitted with the last good Preview kept; both
 * writes converge when repeated. A candidate `main` lacks fails the run. Answers the runs it could
 * not settle, which stay running.
 */
const recoverAdmissions = async ({ store, git, active }: Readonly<{
  store: Pick<BuilderStore, 'listAdmissionRuns' | 'advanceBuilderRunSource' | 'settleBuilderRunBuild' | 'failBuilderRun'>
  git: BuilderRunDependencies['git']
  active: ReadonlySet<string>
}>): Promise<readonly string[]> => {
  const unsettled: string[] = []
  for (const run of await store.listAdmissionRuns()) {
    if (active.has(run.builderRunId)) continue
    const candidate = run.candidateRevision
    try {
      if (run.resultSourceRevision !== candidate && !await git.mainContains(run.projectId, candidate)) {
        await store.failBuilderRun(run.builderRunId, 'BUILDER_SOURCE_ADMISSION_FAILED')
        continue
      }
      await store.advanceBuilderRunSource(run.builderRunId, candidate)
      await store.settleBuilderRunBuild({ builderRunId: run.builderRunId, sourceRevision: candidate, failureCode: 'BUILDER_PREVIEW_NOT_BUILT' })
    } catch {
      unsettled.push(run.builderRunId)
    }
  }
  return unsettled
}

// How a run ended, for the settle of its open question.
type SettleTerminal = 'USER_CANCELLED' | 'FAILED' | 'HUB_RESTART'

// Only these end a run with a recorded candidate knowing its source is not on main.
// The abort reason of a leg the Hub stops: it settles INTERRUPTED HUB_RESTART, not as the operator's stop.
const HUB_STOPPING = 'HUB_STOPPING'
const NOT_ADMITTED = new Set(['BUILDER_SOURCE_BASE_MOVED', 'BUILDER_SOURCE_ADMISSION_FAILED', 'BUILDER_RUN_CANCELLED'])

export const createBuilderService = ({ store, applicationArtifacts, applicationServer, runs }: Readonly<{
  store: BuilderStore
  applicationArtifacts: BuilderApplicationArtifacts
  applicationServer?: ApplicationServerPort
  runs: BuilderRunDependencies
}>): BuilderService => {
  // A run's legs: the work now in flight for it. A parked run has none, in this process or after a restart.
  const builderActive = new Map<string, Readonly<{
    controller: AbortController
    work: Promise<void>
    /** Whether this leg ended parked on a question; settles once its work has released everything. */
    parking: Promise<boolean>
    /** The call this leg was started to answer, so a second answer to it is told apart from an answer to a later question. */
    answered: string | undefined
  }>>()
  const applicationShutdown = new AbortController()
  let serviceClosing: Promise<void> | null = null
  let reconcileTimer: ReturnType<typeof setTimeout> | null = null
  let reconciling: Promise<void> = Promise.resolve()
  const recover = (active: ReadonlySet<string>): Promise<readonly string[]> => recoverAdmissions({ store, git: runs.git, active })
  // Candidate runs left running are settled here, again and again until the Conexus Git and the database answer.
  const reconcile = async (): Promise<void> => {
    const active = new Set(builderActive.keys())
    const unsettled = await recover(active).then((ids) => ids.length > 0, () => true)
    if (await settleUnowned(active).then((left) => left, () => true) || unsettled) reconcileSoon()
  }
  // A run still running that no leg of this Hub owns lost its ending to a failed write. Answers
  // whether one is left unsettled. A leg dispatched since the list was read owns its run.
  const settleUnowned = async (active: ReadonlySet<string>): Promise<boolean> => {
    let left = false
    for (const run of await store.listUnownedRunCandidates()) {
      if (active.has(run.builderRunId) || builderActive.has(run.builderRunId)) continue
      try {
        await store.failBuilderRun(run.builderRunId, 'BUILDER_RUN_SETTLE_LOST')
        logLine(`BUILDER_RUN_SETTLED_BY_RECONCILE:${run.builderRunId}`, 'warn')
        await settleRun(run, 'FAILED')
      } catch {
        left = true
      }
    }
    return left
  }
  const reconcileSoon = (): void => {
    if (reconcileTimer || serviceClosing) return
    reconcileTimer = setTimeout(() => {
      reconcileTimer = null
      reconciling = reconciling.then(reconcile)
    }, runs.reconcileEveryMs ?? 30_000)
    reconcileTimer.unref?.()
  }
  // A browser that misses a publish still reads the run from the builder-session poll, so a failed
  // one never stops a run or a stop request.
  const publishRun = async (run: BuilderRunSummary): Promise<void> => {
    try { await runs.publishRun(run) } catch { /* the poll still serves the run */ }
  }
  const failureCode = (error: unknown): string => {
    const code = error instanceof Error ? error.message : ''
    return /^[A-Z0-9_]{1,120}$/.test(code) ? code : 'BUILDER_PREPARATION_FAILED'
  }
  // A run that ever asked a question leaves it open on the conversation thread whichever way it ends:
  // a stop during the park, a refused park, a failed resumed leg or a restart. Mastra's own discard
  // settles the open calls as denied; with none open it only reads the thread, so every ending
  // calls this and a second call changes nothing. A failed discard is logged, never thrown, since the
  // run's own ending must not depend on it.
  const settleRun = async (run: Readonly<{ builderRunId: string; projectId: string; conversationId: string }>, terminal: SettleTerminal): Promise<void> => {
    try {
      await runs.runtime.discardParked({ projectId: run.projectId, conversationId: run.conversationId })
    } catch {
      logLine(`BUILDER_PARKED_DISCARD_FAILED:${run.builderRunId}:${terminal}`, 'warn')
    }
  }
  // A run's ending is written again after a short wait, as a database blip is common and the
  // Project answers PROJECT_BUSY while its row stays running. When every try fails the timer settles the row.
  const writeEnding = async (builderRunId: string, write: () => Promise<void>): Promise<void> => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { await write(); return } catch (error) {
        if (attempt === 3) {
          logLine(`BUILDER_RUN_SETTLE_FAILED:${builderRunId}:${failureCode(error)}`, 'error')
          reconcileSoon()
          return
        }
        await new Promise((wake) => { setTimeout(wake, runs.settleRetryMs ?? 500) })
      }
    }
  }
  const dispatchBuilderRun = (run: BuilderRunSummary, input: Readonly<{ accountId: string; content: string; resume?: Readonly<{ toolCallId: string; resumeData: unknown }> }>): void => {
    if (builderActive.has(run.builderRunId)) return
    const controller = new AbortController()
    // A browser following the conversation learns each step from its stream; the builder-session
    // read stays the record, so a run a newer one replaced, or a failed publish, changes nothing.
    const publish = async (): Promise<void> => {
      let latest: BuilderRunSummary | null = null
      try { latest = await store.readBuilderRun({ accountId: input.accountId, projectId: run.projectId }) } catch { return }
      if (latest?.builderRunId === run.builderRunId) await publishRun(latest)
    }
    let endParking: (parked: boolean) => void = () => undefined
    const parking = new Promise<boolean>((resolve) => { endParking = resolve })
    const setPhase = async (phase: BuilderRunningPhase): Promise<void> => {
      if (typeof store.setBuilderRunPhase === 'function') await store.setBuilderRunPhase(run.builderRunId, phase)
      await publish()
    }
    // A run whose agent ran has tool calls in its conversation thread until its source is
    // admitted; if it never is, the thread gets a note that its files are kept for the next turn.
    let unadmittedAgentRun: BuilderRunSummary | null = null
    let candidateRecorded = false
    // The catch publishes how the run ended before it closes the session; the finally then has nothing to add.
    let endPublished = false
    // The run's session stays open until its last state is published to the stream that follows it.
    let closeHeldSession: (() => Promise<void>) | undefined
    const closeSession = async (): Promise<void> => {
      const close = closeHeldSession
      closeHeldSession = undefined
      await close?.()
    }
    const work = (async () => {
      // An answered run was taken out of PARKED by the answer, which is its claim.
      const claimed = input.resume ? run : await store.claimBuilderRun(run.builderRunId)
      await setPhase('PREPARING')
      const conversation = { projectId: claimed.projectId, conversationId: claimed.conversationId }
      const result = await runs.runtime.execute({
        projectId: claimed.projectId, accountId: input.accountId, conversationId: claimed.conversationId,
        executionId: claimed.builderRunId, intent: input.content, ...(input.resume ? { resume: input.resume } : {}), baseSourceRevision: claimed.baseSourceRevision,
        providerSandboxId: await store.readConversationSandbox(conversation),
        signal: controller.signal,
        holdSession: (close) => { closeHeldSession = close },
        setPhase: async (phase: BuilderRunningPhase) => {
          await setPhase(phase)
          if (phase === 'AGENT') unadmittedAgentRun = claimed
        },
        bindPhysicalSandbox: async (sandboxId: string) => {
          await store.bindBuilderRunSandbox(claimed.builderRunId, sandboxId)
          await store.recordConversationSandbox({ ...conversation, providerSandboxId: sandboxId })
        },
        bindMessage: (messageId: string) => store.bindBuilderRunMessage(claimed.builderRunId, messageId),
        recordCandidate: async (sourceRevision: string) => {
          await store.recordBuilderRunCandidate(claimed.builderRunId, sourceRevision)
          candidateRecorded = true
        },
        recordMirror: (head: string) => store.recordConversationSession({ projectId: claimed.projectId, conversationId: claimed.conversationId, mirrorHead: head, syncedMain: claimed.baseSourceRevision, turnEnded: true }),
      })
      if (result.kind === 'SOURCE_ADMITTED') unadmittedAgentRun = null
      if (result.projectId !== claimed.projectId || result.executionId !== claimed.builderRunId || result.baseSourceRevision !== claimed.baseSourceRevision) throw new Error('BUILDER_RUNTIME_RESULT_SCOPE_REFUSED')
      if (result.kind === 'PARKED') {
        if (controller.signal.aborted) throw new Error('BUILDER_RUN_CANCELLED')
        await setPhase('PARKED')
        await closeSession()
        // The leg is over: an answer starts the next one, which this entry must not shadow.
        builderActive.delete(run.builderRunId)
        endParking(true)
        return
      }
      if (result.kind === 'RESPONSE_ONLY') {
        if (controller.signal.aborted) throw new Error('BUILDER_RUN_CANCELLED')
        await setPhase('FINALIZING')
        await store.settleBuilderRun({ builderRunId: claimed.builderRunId, resultSourceRevision: null, resultKind: 'RESPONSE_ONLY', failureCode: null })
        return
      }
      // The runtime admitted the source by fast forwarding `main` from the base, so a stop arriving
      // now is too late: the run records it and settles admitted.
      const admitted = result.resultSourceRevision
      await store.advanceBuilderRunSource(claimed.builderRunId, admitted)
      // The database refuses a phase once a stop is requested; an admitted run still settles.
      const finalizing = (): Promise<void> => setPhase('FINALIZING').catch(() => undefined)
      const note = (code: string, outcome: RunNote['outcome'], detail?: string): Promise<void> => runs.appendDiagnostic({
        projectId: claimed.projectId, conversationId: claimed.conversationId, builderRunId: claimed.builderRunId, code, outcome, sourceRevision: admitted,
        ...(detail ? { detail } : {}),
      }).catch(() => undefined)
      // Only a build the source broke asks the agent for a fix; a platform fault asking the same
      // teaches it to delete correct code until the fault goes away.
      const buildFailed = (code: string, detail?: string): Promise<void> =>
        note(code, builderFailureCategory(code) === 'APPLICATION_BUILD_FAILED' ? 'BUILD_FAILED' : 'PLATFORM_FAILED', detail)
      // The agent's sandbox already compiled (and smoked) the artifact. A build or smoke failure
      // there still admitted the source, so it settles as a build failure and the last good
      // Preview stays in place.
      if (result.applicationBuild.kind === 'BUILD_FAILED') {
        const { code, detail } = result.applicationBuild
        await finalizing()
        await store.settleBuilderRunBuild({ builderRunId: claimed.builderRunId, sourceRevision: admitted, failureCode: code })
        await buildFailed(code, detail)
        return
      }
      try {
        const artifact = await prepareBuilderRunApplicationArtifact({ applicationArtifacts }, {
          accountId: input.accountId, projectId: claimed.projectId, builderRunId: claimed.builderRunId,
          sourceRevision: admitted,
          compiledApplication: result.applicationBuild.compiledApplication,
        })
        const server = await prepareApplicationServer(applicationServer, result.applicationBuild.compiledApplication)
        if (server?.reset) await note('APPLICATION_PREVIEW_DATA_RESET', 'PREVIEW_DATA_RESET')
        await finalizing()
        await store.settleBuilderRunBuild({ builderRunId: claimed.builderRunId, sourceRevision: admitted,
          artifactRevisionId: artifact.artifactRevisionId, artifactDigest: artifact.artifactDigest })
        if (result.applicationBuild.compiledApplication.thumbnail && applicationArtifacts.retainApplicationThumbnail) {
          const thumbnail = result.applicationBuild.compiledApplication.thumbnail
          if (thumbnail.bytes.byteLength > 0 && thumbnail.bytes.byteLength <= 512000) {
            await applicationArtifacts.retainApplicationThumbnail({
              accountId: input.accountId,
              projectId: claimed.projectId,
              executionId: result.applicationBuild.compiledApplication.executionId,
              sourceRevision: admitted,
              artifactRevisionId: artifact.artifactRevisionId,
              mediaType: thumbnail.mediaType,
              bytes: thumbnail.bytes,
            }).catch(() => {
              // Best-effort thumbnail retention: failure to retain does not fail the build settlement.
            })
          }
        }
        if (result.applicationBuild.bootProblems) await note('APPLICATION_BOOT_PROBLEMS', 'BOOT_PROBLEMS', result.applicationBuild.bootProblems)
      } catch (error) {
        const code = failureCode(error)
        if (code === 'BUILDER_RUN_CANCELLED' || code === 'APPLICATION_COMPILER_CANCELLED') throw error
        await finalizing()
        await store.settleBuilderRunBuild({ builderRunId: claimed.builderRunId, sourceRevision: admitted,
          failureCode: code }).catch(() => undefined)
        await buildFailed(code, error instanceof Error && typeof error.cause === 'string' ? error.cause : undefined)
        throw error
      }
    })().catch(async (error) => {
      const code = failureCode(error)
      // Its source may be on main: the run stays running with its candidate until reconciliation settles it.
      if (candidateRecorded && !NOT_ADMITTED.has(code)) {
        reconcileSoon()
        return
      }
      const unadmitted: BuilderRunSummary | null = unadmittedAgentRun
      if (unadmitted) {
        // A refused candidate says why, so the next turn in this conversation can fix it.
        const refused = error instanceof CandidateRefused ? error : null
        await runs.appendDiagnostic({
          projectId: unadmitted.projectId, conversationId: unadmitted.conversationId, builderRunId: unadmitted.builderRunId, code,
          outcome: refused ? 'CANDIDATE_REFUSED' : code === 'BUILDER_SOURCE_BASE_MOVED' ? 'SOURCE_BASE_MOVED' : 'RUN_NOT_FINISHED',
          sourceRevision: unadmitted.baseSourceRevision, ...(refused ? { detail: refused.detail } : {}),
        }).catch(() => undefined)
      }
      // The operator's cancellation or the Hub's own stop aborts this controller, and what the abort surfaces depends
      // on where the run was standing: a phase write the database now refuses is still a cancellation.
      const hubStopping = controller.signal.reason === HUB_STOPPING
      const cancelled = controller.signal.aborted || code === 'BUILDER_RUN_CANCELLED' || code === 'BUILDER_LATE_RESULT_REFUSED' || code === 'APPLICATION_COMPILER_CANCELLED'
      const terminal: SettleTerminal = hubStopping ? 'HUB_RESTART' : cancelled ? 'USER_CANCELLED' : 'FAILED'
      if (terminal === 'HUB_RESTART') {
        await writeEnding(run.builderRunId, () => store.interruptBuilderRun(run.builderRunId, 'HUB_RESTART'))
      } else if (terminal === 'USER_CANCELLED') {
        await writeEnding(run.builderRunId, () => store.interruptBuilderRun(run.builderRunId, 'USER_CANCELLED'))
      } else {
        await writeEnding(run.builderRunId, () => store.failBuilderRun(run.builderRunId, code))
      }
      // The stream that follows the run hears how it ended before its session is closed; the session
      // then lets go of the thread, and only then are the run's open calls settled.
      await publish()
      endPublished = true
      await closeSession()
      await settleRun(run, terminal)
    })
      .finally(async () => {
        if (!endPublished) await publish()
        await closeSession()
        if (builderActive.get(run.builderRunId)?.controller === controller) builderActive.delete(run.builderRunId)
        endParking(false)
      })
    builderActive.set(run.builderRunId, { controller, work, parking, answered: input.resume?.toolCallId })
  }
  const getApplicationBySource = (input: Readonly<{ accountId: string; projectId: string; sourceRevision: string }>): Promise<ApplicationArtifactMetadata | null> => {
    if (applicationShutdown.signal.aborted) return Promise.reject(new Error('BUILDER_APPLICATION_CLOSED'))
    if (!applicationArtifacts.getApplicationBySource) return Promise.resolve(null)
    return applicationArtifacts.getApplicationBySource(input)
  }
  const readApplicationFileBySource = (input: Readonly<{ accountId: string; projectId: string; sourceRevision: string; artifactRevisionId: string; path: string }>): Promise<ApplicationArtifactReadResult | null> => {
    if (applicationShutdown.signal.aborted) return Promise.reject(new Error('BUILDER_APPLICATION_CLOSED'))
    if (!applicationArtifacts.readApplicationFileBySource) return Promise.resolve(null)
    return applicationArtifacts.readApplicationFileBySource(input)
  }
  // A revision the source view may show the caller; `main` counts as read from the Conexus Git now.
  const admitSource = async ({ accountId, projectId }: Readonly<{ accountId: string; projectId: string }>, sourceRevision: string): Promise<boolean> =>
    store.admitSourceRevision({ accountId, projectId, sourceRevision, mainRevision: await runs.git.readMain(projectId).catch(() => null) })
  const close = async (): Promise<void> => {
    if (serviceClosing !== null) return serviceClosing
    serviceClosing = (async () => {
      applicationShutdown.abort()
      await Promise.all([...builderActive.values()].map(({ work }) => work))
      if (reconcileTimer) clearTimeout(reconcileTimer)
      await reconciling
      await store.close()
    })()
    return serviceClosing
  }
  return Object.freeze({
    createBuilderRun: async (input) => {
      if (await runs.conversations.ownerOf(input.projectId, input.conversationId) !== 'PROJECT') throw new Error('BUILDER_CONVERSATION_NOT_FOUND')
      // The base is `main`, read only once the database holds the Project's run lock.
      const run = await store.createBuilderRun({ ...input, readBase: () => runs.git.readMain(input.projectId) })
      if (run.state === 'QUEUED') {
        dispatchBuilderRun(run, input)
      }
      return run
    },
    cancelBuilderRun: async (input) => {
      const result = await store.requestBuilderRunCancellation(input)
      const leg = builderActive.get(input.builderRunId)
      leg?.controller.abort()
      // With a leg, its catch settles once the leg has let go of the thread.
      if (!leg && result.state === 'INTERRUPTED') await settleRun(result, 'USER_CANCELLED')
      await publishRun(result)
      return result
    },
    answerBuilderRun: async ({ accountId, projectId, builderRunId, toolCallId, resumeData }) => {
      const latest = await store.readBuilderRun({ accountId, projectId })
      if (latest?.builderRunId !== builderRunId) return 'NOT_PARKED'
      const answeredByLeg = (): boolean => builderActive.get(builderRunId)?.answered === toolCallId
      const leg = builderActive.get(builderRunId)
      if (leg) {
        if (answeredByLeg()) return 'ALREADY_ANSWERED'
        // The question can be answered the moment it is asked, while the leg is still releasing what it held.
        if (!await leg.parking) return 'NOT_PARKED'
      }
      // The call is checked before the run leaves PARKED: a leg resumed on a call the thread does
      // not hold fails, and the run's question is lost with it.
      const standing = await runs.findParkedCall({ projectId, conversationId: latest.conversationId, toolCallId })
      switch (standing) {
        case 'ANSWERED': return 'ALREADY_ANSWERED'
        case 'ABSENT': return 'NOT_PARKED'
        case 'PARKED': break
        default: { const unhandled: never = standing; return unhandled }
      }
      const resumed = await store.resumeBuilderRun(builderRunId)
      // Another answer took the run out of PARKED since the check.
      if (!resumed) return answeredByLeg() ? 'ALREADY_ANSWERED' : 'NOT_PARKED'
      dispatchBuilderRun(resumed, { accountId, content: resumed.requestText ?? '', resume: { toolCallId, resumeData } })
      return 'RESUMED'
    },
    listSourceTree: async (input) => {
      if (!await admitSource(input, input.sourceRevision)) throw new Error('BUILDER_SOURCE_SUBJECT_NOT_FOUND')
      return runs.source.listSourceTree(input.projectId, input.sourceRevision)
    },
    getSourceFile: async (input) => {
      if (!await admitSource(input, input.sourceRevision)) throw new Error('BUILDER_SOURCE_SUBJECT_NOT_FOUND')
      return runs.source.readSourceFile(input.projectId, input.sourceRevision, input.path)
    },
    compareSourceRevisions: async (input) => {
      const admitted = await Promise.all([admitSource(input, input.baseSourceRevision), admitSource(input, input.resultSourceRevision)])
      if (!admitted[0] || !admitted[1]) throw new Error('BUILDER_SOURCE_SUBJECT_NOT_FOUND')
      return runs.source.compareRevisions(input.projectId, input.baseSourceRevision, input.resultSourceRevision)
    },
    getApplicationBySource,
    readApplicationFileBySource,
    recover: async () => {
      if ((await recover(new Set())).length) reconcileSoon()
      for (const run of await store.recoverBuilderRuns()) await settleRun(run, 'HUB_RESTART')
    },
    stopLegs: () => { for (const { controller } of builderActive.values()) controller.abort(HUB_STOPPING) },
    close,
  })
}
