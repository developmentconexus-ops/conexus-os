import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { Observability, MastraStorageExporter } from '@mastra/observability'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { createCodingAgent } from '@mastra/core/coding-agent'
import { AgentController } from '@mastra/core/agent-controller'
import { Mastra } from '@mastra/core/mastra'
import { createPostgresPool } from '../platform/postgres.js'
import { readSecretFile } from '../platform/secrets.js'
import { registerBuilderRoutes } from './routes.js'
import { registerBuilderMastraRoutes } from './mastra-session-routes.js'
import type { BuilderLaunchPreviewPort, BuilderSessionPort, BuilderSessionSnapshot, BuilderTraceSummary } from './routes.js'
import {
  BUILDER_TRACE_REQUEST_CONTEXT_KEYS,
  BUILDER_CREDENTIAL_REQUEST_CONTEXT_KEY,
  BUILDER_MODEL_REQUEST_CONTEXT_KEY,
  createMastraE2BCodingWorkerRuntime,
  resolveBuilderWorkspace,
} from './runtime.js'
import { createBuilderService } from './service.js'
import type { ListModelOffers } from './service.js'
import type { ApplicationSourceCoordinates, BuilderApplicationArtifacts, UnboundBuilderApplicationArtifacts } from './application-build.js'
import { createBuilderSourcePort } from './source.js'
import type { BuilderGitSourceCapability } from './source.js'
import { createBuilderStore } from './store.js'
import type { ResolvedBuilderModel } from '../model-connection/resolved-model.js'
import { BUILDER_BASE_AGENT_INSTRUCTIONS, BUILDER_MODE_DEFINITIONS } from './application-starter.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'

const BUILDER_THREAD_PREFIX = 'conexus-builder:'
const threadIdForProject = (projectId: string): string => `${BUILDER_THREAD_PREFIX}${projectId}`
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

export const resolveBuilderModel = ({ reference, modelIdentity, resolveModel }: Readonly<{
  reference: unknown
  modelIdentity: unknown
  resolveModel: (reference: Readonly<{ connectionId: string; generation: string }>, modelId: string) => Promise<ResolvedBuilderModel>
}>): Promise<ResolvedBuilderModel> => {
  if (reference && typeof reference === 'object' && 'connectionId' in reference && 'generation' in reference &&
    typeof reference.connectionId === 'string' && typeof reference.generation === 'string' &&
    modelIdentity && typeof modelIdentity === 'object' && 'modelId' in modelIdentity && typeof modelIdentity.modelId === 'string') {
    return resolveModel({ connectionId: reference.connectionId, generation: reference.generation }, modelIdentity.modelId)
  }
  throw new Error('BUILDER_MODEL_CREDENTIAL_UNRESOLVABLE')
}

