import type { FastifyInstance } from 'fastify'
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
import type { BuilderLaunchPreviewPort, BuilderSessionPort, BuilderSessionSnapshot } from './routes.js'
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
import { createE2BApplicationCompiler } from './application-artifact-runtime.js'
import { BUILDER_BASE_AGENT_INSTRUCTIONS, BUILDER_MODE_DEFINITIONS } from './application-starter.js'

const BUILDER_THREAD_PREFIX = 'conexus-builder:'
const threadIdForProject = (projectId: string): string => `${BUILDER_THREAD_PREFIX}${projectId}`
const BUILDER_OBSERVABILITY_FLUSH_TIMEOUT_MS = 5_000

type BuilderObservabilityLifecycle = Readonly<{
  flush(): Promise<void>
  close(): Promise<void>
}>

const createBuilderObservabilityLifecycle = (observability: Observability): BuilderObservabilityLifecycle => {
  let queued: Promise<void> = Promise.resolve()
  let closing = false
  const reportFailure = (): void => {
    process.emitWarning('BUILDER_PREPARATION_FAILED', { code: 'BUILDER_PREPARATION_FAILED' })
  }
  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const result = queued.then(operation, operation)
    queued = result.catch(() => undefined)
    return result
  }
  const waitBounded = (operation: Promise<void>): Promise<'completed' | 'failed' | 'timed-out'> => new Promise((resolve) => {
    const timeout = setTimeout(() => resolve('timed-out'), BUILDER_OBSERVABILITY_FLUSH_TIMEOUT_MS)
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
    close: async () => {
      closing = true
      const queuedResult = await waitBounded(queued)
      if (queuedResult !== 'completed') {
        reportFailure()
        return
      }
      const shutdownResult = await waitBounded(observability.shutdown())
      if (shutdownResult !== 'completed') reportFailure()
    },
  })
}

const messageText = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.flatMap((part) => {
    if (typeof part !== 'object' || part === null || !('type' in part) || part.type !== 'text' || !('text' in part) || typeof part.text !== 'string') return []
    return [part.text]
  }).join('')
  if (typeof content === 'object' && content !== null && 'parts' in content) {
    return messageText(content.parts)
  }
  return ''
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
export const projectBuilderMessages = (messages: readonly ProjectableBuilderMessage[]) => Object.freeze(messages
  .flatMap((message) => {
    const role: 'user' | 'assistant' | 'system' | null = message.role === 'signal' && message.type === 'user'
      ? 'user'
      : message.role === 'user' || message.role === 'assistant' || message.role === 'system'
        ? message.role
        : null
    const text = messageText(message.content)
    return role && text.trim() ? [{ id: message.id, role, text, createdAt: messageDate(message.createdAt) }] : []
  })
  .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
  .map((message) => Object.freeze(message)))

export const createConfiguredBuilderModule = ({ database, builder, projectSource, applicationArtifacts, launchPreview, model, modelIdentity, validateModelCredential, origin, resolveCurrentSession }: Readonly<{
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
  validateModelCredential(): void
  origin: string
  resolveCurrentSession: (request: import('fastify').FastifyRequest, requireCsrf?: boolean) => Promise<Readonly<{ account: Readonly<{ accountId: string }> }> | null>
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
    id: 'conexus-builder-coding-agent', name: 'Conexus Coding Worker', model, workspace: resolveBuilderWorkspace,
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
    sharedHarness: {
      controller: sharedController,
      ready: sharedControllerReady,
      flushObservability: observabilityLifecycle.flush,
    },
  })
  const compiler = createE2BApplicationCompiler({ apiKey: readSecretFile(builder.e2bApiKeyFile) })
  const service = createBuilderService({ store, source, runtime, compiler, applicationArtifacts: boundApplicationArtifacts })
  const session: BuilderSessionPort = Object.freeze({
    read: async ({ accountId, projectId }): Promise<BuilderSessionSnapshot> => {
      const preview = await store.readPreviewSubject({ accountId, projectId })
      if (!preview) throw new Error('NOT_AUTHORIZED')
      await ensureSessionStorage()
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
      })
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
