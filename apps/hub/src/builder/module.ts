import type { FastifyInstance } from 'fastify'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { Observability, MastraStorageExporter } from '@mastra/observability'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { prepareAgentControllerMount } from '@mastra/code-sdk'
import { Mastra } from '@mastra/core/mastra'
import { createPostgresPool } from '../platform/postgres.js'
import { readSecretFile } from '../platform/secrets.js'
import { registerBuilderRoutes } from './routes.js'
import { BUILDER_CONTROLLER_ID, registerBuilderMastraRoutes } from './mastra-session-routes.js'
import type { BuilderLaunchPreviewPort, BuilderSessionPort, BuilderSessionSnapshot, BuilderTraceSummary } from './routes.js'
import {
  BUILDER_TRACE_REQUEST_CONTEXT_KEYS,
  createMastraE2BCodingWorkerRuntime,
  resolveBuilderWorkspace,
} from './runtime.js'
import { createBuilderService } from './service.js'
import type { ApplicationSourceCoordinates, BuilderApplicationArtifacts, UnboundBuilderApplicationArtifacts } from './application-build.js'
import { createBuilderSourcePort } from './source.js'
import type { BuilderGitSourceCapability } from './source.js'
import { createBuilderStore } from './store.js'
import { BUILDER_BASE_AGENT_INSTRUCTIONS, BUILDER_MODE_DEFINITIONS } from './application-starter.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'

const BUILDER_OBSERVABILITY_FLUSH_TIMEOUT_MS = 5_000

type BuilderObservabilityLifecycle = Readonly<{
  flush(): Promise<void>
  close(): Promise<void>
}>

export const createBuilderObservabilityLifecycle = (
  observability: Pick<Observability, 'flush' | 'shutdown'>,
  flushTimeoutMs = BUILDER_OBSERVABILITY_FLUSH_TIMEOUT_MS,
): BuilderObservabilityLifecycle => {
  let queued: Promise<void> = Promise.resolve()
  let closing = false
  let closePromise: Promise<void> | undefined
  const reportFailure = (): void => {
    process.emitWarning('BUILDER_PREPARATION_FAILED', { code: 'BUILDER_PREPARATION_FAILED' })
  }
  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const result = queued.then(operation, operation)
    queued = result.catch(() => undefined)
    return result
  }
  const waitBounded = (operation: Promise<void>): Promise<'completed' | 'failed' | 'timed-out'> => new Promise((resolve) => {
    const timeout = setTimeout(() => resolve('timed-out'), flushTimeoutMs)
    void operation.then(
      () => { clearTimeout(timeout); resolve('completed') },
      () => { clearTimeout(timeout); resolve('failed') },
    )
  })
  return Object.freeze({
    flush: async () => {
      if (closing) return
      const current = enqueue(() => observability.flush())
      const result = await waitBounded(current)
      if (result !== 'completed') reportFailure()
    },
    close: () => {
      closePromise ??= (async () => {
        closing = true
        try {
          await queued
        } catch {
          reportFailure()
        }
        try {
          await observability.shutdown()
        } catch {
          reportFailure()
        }
      })()
      return closePromise
    },
  })
}

// Deterministic on run+code so a retried call collapses onto the same message instead of
// appending a duplicate diagnostic.
const diagnosticMessageId = (builderRunId: string, code: string): string =>
  createHash('sha256').update(`builder-diagnostic:${builderRunId}:${code}`).digest('hex')

export const createDiagnosticAppender = ({ sessionMemory, ensureSessionStorage }: Readonly<{
  sessionMemory: Pick<Memory, 'saveMessages'>
  ensureSessionStorage: () => Promise<void>
}>) => async ({ projectId, conversationId, builderRunId, code }: Readonly<{ projectId: string; conversationId: string; builderRunId: string; code: string }>): Promise<void> => {
  await ensureSessionStorage()
  await sessionMemory.saveMessages({ messages: [{
    id: diagnosticMessageId(builderRunId, code), role: 'assistant', createdAt: new Date(), threadId: conversationId, resourceId: projectId,
    content: { format: 2, parts: [{ type: 'text', text: `A execução ${builderRunId} preservou a fonte, mas a compilação falhou. Diagnóstico seguro: ${code}. Corrija a solicitação para tentar novamente.` }] },
  }] })
}

