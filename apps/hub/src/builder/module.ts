import type { FastifyInstance } from 'fastify'
import { createHash } from 'node:crypto'
import type { AgentController } from '@mastra/core/agent-controller'
import type { ToolsInput } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { ConsoleLogger } from '@mastra/core/logger'
import type { ObservabilityInstance, SpanOutputProcessor } from '@mastra/core/observability'
import { SpanType } from '@mastra/core/observability'
import { RequestContext } from '@mastra/core/request-context'
import type { MastraCompositeStore, RetentionConfig } from '@mastra/core/storage'
import type { Workspace } from '@mastra/core/workspace'
import { Observability, MastraStorageExporter } from '@mastra/observability'
import { PostgresStore } from '@mastra/pg'
import { createPostgresPool } from '../platform/postgres.js'
import { logLine } from '../platform/logger.js'
import type { PostgresPool } from '../platform/postgres.js'
import { createSecretEnvelope, readSecretFile } from '../platform/secrets.js'
import { registerBuilderRoutes } from './routes.js'
import { registerBuilderSessionRoutes } from './mastra-session-routes.js'
import type { ToolPayloadProjection } from './mastra-session-routes.js'
import type { BuilderLaunchPreviewPort, BuilderSessionPort, BuilderSessionSnapshot, BuilderTraceSummary } from './routes.js'
import { BUILDER_TRACE_REQUEST_CONTEXT_KEYS } from './runtime.js'
import { createBuilderService } from './service.js'
import type { ApplicationServerPort, ApplicationSourceCoordinates, BuilderApplicationArtifacts, UnboundBuilderApplicationArtifacts } from './application-build.js'
import { createBuilderStore } from './store.js'
import { buildTraceSummary, UNAVAILABLE_TRACE_SUMMARY } from './trace-summary.js'
import type { AccountId, ResolveCurrentSession } from '../identity-access/current-session.js'
import type { FactoryRuntimeConfig, GoogleAiProRuntimeConfig, InstallationSecretKey } from '../platform/config.js'
import { assertBuilderSkillsAvailable } from './skills-guard.js'
import { conversationRunScope, createBuilderRunRuntime, createControllerRunSessions, createParkedDiscard, e2bConversationSandboxes } from './run-runtime.js'
import type { BuilderRunPorts, RunContextBinder } from './run-runtime.js'
import { APPLICATION_SHAPE_FILES, fixedApplicationStarterFiles } from './application-starter.js'
import { createConexusGit } from './conexus-git.js'
import { createConversations, projectResourceId } from './conversations.js'
import { projectBuilderRun } from './failure-vocabulary.js'
import { createConversationSessions } from './conversation-sessions.js'
import { createBuilderController, createContext7Docs, type RunTools } from './harness/index.js'
import { starterProjectFiles } from './project-context.js'
import { createProjectSourceReads } from './source.js'
import { createCliproxyPool, defaultCliproxyStateDir, verifyCliproxyBinary } from './google-ai-pro/pool.js'
import { startModelRouter } from './google-ai-pro/router.js'
import { createRefreshWriteBack } from './google-ai-pro/write-back.js'
import { GOOGLE_AI_PRO_PROVIDER } from './google-ai-pro/credential.js'
import { createGoogleAiProRoute } from './google-ai-pro/route.js'
import { createGoogleAiProAccounts } from './google-ai-pro/store.js'
import { ANTHROPIC_PROVIDER, createClaudeHolds } from './anthropic/credential.js'
import { createAnthropicRoute } from './anthropic/route.js'
import { createModelAccountStore } from './model-account-store.js'
import { CONVERSATION_ID_KEY, createModelRouting, RUN_ID_KEY, type ModelRole, type ModelRoute } from './model-routing.js'
import { createBuilderMemory } from './memory.js'
import { createCodexHolds, OPENAI_MODEL_PROVIDER } from './openai-codex/credential.js'
import { createOpenAICodexRoute } from './openai-codex/route.js'
import { registerModelAccountRoutes } from './model-accounts.js'
import type { BuilderRunDependencies, RunNote } from './service.js'

