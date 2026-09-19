import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { MastraLanguageModel } from '@mastra/core/agent'
import { Observability, MastraStorageExporter } from '@mastra/observability'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { createCodingAgent } from '@mastra/core/coding-agent'
import { AgentController } from '@mastra/core/agent-controller'
import { createPostgresPool } from '../platform/postgres.js'
import { readSecretFile } from '../platform/secrets.js'
import { registerBuilderRoutes } from './routes.js'
import type { BuilderLaunchPreviewPort, BuilderMessagePart, BuilderSessionMessage, BuilderSessionPort, BuilderSessionSnapshot, BuilderTraceSummary } from './routes.js'
import {
  BUILDER_TRACE_REQUEST_CONTEXT_KEYS,
  BUILDER_CREDENTIAL_REQUEST_CONTEXT_KEY,
  BUILDER_MODEL_REQUEST_CONTEXT_KEY,
  createMastraE2BCodingWorkerRuntime,
  resolveBuilderWorkspace,
  safeActivityId,
  safePath,
  toolLabel,
} from './runtime.js'
import { createBuilderService } from './service.js'
import type { ApplicationSourceCoordinates, BuilderApplicationArtifacts, UnboundBuilderApplicationArtifacts } from './application-build.js'
import { createBuilderSourcePort } from './source.js'
import type { BuilderGitSourceCapability } from './source.js'
import { createBuilderStore } from './store.js'
import type { ModelChoice } from '../model-connection/model-catalog.js'
import { createE2BApplicationCompiler } from './application-artifact-runtime.js'
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

const messageDate = (value: unknown): string => {
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.valueOf()) ? new Date(0).toISOString() : date.toISOString()
}
type ProjectableBuilderMessage = Readonly<{
  id: string
  role: string
  type?: string
  content: unknown
  createdAt: unknown
}>
const nativeMessageParts = (content: unknown): readonly Record<string, unknown>[] => {
  if (typeof content === 'string') return content ? [{ type: 'text', text: content }] : []
  if (Array.isArray(content)) return content as Record<string, unknown>[]
  if (typeof content === 'object' && content !== null && 'parts' in content && Array.isArray((content as { parts?: unknown }).parts)) {
    return (content as { parts: Record<string, unknown>[] }).parts
  }
  return []
}
const sandboxExitOutcomes = (parts: readonly Record<string, unknown>[]): ReadonlyMap<string, Readonly<{ success: boolean; executionTimeMs?: number }>> => {
  const outcomes = new Map<string, Readonly<{ success: boolean; executionTimeMs?: number }>>()
  for (const part of parts) {
    if (part.type !== 'data-sandbox-exit' || typeof part.data !== 'object' || part.data === null) continue
    const { toolCallId, success, executionTimeMs } = part.data as Record<string, unknown>
    if (typeof toolCallId === 'string' && typeof success === 'boolean') {
      outcomes.set(toolCallId, Object.freeze({ success, ...(typeof executionTimeMs === 'number' ? { executionTimeMs } : {}) }))
    }
  }
  return outcomes
}
const buildActivityPart = (
  toolInvocation: Record<string, unknown>,
  outcomes: ReadonlyMap<string, Readonly<{ success: boolean; executionTimeMs?: number }>>,
): BuilderMessagePart | undefined => {
  const { toolCallId, toolName, args, state } = toolInvocation
  if (typeof toolCallId !== 'string' || typeof toolName !== 'string' || typeof state !== 'string') return undefined
  const outcome = outcomes.get(toolCallId)
  const path = safePath(args)
  return Object.freeze({
    kind: 'ACTIVITY' as const,
    id: safeActivityId(toolCallId),
    label: toolLabel(toolName),
    ...(path ? { path } : {}),
    state: outcome ? outcome.success ? 'succeeded' : 'failed' : state === 'result' ? 'succeeded' : 'interrupted',
    ...(outcome?.executionTimeMs !== undefined ? { durationMs: outcome.executionTimeMs } : {}),
  })
}
const buildMessageParts = (parts: readonly Record<string, unknown>[]): readonly BuilderMessagePart[] => {
  const outcomes = sandboxExitOutcomes(parts)
  return parts.flatMap((part): BuilderMessagePart[] => {
    if (part.type === 'text' && typeof part.text === 'string' && part.text.trim()) return [Object.freeze({ kind: 'TEXT' as const, text: part.text })]
    if (part.type === 'tool-invocation' && typeof part.toolInvocation === 'object' && part.toolInvocation !== null) {
      const activity = buildActivityPart(part.toolInvocation as Record<string, unknown>, outcomes)
      return activity ? [activity] : []
    }
    return []
  })
}
export const projectBuilderMessages = (messages: readonly ProjectableBuilderMessage[]): readonly BuilderSessionMessage[] => Object.freeze(messages
  .flatMap((message) => {
    const role: 'user' | 'assistant' | 'system' | null = message.role === 'signal' && message.type === 'user'
      ? 'user'
      : message.role === 'user' || message.role === 'assistant' || message.role === 'system'
        ? message.role
        : null
    if (!role) return []
    const parts = buildMessageParts(nativeMessageParts(message.content))
    return parts.length ? [{ id: message.id, role, createdAt: messageDate(message.createdAt), parts: Object.freeze(parts) }] : []
  })
  .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
  .map((message) => Object.freeze(message)))

