import type { FastifyInstance } from 'fastify'
import { createHash } from 'node:crypto'
import type { ToolsInput } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { ConsoleLogger } from '@mastra/core/logger'
import type { ObservabilityInstance, SpanOutputProcessor } from '@mastra/core/observability'
import { SpanType } from '@mastra/core/observability'
import type { RequestContext } from '@mastra/core/request-context'
import type { MastraCompositeStore, RetentionConfig } from '@mastra/core/storage'
import type { Workspace } from '@mastra/core/workspace'
import { Memory } from '@mastra/memory'
import { Observability, MastraStorageExporter } from '@mastra/observability'
import { PostgresStore } from '@mastra/pg'
import { createPostgresPool } from '../platform/postgres.js'
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
import { createBuilderRunRuntime, createControllerRunSessions, e2bRunSandboxes } from './run-runtime.js'
import type { BuilderRunPorts, RunContextBinder } from './run-runtime.js'
import { APPLICATION_CHECK_FILES, FIXED_APPLICATION_STARTER_FILES } from './application-starter.js'
import { createConexusGit } from './conexus-git.js'
import { createConversations, projectResourceId } from './conversations.js'
import { createBuilderController, readModeId } from './harness/index.js'
import type { BuilderModeId } from './harness/index.js'
import { starterProjectKnowledge } from './project-knowledge.js'
import { createProjectSourceReads } from './source.js'
import { createCliproxyPool, defaultCliproxyStateDir, verifyCliproxyBinary } from './google-ai-pro/pool.js'
import { startModelRouter } from './google-ai-pro/router.js'
import { GOOGLE_AI_PRO_PROVIDER, type GoogleAiProKey } from './google-ai-pro/credential.js'
import { createGoogleAiProAccounts } from './google-ai-pro/store.js'
import { registerModelAccountRoutes } from './model-accounts.js'
import type { BuilderRunDependencies, RunNote } from './service.js'

const BUILDER_OBSERVABILITY_FLUSH_TIMEOUT_MS = 5_000

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

// The next turn reads this thread, and a discarded run's tool calls in it describe edits the files
// no longer have, so the note is written for the agent as much as for the person.
const discarded = (sourceRevision: string): string =>
  `As alterações desta execução foram descartadas e os arquivos voltaram à revisão ${sourceRevision}; as edições descritas acima nesta conversa não existem nos arquivos. Leia os arquivos antes de confiar neste histórico.`

const NOTE_TEXT: Readonly<Record<RunNote['outcome'], (note: RunNote) => string>> = Object.freeze({
  SOURCE_BASE_MOVED: ({ builderRunId, code, sourceRevision }) =>
    `A execução ${builderRunId} não foi aplicada: a fonte do Project mudou enquanto ela trabalhava, e nada foi sobrescrito. ${discarded(sourceRevision)} Diagnóstico seguro: ${code}. Envie o pedido novamente: ele começará da versão atual da fonte.`,
  RUN_NOT_FINISHED: ({ builderRunId, code, sourceRevision }) =>
    `A execução ${builderRunId} não terminou e nada dela foi aplicado. ${discarded(sourceRevision)} Diagnóstico seguro: ${code}.`,
  BUILD_FAILED: ({ builderRunId, code, detail }) =>
    `A execução ${builderRunId} preservou a fonte, mas a compilação falhou. Diagnóstico seguro: ${code}.${detail ? ` Detalhe: ${detail}` : ''} Corrija a solicitação para tentar novamente.`,
  PLATFORM_FAILED: ({ builderRunId, code }) =>
    `A execução ${builderRunId} preservou a fonte, mas o Conexus não conseguiu gerar a prévia por uma falha da própria plataforma, não da fonte. Diagnóstico seguro: ${code}. Não altere os arquivos por causa desta falha; envie o pedido novamente quando a plataforma voltar.`,
  CANDIDATE_REFUSED: ({ builderRunId, code, detail, sourceRevision }) =>
    `A execução ${builderRunId} não foi aplicada: o Conexus recusou o resultado antes de aprová-lo. ${discarded(sourceRevision)} Diagnóstico seguro: ${code}.${detail ? ` Motivo: ${detail}` : ''} Corrija isso na próxima execução.`,
  PREVIEW_DATA_RESET: ({ builderRunId }) =>
    `A execução ${builderRunId} mudou migrações que já tinham sido aplicadas, então os dados da Preview deste Project foram apagados e todas as migrações rodaram de novo.`,
})

const noteMessage = (note: RunNote) => ({
  id: diagnosticMessageId(note.builderRunId, note.code), role: 'assistant' as const, createdAt: new Date(), threadId: note.conversationId,
  resourceId: projectResourceId(note.projectId),
  content: { format: 2 as const, parts: [{ type: 'text' as const, text: NOTE_TEXT[note.outcome](note) }] },
})

