import type { BuilderSourceFile, BuilderSourcePort, BuilderSourceTree } from './source.js'
import type { CodingWorkerRuntime } from './runtime.js'
import type { BuilderRunningPhase, BuilderRunSummary, BuilderStore } from './store.js'
import { prepareBuilderRunApplicationArtifact } from './application-build.js'
import type { ApplicationArtifactMetadata, ApplicationArtifactReadResult, BuilderApplicationArtifacts } from './application-build.js'
import type { ApplicationCompilerRuntime } from './application-artifact-runtime.js'
import { resolveBuilderModelChoice } from './model-choice.js'
import type { ModelOffer } from '../model-connection/paid-models.js'

export type ListModelOffers = (input: Readonly<{ accountId: string; projectId: string }>) => Promise<readonly ModelOffer[]>

export type BuilderService = Readonly<{
  createBuilderRun(input: Readonly<{ accountId: string; projectId: string; idempotencyKey: string; content: string; mode: 'BUILD' | 'PLAN'; modelChoiceId?: string }>): Promise<BuilderRunSummary>
  cancelBuilderRun(input: Readonly<{ accountId: string; projectId: string; builderRunId: string }>): Promise<BuilderRunSummary>
  listSourceTree(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string }>): Promise<BuilderSourceTree>
  getSourceFile(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string; path: string }>): Promise<BuilderSourceFile>
  getApplicationBySource(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string }>): Promise<ApplicationArtifactMetadata | null>
  readApplicationFileBySource(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string; artifactRevisionId: string; path: string }>): Promise<ApplicationArtifactReadResult | null>
  recover(): Promise<void>
  close(): Promise<void>
}>