export const resolveBuilderModel = ({ reference, modelIdentity, resolveModel, fallbackModel }: Readonly<{
  reference: unknown
  modelIdentity: unknown
  resolveModel?: (reference: Readonly<{ connectionId: string; generation: string }>, modelId: string) => MastraLanguageModel
  fallbackModel: MastraLanguageModel
}>): MastraLanguageModel => {
  if (reference === undefined) return fallbackModel
  if (resolveModel && reference && typeof reference === 'object' && 'connectionId' in reference && 'generation' in reference &&
    typeof reference.connectionId === 'string' && typeof reference.generation === 'string' &&
    modelIdentity && typeof modelIdentity === 'object' && 'modelId' in modelIdentity && typeof modelIdentity.modelId === 'string') {
    return resolveModel({ connectionId: reference.connectionId, generation: reference.generation }, modelIdentity.modelId)
  }
  throw new Error('BUILDER_MODEL_CREDENTIAL_UNRESOLVABLE')
}

export const createConfiguredBuilderModule = ({ database, builder, projectSource, applicationArtifacts, launchPreview, model, modelIdentity, modelChoices, validateModelCredential, resolveModel, origin, resolveCurrentSession }: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  builder: Readonly<{
    ingressPasswordFile: string; executorPasswordFile: string; e2bApiKeyFile: string
    e2bTemplateId: string; modelAdmissionId: string
  }>
  applicationArtifacts: UnboundBuilderApplicationArtifacts
  launchPreview?: BuilderLaunchPreviewPort
  projectSource: Readonly<{ storageRoot: string; git: BuilderGitSourceCapability }>
  model: MastraLanguageModel
  modelIdentity: Readonly<{ admissionId: string; providerId: string; modelId: string }>
  modelChoices?: readonly ModelChoice[]
  validateModelCredential(): void
  resolveModel?: (reference: Readonly<{ connectionId: string; generation: string }>, modelId: string) => MastraLanguageModel
  origin: string
  resolveCurrentSession: ResolveCurrentSession
}>) => {
  const executorPool = createPostgresPool({ ...database, user: 'hub_rb_executor', password: readSecretFile(builder.executorPasswordFile) })
  const store = createBuilderStore({
    ingressPool: createPostgresPool({ ...database, user: 'hub_rb_ingress', password: readSecretFile(builder.ingressPasswordFile) }),
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
      ...(resolveModel ? { resolveModel } : {}),
      fallbackModel: model,
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
  const sharedControllerReady = sharedController.init()
  let sessionStorageInit: Promise<void> | undefined
  const ensureSessionStorage = async (): Promise<void> => {
    sessionStorageInit ??= sessionStorage.init()
    await sessionStorageInit
  }
  const runtime = createMastraE2BCodingWorkerRuntime({
    apiKey: readSecretFile(builder.e2bApiKeyFile),
    templateId: builder.e2bTemplateId,
    model,
    modelIdentity,
    validateModelCredential,
    ...(resolveModel ? { resolveModel } : {}),
    sharedHarness: {
      controller: sharedController,
      ready: sharedControllerReady,
      flushObservability: observabilityLifecycle.flush,
    },
  })
  const compiler = createE2BApplicationCompiler({ apiKey: readSecretFile(builder.e2bApiKeyFile) })
  const appendDiagnostic = async ({ projectId, builderRunId, code }: Readonly<{ projectId: string; builderRunId: string; code: string }>): Promise<void> => {
    await ensureSessionStorage()
    await sessionMemory.saveMessages({ messages: [{
      id: randomUUID(), role: 'assistant', createdAt: new Date(), threadId: threadIdForProject(projectId), resourceId: projectId,
      content: { format: 2, parts: [{ type: 'text', text: `A execução ${builderRunId} preservou a fonte, mas a compilação falhou. Diagnóstico seguro: ${code}. Corrija a solicitação para tentar novamente.` }] },
    }] })
  }
  const service = createBuilderService({ store, source, runtime, compiler, applicationArtifacts: boundApplicationArtifacts, ...(modelChoices ? { modelChoices } : {}), requiresClaudeConnection: true, appendDiagnostic })
  const session: BuilderSessionPort = Object.freeze({
    read: async ({ accountId, projectId }): Promise<BuilderSessionSnapshot> => {
      const preview = await store.readPreviewSubject({ accountId, projectId })
      if (!preview) throw new Error('NOT_AUTHORIZED')
      await ensureSessionStorage()
      const runHistory = await store.listBuilderRuns({ accountId, projectId })
      const threadId = threadIdForProject(projectId)
      const thread = await sessionMemory.getThreadById({ threadId })
      const history = thread
        ? await sessionMemory.recall({ threadId, resourceId: projectId, page: 0, perPage: 50 })
        : { messages: [] }
      const messages = projectBuilderMessages(history.messages)
      return Object.freeze({
        projectId,
        threadId,
        messages: Object.freeze(messages),
        workingSourceRevision: preview.workingSourceRevision,
        lastPreviewSourceRevision: preview.lastPreviewSourceRevision ?? null,
        lastPreviewArtifactRevisionId: preview.lastPreviewArtifactRevisionId ?? null,
        lastPreviewArtifactDigest: preview.lastPreviewArtifactDigest ?? null,
        modelChoices: modelChoices ?? [{ choiceId: modelIdentity.admissionId, label: modelIdentity.modelId, providerId: modelIdentity.providerId, modelId: modelIdentity.modelId, capabilities: ['BUILDER_CODING'] as const }],
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
    registerBuilderRoutes: (app: FastifyInstance) => registerBuilderRoutes(app, { store, service, session, resolveCurrentSession, origin, ...(launchPreview ? { launchPreview } : {}) }),
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
