import { randomUUID } from 'node:crypto'
import type { ConexusGit } from './conexus-git.js'
import type { Conversations } from './conversations.js'
import { settleTakenOverCandidate } from './run/admit.js'
import type { BuilderRunPorts, DiagnosticAppender } from './run/ports.js'
import type { AnswerOutcome } from './run/question.js'
import { type LiveRun, startRun } from './run/run.js'
import type { BuilderSourceComparison, BuilderSourceFile, BuilderSourceTree, ProjectSourceReads } from './source.js'
import type { BuilderRunSummary, BuilderStore } from './store.js'
import type { ApplicationArtifactMetadata, ApplicationArtifactReadResult, ApplicationServerPort, BuilderApplicationArtifacts } from './application-build.js'
import { Failure, logFailure, toFailure } from '../platform/failure.js'
import { logLine, logger } from '../platform/logger.js'
import { heapUsedRatio } from '../platform/heap.js'

type SourceCoordinates = Readonly<{ accountId: string; projectId: string; sourceRevision: string }>

export type BuilderService = Readonly<{
  /**
   * The person's message in a conversation. A run of it waiting on the person takes it (`created`
   * false); with no run, it starts one. A run that is working answers BUILDER_BUSY.
   */
  sendBuilderMessage(input: Readonly<{ accountId: string; projectId: string; conversationId: string; idempotencyKey: string; content: string }>): Promise<Readonly<{ builderRun: BuilderRunSummary; created: boolean }>>
  cancelBuilderRun(input: Readonly<{ accountId: string; projectId: string; builderRunId: string }>): Promise<BuilderRunSummary>
  /** The person's answer to the question the conversation's run waits on. */
  answerQuestion(input: Readonly<{ projectId: string; conversationId: string; toolCallId: string; resumeData: unknown }>): AnswerOutcome
  listSourceTree(input: SourceCoordinates): Promise<BuilderSourceTree>
  getSourceFile(input: SourceCoordinates & Readonly<{ path: string }>): Promise<BuilderSourceFile>
  compareSourceRevisions(input: Readonly<{ accountId: string; projectId: string; baseSourceRevision: string; resultSourceRevision: string }>): Promise<BuilderSourceComparison>
  getApplicationBySource(input: SourceCoordinates): Promise<ApplicationArtifactMetadata | null>
  readApplicationFileBySource(input: SourceCoordinates & Readonly<{ artifactRevisionId: string; path: string }>): Promise<ApplicationArtifactReadResult | null>
  /** Refreshes the heartbeat of every run this Hub works, so no sweep takes it over. */
  heartbeat(): Promise<void>
  /**
   * Takes over every run whose owner went quiet (a crash, a restart, or an ending whose write
   * failed) and settles it from the database and the Conexus Git alone. A run a sweep could not
   * settle is taken over again by a later one.
   */
  sweep(): Promise<void>
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
  publishRun(run: BuilderRunSummary): Promise<void>
  /** How long a question waits for the person before its run ends. */
  questionWaitMs: number
  /** The wait before a failed ending write is tried again; it is tried three times. */
  settleRetryMs?: number
  /** How long a run's owner may go without a heartbeat before a sweep takes the run over. */
  staleAfterMs?: number
  /** This Hub process as the owner of the runs it works; a new one at every start. */
  ownerId?: string
  /** Used heap over the old-space cap, read once as a run is asked for. */
  heapUsedRatio?: () => number
}>

/** Three heartbeats missed. */
const RUN_STALE_AFTER_MS = 30_000
/**
 * Above this a new run is refused. The heap watch warns at 0.8 held over two samples 15 s apart;
 * this is one read, which can land on a peak before a collection, so it sits above that. What is left
 * of a 512 MB cap, about 77 MB, is for the runs already working, waiting ones included.
 */
const HEAP_REFUSE_RATIO = 0.85

/**
 * Settles each run whose owner went quiet from the database and the Conexus Git alone. It keeps how
 * each run this Hub took over and has not yet settled lost its owner: a settle that failed leaves the
 * run owned here, so the next sweep takes it from this Hub and must not read that as this Hub's own
 * lost ending.
 */
