import type { FastifyInstance } from 'fastify'
import type { ToolsInput } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { ConsoleLogger } from '@mastra/core/logger'
import type { ObservabilityInstance } from '@mastra/core/observability'
import { RequestContext } from '@mastra/core/request-context'
import type { Workspace } from '@mastra/core/workspace'
import { createPostgresPool } from '../platform/postgres.js'
import { Failure } from '../platform/failure.js'
import { logLine } from '../platform/logger.js'
import { createSecretEnvelope, readSecretFile } from '../platform/secrets.js'
import { registerBuilderRoutes } from './routes.js'
import { mountLogFilter, mountValidationFailure, registerBuilderSessionRoutes } from './mastra-session-routes.js'
import type { ToolPayloadProjection } from './mastra-session-routes.js'
import type { BuilderLaunchPreviewPort, BuilderSessionPort, BuilderSessionSnapshot, BuilderTraceSummary } from './routes.js'
import { parkedCallStanding } from './runtime.js'
import { createBuilderService } from './service.js'
import type { ApplicationServerPort, ApplicationSourceCoordinates, BuilderApplicationArtifacts, UnboundBuilderApplicationArtifacts } from './application-build.js'
import { createBuilderStore } from './store.js'
import { buildTraceSummary, UNAVAILABLE_TRACE_SUMMARY } from './trace-summary.js'
import type { AccountId, ResolveCurrentSession } from '../identity-access/current-session.js'
import type { FactoryRuntimeConfig, GoogleAiProRuntimeConfig, InstallationSecretKey } from '../platform/config.js'
import { assertBuilderSkillsAvailable } from './skills-guard.js'
import { createBuilderRunRuntime } from './run/run.js'
import type { BuilderRunPorts, RunContextBinder } from './run/ports.js'
import { conversationRunScope, createControllerRunSessions, createParkedDiscard } from './run/turn.js'
import { e2bConversationSandboxes } from './conversation-sandboxes.js'
import type { ConversationSandboxes } from './conversation-sandboxes.js'
import { listPausedConversationMachines } from './sandbox.js'
import { APPLICATION_SHAPE_FILES, fixedApplicationStarterFiles } from './application-starter.js'
import { createConexusGit } from './conexus-git.js'
import { createConversations, projectResourceId } from './conversations.js'
import { scheduleIdleMachineSweep } from './idle-machine-sweep.js'
import { scheduleRunLease } from './run-lease.js'
import { createBuilderObservability, createBuilderObservabilityLifecycle } from './observability.js'
import { createDiagnosticAppender } from './diagnostic-appender.js'
import { createBuilderStorage, scheduleRetentionPrune } from './storage.js'
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
import type { BuilderRunDependencies } from './service.js'

