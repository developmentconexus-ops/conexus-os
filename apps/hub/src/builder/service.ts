import type { BuilderSourceFile, BuilderSourcePort, BuilderSourceTree } from './source.js'
import type { CodingWorkerRuntime } from './runtime.js'
import type { BuilderRunSummary, BuilderStore, ChangeProjection, ClaimedChange } from './store.js'
import { prepareApplicationArtifact, prepareBuilderRunApplicationArtifact } from './application-build.js'
import type { ApplicationArtifactMetadata, ApplicationArtifactReadRequest, ApplicationArtifactReadResult, ApplicationBuildRequest, BuilderApplicationArtifacts } from './application-build.js'
import type { ApplicationCompilerRuntime } from './application-artifact-runtime.js'
import { createPreviewPreparationCoordinator } from './preview-preparation.js'
import type { PreviewPreparation, PreviewPreparationRequest } from './preview-preparation.js'
import { randomUUID } from 'node:crypto'
import { parseObservationEvent, type BuilderObservation } from '../../../../packages/builder-observation/src/index.mjs'
import { createObservationFeed } from './observation-feed.js'

export type BuilderService = Readonly<{
  createBuilderRun(input: Readonly<{ accountId: string; projectId: string; idempotencyKey: string; content: string; mode: 'BUILD' | 'PLAN' }>): Promise<BuilderRunSummary>
  createChange(input: Readonly<{ accountId: string; projectId: string; idempotencyKey: string; intent: string; expectedSourceRevision: string }>): Promise<ChangeProjection>
  listSourceTree(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string }>): Promise<BuilderSourceTree>
  getSourceFile(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string; path: string }>): Promise<BuilderSourceFile>
  prepareApplication(input: ApplicationBuildRequest): Promise<ApplicationArtifactMetadata>
  readApplicationFile(input: ApplicationArtifactReadRequest): Promise<ApplicationArtifactReadResult | null>
  getApplication(input: Readonly<{ accountId: string; projectId: string; builderRunId: string; sourceRevision: string }>): Promise<ApplicationArtifactMetadata | null>
  getApplicationBySource(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string }>): Promise<ApplicationArtifactMetadata | null>
  readApplicationFileBySource(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string; artifactRevisionId: string; path: string }>): Promise<ApplicationArtifactReadResult | null>
  startPreviewPreparation(input: PreviewPreparationRequest): Promise<PreviewPreparation>
  readPreviewPreparation(input: PreviewPreparationRequest): Promise<PreviewPreparation | null>
  observeChange(input: Readonly<{ projectId: string; changeId: string }>): ReadableStream<string> | null
  observeBuilderRun(input: Readonly<{ projectId: string; builderRunId: string }>): ReadableStream<string> | null
  recover(): Promise<void>
  close(): Promise<void>
}>

