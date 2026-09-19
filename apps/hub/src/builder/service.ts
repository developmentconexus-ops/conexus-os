import type { BuilderSourceFile, BuilderSourcePort, BuilderSourceTree } from './source.js'
import type { CodingWorkerRuntime } from './runtime.js'
import type { BuilderRunSummary, BuilderStore } from './store.js'
import { prepareBuilderRunApplicationArtifact } from './application-build.js'
import type { ApplicationArtifactMetadata, ApplicationArtifactReadResult, BuilderApplicationArtifacts } from './application-build.js'
import type { ApplicationCompilerRuntime } from './application-artifact-runtime.js'
import { toBuilderLiveView, type BuilderExecutionPhase, type BuilderLiveView, type BuilderSession } from './runtime.js'
import { resolveBuilderModelChoice } from './model-choice.js'
import type { ModelChoice } from '../model-connection/model-catalog.js'

export type BuilderService = Readonly<{
  createBuilderRun(input: Readonly<{ accountId: string; projectId: string; idempotencyKey: string; content: string; mode: 'BUILD' | 'PLAN'; modelChoiceId?: string }>): Promise<BuilderRunSummary>
  cancelBuilderRun(input: Readonly<{ accountId: string; projectId: string; builderRunId: string }>): Promise<BuilderRunSummary>
  listSourceTree(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string }>): Promise<BuilderSourceTree>
  getSourceFile(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string; path: string }>): Promise<BuilderSourceFile>
  getApplicationBySource(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string }>): Promise<ApplicationArtifactMetadata | null>
  readApplicationFileBySource(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string; artifactRevisionId: string; path: string }>): Promise<ApplicationArtifactReadResult | null>
  observeBuilderRun(input: Readonly<{ projectId: string; builderRunId: string }>): Promise<ReadableStream<string> | null>
  recover(): Promise<void>
  close(): Promise<void>
}>

const terminalPhases = new Set<BuilderExecutionPhase>(['SUCCEEDED', 'FAILED', 'INTERRUPTED'])
type PersistedBuilderPhase = Exclude<BuilderExecutionPhase, 'SUCCEEDED' | 'FAILED' | 'INTERRUPTED'>
const persistedPhases = new Set<PersistedBuilderPhase>(['PREPARING', 'AGENT', 'SOURCE_ADMISSION', 'COMPILING', 'FINALIZING'])
const isPersistedPhase = (phase: BuilderExecutionPhase): phase is PersistedBuilderPhase => persistedPhases.has(phase as PersistedBuilderPhase)

type LiveListener = (view: BuilderLiveView) => void

type BuilderRunObservation = Readonly<{
  setPhase(phase: BuilderExecutionPhase): Promise<void>
  attachSession(session: BuilderSession): () => void
  subscribe(listener: LiveListener): () => void
  stream(disposeSessionOnCancel?: boolean): ReadableStream<string>
}>

const createBuilderRunObservation = (persistPhase?: (phase: PersistedBuilderPhase) => Promise<void>): BuilderRunObservation => {
  let phase: BuilderExecutionPhase = 'PREPARING'
  let view: BuilderLiveView = { phase, running: true, message: null, activities: [] }
  let detachSession = () => {}
  const listeners = new Set<LiveListener>()
  const notify = (): void => {
    for (const listener of listeners) listener(view)
  }
  const publish = (next: BuilderLiveView): void => {
    view = next
    notify()
  }
  const setPhase = async (nextPhase: BuilderExecutionPhase): Promise<void> => {
    if (isPersistedPhase(nextPhase)) await persistPhase?.(nextPhase)
    phase = nextPhase
    publish({ ...view, phase, running: !terminalPhases.has(phase) })
  }
  const attachSession = (session: BuilderSession): (() => void) => {
    detachSession()
    phase = 'AGENT'
    const update = (displayState: Parameters<typeof toBuilderLiveView>[0]): void => {
      publish(toBuilderLiveView(displayState, phase))
    }
    const unsubscribe = session.subscribe((event) => {
      if (event.type === 'display_state_changed') update(event.displayState)
    })
    update(session.displayState.get())
    let detached = false
    const detach = (): void => {
      if (detached) return
      detached = true
      unsubscribe()
      if (detachSession === detach) detachSession = () => {}
    }
    detachSession = detach
    return detach
  }
  const subscribe = (listener: LiveListener): (() => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }
  const stream = (disposeSessionOnCancel = false): ReadableStream<string> => {
    let closed = false
    let unsubscribe = () => {}
    return new ReadableStream<string>({
      start(controller) {
        const emit = (next: BuilderLiveView): void => {
          if (closed) return
          controller.enqueue(`data: ${JSON.stringify(next)}\n\n`)
          if (terminalPhases.has(next.phase)) {
            closed = true
            unsubscribe()
            controller.close()
          }
        }
        emit(view)
        if (!closed) unsubscribe = subscribe(emit)
      },
      cancel() {
        closed = true
        unsubscribe()
        if (disposeSessionOnCancel) detachSession()
      },
    })
  }
  return Object.freeze({ setPhase, attachSession, subscribe, stream })
}

