import type { FastifyInstance } from 'fastify'
import type { MastraLanguageModel } from '@mastra/core/agent'
import { createPostgresPool } from '../platform/postgres.js'
import { readSecretFile } from '../platform/secrets.js'
import { registerBuilderRoutes } from './routes.js'
import { createMastraE2BCodingWorkerRuntime } from './runtime.js'
import { createMastraE2BCandidateVerificationRuntime } from './verification-runtime.js'
import { createBuilderService } from './service.js'
import { createBuilderSourcePort } from './source.js'
import type { BuilderGitSourceCapability } from './source.js'
import { createBuilderStore } from './store.js'

export const createConfiguredBuilderModule = ({ database, builder, projectSource, model, modelIdentity, validateModelCredential, verifierModel, verifierModelIdentity, validateVerifierModelCredential, origin, resolveCurrentSession }: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  builder: Readonly<{
    ingressPasswordFile: string; executorPasswordFile: string; e2bApiKeyFile: string
    e2bTemplateId: string; modelAdmissionId: string; verifierModelAdmissionId: string
  }>
  projectSource: Readonly<{ storageRoot: string; ownership: Readonly<Record<string, string>>; git: BuilderGitSourceCapability }>
  model: MastraLanguageModel
  modelIdentity: Readonly<{ admissionId: string; providerId: string; modelId: string }>
  validateModelCredential(): void
  verifierModel: MastraLanguageModel
  verifierModelIdentity: Readonly<{ admissionId: string; providerId: string; modelId: string }>
  validateVerifierModelCredential(): void
  origin: string
  resolveCurrentSession: (request: import('fastify').FastifyRequest, requireCsrf?: boolean) => Promise<Readonly<{ account: Readonly<{ accountId: string }> }> | null>
}>) => {
  const store = createBuilderStore({
    ingressPool: createPostgresPool({ ...database, user: 'hub_rb_ingress', password: readSecretFile(builder.ingressPasswordFile) }),
    executorPool: createPostgresPool({ ...database, user: 'hub_rb_executor', password: readSecretFile(builder.executorPasswordFile) }),
  })
  const source = createBuilderSourcePort({
    git: projectSource.git,
    storageRoot: projectSource.storageRoot,
    sourceOwnership: projectSource.ownership,
  })
  const runtime = createMastraE2BCodingWorkerRuntime({
    apiKey: readSecretFile(builder.e2bApiKeyFile),
    templateId: builder.e2bTemplateId,
    model,
    modelIdentity,
    validateModelCredential,
  })
  const verifier = createMastraE2BCandidateVerificationRuntime({
    apiKey: readSecretFile(builder.e2bApiKeyFile),
    templateId: builder.e2bTemplateId,
    model: verifierModel,
    modelIdentity: verifierModelIdentity,
    validateModelCredential: validateVerifierModelCredential,
  })
  const service = createBuilderService({ store, source, runtime, verifier })
  return Object.freeze({
    registerBuilderRoutes: (app: FastifyInstance) => registerBuilderRoutes(app, { store, service, resolveCurrentSession, origin }),
    recover: service.recover,
    close: service.close,
  })
}
