import type { BuilderSourceFile, BuilderSourcePort, BuilderSourceTree } from './source.js'
import type { CodingWorkerRuntime } from './runtime.js'
import type { BuilderRunSummary, BuilderStore } from './store.js'
import { prepareBuilderRunApplicationArtifact } from './application-build.js'
import type { ApplicationArtifactMetadata, ApplicationArtifactReadResult, BuilderApplicationArtifacts } from './application-build.js'
import type { ApplicationCompilerRuntime } from './application-artifact-runtime.js'
import { toBuilderLiveView } from './runtime.js'
import { resolveBuilderModelChoice, type BuilderModelChoice } from './model-choice.js'

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

export const createBuilderService = ({ store, source, runtime, compiler, applicationArtifacts, modelChoices = [], requiresClaudeConnection = false, appendDiagnostic }: Readonly<{
  store: BuilderStore
  source: BuilderSourcePort
  runtime: CodingWorkerRuntime
  compiler: ApplicationCompilerRuntime
  applicationArtifacts: BuilderApplicationArtifacts
  modelChoices?: readonly BuilderModelChoice[]
  requiresClaudeConnection?: boolean
  appendDiagnostic?: (input: Readonly<{ projectId: string; builderRunId: string; code: string }>) => Promise<void>
}>): BuilderService => {
  if (runtime.kind !== 'REMOTE_E2B') throw new Error('BUILDER_LOCAL_RUNTIME_REFUSED')
  const builderActive = new Map<string, Readonly<{ controller: AbortController; work: Promise<void> }>>()
  const availableModelChoices = modelChoices.length > 0 ? modelChoices : [
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
    const work = (async () => {
      const modelIdentity = run.modelAdmissionId && run.modelProviderId && run.modelId
        ? { admissionId: run.modelAdmissionId, providerId: run.modelProviderId, modelId: run.modelId }
        : runtime.modelIdentity
      const claimed = await store.claimBuilderRun(run.builderRunId, modelIdentity)
      if (requiresClaudeConnection && (!claimed.claudeConnectionId || !claimed.claudeCredentialGeneration)) throw new Error('CLAUDE_CONNECTION_REQUIRED')
      const sourceBundle = await source.prepareProjectSource({
        projectId: claimed.projectId, executionId: claimed.builderRunId, sourceRevision: claimed.baseSourceRevision,
      })
      const result = await runtime.execute({
        projectId: claimed.projectId, executionId: claimed.builderRunId, intent: input.content,
        mode: claimed.mode, baseSourceRevision: claimed.baseSourceRevision, sourceBundle, modelIdentity,
        ...(claimed.claudeConnectionId && claimed.claudeCredentialGeneration
          ? { credentialReference: { connectionId: claimed.claudeConnectionId, generation: claimed.claudeCredentialGeneration } }
          : {}),
        signal: controller.signal,
        bindPhysicalSandbox: (sandboxId) => store.bindBuilderRunSandbox(claimed.builderRunId, sandboxId),
        bindMessage: (messageId) => store.bindBuilderRunMessage(claimed.builderRunId, messageId),
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
        const code = failureCode(error)
        await store.settleBuilderRunBuild({ builderRunId: claimed.builderRunId, sourceRevision: admitted.resultSourceRevision,
          failureCode: code }).catch(() => undefined)
        if (code !== 'BUILDER_RUN_CANCELLED' && code !== 'APPLICATION_COMPILER_CANCELLED' && appendDiagnostic) {
          await appendDiagnostic({ projectId: claimed.projectId, builderRunId: claimed.builderRunId, code }).catch(() => undefined)
        }
        throw error
      }
    })().catch(async (error) => {
      const code = failureCode(error)
      if (code === 'BUILDER_RUN_CANCELLED' || code === 'BUILDER_LATE_RESULT_REFUSED') await store.interruptBuilderRun(run.builderRunId, 'USER_CANCELLED').catch(() => undefined)
      else await store.failBuilderRun(run.builderRunId, code).catch(() => undefined)
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
      const session = await runtime.getSessionByResource?.(projectId, `builder:${builderRunId}`)
      if (!session) return null
      let closed = false
      let unsubscribe = () => {}
      return new ReadableStream<string>({
        start: (controller) => {
          unsubscribe = session.subscribe((event) => {
            if (!closed && event.type === 'display_state_changed') {
              controller.enqueue(`data: ${JSON.stringify(toBuilderLiveView(event.displayState))}\n\n`)
            }
          })
          if (!closed) controller.enqueue(`data: ${JSON.stringify(toBuilderLiveView(session.displayState.get()))}\n\n`)
        },
        cancel: () => { closed = true; unsubscribe() },
      })
    },
    recover: async () => {
      await store.recoverAndListQueuedBuilderRuns()
    },
    close,
  })
}
