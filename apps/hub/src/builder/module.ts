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
import { BUILDER_CONTROLLER_ID, registerBuilderMastraRoutes, registerFactoryMastraRoutes } from './mastra-session-routes.js'
import { admitFactoryConversation, openFactoryConversationThread, registerFactoryConversationRoutes } from './factory-routes.js'
import type { BuilderLaunchPreviewPort, BuilderSessionPort, BuilderSessionSnapshot, BuilderTraceSummary } from './routes.js'
import {
  BUILDER_REPOSITORY_ROOT,
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
import type { FactoryRuntimeConfig } from '../platform/config.js'
import { assertFactoryHost, composeFactory, createFactoryPool, createFactorySandbox } from './factory.js'
import type { FactoryComposition } from './factory.js'
import { createGithubApp } from './factory-github.js'
import { createFactoryCodingWorkerRuntime, createMastraFactoryRunPorts, recoverFactoryAdmissions } from './factory-runtime.js'
import type { FactoryRunDependencies, RunNote } from './service.js'
import type { BuilderStore } from './store.js'

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

// The next turn reads this thread, and a discarded run's tool calls in it describe edits the files
// no longer have, so the note is written for the agent as much as for the person.
const discarded = (sourceRevision: string): string =>
  `As alterações desta execução foram descartadas e os arquivos voltaram à revisão ${sourceRevision}; as edições descritas acima nesta conversa não existem nos arquivos. Leia os arquivos antes de confiar neste histórico.`

const NOTE_TEXT: Readonly<Record<RunNote['outcome'], (note: RunNote) => string>> = Object.freeze({
  SOURCE_BASE_MOVED: ({ builderRunId, code, sourceRevision }) =>
    `A execução ${builderRunId} não foi aplicada: a fonte do Project mudou enquanto ela trabalhava, e nada foi sobrescrito. ${discarded(sourceRevision)} Diagnóstico seguro: ${code}. Envie o pedido novamente: ele começará da versão atual da fonte.`,
  RUN_NOT_FINISHED: ({ builderRunId, code, sourceRevision }) =>
    `A execução ${builderRunId} não terminou e nada dela foi aplicado. ${discarded(sourceRevision)} Diagnóstico seguro: ${code}.`,
  BUILD_FAILED: ({ builderRunId, code }) =>
    `A execução ${builderRunId} preservou a fonte, mas a compilação falhou. Diagnóstico seguro: ${code}. Corrija a solicitação para tentar novamente.`,
})

const noteMessage = (note: RunNote, resourceId: string) => ({
  id: diagnosticMessageId(note.builderRunId, note.code), role: 'assistant' as const, createdAt: new Date(), threadId: note.conversationId, resourceId,
  content: { format: 2 as const, parts: [{ type: 'text' as const, text: NOTE_TEXT[note.outcome](note) }] },
})

export const createDiagnosticAppender = ({ sessionMemory, ensureSessionStorage }: Readonly<{
  sessionMemory: Pick<Memory, 'saveMessages'>
  ensureSessionStorage: () => Promise<void>
}>) => async (note: RunNote): Promise<void> => {
  await ensureSessionStorage()
  await sessionMemory.saveMessages({ messages: [noteMessage(note, note.projectId)] })
}

// A Factory conversation's thread lives under the conversation's own resourceId in Factory storage.
export const createFactoryDiagnosticAppender = (ready: Promise<Pick<FactoryComposition, 'mastra'>>) =>
  async (note: RunNote): Promise<void> => {
    const memory = await (await ready).mastra.getStorage()?.getStore('memory')
    if (!memory) throw new Error('BUILDER_FACTORY_UNAVAILABLE')
    await memory.saveMessages({ messages: [noteMessage(note, note.conversationId)] })
  }

export const createBuilderMountOptions = ({ storage, memory, storageRoot }: Readonly<{
  storage: LibSQLStore
  memory: Memory
  storageRoot: string
}>) => ({
  controllerId: BUILDER_CONTROLLER_ID,
  storage,
  storageBackend: 'libsql' as const,
  memory,
  cwd: storageRoot,
  configDir: '.conexus-builder',
  disableMcp: true,
  disableHooks: true,
  disablePlugins: true,
  disableGithubSignals: true,
  disableSettingsOmSeed: true,
  // Mastra Code tells the model its working directory is the project it detected at cwd, which on
  // the Hub is the storage root. The agent then refused to edit the sandbox it was actually given.
  // The Project's source lives at the sandbox's repository root, so that is the project it is told.
  initialState: { yolo: true, projectPath: BUILDER_REPOSITORY_ROOT, projectName: 'Conexus Project' },
  modes: BUILDER_MODE_DEFINITIONS.map((mode) => ({ ...mode, availableTools: [...mode.availableTools] })),
  hostInstructions: BUILDER_BASE_AGENT_INSTRUCTIONS,
  // Nothing local is ever the workspace: a run acts only in the E2B sandbox it was given.
  workspace: resolveBuilderWorkspace,
})

const createBuilderObservability = (serviceName: string): Observability => new Observability({
  sensitiveDataFilter: true,
  configs: {
    default: {
      serviceName,
      requestContextKeys: [...BUILDER_TRACE_REQUEST_CONTEXT_KEYS],
      exporters: [new MastraStorageExporter()],
    },
  },
})

// Two Mastra instances until the legacy conversations move into Factory storage: a controller reads
// and writes through its own Mastra's storage, so the legacy controller on the Factory's Postgres
// would hide every existing Project's conversations.
const startFactoryComposition = ({ database, factory, store, e2bApiKey, e2bTemplateId, origin }: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  factory: FactoryRuntimeConfig
  store: BuilderStore
  e2bApiKey: string
  e2bTemplateId: string
  origin: string
}>) => {
  assertFactoryHost({ cwd: process.cwd(), home: process.env.HOME })
  const pool = createFactoryPool(database, readSecretFile(factory.databasePasswordFile))
  const github = {
    appId: factory.githubAppId,
    clientId: factory.githubClientId,
    slug: factory.githubAppSlug,
    privateKey: readSecretFile(factory.githubPrivateKeyFile),
    clientSecret: readSecretFile(factory.githubClientSecretFile),
  }
  const stateSecret = readSecretFile(factory.stateSecretFile)
  const observability = createBuilderObservability('conexus-builder-factory')
  const observabilityLifecycle = createBuilderObservabilityLifecycle(observability)
  const githubApp = createGithubApp({ appId: factory.githubAppId, privateKey: github.privateKey })
  // A sandbox starts only after the composition is ready, so its seed reads the Factory's rows then.
  const readCheckout = async (slug: string) => {
    const sourceControl = (await ready).github.sourceControlStorage
    for (const installation of await sourceControl.installations.list({ orgId: factory.orgId })) {
      const repository = await sourceControl.repositories.findBySlug({ orgId: factory.orgId, installationId: installation.id, slug })
      if (repository) {
        return { token: await githubApp.repositoryToken(Number(installation.externalId), Number(repository.externalId), 'read'), defaultBranch: repository.defaultBranch }
      }
    }
    throw new Error('BUILDER_FACTORY_UNAVAILABLE')
  }
  const ready = composeFactory({
    pool, github, stateSecret, publicUrl: origin, observability,
    sandbox: createFactorySandbox({ apiKey: e2bApiKey, templateId: e2bTemplateId, readCheckout }),
  })
  ready.catch(() => undefined)
  const appendDiagnostic = createFactoryDiagnosticAppender(ready)
  const portsReady = ready.then((composition) => createMastraFactoryRunPorts({
    composition, orgId: factory.orgId, log: (line) => { process.stderr.write(`${line}\n`) },
  }))
  portsReady.catch(() => undefined)
  const runtime = portsReady.then((ports) => createFactoryCodingWorkerRuntime({ ...ports, github: githubApp }))
  runtime.catch(() => undefined)
  const run: FactoryRunDependencies = Object.freeze({
    runtime: { execute: async (input) => (await runtime).execute(input) },
    readBindingForRun: store.readFactoryBindingForRun,
    readSourceHead: async (binding) => {
      const repository = await (await portsReady).resolveRepository(binding)
      return githubApp.readBranchHead(repository.installation, repository, repository.defaultBranch)
    },
    readConversationRepository: async (conversationId) =>
      (await (await ready).github.sourceControlStorage.sessions.getBySessionId(conversationId))?.projectRepositoryId ?? null,
    appendDiagnostic,
    recoverAdmissions: async () => recoverFactoryAdmissions({ store, github: githubApp, resolveRepository: (await portsReady).resolveRepository }),
  })
  return Object.freeze({
    orgId: factory.orgId,
    ready,
    portsReady,
    run,
    observabilityLifecycle,
    close: async () => {
      try {
        await ready.then((composition) => composition.close(), () => pool.end())
      } finally {
        await observabilityLifecycle.close()
      }
    },
  })
}