const BUILDER_OBSERVABILITY_FLUSH_TIMEOUT_MS = 5_000
// The agent loop reads its steps back from this pool; a 5 s wait failed a run when the host was busy
// (the same window that timed out the observability exporter). Waiting is cheaper than a failed turn.
const AGENT_STORAGE_CONNECT_TIMEOUT_MS = 30_000

type BuilderObservabilityLifecycle = Readonly<{
  flush(): Promise<void>
  close(): Promise<void>
}>

/** @public Tests import this at runtime from the built module. */
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

// The next turn reads this thread, and an unadmitted run's tool calls in it describe edits that are
// in the conversation's files but not on `main`, so the note is written for the agent as much as for the person.
const kept = (sourceRevision: string): string =>
  `Os arquivos desta execução ficaram guardados nesta conversa, e a próxima execução continua deles, junto com a versão atual da fonte; a versão aplicada continua na revisão ${sourceRevision}. Leia os arquivos antes de confiar neste histórico.`

const NOTE_TEXT: Readonly<Record<RunNote['outcome'], (note: RunNote) => string>> = Object.freeze({
  SOURCE_BASE_MOVED: ({ builderRunId, code, sourceRevision }) =>
    `A execução ${builderRunId} não foi aplicada: a fonte do Project mudou enquanto ela trabalhava, e nada foi sobrescrito. ${kept(sourceRevision)} Diagnóstico seguro: ${code}. Envie o pedido novamente: ele juntará os arquivos desta conversa com a versão atual da fonte.`,
  RUN_NOT_FINISHED: ({ builderRunId, code, sourceRevision }) =>
    `A execução ${builderRunId} não terminou e nada dela foi aplicado. ${kept(sourceRevision)} Diagnóstico seguro: ${code}.`,
  BUILD_FAILED: ({ builderRunId, code, detail }) =>
    `A execução ${builderRunId} preservou a fonte, mas a compilação falhou. Diagnóstico seguro: ${code}.${detail ? ` Detalhe: ${detail}` : ''} Corrija a solicitação para tentar novamente.`,
  PLATFORM_FAILED: ({ builderRunId, code }) =>
    `A execução ${builderRunId} preservou a fonte, mas o Conexus não conseguiu gerar a prévia por uma falha da própria plataforma, não da fonte. Diagnóstico seguro: ${code}. Não altere os arquivos por causa desta falha; envie o pedido novamente quando a plataforma voltar.`,
  CANDIDATE_REFUSED: ({ builderRunId, code, detail, sourceRevision }) =>
    `A execução ${builderRunId} não foi aplicada: o Conexus recusou o resultado antes de aprová-lo. ${kept(sourceRevision)} Diagnóstico seguro: ${code}.${detail ? ` Motivo: ${detail}` : ''} Corrija isso na próxima execução.`,
  BOOT_PROBLEMS: ({ builderRunId, detail }) =>
    `A execução ${builderRunId} foi aplicada e a Prévia está no ar, mas ao abrir o app o Conexus viu problemas.${detail ? ` Detalhe: ${detail}` : ''} Corrija isso na próxima execução.`,
  PREVIEW_DATA_RESET: ({ builderRunId }) =>
    `A execução ${builderRunId} mudou migrações que já tinham sido aplicadas, então os dados da Preview deste Project foram apagados e todas as migrações rodaram de novo.`,
})

type NoteSession = Pick<Awaited<ReturnType<AgentController['createSession']>>, 'sendSignalToThread'>

/**
 * A `notification` signal is Mastra's system notice for a thread (`sendSignalToThread`, planned as
 * 6b in docs/reference/mastra-boundary.md): the next turn's model reads it as
 * `<notification source="conexus" ...>` context, and the thread stores it as a `signal` row the
 * browser renders as a notice, never as the Builder speaking. Its id is deterministic, so a retry
 * writes it once.
 */