const createStaleRunSweep = ({ store, git, ownerId, staleAfterMs }: Readonly<{
  store: BuilderStore
  git: BuilderRunDependencies['git']
  ownerId: string
  staleAfterMs: number
}>) => {
  const takenOver = new Map<string, 'SETTLE_LOST' | 'OWNER_GONE'>()
  return async (): Promise<void> => {
    for (const run of await store.takeOverStaleBuilderRuns(ownerId, staleAfterMs)) {
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
  }
}

export const createBuilderService = ({ store, applicationArtifacts, applicationServer, runs: dependencies }: Readonly<{
  store: BuilderStore
  applicationArtifacts: BuilderApplicationArtifacts
  applicationServer?: ApplicationServerPort
  runs: BuilderRunDependencies
}>): BuilderService => {
  const ownerId = dependencies.ownerId ?? randomUUID()
  // The live runs by conversation: the only map of runs in the Hub.
  const runs = new Map<string, LiveRun>()
  const applicationShutdown = new AbortController()
  let serviceClosing: Promise<void> | null = null
  // A browser that misses a publish still reads the run from the builder-session poll, so a failed
  // one never stops a run or a stop request.
  const publishRun = async (run: BuilderRunSummary): Promise<void> => {
    try {
      await dependencies.publishRun(run)
    } catch (error) {
      logFailure(logger, toFailure(error), { 'builder.run_id': run.builderRunId })
    }
  }
  const start = (row: BuilderRunSummary, request: Readonly<{ accountId: string; content: string; idempotencyKey: string }>): void => {
    const live = startRun({
      ports: dependencies.ports, store, applicationArtifacts, applicationServer, appendDiagnostic: dependencies.appendDiagnostic, publishRun,
      ownerId, questionWaitMs: dependencies.questionWaitMs, settleRetryMs: dependencies.settleRetryMs ?? 500,
    }, row, request)
    runs.set(row.conversationId, live)
    void live.done.catch((error: unknown) => {
      logFailure(logger, new Failure('BUILDER_RUN_SETTLE_FAILED', { cause: error }), { 'builder.run_id': row.builderRunId })
    }).finally(() => { if (runs.get(row.conversationId) === live) runs.delete(row.conversationId) })
  }
  const live = (projectId: string, conversationId: string): LiveRun | undefined => {
    const run = runs.get(conversationId)
    return run?.projectId === projectId ? run : undefined
  }
  const unlessClosed = <T>(read: () => Promise<T>): Promise<T> =>
    applicationShutdown.signal.aborted ? Promise.reject(new Failure('BUILDER_APPLICATION_CLOSED')) : read()
  // A revision the source view may show the caller; `main` counts as read from the Conexus Git now.
  const admitSource = async ({ accountId, projectId }: Readonly<{ accountId: string; projectId: string }>, sourceRevision: string): Promise<boolean> =>
    store.admitSourceRevision({ accountId, projectId, sourceRevision, mainRevision: await dependencies.git.readMain(projectId).catch(() => null) })
  return Object.freeze({
    sendBuilderMessage: async (input) => {
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
      await publishRun(result)
      return result
    },
    answerQuestion: ({ projectId, conversationId, toolCallId, resumeData }) => live(projectId, conversationId)?.answer(toolCallId, resumeData) ?? 'ENDED',
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
    heartbeat: async () => {
      if (runs.size > 0) await store.heartbeatBuilderRuns(ownerId, [...runs.values()].map((run) => run.builderRunId))
    },
    sweep: createStaleRunSweep({ store, git: dependencies.git, ownerId, staleAfterMs: dependencies.staleAfterMs ?? RUN_STALE_AFTER_MS }),
    stopRuns: () => { for (const run of runs.values()) run.stop('HUB_STOPPING') },
    close: () => {
      serviceClosing ??= (async () => {
        applicationShutdown.abort()
        await Promise.all([...runs.values()].map((run) => run.done.catch(() => undefined)))
        await store.close()
      })()
      return serviceClosing
    },
  })
}