export const createConfiguredBuilderModule = ({ database, builder, factory, projectSource, applicationArtifacts, launchPreview, origin, resolveCurrentSession }: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  builder: Readonly<{
    ingressPasswordFile: string; executorPasswordFile: string; e2bApiKeyFile: string
    e2bTemplateId: string
  }>
  factory?: FactoryRuntimeConfig
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
  const observability = createBuilderObservability('conexus-builder')
  const observabilityLifecycle = createBuilderObservabilityLifecycle(observability)
  // The coding agent, its tools, its model credentials and its model selection are Mastra Code's,
  // which is the composition the Factory itself mounts (C-022). Conexus supplies only what is its
  // own: the storage the Project's conversations live in, the per-run Workspace, the Builder's
  // modes and host instructions, and the authorization that decides which resourceId a caller
  // may act under. The mount is prepared rather than booted so the Mastra that owns it is the
  // one this module constructs, carrying the Builder's observability with it.
  const harness = (async () => {
    const prepared = await prepareAgentControllerMount(createBuilderMountOptions({
      storage: sessionStorage, memory: sessionMemory, storageRoot: projectSource.storageRoot,
    }))
    const mastra = new Mastra({ ...prepared.mastraArgs, observability, logger: false })
    await prepared.finalize()
    return Object.freeze({ controller: prepared.base.controller, mastra })
  })()
  harness.catch(() => undefined)
  const e2bApiKey = readSecretFile(builder.e2bApiKeyFile)
  const factoryComposition = factory
    ? startFactoryComposition({ database, factory, store, e2bApiKey, e2bTemplateId: builder.e2bTemplateId, origin })
    : undefined
  let sessionStorageInit: Promise<void> | undefined
  const ensureSessionStorage = async (): Promise<void> => {
    sessionStorageInit ??= sessionStorage.init()
    await sessionStorageInit
  }
  const runtime = createMastraE2BCodingWorkerRuntime({
    apiKey: e2bApiKey,
    templateId: builder.e2bTemplateId,
    sharedHarness: {
      ready: harness,
      flushObservability: observabilityLifecycle.flush,
    },
  })
  const appendDiagnostic = createDiagnosticAppender({ sessionMemory, ensureSessionStorage })
  const service = createBuilderService({
    store, source, runtime, applicationArtifacts: boundApplicationArtifacts, appendDiagnostic,
    ...(factoryComposition ? { factory: factoryComposition.run } : {}),
  })
  const session: BuilderSessionPort = Object.freeze({
    read: async ({ accountId, projectId }): Promise<BuilderSessionSnapshot> => {
      const preview = await store.readPreviewSubject({ accountId, projectId })
      if (!preview) throw new Error('NOT_AUTHORIZED')
      await ensureSessionStorage()
      const [runHistory, binding] = await Promise.all([
        store.listBuilderRuns({ accountId, projectId }),
        store.readFactoryBinding({ accountId, projectId }),
      ])
      return Object.freeze({
        sourceHost: binding ? 'FACTORY' as const : 'CONEXUS' as const,
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
      const builderOperations = await registerBuilderRoutes(app, { store, service, session, resolveCurrentSession, origin, ...(launchPreview ? { launchPreview } : {}) })
      if (!factoryComposition) return builderOperations
      const composition = await factoryComposition.ready
      const sessions = composition.github.sourceControlStorage.sessions
      await registerFactoryMastraRoutes(app, {
        mastra: composition.mastra,
        controllerId: composition.controllerId,
        controller: composition.controller,
        origin,
        orgId: factoryComposition.orgId,
        resolveCurrentSession,
        admitConversation: admitFactoryConversation({ sessions, resolveFactoryProject: store.resolveFactoryProject }),
      })
      return [...builderOperations, ...await registerFactoryConversationRoutes(app, {
        readFactoryBinding: store.readFactoryBinding, sessions, orgId: factoryComposition.orgId, origin, resolveCurrentSession,
        defaultBranchOf: async (binding) => (await (await factoryComposition.portsReady).resolveRepository(binding)).defaultBranch,
        openThread: openFactoryConversationThread({ controller: composition.controller, orgId: factoryComposition.orgId }),
      })]
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
          await factoryComposition?.close()
        }
      }
    },
  })
}
