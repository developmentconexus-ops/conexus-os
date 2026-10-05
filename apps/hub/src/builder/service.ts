import type { AccountId, BuilderRunId, ProjectId, SourceComparison, SourceFile, SourceRevision, SourceTree } from '../../../../packages/contract/dist/index.js'
import type { ConexusGit } from './conexus-git.js'
import type { Conversations } from './conversations.js'
import { settleTakenOverCandidate } from './run/admit.js'
import type { RunTools } from './harness/index.js'
import type { BuilderRunPorts, DiagnosticAppender } from './run/ports.js'
import type { AnswerOutcome } from './run/question.js'
import { type LiveRun, startRun } from './run/run.js'
import type { ProjectSourceReads } from './source.js'
import type { BuilderRunSummary, BuilderRunView, BuilderStore, TakenOverRun } from './store.js'
import type { ApplicationArtifactMetadata, ApplicationSourceCoordinates, ApplicationArtifactReadResult, ApplicationServerPort, BuilderApplicationArtifacts } from './application-build.js'
import { Failure, logFailure, toFailure } from '../platform/failure.js'
import { logLine, logger } from '../platform/logger.js'
import { heapUsedRatio } from '../platform/heap.js'

type SourceCoordinates = Readonly<{ accountId: AccountId; projectId: ProjectId; sourceRevision: SourceRevision }>

export type BuilderService = Readonly<{
  /**
   * The person's message in a conversation. A run of it waiting on the person takes it (`created`
   * false); with no run, it starts one. A run that is working answers BUILDER_BUSY.
   */
  sendBuilderMessage(input: Readonly<{ accountId: AccountId; projectId: ProjectId; conversationId: string; idempotencyKey: string; content: string }>): Promise<Readonly<{ builderRun: BuilderRunSummary; created: boolean }>>
  cancelBuilderRun(input: Readonly<{ accountId: AccountId; projectId: ProjectId; builderRunId: BuilderRunId }>): Promise<BuilderRunSummary>
  /** The person's answer to the question the conversation's run waits on. */
  answerQuestion(input: Readonly<{ projectId: ProjectId; conversationId: string; toolCallId: string; resumeData: unknown }>): AnswerOutcome
  /** The calls the conversation's run in this Hub waits on the person for; none when no run here waits. */
  pendingCalls(projectId: ProjectId, conversationId: string): readonly string[]
  /** The tools of the conversation's run, while that run is the one in this Hub. */
  runTools(conversationId: string, builderRunId: BuilderRunId): RunTools | undefined
  /** Whether the conversation has a run in this Hub. */
  runOpen(conversationId: string): boolean
  listSourceTree(input: SourceCoordinates): Promise<SourceTree>
  getSourceFile(input: SourceCoordinates & Readonly<{ path: string }>): Promise<SourceFile>
  compareSourceRevisions(input: Readonly<{ accountId: AccountId; projectId: ProjectId; baseSourceRevision: SourceRevision; resultSourceRevision: SourceRevision }>): Promise<SourceComparison>
  getApplicationBySource(input: ApplicationSourceCoordinates): Promise<ApplicationArtifactMetadata | null>
  readApplicationFileBySource(input: ApplicationSourceCoordinates & Readonly<{ artifactRevisionId: string; path: string }>): Promise<ApplicationArtifactReadResult | null>
  /**
   * One pass of the run lease: refreshes the heartbeat of every run this Hub works, and takes over
   * every other run whose owner went quiet (a crash, a restart, or an ending whose write failed),
   * settling it from the database and the Conexus Git alone. A run this Hub works is never taken
   * over by it. A run a pass could not settle is taken over again by a later one.
   */
  renewLease(signal: AbortSignal): Promise<void>
  /** Stops every run for a Hub that is stopping; each ends INTERRUPTED HUB_RESTART. */
  stopRuns(): void
  close(): Promise<void>
}>

// A run works on its Project's repository in the Conexus Git, whose `main` is the admitted source.
export type BuilderRunDependencies = Readonly<{
  ports: BuilderRunPorts
  git: Pick<ConexusGit, 'readMain' | 'mainContains'>
  conversations: Pick<Conversations, 'ownerOf'>
  source: ProjectSourceReads
  appendDiagnostic: DiagnosticAppender
  /** Hands the run, as the builder-session read serves it, to a browser following its conversation. */
  publishRun(run: BuilderRunView): Promise<void>
  /** How long a question waits for the person before its run ends. */
  questionWaitMs: number
  /** The wait before a failed ending write is tried again; it is tried three times. */
  settleRetryMs?: number
  /** How long a run's owner may go without a heartbeat before a lease pass takes the run over. */
  staleAfterMs?: number
  /** Used heap over the old-space cap, read once as a run is asked for. */
  heapUsedRatio?: () => number
}>