export const createConfiguredBuilderModule = ({ database, builder, projectSource, applicationArtifacts, launchPreview, listModelOffers, resolveModel, origin, resolveCurrentSession }: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  builder: Readonly<{
    ingressPasswordFile: string; executorPasswordFile: string; e2bApiKeyFile: string
    e2bTemplateId: string
  }>
  applicationArtifacts: UnboundBuilderApplicationArtifacts
  launchPreview?: BuilderLaunchPreviewPort
  projectSource: Readonly<{ storageRoot: string; git: BuilderGitSourceCapability }>
  listModelOffers: ListModelOffers
  resolveModel: (reference: Readonly<{ connectionId: string; generation: string }>, modelId: string) => Promise<ResolvedBuilderModel>
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
  const sharedAgent = createCodingAgent({
    id: 'conexus-builder-coding-agent', name: 'Conexus Coding Worker',
    model: ({ requestContext }) => resolveBuilderModel({
      reference: requestContext?.getRaw(BUILDER_CREDENTIAL_REQUEST_CONTEXT_KEY),
      modelIdentity: requestContext?.getRaw(BUILDER_MODEL_REQUEST_CONTEXT_KEY),
      resolveModel,
    }), workspace: resolveBuilderWorkspace,
    editor: false, instructions: BUILDER_BASE_AGENT_INSTRUCTIONS, tools: {},
  })
  const sharedController = new AgentController<Record<string, unknown>>({
    id: 'conexus-builder-controller', storage: sessionStorage, memory: sessionMemory,
    initialState: { yolo: true },
    modes: BUILDER_MODE_DEFINITIONS.map((mode) => ({ ...mode, availableTools: [...mode.availableTools] })),
    defaultModeId: 'build', agent: sharedAgent, workspace: undefined,
    observability,
  })
  // A controller registered on a Mastra instance reads threads and records traces through that
  // instance, so it has to hold the same store and the same observability the sessions were built with.
  const mastra = new Mastra({ storage: sessionStorage, observability, agentControllers: { [sharedController.id]: sharedController }, logger: false })
  const sharedControllerReady = sharedController.init()
  let sessionStorageInit: Promise<void> | undefined
  const ensureSessionStorage = async (): Promise<void> => {
    sessionStorageInit ??= sessionStorage.init()
    await sessionStorageInit
  }
  const runtime = createMastraE2BCodingWorkerRuntime({
    apiKey: readSecretFile(builder.e2bApiKeyFile),
    templateId: builder.e2bTemplateId,
    sharedHarness: {
      controller: sharedController,
      ready: sharedControllerReady,
      flushObservability: observabilityLifecycle.flush,
    },
  })
  const appendDiagnostic = async ({ projectId, builderRunId, code }: Readonly<{ projectId: string; builderRunId: string; code: string }>): Promise<void> => {
    await ensureSessionStorage()
    await sessionMemory.saveMessages({ messages: [{
      id: randomUUID(), role: 'assistant', createdAt: new Date(), threadId: threadIdForProject(projectId), resourceId: projectId,
      content: { format: 2, parts: [{ type: 'text', text: `A execução ${builderRunId} preservou a fonte, mas a compilação falhou. Diagnóstico seguro: ${code}. Corrija a solicitação para tentar novamente.` }] },
    }] })
  }
  const service = createBuilderService({ store, source, runtime, applicationArtifacts: boundApplicationArtifacts, listModelOffers, appendDiagnostic })
  const session: BuilderSessionPort = Object.freeze({
    read: async ({ accountId, projectId }): Promise<BuilderSessionSnapshot> => {
      const preview = await store.readPreviewSubject({ accountId, projectId })
      if (!preview) throw new Error('NOT_AUTHORIZED')
      await ensureSessionStorage()
      const [runHistory, modelChoices] = await Promise.all([
        store.listBuilderRuns({ accountId, projectId }),
        listModelOffers({ accountId, projectId }),
      ])
      return Object.freeze({
        projectId,
        threadId: threadIdForProject(projectId),
        workingSourceRevision: preview.workingSourceRevision,
        lastPreviewSourceRevision: preview.lastPreviewSourceRevision ?? null,
        lastPreviewArtifactRevisionId: preview.lastPreviewArtifactRevisionId ?? null,
        lastPreviewArtifactDigest: preview.lastPreviewArtifactDigest ?? null,
        modelChoices,
        runHistory,
      })
    },
    readTrace: async ({ accountId, projectId, builderRunId }): Promise<BuilderTraceSummary> => {
      const preview = await store.readPreviewSubject({ accountId, projectId })
      if (!preview) throw new Error('NOT_AUTHORIZED')
      await ensureSessionStorage()
      const observability = await sessionStorage.getStore('observability')
      if (!observability) return { available: false, traceId: null, spans: [] }
      const traces = await observability.listTraces({
        filters: { resourceId: projectId, metadata: { conexusBuilderProjectId: projectId, conexusBuilderRunId: builderRunId } },
        pagination: { page: 0, perPage: 1 },
      })
      const root = traces.spans.at(0)
      if (!root) return { available: false, traceId: null, spans: [] }
      const trace = await observability.getTrace({ traceId: root.traceId })
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
      await registerBuilderMastraRoutes(app, {
        mastra,
        controller: sharedController,
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
        await sharedController.destroy()
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