export const createBuilderService = ({ store, source, runtime, compiler, applicationArtifacts, modelChoices = [], requiresModelConnection = false, appendDiagnostic }: Readonly<{
  store: BuilderStore
  source: BuilderSourcePort
  runtime: CodingWorkerRuntime
  compiler: ApplicationCompilerRuntime
  applicationArtifacts: BuilderApplicationArtifacts
  modelChoices?: readonly ModelChoice[]
  requiresModelConnection?: boolean
  appendDiagnostic?: (input: Readonly<{ projectId: string; builderRunId: string; code: string }>) => Promise<void>
}>): BuilderService => {
  if (runtime.kind !== 'REMOTE_E2B') throw new Error('BUILDER_LOCAL_RUNTIME_REFUSED')
  const builderActive = new Map<string, Readonly<{ controller: AbortController; work: Promise<void>; observation: BuilderRunObservation }>>()
  const availableModelChoices: readonly ModelChoice[] = modelChoices.length > 0 ? modelChoices : [
    { choiceId: runtime.modelIdentity.admissionId, label: runtime.modelIdentity.modelId, providerId: runtime.modelIdentity.providerId, modelId: runtime.modelIdentity.modelId, capabilities: ['BUILDER_CODING'] },
  ]
  const applicationShutdown = new AbortController()
  let serviceClosing: Promise<void> | null = null
  const failureCode = (error: unknown): string => {
    const code = error instanceof Error ? error.message : ''
    return /^[A-Z0-9_]{1,120}$/.test(code) ? code : 'BUILDER_PREPARATION_FAILED'
  }
  const dispatchBuilderRun = (run: BuilderRunSummary, input: Readonly<{ accountId: string; content: string }>): void => {
    if (builderActive.has(run.builderRunId)) return
    const controller = new AbortController()
    const persistPhase = typeof store.setBuilderRunPhase === 'function'
      ? (phase: PersistedBuilderPhase): Promise<void> => store.setBuilderRunPhase(run.builderRunId, phase)
      : undefined
    const observation = createBuilderRunObservation(persistPhase)
    const work = (async () => {
      const modelIdentity = run.modelAdmissionId && run.modelProviderId && run.modelId
        ? { admissionId: run.modelAdmissionId, providerId: run.modelProviderId, modelId: run.modelId }
        : runtime.modelIdentity
      const claimed = await store.claimBuilderRun(run.builderRunId, modelIdentity)
      if (requiresModelConnection && (!claimed.modelConnectionId || !claimed.modelCredentialGeneration)) throw new Error('MODEL_CONNECTION_REQUIRED')
      await observation.setPhase('PREPARING')
      const sourceBundle = await source.prepareProjectSource({
        projectId: claimed.projectId, executionId: claimed.builderRunId, sourceRevision: claimed.baseSourceRevision,
      })
      const result = await runtime.execute({
        projectId: claimed.projectId, executionId: claimed.builderRunId, intent: input.content,
        mode: claimed.mode, baseSourceRevision: claimed.baseSourceRevision, sourceBundle, modelIdentity,
        ...(claimed.modelConnectionId && claimed.modelCredentialGeneration
          ? { credentialReference: { connectionId: claimed.modelConnectionId, generation: claimed.modelCredentialGeneration } }
          : {}),
        signal: controller.signal,
        setPhase: observation.setPhase,
        onSession: observation.attachSession,
        bindPhysicalSandbox: (sandboxId) => store.bindBuilderRunSandbox(claimed.builderRunId, sandboxId),
        bindMessage: (messageId) => store.bindBuilderRunMessage(claimed.builderRunId, messageId),
      })
      if (result.projectId !== claimed.projectId || !('executionId' in result) || result.executionId !== claimed.builderRunId || result.baseSourceRevision !== claimed.baseSourceRevision) throw new Error('BUILDER_RUNTIME_RESULT_SCOPE_REFUSED')
      if (result.kind === 'RESPONSE_ONLY') {
        if (controller.signal.aborted) throw new Error('BUILDER_RUN_CANCELLED')
        await observation.setPhase('FINALIZING')
        await store.settleBuilderRun({ builderRunId: claimed.builderRunId, resultSourceRevision: null, resultKind: 'RESPONSE_ONLY', failureCode: null })
        await observation.setPhase('SUCCEEDED')
        return
      }
      await observation.setPhase('SOURCE_ADMISSION')
      if (controller.signal.aborted) throw new Error('BUILDER_RUN_CANCELLED')
      const admitted = await source.admitSourceResult({
        projectId: claimed.projectId, executionId: claimed.builderRunId,
        baseSourceRevision: claimed.baseSourceRevision, claimedResultSourceRevision: result.claimedResultSourceRevision,
        resultBundle: result.resultBundle,
      })
      if (controller.signal.aborted) throw new Error('BUILDER_RUN_CANCELLED')
      await store.advanceBuilderRunSource(claimed.builderRunId, admitted.resultSourceRevision)
      if (claimed.mode === 'PLAN') throw new Error('BUILDER_PLAN_SOURCE_RESULT_REFUSED')
      await observation.setPhase('COMPILING')
      try {
        const artifact = await prepareBuilderRunApplicationArtifact({ source, compiler, applicationArtifacts }, {
          accountId: input.accountId, projectId: claimed.projectId, builderRunId: claimed.builderRunId,
          sourceRevision: admitted.resultSourceRevision,
          signal: controller.signal,
        })
        if (controller.signal.aborted) throw new Error('BUILDER_RUN_CANCELLED')
        await observation.setPhase('FINALIZING')
        await store.settleBuilderRunBuild({ builderRunId: claimed.builderRunId, sourceRevision: admitted.resultSourceRevision,
          artifactRevisionId: artifact.artifactRevisionId, artifactDigest: artifact.artifactDigest })
        await observation.setPhase('SUCCEEDED')
      } catch (error) {
        const code = failureCode(error)
        if (code === 'BUILDER_RUN_CANCELLED' || code === 'APPLICATION_COMPILER_CANCELLED') throw error
        await observation.setPhase('FINALIZING')
        await store.settleBuilderRunBuild({ builderRunId: claimed.builderRunId, sourceRevision: admitted.resultSourceRevision,
          failureCode: code }).catch(() => undefined)
        if (appendDiagnostic) {
          await appendDiagnostic({ projectId: claimed.projectId, builderRunId: claimed.builderRunId, code }).catch(() => undefined)
        }
        throw error
      }
    })().catch(async (error) => {
      const code = failureCode(error)
      if (code === 'BUILDER_RUN_CANCELLED' || code === 'BUILDER_LATE_RESULT_REFUSED' || code === 'APPLICATION_COMPILER_CANCELLED') {
        await store.interruptBuilderRun(run.builderRunId, 'USER_CANCELLED').catch(() => undefined)
        await observation.setPhase('INTERRUPTED')
      } else {
        await store.failBuilderRun(run.builderRunId, code).catch(() => undefined)
        await observation.setPhase('FAILED')
      }
    })
      .finally(() => { builderActive.delete(run.builderRunId) })
    builderActive.set(run.builderRunId, { controller, work, observation })
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
  const close = async (): Promise<void> => {
    if (serviceClosing !== null) return serviceClosing
    serviceClosing = (async () => {
      applicationShutdown.abort()
      await Promise.all([...builderActive.values()].map(({ work }) => work))
      await store.close()
    })()
    return serviceClosing
  }
  return Object.freeze({
    createBuilderRun: async (input) => {
      const resolved = resolveBuilderModelChoice(availableModelChoices, input.modelChoiceId)
      const run = await store.createBuilderRun({ ...input, modelIdentity: resolved.identity })
      if (run.state === 'QUEUED') dispatchBuilderRun(run, input)
      return run
    },
    cancelBuilderRun: async (input) => {
      const result = await store.requestBuilderRunCancellation(input)
      builderActive.get(input.builderRunId)?.controller.abort()
      return result
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
    getApplicationBySource,
    readApplicationFileBySource,
    observeBuilderRun: async ({ projectId, builderRunId }) => {
      const active = builderActive.get(builderRunId)
      if (active) return active.observation.stream()
      const session = await runtime.getSessionByResource?.(projectId, `builder:${builderRunId}`)
      if (!session) return null
      const observation = createBuilderRunObservation()
      observation.attachSession(session)
      return observation.stream(true)
    },
    recover: async () => {
      await store.recoverAndListQueuedBuilderRuns()
    },
    close,
  })
}