export const createBuilderService = ({ store, source, runtime, compiler, applicationArtifacts, listModelOffers, appendDiagnostic }: Readonly<{
  store: BuilderStore
  source: BuilderSourcePort
  runtime: CodingWorkerRuntime
  compiler: ApplicationCompilerRuntime
  applicationArtifacts: BuilderApplicationArtifacts
  listModelOffers: ListModelOffers
  appendDiagnostic?: (input: Readonly<{ projectId: string; builderRunId: string; code: string }>) => Promise<void>
}>): BuilderService => {
  if (runtime.kind !== 'REMOTE_E2B') throw new Error('BUILDER_LOCAL_RUNTIME_REFUSED')
  const builderActive = new Map<string, Readonly<{ controller: AbortController; work: Promise<void> }>>()
  const applicationShutdown = new AbortController()
  let serviceClosing: Promise<void> | null = null
  const failureCode = (error: unknown): string => {
    const code = error instanceof Error ? error.message : ''
    return /^[A-Z0-9_]{1,120}$/.test(code) ? code : 'BUILDER_PREPARATION_FAILED'
  }
  const dispatchBuilderRun = (run: BuilderRunSummary, input: Readonly<{ accountId: string; content: string }>): void => {
    if (builderActive.has(run.builderRunId)) return
    const controller = new AbortController()
    // The browser reads run.phase from the builder-session poll; the live turn itself is Mastra's.
    const setPhase = async (phase: BuilderRunningPhase): Promise<void> => {
      if (typeof store.setBuilderRunPhase === 'function') await store.setBuilderRunPhase(run.builderRunId, phase)
    }
    const work = (async () => {
      if (!run.modelAdmissionId || !run.modelProviderId || !run.modelId) throw new Error('BUILDER_MODEL_ADMISSION_REFUSED')
      const modelIdentity = { admissionId: run.modelAdmissionId, providerId: run.modelProviderId, modelId: run.modelId }
      const claimed = await store.claimBuilderRun(run.builderRunId, modelIdentity)
      if (!claimed.modelConnectionId || !claimed.modelCredentialGeneration) throw new Error('MODEL_CONNECTION_REQUIRED')
      await setPhase('PREPARING')
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
        setPhase,
        bindPhysicalSandbox: (sandboxId) => store.bindBuilderRunSandbox(claimed.builderRunId, sandboxId),
        bindMessage: (messageId) => store.bindBuilderRunMessage(claimed.builderRunId, messageId),
      })
      if (result.projectId !== claimed.projectId || !('executionId' in result) || result.executionId !== claimed.builderRunId || result.baseSourceRevision !== claimed.baseSourceRevision) throw new Error('BUILDER_RUNTIME_RESULT_SCOPE_REFUSED')
      if (result.kind === 'RESPONSE_ONLY') {
        if (controller.signal.aborted) throw new Error('BUILDER_RUN_CANCELLED')
        await setPhase('FINALIZING')
        await store.settleBuilderRun({ builderRunId: claimed.builderRunId, resultSourceRevision: null, resultKind: 'RESPONSE_ONLY', failureCode: null })
        return
      }
      await setPhase('SOURCE_ADMISSION')
      if (controller.signal.aborted) throw new Error('BUILDER_RUN_CANCELLED')
      const admitted = await source.admitSourceResult({
        projectId: claimed.projectId, executionId: claimed.builderRunId,
        baseSourceRevision: claimed.baseSourceRevision, claimedResultSourceRevision: result.claimedResultSourceRevision,
        resultBundle: result.resultBundle,
      })
      if (controller.signal.aborted) throw new Error('BUILDER_RUN_CANCELLED')
      await store.advanceBuilderRunSource(claimed.builderRunId, admitted.resultSourceRevision)
      if (claimed.mode === 'PLAN') throw new Error('BUILDER_PLAN_SOURCE_RESULT_REFUSED')
      await setPhase('COMPILING')
      try {
        const artifact = await prepareBuilderRunApplicationArtifact({ source, compiler, applicationArtifacts }, {
          accountId: input.accountId, projectId: claimed.projectId, builderRunId: claimed.builderRunId,
          sourceRevision: admitted.resultSourceRevision,
          signal: controller.signal,
        })
        if (controller.signal.aborted) throw new Error('BUILDER_RUN_CANCELLED')
        await setPhase('FINALIZING')
        await store.settleBuilderRunBuild({ builderRunId: claimed.builderRunId, sourceRevision: admitted.resultSourceRevision,
          artifactRevisionId: artifact.artifactRevisionId, artifactDigest: artifact.artifactDigest })
      } catch (error) {
        const code = failureCode(error)
        if (code === 'BUILDER_RUN_CANCELLED' || code === 'APPLICATION_COMPILER_CANCELLED') throw error
        await setPhase('FINALIZING')
        await store.settleBuilderRunBuild({ builderRunId: claimed.builderRunId, sourceRevision: admitted.resultSourceRevision,
          failureCode: code }).catch(() => undefined)
        if (appendDiagnostic) {
          await appendDiagnostic({ projectId: claimed.projectId, builderRunId: claimed.builderRunId, code }).catch(() => undefined)
        }
        throw error
      }
    })().catch(async (error) => {
      const code = failureCode(error)
      // Only the operator's cancellation aborts this controller, and what the abort surfaces depends
      // on where the run was standing: a phase write the database now refuses is still a cancellation.
      if (controller.signal.aborted || code === 'BUILDER_RUN_CANCELLED' || code === 'BUILDER_LATE_RESULT_REFUSED' || code === 'APPLICATION_COMPILER_CANCELLED') {
        await store.interruptBuilderRun(run.builderRunId, 'USER_CANCELLED').catch(() => undefined)
      } else {
        await store.failBuilderRun(run.builderRunId, code).catch(() => undefined)
      }
    })
      .finally(() => { builderActive.delete(run.builderRunId) })
    builderActive.set(run.builderRunId, { controller, work })
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
      const resolved = resolveBuilderModelChoice(
        await listModelOffers({ accountId: input.accountId, projectId: input.projectId }),
        input.modelChoiceId,
      )
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
    recover: async () => {
      await store.recoverAndListQueuedBuilderRuns()
    },
    close,
  })
}
