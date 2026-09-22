import type { FastifyInstance } from 'fastify'
import type { ModelCredentialsStorage } from '@mastra/factory/storage/domains/credentials/base'
import type { MemorySettingsStorage } from '@mastra/factory/storage/domains/memory-settings/base'
import type { ModelPacksStorage } from '@mastra/factory/storage/domains/model-packs/base'
import { createHash } from 'node:crypto'
import { Observability, MastraStorageExporter } from '@mastra/observability'
import { createPostgresPool } from '../platform/postgres.js'
import { readSecretFile } from '../platform/secrets.js'
import { registerBuilderRoutes } from './routes.js'
import { registerFactoryMastraRoutes } from './mastra-session-routes.js'
import { admitFactoryConversation, openFactoryConversationThread, registerFactoryConversationRoutes } from './factory-routes.js'
import type { BuilderLaunchPreviewPort, BuilderSessionPort, BuilderSessionSnapshot, BuilderTraceSummary } from './routes.js'
import { BUILDER_TRACE_REQUEST_CONTEXT_KEYS } from './runtime.js'
import { createBuilderService } from './service.js'
import type { ApplicationSourceCoordinates, BuilderApplicationArtifacts, UnboundBuilderApplicationArtifacts } from './application-build.js'
import { createBuilderStore } from './store.js'
import type { AccountId, ResolveCurrentSession } from '../identity-access/current-session.js'
import type { FactoryRuntimeConfig, GoogleAiProRuntimeConfig } from '../platform/config.js'
import { assertFactoryHost, composeFactory, createFactoryPool, createFactorySandbox } from './factory.js'
import type { FactoryComposition } from './factory.js'
import { createGithubApp } from './factory-github.js'
import { registerInstallationGithubRoutes } from './installation-github-routes.js'
import { openFactoryRecords, prepareFactoryRepository } from './factory-provisioning.js'
import type { FactoryBinding } from './factory-provisioning.js'
import { createFactoryCodingWorkerRuntime, createMastraFactoryRunPorts, recoverFactoryAdmissions } from './factory-runtime.js'
import { createFactorySourceReads } from './factory-source.js'
import { createCliproxyPool, defaultCliproxyStateDir, verifyCliproxyBinary } from './google-ai-pro/pool.js'
import { startModelRouter } from './google-ai-pro/router.js'
import { applyModelDefaults, registerModelAccountRoutes } from './model-accounts.js'
import { createProjectRepositoryPort, registerProjectRepositoryRoutes } from './repository-routes.js'
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

// A Factory conversation's thread lives under the conversation's own resourceId in Factory storage.
export const createFactoryDiagnosticAppender = (ready: Promise<Pick<FactoryComposition, 'mastra'>>) =>
  async (note: RunNote): Promise<void> => {
    const memory = await (await ready).mastra.getStorage()?.getStore('memory')
    if (!memory) throw new Error('BUILDER_FACTORY_UNAVAILABLE')
    await memory.saveMessages({ messages: [noteMessage(note, note.conversationId)] })
  }

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

// Kills what a crashed Hub left running before the router takes calls.
const startGoogleAiPro = async ({ binary, sha256 }: GoogleAiProRuntimeConfig) => {
  await verifyCliproxyBinary(binary, sha256)
  const pool = createCliproxyPool({ binary, stateDir: defaultCliproxyStateDir() })
  await pool.sweepOrphans()
  const router = await startModelRouter(pool)
  return Object.freeze({
    pool,
    url: router.url,
    close: async () => {
      try { await router.close() } finally { await pool.close() }
    },
  })
}

// The Factory's Mastra is the Hub's only one: it holds every conversation, its model selection and
// the Builder's traces.
const startFactoryComposition = ({ database, factory, googleAiPro: googleAiProConfig, store, e2bApiKey, e2bTemplateId, origin }: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  factory: FactoryRuntimeConfig
  googleAiPro: GoogleAiProRuntimeConfig | undefined
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
  const secretKey = readSecretFile(factory.secretKeyFile)
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
  const googleAiPro = googleAiProConfig ? startGoogleAiPro(googleAiProConfig) : Promise.resolve(undefined)
  googleAiPro.catch(() => undefined)
  const ready: Promise<FactoryComposition> = googleAiPro.then((started) => composeFactory({
    pool, github, stateSecret, secretKey, publicUrl: origin, observability,
    sandbox: createFactorySandbox({ apiKey: e2bApiKey, templateId: e2bTemplateId, readCheckout }),
    ...(started ? { googleAiProUrl: started.url } : {}),
  }))
  ready.catch(() => undefined)
  const appendDiagnostic = createFactoryDiagnosticAppender(ready)
  const portsReady = ready.then((composition) => createMastraFactoryRunPorts({
    composition, orgId: factory.orgId, log: (line) => { process.stderr.write(`${line}\n`) },
  }))
  portsReady.catch(() => undefined)
  const runtime = portsReady.then((ports) => createFactoryCodingWorkerRuntime({ ...ports, github: githubApp }))
  runtime.catch(() => undefined)
  const records = ready.then((composition) => openFactoryRecords(composition.storage))
  records.catch(() => undefined)
  const prepareRepository = async ({ projectId, projectName }: Readonly<{ projectId: string; projectName: string }>): Promise<FactoryBinding> =>
    prepareFactoryRepository({ github: githubApp, records: await records, orgId: factory.orgId, projectId, projectName })
  const repository = createProjectRepositoryPort({
    readFactoryBinding: store.readFactoryBinding,
    resolveRepository: (binding) => portsReady.then((ports) => ports.resolveRepository(binding)),
    github: githubApp,
  })
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
    recoverAdmissions: async (active) => recoverFactoryAdmissions({ store, github: githubApp, resolveRepository: (await portsReady).resolveRepository, active }),
    source: createFactorySourceReads({ github: githubApp, resolveRepository: async (binding) => (await portsReady).resolveRepository(binding) }),
  })
  return Object.freeze({
    orgId: factory.orgId,
    ready,
    portsReady,
    googleAiPro,
    run,
    prepareRepository,
    repository,
    githubApp,
    githubAppSlug: factory.githubAppSlug,
    records,
    observabilityLifecycle,
    close: async () => {
      try {
        await ready.then((composition) => composition.close(), () => pool.end())
      } finally {
        await googleAiPro.then((started) => started?.close(), () => undefined)
        await observabilityLifecycle.close()
      }
    },
  })
}