const noteSignal = (note: RunNote) => ({
  id: diagnosticMessageId(note.builderRunId, note.code),
  type: 'notification' as const,
  contents: NOTE_TEXT[note.outcome](note),
  attributes: { source: 'conexus', outcome: note.outcome, run: note.builderRunId },
})

/** @public Tests import this at runtime from the built module. */
export const createDiagnosticAppender = (openSession: (target: Readonly<{ resourceId: string; threadId: string }>) => Promise<NoteSession>) =>
  async (note: RunNote): Promise<void> => {
    const target = { resourceId: projectResourceId(note.projectId), threadId: note.conversationId }
    await (await openSession(target)).sendSignalToThread(noteSignal(note), target).accepted
  }

/** @public Tests import this at runtime from the built module. */
export const compactProcessorRunPayloads: SpanOutputProcessor = {
  name: 'builder-compact-processor-run-payloads',
  process: (span) => {
    if (span && span.type === SpanType.PROCESSOR_RUN) {
      if (Array.isArray(span.input)) span.input = { messageCount: span.input.length }
      if (Array.isArray(span.output)) span.output = { messageCount: span.output.length }
    }
    return span
  },
  shutdown: async () => {},
}

/** @public Tests import this at runtime from the built module. */
export const createBuilderObservability = (serviceName: string, connectorObservability?: ObservabilityInstance): Observability => {
  const observability = new Observability({
    sensitiveDataFilter: true,
    configs: {
      default: {
        serviceName,
        requestContextKeys: [...BUILDER_TRACE_REQUEST_CONTEXT_KEYS],
        exporters: [new MastraStorageExporter()],
        spanOutputProcessors: [compactProcessorRunPayloads],
        serializationOptions: { maxStringLength: 32_768 },
        // The Postgres store keeps spans but has no log table; the Hub's logs go through its pino logger.
        logging: { enabled: false },
      },
    },
  })
  if (connectorObservability) observability.registerInstance('connectors', connectorObservability)
  return observability
}

const RETENTION_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000

// Spans hold prompts, tool I/O and source text. Bounding their age is the only retention: Builder
// evidence lives in the threads' messages, so memory is never a retention key here.
const OBSERVABILITY_SPAN_RETENTION: RetentionConfig = { observability: { spans: { maxAge: '30d' } } }

/**
 * The Builder's Mastra storage: threads, messages and traces in Postgres, so conversations survive a
 * restart. It lives in the `factory` schema through the `hub_factory` role until slice 7 moves it
 * to schema `mastra`.
 * @public Tests import this at runtime from the built module.
 */
export const createBuilderStorage = (pool: PostgresPool): PostgresStore =>
  new PostgresStore({ id: 'conexus-builder', pool, schemaName: 'factory', retention: OBSERVABILITY_SPAN_RETENTION })

// Mastra never runs prune() itself (reference-storage-retention.md). The store declares the
// `maxAge` policy above; this is the schedule that actually deletes rows older than it. Each tick
// waits for the store's own init, which creates the tables a fresh installation does not have yet.
type RetentionSchedule = Readonly<{ tick(): Promise<void>; close(): void }>

/** @public Tests import this at runtime from the built module. */
export const scheduleRetentionPrune = (
  storage: Pick<MastraCompositeStore, 'init' | 'prune'>,
  log: (line: string) => void,
  intervalMs = RETENTION_PRUNE_INTERVAL_MS,
): RetentionSchedule => {
  const tick = async (): Promise<void> => {
    await storage.init()
    for (const result of await storage.prune()) {
      log(`BUILDER_RETENTION_PRUNED:${result.domain}.${result.table}:${result.deleted}`)
      if (!result.done) log(`BUILDER_RETENTION_PRUNE_INCOMPLETE:${result.domain}.${result.table}`)
    }
  }
  tick().catch((error) => log(`BUILDER_RETENTION_PRUNE_FAILED:${error instanceof Error ? error.message : String(error)}`))
  const timer = setInterval(() => { tick().catch((error) => log(`BUILDER_RETENTION_PRUNE_FAILED:${error instanceof Error ? error.message : String(error)}`)) }, intervalMs)
  timer.unref()
  return Object.freeze({ tick, close: () => clearInterval(timer) })
}