/** Three lease passes missed. */
const RUN_STALE_AFTER_MS = 30_000
/**
 * Above this a new run is refused. The heap watch warns at 0.8 held over two samples 15 s apart;
 * this is one read, which can land on a peak before a collection, so it sits above that. What is left
 * of a 512 MB cap, about 77 MB, is for the runs already working, waiting ones included.
 */
const HEAP_REFUSE_RATIO = 0.85

/**
 * One pass of the run lease: renews the heartbeat of the runs this Hub works and settles each run the
 * database took over from an owner that went quiet, from the database and the Conexus Git alone. It
 * keeps how each run this Hub took over and has not yet settled lost its owner: a settle that failed
 * leaves the run owned here, so a later pass takes it from this Hub and must not read that as this
 * Hub's own lost ending. A run that is live in this Hub when its turn to settle comes is skipped: it
 * began after the pass listed the live runs, and it already has a fresh heartbeat.
 */
const createRunLease = ({ store, git, ownerId, staleAfterMs, liveRunIds }: Readonly<{
  store: BuilderStore
  git: BuilderRunDependencies['git']
  ownerId: string
  staleAfterMs: number
  liveRunIds(): readonly BuilderRunId[]
}>) => {
  const takenOver = new Map<string, 'SETTLE_LOST' | 'OWNER_GONE'>()
  const settle = async (run: TakenOverRun): Promise<void> => {
    // This Hub's own run is gone with its ending unwritten; any other owner stopped with its process.
    const loss = takenOver.get(run.builderRunId) ?? (run.previousOwnerId === ownerId ? 'SETTLE_LOST' : 'OWNER_GONE')
    takenOver.set(run.builderRunId, loss)
    logLine('BUILDER_RUN_TAKEN_OVER', { run: run.builderRunId, loss }, 'warn')
    try {
      if (run.candidateRevision) await settleTakenOverCandidate({ store, git }, { ...run, candidateRevision: run.candidateRevision })
      else await (loss === 'SETTLE_LOST' ? store.failBuilderRun(run.builderRunId, 'BUILDER_RUN_SETTLE_LOST') : store.interruptBuilderRun(run.builderRunId, 'HUB_RESTART'))
      takenOver.delete(run.builderRunId)
    } catch (error) {
      logFailure(logger, new Failure('BUILDER_RUN_SWEEP_SETTLE_FAILED', { cause: error }), { 'builder.run_id': run.builderRunId })
    }
  }
  return async (signal: AbortSignal): Promise<void> => {
    if (signal.aborted) return
    for (const run of await store.renewRunLease(ownerId, liveRunIds(), staleAfterMs)) {
      if (signal.aborted) return
      if (!liveRunIds().includes(run.builderRunId)) await settle(run)
    }
  }
}