export const createConfiguredBuilderModule = ({ database, builder, factory, googleAiPro, applicationArtifacts, launchPreview, origin, resolveCurrentSession, isInstallationAdministrator }: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  builder: Readonly<{
    ingressPasswordFile: string; executorPasswordFile: string; e2bApiKeyFile: string
    e2bTemplateId: string
  }>
  factory: FactoryRuntimeConfig
  googleAiPro?: GoogleAiProRuntimeConfig
  applicationArtifacts: UnboundBuilderApplicationArtifacts
  launchPreview?: BuilderLaunchPreviewPort
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  isInstallationAdministrator(account: AccountId): Promise<boolean>
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
  const factoryComposition = startFactoryComposition({
    database, factory, googleAiPro, store, e2bApiKey: readSecretFile(builder.e2bApiKeyFile), e2bTemplateId: builder.e2bTemplateId, origin,
  })
  const service = createBuilderService({ store, applicationArtifacts: boundApplicationArtifacts, factory: factoryComposition.run })
  const session: BuilderSessionPort = Object.freeze({
    read: async ({ accountId, projectId }): Promise<BuilderSessionSnapshot> => {
      const preview = await store.readPreviewSubject({ accountId, projectId })
      if (!preview) throw new Error('NOT_AUTHORIZED')
      return Object.freeze({
        projectId,
        workingSourceRevision: preview.workingSourceRevision,
        lastPreviewSourceRevision: preview.lastPreviewSourceRevision ?? null,
        lastPreviewArtifactRevisionId: preview.lastPreviewArtifactRevisionId ?? null,
        lastPreviewArtifactDigest: preview.lastPreviewArtifactDigest ?? null,
        runHistory: await store.listBuilderRuns({ accountId, projectId }),
      })
    },
    readTrace: async ({ accountId, projectId, builderRunId }): Promise<BuilderTraceSummary> => {
      const preview = await store.readPreviewSubject({ accountId, projectId })
      if (!preview) throw new Error('NOT_AUTHORIZED')
      const observabilityStore = await (await factoryComposition.ready).mastra.getStorage()?.getStore('observability')
      if (!observabilityStore) return { available: false, traceId: null, spans: [] }
      const traces = await observabilityStore.listTraces({
        filters: { metadata: { conexusBuilderProjectId: projectId, conexusBuilderRunId: builderRunId } },
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
      const builderOperations = await registerBuilderRoutes(app, { store, service, session, resolveCurrentSession, origin, ...(launchPreview ? { launchPreview } : {}) })
      const composition = await factoryComposition.ready
      const googleAiProPool = (await factoryComposition.googleAiPro)?.pool
      const sessions = composition.github.sourceControlStorage.sessions
      const modelPacks = composition.storage.getDomain<ModelPacksStorage>('model-packs')
      await registerModelAccountRoutes(app, {
        domains: {
          credentials: composition.storage.getDomain<ModelCredentialsStorage>('model-credentials'),
          modelPacks,
          memorySettings: composition.storage.getDomain<MemorySettingsStorage>('memory-settings'),
        },
        controller: composition.controller,
        orgId: factoryComposition.orgId,
        origin,
        resolveCurrentSession,
        isInstallationAdministrator,
        ...(googleAiProPool ? { googleAiPro: googleAiProPool } : {}),
      })
      await registerInstallationGithubRoutes(app, {
        origin,
        resolveCurrentSession,
        isInstallationAdministrator,
        github: factoryComposition.githubApp,
        records: await factoryComposition.records,
        orgId: factoryComposition.orgId,
        appSlug: factoryComposition.githubAppSlug,
      })
      await registerFactoryMastraRoutes(app, {
        mastra: composition.mastra,
        controllerId: composition.controllerId,
        controller: composition.controller,
        origin,
        orgId: factoryComposition.orgId,
        resolveCurrentSession,
        admitConversation: admitFactoryConversation({ sessions, resolveFactoryProject: store.resolveFactoryProject }),
      })
      const repositoryOperations = await registerProjectRepositoryRoutes(app, {
        repository: factoryComposition.repository,
        resolveCurrentSession,
      })
      return [...builderOperations, ...repositoryOperations, ...await registerFactoryConversationRoutes(app, {
        readFactoryBinding: store.readFactoryBinding, sessions, orgId: factoryComposition.orgId, origin, resolveCurrentSession,
        defaultBranchOf: async (binding) => (await (await factoryComposition.portsReady).resolveRepository(binding)).defaultBranch,
        openThread: openFactoryConversationThread({ controller: composition.controller, orgId: factoryComposition.orgId, applyDefaults: applyModelDefaults({ modelPacks, orgId: factoryComposition.orgId }) }),
      })]
    },
    // Absent without the Factory, and then no Project can be created.
    prepareProjectRepository: factoryComposition?.prepareRepository,
    readApplicationFileBySource: service.readApplicationFileBySource,
    getApplicationBySource: service.getApplicationBySource,
    recover: service.recover,
    close: async () => {
      try {
        await service.close()
      } finally {
        await factoryComposition.close()
      }
    },
  })
}