// The agent loop reads its steps back from this pool; a 5 s wait failed a run when the host was busy
// (the same window that timed out the observability exporter). Waiting is cheaper than a failed turn.
const AGENT_STORAGE_CONNECT_TIMEOUT_MS = 30_000

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

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
export const createConfiguredBuilderModule = ({ database, builder, factory, secretKey, googleAiPro, applicationArtifacts, applicationServer, launchPreview, origin, resolveCurrentSession, isInstallationAdministrator, readProjectName, connectors, connectorObservability, conversationSandboxes }: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  builder: Readonly<{
    ingressPasswordFile: string; executorPasswordFile: string; modelAccountPasswordFile: string; e2bApiKeyFile: string
    e2bTemplateId: string; gitRoot: string; context7ApiKeyFile?: string | undefined
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
  /** The conversations' sandboxes; absent, the Hub uses E2B. Only a test composition passes one. */
  conversationSandboxes?: ConversationSandboxes
}>) => {
  assertBuilderSkillsAvailable()
  const log = logLine
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
  const retainApplicationThumbnail = applicationArtifacts.retainApplicationThumbnail
  const getApplicationThumbnail = applicationArtifacts.getApplicationThumbnail
  const boundApplicationArtifacts: BuilderApplicationArtifacts = Object.freeze({
    ...(getApplicationBySource ? { getApplicationBySource: (input: ApplicationSourceCoordinates) => getApplicationBySource(executorPool, input) } : {}),
    retainApplication: (input) => applicationArtifacts.retainApplication(executorPool, input),
    ...(retainApplicationThumbnail ? { retainApplicationThumbnail: (input: Parameters<NonNullable<typeof retainApplicationThumbnail>>[1]) => retainApplicationThumbnail(executorPool, input) } : {}),
    ...(getApplicationThumbnail ? { getApplicationThumbnail: (input: Parameters<NonNullable<typeof getApplicationThumbnail>>[1]) => getApplicationThumbnail(executorPool, input) } : {}),
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
    [OPENAI_MODEL_PROVIDER]: createOpenAICodexRoute(createCodexHolds({ store: modelAccounts })),
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
    logger: new ConsoleLogger({ name: 'conexus-builder', level: 'warn', filter: mountLogFilter }),
    server: { onValidationError: mountValidationFailure },
  })
  const ready = controller.init()
  ready.catch(() => undefined)
  const sessions = createConversationSessions({ controller })
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
    if (!memory) throw new Failure('BUILDER_CONVERSATIONS_UNAVAILABLE')
    return memory
  })

  const openSession = createControllerRunSessions({ controller, runContexts, conversationWorkspaces, runTools, readDefaultModel: () => readDefault('build') })
  const discardParked = createParkedDiscard({ controller })
  // E2B's sandboxes come with the sweep that deletes its idle paused machines. A test composition's
  // own sandboxes have no E2B machines, so no key is read and nothing is swept.
  const e2bSandboxes = () => {
    const e2bApiKey = readSecretFile(builder.e2bApiKeyFile)
    const sandboxes = e2bConversationSandboxes({ apiKey: e2bApiKey, templateId: builder.e2bTemplateId })
    const idleMachineSweep = scheduleIdleMachineSweep({
      listPaused: () => listPausedConversationMachines(e2bApiKey),
      openRunConversations: store.readOpenRunConversations,
      kill: sandboxes.killRecorded,
      log,
    })
    return { sandboxes, idleMachineSweep }
  }
  const { sandboxes, idleMachineSweep } = conversationSandboxes ? { sandboxes: conversationSandboxes, idleMachineSweep: undefined } : e2bSandboxes()
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
    findParkedCall: async ({ projectId, conversationId, toolCallId }) => parkedCallStanding(await conversationSession(projectResourceId(projectId), conversationId), toolCallId),
    // Into the session the run's turns go through, which the browser's stream follows. The
    // controller keeps it in memory only; a session not open yet, or gone, has no one to tell.
    publishRun: async (run) => {
      const session = await controller.getSessionByResource(projectResourceId(run.projectId), conversationRunScope(run.conversationId))
      await session?.state.set({ conexusRun: run })
    },
  })
  const service = createBuilderService({
    store, applicationArtifacts: boundApplicationArtifacts, ...(applicationServer ? { applicationServer } : {}), runs,
  })
  // Sweeps at boot: the runs a stopped Hub left in flight are settled once their heartbeat is stale.
  const runLease = scheduleRunLease({ heartbeat: service.heartbeat, sweep: service.sweep })
  const session: BuilderSessionPort = Object.freeze({
    read: async ({ accountId, projectId }): Promise<BuilderSessionSnapshot> => {
      const preview = await store.readPreviewSubject({ accountId, projectId })
      if (!preview) throw new Failure('PROJECT_BUILD_DENIED')
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
      if (!preview) throw new Failure('PROJECT_BUILD_DENIED')
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
          if (latest?.conversationId !== conversationId) return 'NOT_PARKED'
          return service.answerBuilderRun({ accountId, projectId, builderRunId: latest.builderRunId, toolCallId, resumeData })
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
    killProjectSandboxes: async (projectId: string) => { await sandboxes.killRecorded(await store.readProjectSandboxes(projectId)) },
    // A deleted Project leaves neither its conversations nor its repository behind.
    deleteProjectRepository: async (projectId: string) => {
      const conversationIds = await conversations.deleteAll(projectId)
      await sessions.drop(projectResourceId(projectId), conversationIds)
      await sandboxes.destroy(conversationIds)
      await git.deleteRepository(projectId)
    },
    readApplicationFileBySource: service.readApplicationFileBySource,
    getApplicationBySource: service.getApplicationBySource,
    getApplicationThumbnail: boundApplicationArtifacts.getApplicationThumbnail,
    close: async () => {
      let drained: Promise<unknown> = Promise.resolve()
      try {
        try {
          service.stopLegs()
        } finally {
          drained = Promise.all([retentionPrune.close(), idleMachineSweep?.close()])
        }
        // The lease reads the run store's pool, which the service's close ends.
        await runLease.close()
        await service.close()
      } finally {
        try {
          await sessions.close()
          await controller.destroy()
        } finally {
          await docsTools.close()
          await googleAiProReady.then((started) => started?.close(), () => undefined)
          await observabilityLifecycle.close()
          await drained
          await Promise.all([storagePool.end(), modelAccountPool.end()])
        }
      }
    },
  })
}