// Kills what a crashed Hub left running before the router takes calls.
const startGoogleAiPro = async ({ binary, sha256 }: GoogleAiProRuntimeConfig, persistFor: Parameters<typeof startModelRouter>[1]) => {
  await verifyCliproxyBinary(binary, sha256)
  const pool = createCliproxyPool({ binary, stateDir: defaultCliproxyStateDir() })
  await pool.sweepOrphans()
  const router = await startModelRouter(pool, persistFor)
  return Object.freeze({
    pool,
    url: router.url,
    close: async () => {
      try { await router.close() } finally { await pool.close() }
    },
  })
}

/** The Connector owner's part in a Builder run; absent without a Connector module. */
export type BuilderConnectorPort = Readonly<{
  openRun: NonNullable<BuilderRunPorts['openConnectorRun']>
  tools(context: Readonly<{ requestContext: RequestContext }>): ToolsInput
  toolPayloadProjection: ToolPayloadProjection
}>

const BUILDER_CONTROLLER_ID = 'conexus-builder'

export const createConfiguredBuilderModule = ({ database, builder, factory, secretKey, googleAiPro, applicationArtifacts, applicationServer, launchPreview, origin, resolveCurrentSession, isInstallationAdministrator, readProjectName, connectors, connectorObservability }: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  builder: Readonly<{
    ingressPasswordFile: string; executorPasswordFile: string; modelAccountPasswordFile: string; e2bApiKeyFile: string
    e2bTemplateId: string; gitRoot: string; modelStreamRecordDir?: string | undefined; context7ApiKeyFile?: string | undefined
  }>
  // Only its database password is still read: the Builder's Mastra storage lives in the `factory`
  // schema through the `hub_factory` role until slice 7 moves it to schema `mastra`.
  factory: Pick<FactoryRuntimeConfig, 'databasePasswordFile'>
  secretKey: InstallationSecretKey
  googleAiPro?: GoogleAiProRuntimeConfig
  applicationArtifacts: UnboundBuilderApplicationArtifacts
  applicationServer?: ApplicationServerPort
  launchPreview?: BuilderLaunchPreviewPort
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  isInstallationAdministrator(account: AccountId): Promise<boolean>
  /** The Project's display name, which the Builder's prompt states. */
  readProjectName(input: Readonly<{ accountId: string; projectId: string }>): Promise<string>
  connectors?: BuilderConnectorPort
  connectorObservability?: ObservabilityInstance
}>) => {
  assertBuilderSkillsAvailable()
  const log = (line: string): void => logLine(line)
  const executorPool = createPostgresPool({ ...database, user: 'hub_builder_executor', password: readSecretFile(builder.executorPasswordFile) })
  const store = createBuilderStore({
    ingressPool: createPostgresPool({ ...database, user: 'hub_builder_ingress', password: readSecretFile(builder.ingressPasswordFile) }),
    executorPool,
  })
  // Google AI Pro's credential lives in model.model_account (spec 0002), sealed with the same
  // envelope every Conexus secret uses.
  const modelAccountPool = createPostgresPool({ ...database, user: 'hub_model_account', password: readSecretFile(builder.modelAccountPasswordFile) })
  const modelAccounts = createModelAccountStore({
    pool: modelAccountPool,
    envelope: createSecretEnvelope(readSecretFile(secretKey.file), secretKey.previousFiles.map(readSecretFile)),
  })
  const googleAiProAccounts = createGoogleAiProAccounts(modelAccounts)
  const readDefault = async (role: ModelRole): Promise<string | null> =>
    (await modelAccountPool.query<{ model_id: string | null }>('SELECT model.read_installation_default($1) AS model_id', [role])).rows[0]?.model_id ?? null
  const getApplicationBySource = applicationArtifacts.getApplicationBySource
  const readApplicationFileBySource = applicationArtifacts.readApplicationFileBySource
  const boundApplicationArtifacts: BuilderApplicationArtifacts = Object.freeze({
    ...(getApplicationBySource ? { getApplicationBySource: (input: ApplicationSourceCoordinates) => getApplicationBySource(executorPool, input) } : {}),
    retainApplication: (input) => applicationArtifacts.retainApplication(executorPool, input),
    ...(readApplicationFileBySource ? { readApplicationFileBySource: (input: ApplicationSourceCoordinates & Readonly<{ artifactRevisionId: string; path: string }>) => readApplicationFileBySource(executorPool, input) } : {}),
  })
  const git = createConexusGit({ root: builder.gitRoot, starter: [...fixedApplicationStarterFiles(), ...APPLICATION_SHAPE_FILES, ...starterProjectFiles()] })
  const storagePool = createPostgresPool({ ...database, user: 'hub_factory', password: readSecretFile(factory.databasePasswordFile), options: '-c search_path=factory', max: 20, connectionTimeoutMillis: AGENT_STORAGE_CONNECT_TIMEOUT_MS })
  const storage = createBuilderStorage(storagePool)
  const observability = createBuilderObservability('conexus-builder', connectorObservability)
  const observabilityLifecycle = createBuilderObservabilityLifecycle(observability)
  const googleWriteBack = createRefreshWriteBack(modelAccounts)
  const googleAiProReady = googleAiPro ? startGoogleAiPro(googleAiPro, googleWriteBack.persistFor) : Promise.resolve(undefined)
  googleAiProReady.catch(() => undefined)

  const routes: Readonly<Record<string, ModelRoute>> = Object.freeze({
    [GOOGLE_AI_PRO_PROVIDER]: createGoogleAiProRoute({ routerUrl: async () => (await googleAiProReady.catch(() => undefined))?.url, track: googleWriteBack.track }),
    [OPENAI_MODEL_PROVIDER]: createOpenAICodexRoute(createCodexHolds({ store: modelAccounts }), builder.modelStreamRecordDir),
    // Called from the Hub with the person's Anthropic key or Claude subscription; neither leaves the Hub.
    [ANTHROPIC_PROVIDER]: createAnthropicRoute(createClaudeHolds({ store: modelAccounts })),
  })
  const runContexts = new Map<string, RunContextBinder>()
  const conversationWorkspaces = new Map<string, Workspace>()
  const runTools = new Map<string, RunTools>()
  const modelRouting = createModelRouting({
    routes,
    modelAccounts,
    // Read when a run starts, long after the controller below exists.
    conversationModel: (projectId, conversationId) => conversationModel(projectId, conversationId),
    readDefault,
    record: (builderRunId, modelAccountId) => store.recordBuilderRunModelAccount(builderRunId, modelAccountId),
  })
  // Built, never connected, here: the tools are listed on a run's first step, so Context7 being down never delays boot.
  const docsTools = createContext7Docs({ apiKey: builder.context7ApiKeyFile ? readSecretFile(builder.context7ApiKeyFile) : undefined })
  const controller = createBuilderController({
    id: BUILDER_CONTROLLER_ID,
    workspace: ({ requestContext }) => {
      const conversationId = requestContext.getRaw(CONVERSATION_ID_KEY)
      return typeof conversationId === 'string' ? conversationWorkspaces.get(conversationId) : undefined
    },
    runTools: ({ requestContext }) => {
      const runId = requestContext.getRaw(RUN_ID_KEY)
      return typeof runId === 'string' ? runTools.get(runId) : undefined
    },
    model: modelRouting.resolve,
    docsTools,
    memory: createBuilderMemory({ storage, memoryModel: modelRouting.resolveMemory }),
    ...(connectors ? { connectorFetch: connectors.tools } : {}),
  })
  const mastra = new Mastra({
    storage,
    agentControllers: { [BUILDER_CONTROLLER_ID]: controller },
    observability,
    logger: new ConsoleLogger({ name: 'conexus-builder', level: 'warn' }),
  })
  const ready = controller.init()
  ready.catch(() => undefined)
  const sessions = createConversationSessions({ controller, log })
  const conversationSession = async (resourceId: string, conversationId: string) => {
    await ready
    return sessions.open({ resourceId, conversationId, requestContext: new RequestContext() })
  }
  // The conversation's model is the one in its Mastra session, never a copy of Mastra's thread keys.
  const conversationModel = async (projectId: string, conversationId: string): Promise<string | null> => {
    const session = await conversationSession(projectResourceId(projectId), conversationId)
    await session.thread.loadMetadata()
    return session.model.hasSelection() ? session.model.get() : null
  }
  const retentionPrune = scheduleRetentionPrune(storage, log)
  const conversations = createConversations(async () => {
    const memory = await mastra.getStorage()?.getStore('memory')
    if (!memory) throw new Error('BUILDER_CONVERSATIONS_UNAVAILABLE')
    return memory
  })

  const openSession = createControllerRunSessions({ controller, runContexts, conversationWorkspaces, runTools, readDefaultModel: () => readDefault('build') })
  const discardParked = createParkedDiscard({ controller })
  const sandboxes = e2bConversationSandboxes({ apiKey: readSecretFile(builder.e2bApiKeyFile), templateId: builder.e2bTemplateId, log })
  const runtime = createBuilderRunRuntime({
    openSandbox: sandboxes.open,
    openSession: async (input) => {
      await ready
      return openSession(input)
    },
    discardParked: async (input) => {
      await ready
      return discardParked(input)
    },
    checkModel: modelRouting.check,
    readProjectName,
    git,
    ...(connectors ? { openConnectorRun: connectors.openRun } : {}),
    ...(applicationServer ? { invokeOperation: applicationServer.invoke } : {}),
    log,
  })
  const runs: BuilderRunDependencies = Object.freeze({
    runtime,
    git,
    conversations,
    source: createProjectSourceReads({ git }),
    appendDiagnostic: createDiagnosticAppender(({ resourceId, threadId }) => conversationSession(resourceId, threadId)),
    // Into the session the run's turns go through, which the browser's stream follows. The
    // controller keeps it in memory only; a session not open yet, or gone, has no one to tell.
    publishRun: async (run) => {
      const session = await controller.getSessionByResource(projectResourceId(run.projectId), conversationRunScope(run.conversationId))
      await session?.state.set({ conexusRun: projectBuilderRun(run) })
    },
  })
  const service = createBuilderService({
    store, applicationArtifacts: boundApplicationArtifacts, ...(applicationServer ? { applicationServer } : {}), runs,
  })
  const session: BuilderSessionPort = Object.freeze({
    read: async ({ accountId, projectId }): Promise<BuilderSessionSnapshot> => {
      const preview = await store.readPreviewSubject({ accountId, projectId })
      if (!preview) throw new Error('NOT_AUTHORIZED')
      return Object.freeze({
        projectId,
        workingSourceRevision: await git.readMain(projectId).catch(() => null),
        lastPreviewSourceRevision: preview.lastPreviewSourceRevision,
        lastPreviewArtifactRevisionId: preview.lastPreviewArtifactRevisionId,
        lastPreviewArtifactDigest: preview.lastPreviewArtifactDigest,
        runHistory: await store.listBuilderRuns({ accountId, projectId }),
      })
    },
    readTrace: async ({ accountId, projectId, builderRunId }): Promise<BuilderTraceSummary> => {
      const preview = await store.readPreviewSubject({ accountId, projectId })
      if (!preview) throw new Error('NOT_AUTHORIZED')
      const mastraStorage = mastra.getStorage()
      const observabilityStore = await mastraStorage?.getStore('observability')
      if (!observabilityStore) return UNAVAILABLE_TRACE_SUMMARY
      const traces = await observabilityStore.listTraces({
        filters: { metadata: { conexusBuilderProjectId: projectId, conexusBuilderRunId: builderRunId } },
        pagination: { page: 0, perPage: 1 },
      })
      const root = traces.spans.at(0)
      if (!root) return UNAVAILABLE_TRACE_SUMMARY
      const trace = await observabilityStore.getTrace({ traceId: root.traceId })
      const scoresStore = await mastraStorage?.getStore('scores')
      const scoreRows = scoresStore
        ? (await scoresStore.listScoresBySpan({ traceId: root.traceId, spanId: root.spanId, pagination: { page: 0, perPage: 50 } })).scores
        : []
      return buildTraceSummary({
        traceId: root.traceId,
        spans: trace?.spans ?? [],
        scores: scoreRows,
      })
    },
  })
  const admitProject = async ({ accountId, projectId }: Readonly<{ accountId: string; projectId: string }>): Promise<boolean> =>
    (await store.readPreviewSubject({ accountId, projectId })) !== null
  return Object.freeze({
    registerBuilderRoutes: async (app: FastifyInstance) => {
      const builderOperations = await registerBuilderRoutes(app, { store, service, session, resolveCurrentSession, origin, ...(launchPreview ? { launchPreview } : {}) })
      await ready
      await registerBuilderSessionRoutes(app, {
        mastra, controller, sessions, controllerId: BUILDER_CONTROLLER_ID, origin, resolveCurrentSession, admitProject,
        conversationOwner: ({ projectId, conversationId }) => conversations.ownerOf(projectId, conversationId),
        projectBusy: async ({ accountId, projectId }) => {
          const latest = await store.readBuilderRun({ accountId, projectId })
          return latest?.state === 'QUEUED' || latest?.state === 'RUNNING'
        },
        runContext: (scope) => runContexts.get(scope),
        answerParked: async ({ accountId, projectId, conversationId, toolCallId, resumeData }) => {
          const latest = await store.readBuilderRun({ accountId, projectId })
          if (latest?.conversationId !== conversationId) throw new Error('BUILDER_RUN_NOT_FOUND')
          await service.answerBuilderRun({ accountId, projectId, builderRunId: latest.builderRunId, toolCallId, resumeData })
        },
        ...(connectors ? { toolPayloads: connectors.toolPayloadProjection } : {}),
      })
      const googleAiProPool = (await googleAiProReady)?.pool
      await registerModelAccountRoutes(app, {
        origin,
        resolveCurrentSession,
        isInstallationAdministrator,
        modelAccounts,
        ...(googleAiProPool ? { googleAiPro: googleAiProPool, googleAiProAccounts } : {}),
      })
      return builderOperations
    },
    // Absent without the Builder, and then no Project can be created.
    prepareProjectRepository: (projectId: string) => git.ensureRepository(projectId),
    // Runs before the Project's purge, which drops the rows that name its VMs.
    killProjectSandboxes: async (projectId: string) => sandboxes.killRecorded(await store.readProjectSandboxes(projectId)),
    // A deleted Project leaves neither its conversations nor its repository behind.
    deleteProjectRepository: async (projectId: string) => {
      const conversationIds = await conversations.deleteAll(projectId)
      await sessions.drop(projectResourceId(projectId), conversationIds)
      await sandboxes.destroy(conversationIds)
      await git.deleteRepository(projectId)
    },
    readApplicationFileBySource: service.readApplicationFileBySource,
    getApplicationBySource: service.getApplicationBySource,
    recover: service.recover,
    close: async () => {
      retentionPrune.close()
      try {
        service.stopLegs()
        await service.close()
      } finally {
        try {
          await sessions.close()
          await controller.destroy()
        } finally {
          await docsTools.close()
          await googleAiProReady.then((started) => started?.close(), () => undefined)
          await observabilityLifecycle.close()
          await Promise.all([storagePool.end(), modelAccountPool.end()])
        }
      }
    },
  })
}