export const createBuilderService = ({ store, applicationArtifacts, applicationServer, runs: dependencies }: Readonly<{
  store: BuilderStore
  applicationArtifacts: BuilderApplicationArtifacts
  applicationServer?: ApplicationServerPort
  runs: BuilderRunDependencies
}>): BuilderService => {
  const { ownerId } = store
  // The live runs by conversation: the only map of runs in the Hub.
  const runs = new Map<string, LiveRun>()
  const liveRunIds = (): readonly BuilderRunId[] => [...runs.values()].map((live) => live.builderRunId)
  const applicationShutdown = new AbortController()
  let serviceClosing: Promise<void> | null = null
  // A browser that misses a publish still reads the run from the builder-session poll, so a failed
  // one never stops a run or a stop request.
  const publishRun = async (run: BuilderRunView): Promise<void> => {
    try {
      await dependencies.publishRun(run)
    } catch (error) {
      logFailure(logger, toFailure(error), { 'builder.run_id': run.builderRunId })
    }
  }
  const start = (row: BuilderRunSummary, request: Readonly<{ accountId: AccountId; content: string; idempotencyKey: string }>): void => {
    const live = startRun({
      ports: dependencies.ports, store, applicationArtifacts, applicationServer, appendDiagnostic: dependencies.appendDiagnostic, publishRun,
      questionWaitMs: dependencies.questionWaitMs, settleRetryMs: dependencies.settleRetryMs ?? 500,
    }, row, request)
    runs.set(row.conversationId, live)
    void live.done.catch((error: unknown) => {
      logFailure(logger, new Failure('BUILDER_RUN_SETTLE_FAILED', { cause: error }), { 'builder.run_id': row.builderRunId })
    }).finally(() => { if (runs.get(row.conversationId) === live) runs.delete(row.conversationId) })
  }
  const live = (projectId: ProjectId, conversationId: string): LiveRun | undefined => {
    const run = runs.get(conversationId)
    return run?.projectId === projectId ? run : undefined
  }
  const unlessClosed = <T>(read: () => Promise<T>): Promise<T> =>
    applicationShutdown.signal.aborted ? Promise.reject(new Failure('BUILDER_APPLICATION_CLOSED')) : read()
  // A revision the source view may show the caller; `main` counts as read from the Conexus Git now.
  const admitSource = async ({ accountId, projectId }: Readonly<{ accountId: AccountId; projectId: ProjectId }>, sourceRevision: string): Promise<boolean> =>
    store.admitSourceRevision({ accountId, projectId, sourceRevision, mainRevision: await dependencies.git.readMain(projectId).catch(() => null) })
  return Object.freeze({
    sendBuilderMessage: async (input) => {
      await store.admitBuilder(input)
      const waiting = live(input.projectId, input.conversationId)
      if (waiting) {
        if (waiting.message(input.content, input.idempotencyKey) === 'BUSY') throw new Failure('BUILDER_BUSY')
        const builderRun = await store.readBuilderRun({ accountId: input.accountId, projectId: input.projectId })
        if (builderRun?.builderRunId !== waiting.builderRunId) throw new Failure('BUILDER_BUSY')
        return { builderRun, created: false }
      }
      // Near the heap limit a new run could take the Hub down with every run in it.
      const ratio = (dependencies.heapUsedRatio ?? heapUsedRatio)()
      if (ratio > HEAP_REFUSE_RATIO) {
        logLine('BUILDER_RUN_HEAP_PRESSURE', { ratio: Number(ratio.toFixed(3)) }, 'warn')
        throw new Failure('BUILDER_CAPACITY_FULL')
      }
      if (await dependencies.conversations.ownerOf(input.projectId, input.conversationId) !== 'PROJECT') throw new Failure('CONVERSATION_NOT_FOUND')
      // The base is `main`, read only once the database holds the Project's run lock.
      const builderRun = await store.createBuilderRun({ ...input, readBase: () => dependencies.git.readMain(input.projectId) })
      if (builderRun.state === 'QUEUED' && !runs.has(input.conversationId)) start(builderRun, input)
      return { builderRun, created: true }
    },
    cancelBuilderRun: async (input) => {
      const result = await store.requestBuilderRunCancellation(input)
      for (const run of runs.values()) if (run.builderRunId === input.builderRunId) run.stop('USER_CANCELLED')
      await publishRun({ ...result, pendingCalls: [] })
      return result
    },
    answerQuestion: ({ projectId, conversationId, toolCallId, resumeData }) => live(projectId, conversationId)?.answer(toolCallId, resumeData) ?? 'ENDED',
    pendingCalls: (projectId, conversationId) => live(projectId, conversationId)?.pendingCalls() ?? [],
    runTools: (conversationId, builderRunId) => {
      const run = runs.get(conversationId)
      return run?.builderRunId === builderRunId ? run.tools() : undefined
    },
    runOpen: (conversationId) => runs.has(conversationId),
    listSourceTree: async (input) => {
      if (!await admitSource(input, input.sourceRevision)) throw new Failure('SOURCE_REVISION_NOT_FOUND')
      return dependencies.source.listSourceTree(input.projectId, input.sourceRevision)
    },
    getSourceFile: async (input) => {
      if (!await admitSource(input, input.sourceRevision)) throw new Failure('SOURCE_REVISION_NOT_FOUND')
      return dependencies.source.readSourceFile(input.projectId, input.sourceRevision, input.path)
    },
    compareSourceRevisions: async (input) => {
      const admitted = await Promise.all([admitSource(input, input.baseSourceRevision), admitSource(input, input.resultSourceRevision)])
      if (!admitted[0] || !admitted[1]) throw new Failure('SOURCE_REVISION_NOT_FOUND')
      return dependencies.source.compareRevisions(input.projectId, input.baseSourceRevision, input.resultSourceRevision)
    },
    getApplicationBySource: (input) => unlessClosed(async () => (applicationArtifacts.getApplicationBySource ? applicationArtifacts.getApplicationBySource(input) : null)),
    readApplicationFileBySource: (input) => unlessClosed(async () => (applicationArtifacts.readApplicationFileBySource ? applicationArtifacts.readApplicationFileBySource(input) : null)),
    renewLease: createRunLease({ store, git: dependencies.git, ownerId, staleAfterMs: dependencies.staleAfterMs ?? RUN_STALE_AFTER_MS, liveRunIds }),
    stopRuns: () => { for (const run of runs.values()) run.stop('HUB_STOPPING') },
    close: () => {
      serviceClosing ??= (async () => {
        applicationShutdown.abort()
        await Promise.all([...runs.values()].map((run) => run.done.catch(() => undefined)))
      })()
      return serviceClosing
    },
  })
}