/** @public Tests import this at runtime from the built module. */
export const createDiagnosticAppender = (conversations: Pick<ReturnType<typeof createConversations>, 'appendMessage'>) =>
  (note: RunNote): Promise<void> => conversations.appendMessage(noteMessage(note))

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
// `maxAge` policy above; this is the schedule that actually deletes rows older than it.
type RetentionSchedule = Readonly<{ tick(): Promise<void>; close(): void }>

/** @public Tests import this at runtime from the built module. */
export const scheduleRetentionPrune = (
  storage: Pick<MastraCompositeStore, 'prune'>,
  log: (line: string) => void,
  intervalMs = RETENTION_PRUNE_INTERVAL_MS,
): RetentionSchedule => {
  const tick = async (): Promise<void> => {
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

/** The Connector owner's part in a Builder run; absent without a Connector module. */
export type BuilderConnectorPort = Readonly<{
  openRun: NonNullable<BuilderRunPorts['openConnectorRun']>
  tools(context: Readonly<{ requestContext: RequestContext }>): ToolsInput
  toolPayloadProjection: ToolPayloadProjection
}>

const BUILDER_CONTROLLER_ID = 'conexus-builder'
const RUN_ID_KEY = 'conexusBuilderRunId'
const ROLE_OF_MODE: Readonly<Record<BuilderModeId, 'plan' | 'build'>> = Object.freeze({ plan: 'plan', build: 'build' })

type RunModel = Readonly<{ key: GoogleAiProKey }>

/**
 * The model a turn runs on (spec 0002, Value sourcing): the thread's selection for the current mode,
 * else the installation's default for that role, called through the Hub's Google AI Pro router
 * with the run's own account. Only Google AI Pro is wired in slice 1; any other model refuses the
 * turn the same way a missing account does.
 */
const createModelResolver = ({ runModels, readDefault, routerUrl }: Readonly<{
  runModels: ReadonlyMap<string, RunModel>
  readDefault(role: 'plan' | 'build'): Promise<string | null>
  routerUrl: () => Promise<string | undefined>
}>) => async ({ requestContext }: Readonly<{ requestContext: RequestContext }>) => {
  const runId = requestContext.getRaw(RUN_ID_KEY)
  const run = typeof runId === 'string' ? runModels.get(runId) : undefined
  const url = await routerUrl()
  if (!run || !url) throw new Error('BUILDER_MODEL_NOT_SELECTED')
  const controller = requestContext.get('controller') as Readonly<{ session?: Readonly<{ modelId?: unknown }> }> | undefined
  const selected = typeof controller?.session?.modelId === 'string' && controller.session.modelId ? controller.session.modelId : null
  const modelId = selected ?? await readDefault(ROLE_OF_MODE[readModeId(requestContext) ?? 'plan'])
  const prefix = `${GOOGLE_AI_PRO_PROVIDER}/`
  if (!modelId?.startsWith(prefix)) throw new Error('BUILDER_MODEL_NOT_SELECTED')
  return { providerId: GOOGLE_AI_PRO_PROVIDER, modelId: modelId.slice(prefix.length), url: `${url}/v1`, apiKey: run.key }
}

export const createConfiguredBuilderModule = ({ database, builder, factory, secretKey, googleAiPro, applicationArtifacts, applicationServer, launchPreview, origin, resolveCurrentSession, isInstallationAdministrator, connectors, connectorObservability }: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  builder: Readonly<{
    ingressPasswordFile: string; executorPasswordFile: string; modelAccountPasswordFile: string; e2bApiKeyFile: string
    e2bTemplateId: string; gitRoot: string
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
  connectors?: BuilderConnectorPort
  connectorObservability?: ObservabilityInstance
}>) => {
  assertBuilderSkillsAvailable()
  const log = (line: string): void => { process.stderr.write(`${line}\n`) }
  const executorPool = createPostgresPool({ ...database, user: 'hub_builder_executor', password: readSecretFile(builder.executorPasswordFile) })
  const store = createBuilderStore({
    ingressPool: createPostgresPool({ ...database, user: 'hub_builder_ingress', password: readSecretFile(builder.ingressPasswordFile) }),
    executorPool,
  })
  // Google AI Pro's credential lives in model.model_account (spec 0002), sealed with the same
  // envelope every Conexus secret uses.
  const modelAccountPool = createPostgresPool({ ...database, user: 'hub_model_account', password: readSecretFile(builder.modelAccountPasswordFile) })
  const googleAiProAccounts = createGoogleAiProAccounts({
    pool: modelAccountPool,
    envelope: createSecretEnvelope(readSecretFile(secretKey.file), secretKey.previousFiles.map(readSecretFile)),
  })
  const readDefault = async (role: 'plan' | 'build'): Promise<string | null> =>
    (await modelAccountPool.query<{ model_id: string | null }>('SELECT model.read_installation_default($1) AS model_id', [role])).rows[0]?.model_id ?? null
  const getApplicationBySource = applicationArtifacts.getApplicationBySource
  const readApplicationFileBySource = applicationArtifacts.readApplicationFileBySource
  const boundApplicationArtifacts: BuilderApplicationArtifacts = Object.freeze({
    ...(getApplicationBySource ? { getApplicationBySource: (input: ApplicationSourceCoordinates) => getApplicationBySource(executorPool, input) } : {}),
    retainApplication: (input) => applicationArtifacts.retainApplication(executorPool, input),
    ...(readApplicationFileBySource ? { readApplicationFileBySource: (input: ApplicationSourceCoordinates & Readonly<{ artifactRevisionId: string; path: string }>) => readApplicationFileBySource(executorPool, input) } : {}),
  })
  const git = createConexusGit({ root: builder.gitRoot, starter: [...FIXED_APPLICATION_STARTER_FILES, ...APPLICATION_CHECK_FILES, starterProjectKnowledge()] })

  const storagePool = createPostgresPool({ ...database, user: 'hub_factory', password: readSecretFile(factory.databasePasswordFile), options: '-c search_path=factory', max: 20 })
  const storage = createBuilderStorage(storagePool)
  const observability = createBuilderObservability('conexus-builder', connectorObservability)
  const observabilityLifecycle = createBuilderObservabilityLifecycle(observability)
  const googleAiProReady = googleAiPro ? startGoogleAiPro(googleAiPro) : Promise.resolve(undefined)
  googleAiProReady.catch(() => undefined)

  const runModels = new Map<string, RunModel>()
  const runContexts = new Map<string, RunContextBinder>()
  const runWorkspaces = new Map<string, Workspace>()
  const controller = createBuilderController({
    id: BUILDER_CONTROLLER_ID,
    workspace: ({ requestContext }) => {
      const runId = requestContext.getRaw(RUN_ID_KEY)
      return typeof runId === 'string' ? runWorkspaces.get(runId) : undefined
    },
    model: createModelResolver({ runModels, readDefault, routerUrl: async () => (await googleAiProReady.catch(() => undefined))?.url }),
    memory: new Memory({ options: { lastMessages: 40, semanticRecall: false } }),
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
  const retentionPrune = scheduleRetentionPrune(storage, log)
  const conversations = createConversations(async () => {
    const memory = await mastra.getStorage()?.getStore('memory')
    if (!memory) throw new Error('BUILDER_CONVERSATIONS_UNAVAILABLE')
    return memory
  })

  const openSession = createControllerRunSessions({ controller, runContexts, runWorkspaces })
  const runtime = createBuilderRunRuntime({
    createSandbox: e2bRunSandboxes({ apiKey: readSecretFile(builder.e2bApiKeyFile), templateId: builder.e2bTemplateId }),
    openSession: async (input) => {
      await ready
      return openSession(input)
    },
    holdModelAccount: async ({ builderRunId, accountId }) => {
      const account = await googleAiProAccounts.read(accountId)
      if (!account) throw new Error('BUILDER_MODEL_NOT_SELECTED')
      runModels.set(builderRunId, { key: account.key })
      return { modelAccountId: account.modelAccountId, release: () => { runModels.delete(builderRunId) } }
    },
    git,
    ...(connectors ? { openConnectorRun: connectors.openRun } : {}),
    log,
  })
  const runs: BuilderRunDependencies = Object.freeze({
    runtime,
    git,
    conversations,
    source: createProjectSourceReads({ git }),
    appendDiagnostic: createDiagnosticAppender(conversations),
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
        mastra, controller, controllerId: BUILDER_CONTROLLER_ID, origin, resolveCurrentSession, admitProject,
        conversationOwner: ({ projectId, conversationId }) => conversations.ownerOf(projectId, conversationId),
        projectBusy: async ({ accountId, projectId }) => {
          const latest = await store.readBuilderRun({ accountId, projectId })
          return latest?.state === 'QUEUED' || latest?.state === 'RUNNING'
        },
        runContext: (scope) => runContexts.get(scope),
        ...(connectors ? { toolPayloads: connectors.toolPayloadProjection } : {}),
      })
      const googleAiProPool = (await googleAiProReady)?.pool
      await registerModelAccountRoutes(app, {
        origin,
        resolveCurrentSession,
        isInstallationAdministrator,
        ...(googleAiProPool ? { googleAiPro: googleAiProPool, googleAiProAccounts } : {}),
      })
      return builderOperations
    },
    // Absent without the Builder, and then no Project can be created.
    prepareProjectRepository: (projectId: string) => git.ensureRepository(projectId),
    // A deleted Project leaves neither its conversations nor its repository behind.
    deleteProjectRepository: async (projectId: string) => {
      await conversations.deleteAll(projectId)
      await git.deleteRepository(projectId)
    },
    readApplicationFileBySource: service.readApplicationFileBySource,
    getApplicationBySource: service.getApplicationBySource,
    recover: service.recover,
    close: async () => {
      retentionPrune.close()
      try {
        await service.close()
      } finally {
        try {
          await controller.destroy()
        } finally {
          await googleAiProReady.then((started) => started?.close(), () => undefined)
          await observabilityLifecycle.close()
          await Promise.all([storagePool.end(), modelAccountPool.end()])
        }
      }
    },
  })
}
