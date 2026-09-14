import type { FastifyInstance } from 'fastify'
import { join } from 'node:path'
import type { MastraLanguageModel } from '@mastra/core/agent'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { createCodingAgent } from '@mastra/core/coding-agent'
import { AgentController } from '@mastra/core/agent-controller'
import { createPostgresPool } from '../platform/postgres.js'
import { readSecretFile } from '../platform/secrets.js'
import { registerBuilderRoutes } from './routes.js'
import type { BuilderLaunchPreviewPort, BuilderSessionPort, BuilderSessionSnapshot } from './routes.js'
import { createMastraE2BCodingWorkerRuntime } from './runtime.js'
import type { BuilderProjectKnowledgeReader } from './runtime.js'
import { createBuilderService } from './service.js'
import type { ApplicationArtifactReadRequest, ApplicationSourceCoordinates, BuilderApplicationArtifacts, UnboundBuilderApplicationArtifacts } from './application-build.js'
import { createBuilderSourcePort } from './source.js'
import type { BuilderGitSourceCapability } from './source.js'
import { createBuilderStore } from './store.js'
import { createE2BApplicationCompiler } from './application-artifact-runtime.js'
import { BUILDER_BASE_AGENT_INSTRUCTIONS } from './application-starter.js'

const BUILDER_THREAD_PREFIX = 'conexus-builder:'
const threadIdForProject = (projectId: string): string => `${BUILDER_THREAD_PREFIX}${projectId}`
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

export const createConfiguredBuilderModule = ({ database, builder, projectSource, applicationArtifacts, launchPreview, model, modelIdentity, validateModelCredential, origin, resolveCurrentSession, brainReader }: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  builder: Readonly<{
    ingressPasswordFile: string; executorPasswordFile: string; e2bApiKeyFile: string
    e2bTemplateId: string; modelAdmissionId: string
  }>
  applicationArtifacts: UnboundBuilderApplicationArtifacts
  launchPreview?: BuilderLaunchPreviewPort
  projectSource: Readonly<{ storageRoot: string; ownership: Readonly<Record<string, string>>; git: BuilderGitSourceCapability }>
  model: MastraLanguageModel
  modelIdentity: Readonly<{ admissionId: string; providerId: string; modelId: string }>
  validateModelCredential(): void
  origin: string
  resolveCurrentSession: (request: import('fastify').FastifyRequest, requireCsrf?: boolean) => Promise<Readonly<{ account: Readonly<{ accountId: string }> }> | null>
  brainReader?: BuilderProjectKnowledgeReader
}>) => {
  const executorPool = createPostgresPool({ ...database, user: 'hub_rb_executor', password: readSecretFile(builder.executorPasswordFile) })
  const store = createBuilderStore({
    ingressPool: createPostgresPool({ ...database, user: 'hub_rb_ingress', password: readSecretFile(builder.ingressPasswordFile) }),
    executorPool,
  })
  const getApplicationBySource = applicationArtifacts.getApplicationBySource
  const readApplicationFileBySource = applicationArtifacts.readApplicationFileBySource
  const boundApplicationArtifacts: BuilderApplicationArtifacts = Object.freeze({
    getApplication: (input) => applicationArtifacts.getApplication(executorPool, input),
    ...(getApplicationBySource ? { getApplicationBySource: (input: ApplicationSourceCoordinates) => getApplicationBySource(executorPool, input) } : {}),
    retainApplication: (input) => applicationArtifacts.retainApplication(executorPool, input),
    readApplicationFile: (input: ApplicationArtifactReadRequest) => applicationArtifacts.readApplicationFile(executorPool, input),
    ...(readApplicationFileBySource ? { readApplicationFileBySource: (input: ApplicationSourceCoordinates & Readonly<{ artifactRevisionId: string; path: string }>) => readApplicationFileBySource(executorPool, input) } : {}),
  })
  const source = createBuilderSourcePort({
    git: projectSource.git,
    storageRoot: projectSource.storageRoot,
    sourceOwnership: projectSource.ownership,
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
  const sharedAgent = createCodingAgent({
    id: 'conexus-builder-coding-agent', name: 'Conexus Coding Worker', model, workspace: undefined,
    editor: false, instructions: BUILDER_BASE_AGENT_INSTRUCTIONS, tools: {},
  })
  const sharedController = new AgentController<Record<string, unknown>>({
    id: 'conexus-builder-controller', storage: sessionStorage, memory: sessionMemory,
    initialState: { yolo: true },
    modes: [
      { id: 'build', name: 'Build', instructions: 'Implement and report the bounded Project request.', availableTools: ['mastra_workspace_read_file', 'mastra_workspace_write_file', 'mastra_workspace_edit_file', 'mastra_workspace_list_files', 'mastra_workspace_delete', 'mastra_workspace_file_stat', 'mastra_workspace_grep', 'mastra_workspace_execute_command'] },
      { id: 'plan', name: 'Plan', instructions: 'Inspect and explain the bounded Project request without changing files.', availableTools: ['mastra_workspace_read_file', 'mastra_workspace_list_files', 'mastra_workspace_file_stat', 'mastra_workspace_grep'] },
    ],
    defaultModeId: 'build', agent: sharedAgent, workspace: undefined,
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
    sessionStorage,
    sessionMemory,
    sharedHarness: { agent: sharedAgent, controller: sharedController, ready: sharedControllerReady },
    ...(brainReader ? { brainReader } : {}),
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
        activeTurn: null,
        workingSourceRevision: preview.workingSourceRevision,
        lastPreviewChangeId: preview.lastPreviewChangeId,
        lastPreviewSourceRevision: preview.lastPreviewSourceRevision ?? null,
        lastPreviewArtifactRevisionId: preview.lastPreviewArtifactRevisionId ?? null,
        lastPreviewArtifactDigest: preview.lastPreviewArtifactDigest ?? null,
      })
    },
  })
  return Object.freeze({
    registerBuilderRoutes: (app: FastifyInstance) => registerBuilderRoutes(app, { store, service, session, resolveCurrentSession, origin, ...(launchPreview ? { launchPreview } : {}) }),
    prepareApplication: service.prepareApplication,
    readApplicationFile: service.readApplicationFile,
    readApplicationFileBySource: service.readApplicationFileBySource,
    getApplicationBySource: service.getApplicationBySource,
    startPreviewPreparation: service.startPreviewPreparation,
    readPreviewPreparation: service.readPreviewPreparation,
    recover: service.recover,
    close: async () => {
      try {
        await service.close()
      } finally {
        await sharedController.destroy()
        await sessionStorage.close()
      }
    },
  })
}