export const createBuilderService = ({ store, source, runtime, compiler, applicationArtifacts }: Readonly<{
  store: BuilderStore
  source: BuilderSourcePort
  runtime: CodingWorkerRuntime
  compiler: ApplicationCompilerRuntime
  applicationArtifacts: BuilderApplicationArtifacts
}>): BuilderService => {
  if (runtime.kind !== 'REMOTE_E2B') throw new Error('BUILDER_LOCAL_RUNTIME_REFUSED')
  const active = new Map<string, Promise<void>>()
  const observations = new Map<string, Readonly<{
    projectId: string
    finished: boolean
    feed: ReturnType<typeof createObservationFeed>
    publish(event: BuilderObservation): void
    release(): void
    finish(): void
  }>>()
  const beginObservation = (projectId: string, changeId: string) => {
    const existing = observations.get(changeId)
    if (existing) return existing
    if (observations.size >= 16) ([...observations.values()].find((item) => item.finished) ?? observations.values().next().value)?.release()
    const feed = createObservationFeed()
    const generation = randomUUID()
    let sequence = 0
    let expiry: NodeJS.Timeout | undefined
    let released = false
    const observation = {
      projectId, feed, finished: false,
      publish: (event: BuilderObservation) => {
        try { feed.publish(`data: ${JSON.stringify(parseObservationEvent({ generation, sequence: ++sequence, event }))}\n\n`) }
        catch { feed.close() }
      },
      release: () => {
        released = true
        clearTimeout(expiry)
        feed.close()
        if (observations.get(changeId) === observation) observations.delete(changeId)
      },
      finish: () => {
        if (released || observation.finished) return
        observation.finished = true
        observation.publish({ kind: 'OBSERVATION_END' })
        feed.finish()
        clearTimeout(expiry)
        expiry = setTimeout(observation.release, 120_000)
        expiry.unref()
      },
    }
    expiry = setTimeout(observation.release, 60 * 60_000)
    expiry.unref()
    observations.set(changeId, observation)
    return observation
  }
  const applicationBuilds = new Set<Promise<ApplicationArtifactMetadata>>()
  const builderActive = new Map<string, Promise<void>>()
  const applicationShutdown = new AbortController()
  let serviceClosing: Promise<void> | null = null
  const failureCode = (error: unknown): string => {
    const code = error instanceof Error ? error.message : ''
    return /^[A-Z0-9_]{1,120}$/.test(code) ? code : 'BUILDER_PREPARATION_FAILED'
  }
  const executeCoding = async (claim: ClaimedChange, observe: (event: BuilderObservation) => void): Promise<string | null> => {
    try {
      const sourceBundle = await source.prepareSource({
        projectId: claim.projectId, actorRunId: claim.actorRunId, sourceRevision: claim.baseSourceRevision,
        sourceChangeId: claim.sourceChangeId, initialSourceRevision: claim.baselineSourceRevision,
      })
      const result = await runtime.execute({
        ...claim, sourceBundle, observe,
        bindPhysicalSandbox: (sandboxId) => store.bindSandbox(claim.actorRunId, claim.admissionToken, sandboxId),
      })
      if (result.projectId !== claim.projectId || !('changeId' in result) || result.changeId !== claim.changeId ||
        result.workUnitId !== claim.workUnitId || result.actorRunId !== claim.actorRunId ||
        result.admissionToken !== claim.admissionToken || result.baseSourceRevision !== claim.baseSourceRevision) {
        throw new Error('BUILDER_RUNTIME_RESULT_SCOPE_REFUSED')
      }
      if (result.kind === 'RESPONSE_ONLY') {
        await store.settleResponse({ ...claim, sandboxId: result.sandboxId, summary: result.summary })
        return null
      }
      const candidate = await source.admitCandidate({
        projectId: claim.projectId, changeId: claim.changeId, actorRunId: claim.actorRunId,
        baseSourceRevision: claim.baseSourceRevision,
        changeBaseSourceRevision: claim.changeBaseSourceRevision ?? claim.baseSourceRevision,
        baselineSourceRevision: claim.baselineSourceRevision, sourceChangeId: claim.sourceChangeId,
        claimedCandidateSourceRevision: result.candidateSourceRevision, resultBundle: result.resultBundle,
      })
      await store.settleResult({
        ...claim, sandboxId: result.sandboxId, ...candidate,
        baseSourceRevision: claim.baseSourceRevision, summary: result.summary,
      })
      return result.candidateSourceRevision
    } catch (error) {
      await store.failRun(claim.actorRunId, claim.admissionToken).catch(() => undefined)
      throw error
    }
  }
  const dispatchBuilderRun = (run: BuilderRunSummary, input: Readonly<{ accountId: string; content: string }>): void => {
    if (builderActive.has(run.builderRunId)) return
    const observation = beginObservation(run.projectId, run.builderRunId)
    const work = (async () => {
      const claimed = await store.claimBuilderRun(run.builderRunId, runtime.modelIdentity)
      observation.publish({ kind: 'PHASE', phase: 'CODING' })
      const sourceBundle = await source.prepareProjectSource({
        projectId: claimed.projectId, executionId: claimed.builderRunId, sourceRevision: claimed.baseSourceRevision,
      })
      const result = await runtime.execute({
        accountId: input.accountId, projectId: claimed.projectId, executionId: claimed.builderRunId, intent: input.content,
        mode: claimed.mode, baseSourceRevision: claimed.baseSourceRevision, sourceBundle,
        bindPhysicalSandbox: (sandboxId) => store.bindBuilderRunSandbox(claimed.builderRunId, sandboxId),
        bindMessage: (messageId) => store.bindBuilderRunMessage(claimed.builderRunId, messageId),
        observe: (event) => observation.publish(event),
      })
      if (result.projectId !== claimed.projectId || !('executionId' in result) || result.executionId !== claimed.builderRunId || result.baseSourceRevision !== claimed.baseSourceRevision) throw new Error('BUILDER_RUNTIME_RESULT_SCOPE_REFUSED')
      if (result.kind === 'RESPONSE_ONLY') {
        await store.settleBuilderRun({ builderRunId: claimed.builderRunId, resultSourceRevision: null, resultKind: 'RESPONSE_ONLY', failureCode: null })
        return
      }
      const admitted = await source.admitSourceResult({
        projectId: claimed.projectId, executionId: claimed.builderRunId,
        baseSourceRevision: claimed.baseSourceRevision, claimedResultSourceRevision: result.resultSourceRevision,
        resultBundle: result.resultBundle,
      })
      if (admitted.resultSourceRevision !== result.resultSourceRevision) throw new Error('BUILDER_RESULT_IDENTITY_REFUSED')
      await store.advanceBuilderRunSource(claimed.builderRunId, admitted.resultSourceRevision)
      if (claimed.mode === 'PLAN') throw new Error('BUILDER_PLAN_SOURCE_RESULT_REFUSED')
      try {
        const artifact = await prepareBuilderRunApplicationArtifact({ source, compiler, applicationArtifacts }, {
          accountId: input.accountId, projectId: claimed.projectId, builderRunId: claimed.builderRunId,
          sourceRevision: admitted.resultSourceRevision,
        })
        await store.settleBuilderRunBuild({ builderRunId: claimed.builderRunId, sourceRevision: admitted.resultSourceRevision,
          artifactRevisionId: artifact.artifactRevisionId, artifactDigest: artifact.artifactDigest })
      } catch (error) {
        await store.settleBuilderRunBuild({ builderRunId: claimed.builderRunId, sourceRevision: admitted.resultSourceRevision,
          failureCode: failureCode(error) }).catch(() => undefined)
        throw error
      }
    })().catch(async (error) => { await store.failBuilderRun(run.builderRunId, failureCode(error)).catch(() => undefined) })
      .finally(() => { builderActive.delete(run.builderRunId); observation.finish() })
    builderActive.set(run.builderRunId, work)
  }
  const dispatch = (changeId: string, projectId?: string): void => {
    if (active.has(changeId)) return
    let observation = projectId ? beginObservation(projectId, changeId) : undefined
    const work = (async () => {
      const claim = await store.claimChange(changeId, runtime.modelIdentity)
      observation ??= beginObservation(claim.projectId, changeId)
      observation.publish({ kind: 'PHASE', phase: 'CODING' })
      let observing = true
      const sink = observation
      let sourceRevision: string | null
      try {
        sourceRevision = await executeCoding(claim, (event) => {
          if (observing) sink.publish(event)
        })
      } finally { observing = false }
      if (sourceRevision === null) return
      observation.publish({ kind: 'PHASE', phase: 'PREPARING' })
      const input = { accountId: claim.accountId, projectId: claim.projectId, changeId, sourceRevision }
      try {
        const artifact = await prepareApplication(input)
        await store.settlePreparation({ ...input, outcome: {
          kind: 'READY', artifactRevisionId: artifact.artifactRevisionId, artifactDigest: artifact.artifactDigest,
        } })
      } catch (error) {
        await store.settlePreparation({ ...input, outcome: { kind: 'FAILED', code: failureCode(error) } })
        throw error
      }
    })().catch(() => { observation?.publish({ kind: 'OBSERVATION_UNAVAILABLE', code: 'RUNTIME_FAILED' }) }).finally(() => { active.delete(changeId); observation?.finish() })
    active.set(changeId, work)
  }
  const prepareApplication = async (input: ApplicationBuildRequest): Promise<ApplicationArtifactMetadata> => {
    if (applicationShutdown.signal.aborted) throw new Error('BUILDER_APPLICATION_CLOSED')
    const signal = input.signal
      ? AbortSignal.any([input.signal, applicationShutdown.signal])
      : applicationShutdown.signal
    const work = prepareApplicationArtifact({ store, source, compiler, applicationArtifacts }, { ...input, signal })
    applicationBuilds.add(work)
    try { return await work } finally { applicationBuilds.delete(work) }
  }
  const readApplicationFile = (input: ApplicationArtifactReadRequest): Promise<ApplicationArtifactReadResult | null> => {
    if (applicationShutdown.signal.aborted) return Promise.reject(new Error('BUILDER_APPLICATION_CLOSED'))
    return applicationArtifacts.readApplicationFile(input)
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
  const getApplication = (input: Readonly<{ accountId: string; projectId: string; builderRunId: string; sourceRevision: string }>): Promise<ApplicationArtifactMetadata | null> => {
    if (applicationShutdown.signal.aborted) return Promise.reject(new Error('BUILDER_APPLICATION_CLOSED'))
    return applicationArtifacts.getApplication({ accountId: input.accountId, projectId: input.projectId, executionId: input.builderRunId, sourceRevision: input.sourceRevision })
  }
  const previewPreparation = createPreviewPreparationCoordinator({
    readPreviewSubject: (input) => store.readPreviewSubject(input),
    prepareApplication,
    readRetainedApplication: (input) => applicationArtifacts.getApplication(input),
  })
  const close = async (): Promise<void> => {
    if (serviceClosing !== null) return serviceClosing
    serviceClosing = (async () => {
      applicationShutdown.abort()
      for (const observation of observations.values()) observation.release()
      await previewPreparation.close()
      await Promise.allSettled(applicationBuilds)
      await Promise.all(builderActive.values())
      await Promise.all(active.values())
      await store.close()
    })()
    return serviceClosing
  }
  return Object.freeze({
    createBuilderRun: async (input) => {
      const run = await store.createBuilderRun(input)
      if (run.state === 'QUEUED') dispatchBuilderRun(run, input)
      return run
    },
    createChange: async (input) => {
      const change = await store.createChange(input)
      if (change.state === 'QUEUED') dispatch(change.changeId, change.projectId)
      return change
    },
    listSourceTree: async (input) => {
      if (!await store.admitSourceRevision(input)) throw new Error('BUILDER_SOURCE_SUBJECT_NOT_FOUND')
      return source.listSourceTree({ projectId: input.projectId, sourceRevision: input.sourceRevision })
    },
    getSourceFile: async (input) => {
      if (!await store.admitSourceRevision(input)) throw new Error('BUILDER_SOURCE_SUBJECT_NOT_FOUND')
      return source.readSourceFile({
        projectId: input.projectId, sourceRevision: input.sourceRevision, path: input.path,
      })
    },
    prepareApplication,
    readApplicationFile,
    getApplication,
    getApplicationBySource,
    readApplicationFileBySource,
    startPreviewPreparation: previewPreparation.start,
    readPreviewPreparation: previewPreparation.read,
    observeChange: ({ projectId, changeId }) => {
      const observation = observations.get(changeId)
      return observation?.projectId === projectId ? observation.feed.subscribe() : null
    },
    observeBuilderRun: ({ projectId, builderRunId }) => {
      const observation = observations.get(builderRunId)
      return observation?.projectId === projectId ? observation.feed.subscribe() : null
    },
    recover: async () => {
      for (const changeId of await store.recoverAndListQueued()) dispatch(changeId)
      await store.recoverAndListQueuedBuilderRuns()
    },
    close,
  })
}