export const createConfiguredBuilderModule = ({ database, builder, projectSource, applicationArtifacts, launchPreview, origin, resolveCurrentSession }: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  builder: Readonly<{
    ingressPasswordFile: string; executorPasswordFile: string; e2bApiKeyFile: string
    e2bTemplateId: string
  }>
  applicationArtifacts: UnboundBuilderApplicationArtifacts
  launchPreview?: BuilderLaunchPreviewPort
  projectSource: Readonly<{ storageRoot: string; git: BuilderGitSourceCapability }>
  origin: string
  resolveCurrentSession: ResolveCurrentSession
}>) => {
  const executorPool = createPostgresPool({ ...database, user: 'hub_builder_executor', password: readSecretFile(builder.executorPasswordFile) })
  const store = createBuilderStore({
    ingressPool: createPostgresPool({ ...database, user: 'hub_builder_ingress', password: readSecretFile(builder.ingressPasswordFile) }),
    executorPool,
  })
  const getApplicationBySource = applicationArtifacts.getApplicationBySource
  const readApplicationFileBySource = applicationArtifacts.readApplicationFileBySource
  const boundApplicationArtifacts: BuilderApplicationArtifacts = Object.freeze({
    ...(getApplicationBySource ? { getApplicationBySource: (input: ApplicationSourceCoordinates) => getApplicationBySource(executorPool, input) } : {}),
    retainApplication: (input) => applicationArtifacts.retainApplication(executorPool, input),
    ...(readApplicationFileBySource ? { readApplicationFileBySource: (input: ApplicationSourceCoordinates & Readonly<{ artifactRevisionId: string; path: string }>) => readApplicationFileBySource(executorPool, input) } : {}),
  })
  const source = createBuilderSourcePort({
    git: projectSource.git,
    storageRoot: projectSource.storageRoot,
  })
  // Mastra owns the Project conversation/thread records. The file is kept
  // beside the project custody root so controller recreation does not erase
  // the session, while Conexus remains the owner of authorization and Turns.
  const sessionStorage = new LibSQLStore({
    id: 'conexus-builder-session',
    url: `file:${join(projectSource.storageRoot, 'builder-session.db')}`,
  })
  const sessionMemory = new Memory({
    storage: sessionStorage,
    options: { lastMessages: 20 },
  })
  const observability = new Observability({
    sensitiveDataFilter: true,
    configs: {
      default: {
        serviceName: 'conexus-builder',
        requestContextKeys: [...BUILDER_TRACE_REQUEST_CONTEXT_KEYS],
        exporters: [new MastraStorageExporter()],
      },
    },
  })
  const observabilityLifecycle = createBuilderObservabilityLifecycle(observability)
  // The coding agent, its tools, its model credentials and its model selection are Mastra Code's,
  // which is the composition the Factory itself mounts (C-022). Conexus supplies only what is its
  // own: the storage the Project's conversations live in, the per-run Workspace, the Builder's
  // modes and host instructions, and the authorization that decides which resourceId a caller
  // may act under. The mount is prepared rather than booted so the Mastra that owns it is the
  // one this module constructs, carrying the Builder's observability with it.
  const harness = (async () => {
    const prepared = await prepareAgentControllerMount({
      controllerId: BUILDER_CONTROLLER_ID,
      storage: sessionStorage,
      storageBackend: 'libsql',
      memory: sessionMemory,
      cwd: projectSource.storageRoot,
      configDir: '.conexus-builder',
      disableMcp: true,
      disableHooks: true,
      disablePlugins: true,
      disableGithubSignals: true,
      disableSettingsOmSeed: true,
      initialState: { yolo: true },
      modes: BUILDER_MODE_DEFINITIONS.map((mode) => ({ ...mode, availableTools: [...mode.availableTools] })),
      hostInstructions: BUILDER_BASE_AGENT_INSTRUCTIONS,
      // Nothing local is ever the workspace: a run acts only in the E2B sandbox it was given.
      workspace: resolveBuilderWorkspace,
    })
    const mastra = new Mastra({ ...prepared.mastraArgs, observability, logger: false })
    await prepared.finalize()
    return Object.freeze({ controller: prepared.base.controller, mastra })
  })()
  harness.catch(() => undefined)
  let sessionStorageInit: Promise<void> | undefined
  const ensureSessionStorage = async (): Promise<void> => {
    sessionStorageInit ??= sessionStorage.init()
    await sessionStorageInit
  }
  const runtime = createMastraE2BCodingWorkerRuntime({
    apiKey: readSecretFile(builder.e2bApiKeyFile),
    templateId: builder.e2bTemplateId,
    sharedHarness: {
      ready: harness,
      flushObservability: observabilityLifecycle.flush,
    },
  })
  const appendDiagnostic = createDiagnosticAppender({ sessionMemory, ensureSessionStorage })
  const service = createBuilderService({ store, source, runtime, applicationArtifacts: boundApplicationArtifacts, appendDiagnostic })
  const session: BuilderSessionPort = Object.freeze({
    read: async ({ accountId, projectId }): Promise<BuilderSessionSnapshot> => {
      const preview = await store.readPreviewSubject({ accountId, projectId })
      if (!preview) throw new Error('NOT_AUTHORIZED')
      await ensureSessionStorage()
      const runHistory = await store.listBuilderRuns({ accountId, projectId })
      return Object.freeze({
        projectId,
        workingSourceRevision: preview.workingSourceRevision,
        lastPreviewSourceRevision: preview.lastPreviewSourceRevision ?? null,
        lastPreviewArtifactRevisionId: preview.lastPreviewArtifactRevisionId ?? null,
        lastPreviewArtifactDigest: preview.lastPreviewArtifactDigest ?? null,
        runHistory,
      })
    },
    readTrace: async ({ accountId, projectId, builderRunId }): Promise<BuilderTraceSummary> => {
      const preview = await store.readPreviewSubject({ accountId, projectId })
      if (!preview) throw new Error('NOT_AUTHORIZED')
      await ensureSessionStorage()
      const observabilityStore = await sessionStorage.getStore('observability')
      if (!observabilityStore) return { available: false, traceId: null, spans: [] }
      const traces = await observabilityStore.listTraces({
        filters: { resourceId: projectId, metadata: { conexusBuilderProjectId: projectId, conexusBuilderRunId: builderRunId } },
        pagination: { page: 0, perPage: 1 },
      })
      const root = traces.spans.at(0)
      if (!root) return { available: false, traceId: null, spans: [] }
      const trace = await observabilityStore.getTrace({ traceId: root.traceId })
      const spans = (trace?.spans ?? []).map((span) => ({
        spanType: span.spanType,
        name: span.name,
        startedAt: span.startedAt.toISOString(),
        durationMs: span.endedAt ? Math.max(0, span.endedAt.getTime() - span.startedAt.getTime()) : null,
        error: Boolean(span.error),
      }))
      return { available: true, traceId: root.traceId, spans }
    },
  })
  return Object.freeze({
    registerBuilderRoutes: async (app: FastifyInstance) => {
      const { mastra, controller } = await harness
      await registerBuilderMastraRoutes(app, {
        mastra,
        controller,
        origin,
        resolveCurrentSession,
        admitProjectBuild: async (input) => Boolean(await store.readPreviewSubject(input)),
      })
      return registerBuilderRoutes(app, { store, service, session, resolveCurrentSession, origin, ...(launchPreview ? { launchPreview } : {}) })
    },
    readApplicationFileBySource: service.readApplicationFileBySource,
    getApplicationBySource: service.getApplicationBySource,
    recover: service.recover,
    close: async () => {
      try {
        await service.close()
      } finally {
        await harness.then(({ controller }) => controller.destroy(), () => undefined)
        try {
          await observabilityLifecycle.close()
        } catch {
          process.emitWarning('BUILDER_PREPARATION_FAILED', { code: 'BUILDER_PREPARATION_FAILED' })
        } finally {
          await sessionStorage.close()
        }
      }
    },
  })
}
