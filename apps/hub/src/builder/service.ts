import type { BuilderSourceFile, BuilderSourcePort, BuilderSourceTree } from './source.js'
import type { CodingWorkerRuntime } from './runtime.js'
import type { BuilderRunSummary, BuilderStore } from './store.js'
import { prepareBuilderRunApplicationArtifact } from './application-build.js'
import type { ApplicationArtifactMetadata, ApplicationArtifactReadResult, BuilderApplicationArtifacts } from './application-build.js'
import type { ApplicationCompilerRuntime } from './application-artifact-runtime.js'
import { toBuilderLiveView } from './runtime.js'

export type BuilderService = Readonly<{
  createBuilderRun(input: Readonly<{ accountId: string; projectId: string; idempotencyKey: string; content: string; mode: 'BUILD' | 'PLAN' }>): Promise<BuilderRunSummary>
  listSourceTree(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string }>): Promise<BuilderSourceTree>
  getSourceFile(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string; path: string }>): Promise<BuilderSourceFile>
  getApplicationBySource(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string }>): Promise<ApplicationArtifactMetadata | null>
  readApplicationFileBySource(input: Readonly<{ accountId: string; projectId: string; sourceRevision: string; artifactRevisionId: string; path: string }>): Promise<ApplicationArtifactReadResult | null>
  observeBuilderRun(input: Readonly<{ projectId: string; builderRunId: string }>): Promise<ReadableStream<string> | null>
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
  const builderActive = new Map<string, Promise<void>>()
  const applicationShutdown = new AbortController()
  let serviceClosing: Promise<void> | null = null
  const failureCode = (error: unknown): string => {
    const code = error instanceof Error ? error.message : ''
    return /^[A-Z0-9_]{1,120}$/.test(code) ? code : 'BUILDER_PREPARATION_FAILED'
  }
  const dispatchBuilderRun = (run: BuilderRunSummary, input: Readonly<{ accountId: string; content: string }>): void => {
    if (builderActive.has(run.builderRunId)) return
    const work = (async () => {
      const claimed = await store.claimBuilderRun(run.builderRunId, runtime.modelIdentity)
      const sourceBundle = await source.prepareProjectSource({
        projectId: claimed.projectId, executionId: claimed.builderRunId, sourceRevision: claimed.baseSourceRevision,
      })
      const result = await runtime.execute({
        projectId: claimed.projectId, executionId: claimed.builderRunId, intent: input.content,
        mode: claimed.mode, baseSourceRevision: claimed.baseSourceRevision, sourceBundle,
        ...(claimed.claudeConnectionId && claimed.claudeCredentialGeneration
          ? { credentialReference: { connectionId: claimed.claudeConnectionId, generation: claimed.claudeCredentialGeneration } }
          : {}),
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
        await store.settleBuilderRunBuild({ builderRunId: claimed.builderRunId, sourceRevision: admitted.resultSourceRevision,
          failureCode: failureCode(error) }).catch(() => undefined)
        throw error
      }
    })().catch(async (error) => { await store.failBuilderRun(run.builderRunId, failureCode(error)).catch(() => undefined) })
      .finally(() => { builderActive.delete(run.builderRunId) })
    builderActive.set(run.builderRunId, work)
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
      await Promise.all(builderActive.values())
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
