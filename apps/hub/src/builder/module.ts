import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { ToolsInput } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { ConsoleLogger } from '@mastra/core/logger'
import type { ObservabilityInstance } from '@mastra/core/observability'
import type { RequestContext } from '@mastra/core/request-context'
import { openFactoryPool, type Database, type PostgresPool } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import { gitUnavailableAs } from '../platform/git-failure.js'
import type { Job } from '../platform/jobs.js'
import { logLine } from '../platform/logger.js'
import { createSecretEnvelope, readSecretFile } from '../platform/secrets.js'
import type { AccountId, BuilderRunId, ConversationId, ProjectId, BuilderTraceSummary } from '../../../../packages/contract/dist/index.js'
import { registerBuilderRoutes } from './routes.js'
import { mountLogFilter, mountValidationFailure, registerBuilderSessionRoutes } from './mastra-session-routes.js'
import type { ToolPayloadProjection } from './mastra-session-routes.js'
import type { BuilderLaunchPreviewPort, BuilderSessionPort } from './routes.js'
import { createBuilderService } from './service.js'
import type { ApplicationServerPort, ApplicationSourceCoordinates, BuilderApplicationArtifacts, UnboundBuilderApplicationArtifacts } from './application-build.js'
import { createBuilderStore } from './store.js'
export { builderProjectPorts, purgeProjectBuilder } from './project-ports.js'
import { buildTraceSummary, UNAVAILABLE_TRACE_SUMMARY } from './trace-summary.js'
import type { FactoryRuntimeConfig, GoogleAiProRuntimeConfig, InstallationSecretKey } from '../platform/config.js'
import { assertBuilderSkillsAvailable } from './skills-guard.js'
import type { BuilderRunPorts } from './run/ports.js'
import { createControllerRunSessions } from './run/turn.js'
import { loadCheckBundle } from './check-delivery.js'
import { e2bConversationSandboxes } from './conversation-sandboxes.js'
import type { ConversationSandboxes } from './conversation-sandboxes.js'
import { listPausedConversationMachines } from './sandbox.js'
import { APPLICATION_SHAPE_FILES, fixedApplicationStarterFiles } from './application-starter.js'
import { createConexusGit } from './conexus-git.js'
import { createConversations, projectResourceId } from './conversations.js'
import { sweepIdleMachines } from './idle-machine-sweep.js'
import { createBuilderObservability, createBuilderObservabilityLifecycle } from './observability.js'
import { createDiagnosticAppender } from './diagnostic-appender.js'
import { createBuilderStorage, pruneSpans } from './storage.js'
import { conversationScope, createLiveConversations } from './conversation.js'
import { createBuilderController, createContext7Docs } from './harness/index.js'
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
import { createModelRouting, type ModelRole, type ModelRoute } from './model-routing.js'
import { readRunContext } from './run-context.js'
import { createBuilderMemory } from './memory.js'
import { createCodexHolds, OPENAI_MODEL_PROVIDER } from './openai-codex/credential.js'
import { createOpenAICodexRoute } from './openai-codex/route.js'
import { registerModelAccountRoutes } from './model-accounts.js'
import type { BuilderRunDependencies } from './service.js'
import { isOpenRunState } from '../generated/builder-run-vocabulary.js'

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

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const RUN_LEASE_EVERY_MS = 10_000

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
export const createConfiguredBuilderModule = ({ data, database, runtimePool, builder, factory, secretKey, googleAiPro, applicationArtifacts, applicationServer, launchPreview, isInstallationAdministrator, readProjectName, connectors, connectorObservability, conversationSandboxes }: Readonly<{
  data: Database
  database: Readonly<{ host: string; port: number; database: string }>
  runtimePool: PostgresPool
  builder: Readonly<{
    e2bApiKeyFile: string
    e2bTemplateId: string; gitRoot: string; context7ApiKeyFile?: string | undefined; questionWaitMs: number; modelRetryDelayMs: number | undefined; sandboxIdleMs: number
  }>
  // Only its database password is still read: the Builder's Mastra storage lives in the `factory`
  // schema through the `hub_factory` role until slice 7 moves it to schema `mastra`.
  factory: Pick<FactoryRuntimeConfig, 'databasePasswordFile'>
  secretKey: InstallationSecretKey
  googleAiPro?: GoogleAiProRuntimeConfig
  applicationArtifacts: UnboundBuilderApplicationArtifacts
  applicationServer?: ApplicationServerPort
  launchPreview?: BuilderLaunchPreviewPort
  isInstallationAdministrator(account: AccountId): Promise<boolean>
  /** The Project's display name, which the Builder's prompt states. */
  readProjectName(input: Readonly<{ accountId: AccountId; projectId: ProjectId }>): Promise<string>
  connectors?: BuilderConnectorPort
  connectorObservability?: ObservabilityInstance
  /** The conversations' sandboxes; absent, the Hub uses E2B. Only a test composition passes one. */
  conversationSandboxes?: ConversationSandboxes
}>) => {
  assertBuilderSkillsAvailable()
  const check = loadCheckBundle()
  const log = logLine
  const store = createBuilderStore({ database: data, ownerId: randomUUID() })
  // Google AI Pro's credential lives in model.model_account (spec 0002), sealed with the same
  // envelope every Conexus secret uses.
  const modelAccounts = createModelAccountStore({
    pool: runtimePool,
    envelope: createSecretEnvelope(readSecretFile(secretKey.file), secretKey.previousFiles.map(readSecretFile)),
  })
  const googleAiProAccounts = createGoogleAiProAccounts(modelAccounts)
  const readDefault = async (role: ModelRole): Promise<string | null> =>
    (await runtimePool.query<{ model_id: string | null }>('SELECT model.read_installation_default($1) AS model_id', [role])).rows[0]?.model_id ?? null
  const getApplicationBySource = applicationArtifacts.getApplicationBySource
  const readApplicationFileBySource = applicationArtifacts.readApplicationFileBySource
  const retainApplicationThumbnail = applicationArtifacts.retainApplicationThumbnail
  const boundApplicationArtifacts: BuilderApplicationArtifacts = Object.freeze({
    ...(getApplicationBySource ? { getApplicationBySource: (input: ApplicationSourceCoordinates) => getApplicationBySource(runtimePool, input) } : {}),
    retainApplication: (input) => applicationArtifacts.retainApplication(runtimePool, input),
    ...(retainApplicationThumbnail ? { retainApplicationThumbnail: (input: Parameters<NonNullable<typeof retainApplicationThumbnail>>[1]) => retainApplicationThumbnail(runtimePool, input) } : {}),
    ...(readApplicationFileBySource ? { readApplicationFileBySource: (input: ApplicationSourceCoordinates & Readonly<{ artifactRevisionId: string; path: string }>) => readApplicationFileBySource(runtimePool, input) } : {}),
  })
  const git = createConexusGit({ root: builder.gitRoot, starter: [...fixedApplicationStarterFiles(), ...APPLICATION_SHAPE_FILES, ...starterProjectFiles()] })
  const storagePool = openFactoryPool({ ...database, user: 'hub_factory', passwordFile: factory.databasePasswordFile, options: '-c search_path=factory', max: 20, connectionTimeoutMillis: AGENT_STORAGE_CONNECT_TIMEOUT_MS })
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
  const modelRouting = createModelRouting({
    routes,
    modelAccounts,
    // Read when a run starts, long after the controller below exists.
    conversationModel: (projectId, conversationId) => conversationModel(projectId, conversationId),
    readDefault,
    record: (builderRunId, accountId, modelAccountId) => store.recordBuilderRunModelAccount({
      builderRunId, accountId, modelAccountId,
    }),
  })
  // Built, never connected, here: the tools are listed on a run's first step, so Context7 being down never delays boot.
  const docsTools = createContext7Docs({ apiKey: builder.context7ApiKeyFile ? readSecretFile(builder.context7ApiKeyFile) : undefined })
  const retryDelayMs = builder.modelRetryDelayMs
  const controller = createBuilderController({
    id: BUILDER_CONTROLLER_ID,
    workspace: (context) => liveConversations.workspace(context),
    runTools: ({ requestContext }) => {
      const context = readRunContext(requestContext)
      return context ? service.runTools(context.conversationId, context.builderRunId) : undefined
    },
    model: modelRouting.resolve,
    docsTools,
    memory: createBuilderMemory({ storage, memoryModel: modelRouting.resolveMemory }),
    ...(retryDelayMs === undefined ? {} : { modelRetryDelayMs: () => retryDelayMs }),
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
  // E2B's sandboxes come with the ports of the job that deletes its idle paused machines. A test
  // composition's own sandboxes have no E2B machines, so no key is read and nothing is swept.
  const e2bSandboxes = () => {
    const e2bApiKey = readSecretFile(builder.e2bApiKeyFile)
    const sandboxes = e2bConversationSandboxes({ apiKey: e2bApiKey, templateId: builder.e2bTemplateId, idleMs: builder.sandboxIdleMs, check })
    const machines = {
      listPaused: () => listPausedConversationMachines(e2bApiKey),
      openRunConversations: store.readOpenRunConversations,
      kill: sandboxes.killRecorded,
      log,
    }
    return { sandboxes, machines }
  }
  const { sandboxes, machines } = conversationSandboxes ? { sandboxes: conversationSandboxes, machines: undefined } : e2bSandboxes()
  const liveConversations = createLiveConversations({
    controller, sandboxes, readSandboxId: store.readConversationSandbox, runOpen: (conversationId) => service.runOpen(conversationId),
  })
  const conversationSession = async (ref: Readonly<{ projectId: ProjectId; conversationId: ConversationId }>) => {
    await ready
    return liveConversations.open(ref)
  }
  // The conversation's model is the one in its Mastra session, never a copy of Mastra's thread keys.
  const conversationModel = async (projectId: ProjectId, conversationId: ConversationId): Promise<string | null> => {
    const session = await conversationSession({ projectId, conversationId })
    await session.thread.loadMetadata()
    return session.model.hasSelection() ? session.model.get() : null
  }
  const conversations = createConversations(async () => {
    const memory = await mastra.getStorage()?.getStore('memory')
    if (!memory) throw new Failure('BUILDER_CONVERSATIONS_UNAVAILABLE')
    return memory
  })

  const openSession = createControllerRunSessions({ controller, conversations: liveConversations, readDefaultModel: () => readDefault('build') })
  const ports: BuilderRunPorts = Object.freeze({
    openSandbox: liveConversations.sandbox,
    openSession: async (input) => {
      await ready
      return openSession(input)
    },
    checkModel: modelRouting.check,
    check,
    readProjectName,
    git,
    ...(connectors ? { openConnectorRun: connectors.openRun } : {}),
    ...(applicationServer ? { invokeOperation: applicationServer.invoke } : {}),
    log,
  })
  const runs: BuilderRunDependencies = Object.freeze({
    ports,
    git,
    conversations,
    source: createProjectSourceReads({ git }),
    appendDiagnostic: createDiagnosticAppender(conversationSession),
    // Into the conversation's session, which the browser's stream follows. The controller keeps it
    // in memory only; a session not open yet, or gone, has no one to tell.
    publishRun: async (run) => {
      const session = await controller.getSessionByResource(projectResourceId(run.projectId), conversationScope(run.conversationId))
      await session?.state.set({ conexusRun: run })
    },
    questionWaitMs: builder.questionWaitMs,
  })
  const service = createBuilderService({
    store, applicationArtifacts: boundApplicationArtifacts, ...(applicationServer ? { applicationServer } : {}), runs,
  })
  // The first lease pass runs at start: the runs a stopped Hub left in flight are settled once their heartbeat is stale.
  const jobs: readonly Job[] = [
    { name: 'run-lease', everyMs: RUN_LEASE_EVERY_MS, run: service.renewLease },
    { name: 'span-prune', everyMs: DAY_MS, run: (signal) => pruneSpans(storage, log, signal) },
    { name: 'idle-conversations', everyMs: MINUTE_MS, run: liveConversations.sweep },
    ...(machines ? [{ name: 'idle-machines', everyMs: HOUR_MS, run: async (signal: AbortSignal) => { await sweepIdleMachines(machines, signal) } }] : []),
    ...(googleAiPro ? [{ name: 'idle-cliproxy', everyMs: MINUTE_MS, run: async (signal: AbortSignal) => { await (await googleAiProReady)?.pool.sweepIdle(signal) } }] : []),
  ]
  const readTraceSummary = async (projectId: ProjectId, builderRunId: BuilderRunId): Promise<BuilderTraceSummary> => {
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
    return buildTraceSummary({ traceId: root.traceId, spans: trace?.spans ?? [], scores: scoreRows })
  }
  const session: BuilderSessionPort = Object.freeze({
    read: async ({ accountId, projectId }) => {
      const preview = await store.readPreviewSubject({ accountId, projectId })
      if (!preview) throw new Failure('PROJECT_BUILD_DENIED')
      return Object.freeze({
        preview: Object.freeze({
          workingSourceRevision: await git.readMain(projectId).catch(gitUnavailableAs('BUILDER_SOURCE_UNAVAILABLE')),
          lastPreviewSourceRevision: preview.lastPreviewSourceRevision,
          lastPreviewArtifactRevisionId: preview.lastPreviewArtifactRevisionId,
          lastPreviewArtifactDigest: preview.lastPreviewArtifactDigest,
        }),
        runHistory: await store.listBuilderRuns({ accountId, projectId }),
      })
    },
    readTrace: ({ projectId, builderRunId }): Promise<BuilderTraceSummary> => readTraceSummary(projectId, builderRunId).catch((cause: unknown) => {
      throw new Failure('BUILDER_TRACE_UNAVAILABLE', { cause, details: { projectId, builderRunId } })
    }),
  })
  // The mount's one check: whether the account builds in the Project, by the same admission every Builder write takes.
  const mayBuild = (input: Readonly<{ accountId: AccountId; projectId: ProjectId }>): Promise<boolean> =>
    store.admitBuilder(input).then(() => true, (error: unknown) => {
      if (error instanceof Failure && (error.id === 'PROJECT_BUILD_DENIED' || error.id === 'PROJECT_NOT_FOUND')) return false
      throw error
    })
  return Object.freeze({
    jobs,
    registerBuilderRoutes: async (app: FastifyInstance) => {
      const builderOperations = await registerBuilderRoutes(app, { store, service, session, ...(launchPreview ? { launchPreview } : {}) })
      await ready
      await registerBuilderSessionRoutes(app, {
        mastra, controller, conversations: liveConversations, controllerId: BUILDER_CONTROLLER_ID, mayBuild,
        conversationOwner: ({ projectId, conversationId }) => conversations.ownerOf(projectId, conversationId),
        projectBusy: async ({ accountId, projectId }) => {
          const latest = await store.readBuilderRun({ accountId, projectId })
          return latest !== null && isOpenRunState(latest.state)
        },
        answerQuestion: service.answerQuestion,
        ...(connectors ? { toolPayloads: connectors.toolPayloadProjection } : {}),
      })
      const googleAiProPool = (await googleAiProReady)?.pool
      await registerModelAccountRoutes(app, {
        isInstallationAdministrator,
        modelAccounts,
        ...(googleAiProPool ? { googleAiPro: googleAiProPool, googleAiProAccounts } : {}),
      })
      return builderOperations
    },
    // Absent without the Builder, and then no Project can be created.
    prepareProjectRepository: (projectId: ProjectId) => git.ensureRepository(projectId),
    // Runs before the Project's purge, which drops the rows that name its VMs.
    killProjectSandboxes: async (projectId: ProjectId) => { await sandboxes.killRecorded(await store.readProjectSandboxes(projectId)) },
    // A deleted Project leaves neither its conversations nor its repository behind.
    deleteProjectRepository: async (projectId: ProjectId) => {
      const conversationIds = await conversations.deleteAll(projectId)
      await liveConversations.drop(projectId, conversationIds)
      await git.deleteRepository(projectId)
    },
    readApplicationFileBySource: service.readApplicationFileBySource,
    getApplicationBySource: service.getApplicationBySource,
    close: async () => {
      // The Hub closed its jobs first, so no pass reads what closes below.
      try {
        service.stopRuns()
        await service.close()
      } finally {
        try {
          await liveConversations.close()
          await controller.destroy()
        } finally {
          await docsTools.close()
          await googleAiProReady.then((started) => started?.close(), () => undefined)
          await observabilityLifecycle.close()
          await storagePool.end()
        }
      }
    },
  })
}
