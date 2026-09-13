import type { FastifyInstance } from 'fastify'
import { join } from 'node:path'
import type { MastraLanguageModel } from '@mastra/core/agent'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { createPostgresPool } from '../platform/postgres.js'
import { readSecretFile } from '../platform/secrets.js'
import { registerBuilderRoutes } from './routes.js'
import type { BuilderLaunchPreviewPort } from './routes.js'
import { createMastraE2BCodingWorkerRuntime } from './runtime.js'
import { createBuilderService } from './service.js'
import type { ApplicationArtifactReadRequest, BuilderApplicationArtifacts, UnboundBuilderApplicationArtifacts } from './application-build.js'
import { createBuilderSourcePort } from './source.js'
import type { BuilderGitSourceCapability } from './source.js'
import { createBuilderStore } from './store.js'
import { createE2BApplicationCompiler } from './application-artifact-runtime.js'

export const createConfiguredBuilderModule = ({ database, builder, projectSource, applicationArtifacts, launchPreview, model, modelIdentity, validateModelCredential, origin, resolveCurrentSession }: Readonly<{
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
}>) => {
  const executorPool = createPostgresPool({ ...database, user: 'hub_rb_executor', password: readSecretFile(builder.executorPasswordFile) })
  const store = createBuilderStore({
    ingressPool: createPostgresPool({ ...database, user: 'hub_rb_ingress', password: readSecretFile(builder.ingressPasswordFile) }),
    executorPool,
  })
  const boundApplicationArtifacts: BuilderApplicationArtifacts = Object.freeze({
    getApplication: (input) => applicationArtifacts.getApplication(executorPool, input),
    retainApplication: (input) => applicationArtifacts.retainApplication(executorPool, input),
    readApplicationFile: (input: ApplicationArtifactReadRequest) => applicationArtifacts.readApplicationFile(executorPool, input),
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
  const runtime = createMastraE2BCodingWorkerRuntime({
    apiKey: readSecretFile(builder.e2bApiKeyFile),
    templateId: builder.e2bTemplateId,
    model,
    modelIdentity,
    validateModelCredential,
    sessionStorage,
    sessionMemory,
  })
  const compiler = createE2BApplicationCompiler({ apiKey: readSecretFile(builder.e2bApiKeyFile) })
  const service = createBuilderService({ store, source, runtime, compiler, applicationArtifacts: boundApplicationArtifacts })
  return Object.freeze({
    registerBuilderRoutes: (app: FastifyInstance) => registerBuilderRoutes(app, { store, service, resolveCurrentSession, origin, ...(launchPreview ? { launchPreview } : {}) }),
    prepareApplication: service.prepareApplication,
    readApplicationFile: service.readApplicationFile,
    startPreviewPreparation: service.startPreviewPreparation,
    readPreviewPreparation: service.readPreviewPreparation,
    recover: service.recover,
    close: async () => {
      try {
        await service.close()
      } finally {
        await sessionStorage.close()
      }
    },
  })
}
