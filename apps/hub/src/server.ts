import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { createBrainBindingValidator, createBrainModule } from './brain/module.js'
import {
  authenticateSankhya,
  createConfiguredConnectionModule,
  resolveSankhyaOrigin,
  sankhyaProductionResponseAdmission,
} from './connections/module.js'
import { createEncryptedFileCredentialBackend } from './platform/credential-backend.js'
import {
  createRegisteredKeyConformance,
  createSankhyaKeyConformanceObserver,
  createSankhyaKeyConformanceSubjectResolver,
  readSankhyaKeyConformanceRegistrationCatalog,
} from './gateway/module.js'
import { createHttpApp } from './http/app.js'
import { createIdentityAccessModule } from './identity-access/module.js'
import { createMarModule } from './mar/module.js'
import { readHubConfig } from './platform/config.js'
import { censusConnections, reportConnectionCensus } from './platform/connection-census.js'
import { createPostgresPool } from './platform/postgres.js'
import { readSecretFile } from './platform/secrets.js'
import { createApplicationArtifactStore, createRegistryStore } from './registry/module.js'
import { createWorkspaceModule } from './workspace/module.js'
import { createClaudeAccountModule } from './claude-account/module.js'

// Mastra is loaded only after the production entrypoint has disabled its
// optional telemetry. Keep this before the dynamic Project-module import.
process.env.MASTRA_TELEMETRY_DISABLED = '1'
const {
  createConfiguredProjectModule,
  createConfiguredProjectConnectionBindingModule,
  createConfiguredProjectBindingModule,
  createConfiguredProjectSourceSnapshotFactory,
  createProjectKeyConformanceBasisResolver,
  createProjectBrainRealizationPort,
  createBuilderProjectGitCapability,
  resolveProjectModelAdmission,
  readProjectModelChoices,
} = await import('./project/module.js')
const { createConfiguredBuilderModule } = await import('./builder/module.js')
type ProjectBindingsRuntime = ReturnType<typeof createConfiguredProjectConnectionBindingModule> |
  ReturnType<typeof createConfiguredProjectBindingModule>

const config = readHubConfig()
const pool = createPostgresPool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: readSecretFile(config.database.passwordFile),
})
const s2ReadPool = config.database.workspace ? createPostgresPool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: 'hub_s2_read',
  password: readSecretFile(config.database.workspace.readPasswordFile),
}) : undefined
const identityAccessDependencies = {
  pool,
  workspaceReadPool: s2ReadPool,
  origin: config.origin,
  issuer: config.oidc.issuer,
  clientId: config.oidc.clientId,
  clientSecret: readSecretFile(config.oidc.clientSecretFile),
  bootstrapSubject: config.bootstrapSubject,
  allowInsecureForTest: config.oidc.allowInsecureForTest,
} satisfies Parameters<typeof createIdentityAccessModule>[0] & Readonly<{ workspaceReadPool: typeof s2ReadPool }>
const identityAccess = await createIdentityAccessModule(identityAccessDependencies)
const workspace = config.database.workspace && s2ReadPool ? createWorkspaceModule({
  commandPool: createPostgresPool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: 'hub_ws01_command',
    password: readSecretFile(config.database.workspace.commandPasswordFile),
  }),
  readPool: s2ReadPool,
  origin: config.origin,
  operatorIssuer: config.oidc.issuer,
  operatorSubject: config.bootstrapSubject,
  resolveCurrentSession: identityAccess.resolveCurrentSession,
}) : undefined
if (config.project && config.projectBindings && config.project.storageRoot !== config.projectBindings.storageRoot) {
  throw new Error('PROJECT_BINDING_STORAGE_ROOT_MISMATCH')
}
const sharedSourceSnapshot = config.projectBindings?.brain
  ? createConfiguredProjectSourceSnapshotFactory({
    storageRoot: config.projectBindings.storageRoot,
    sourceOwnershipManifestFile: config.projectBindings.brain.sourceOwnershipManifestFile,
  })
  : config.projectBindings?.sourceOwnershipManifestFile
    ? createConfiguredProjectSourceSnapshotFactory({
      storageRoot: config.projectBindings.storageRoot,
      sourceOwnershipManifestFile: config.projectBindings.sourceOwnershipManifestFile,
    })
  : undefined
const projectBrainContext = sharedSourceSnapshot
  ? createProjectBrainRealizationPort(sharedSourceSnapshot)
  : undefined
const credentialBackend = config.connections ? createEncryptedFileCredentialBackend({
  root: config.connections.credentialRoot,
  keyFile: config.connections.credentialKeyFile,
  keyGeneration: config.connections.credentialKeyGeneration,
}) : undefined
let projectBindings: ProjectBindingsRuntime | undefined
const project = config.project ? createConfiguredProjectModule({
  database: {
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
  },
  project: config.project,
  ...(sharedSourceSnapshot ? { sourceSnapshot: sharedSourceSnapshot } : {}),
  ...(config.projectBindings ? {
    reconcileBindingSource: async (accountId: string, projectId: string) => {
      if (!projectBindings) throw new Error('PROJECT_BINDING_RECOVERY_UNAVAILABLE')
      await projectBindings.reconcileBindingSource(accountId, projectId)
    },
  } : {}),
  origin: config.origin,
  resolveCurrentSession: identityAccess.resolveCurrentSession,
}) : undefined
const brain = config.brain ? createBrainModule({
  pool: createPostgresPool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: 'hub_r2_brain_read',
    password: readSecretFile(config.brain.readPasswordFile),
  }),
  registry: createRegistryStore(),
  resolveCurrentSession: identityAccess.resolveCurrentSession,
  ...(projectBrainContext ? { projectContext: projectBrainContext } : {}),
}) : undefined
const connections = config.connections ? createConfiguredConnectionModule({
  database: {
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
  },
  connections: config.connections,
  ...(credentialBackend ? { credentialBackend } : {}),
  origin: config.origin,
  resolveCurrentSession: identityAccess.resolveCurrentSession,
}) : undefined
const claudeAccount = config.connections && credentialBackend ? createClaudeAccountModule({
  database: { host: config.database.host, port: config.database.port, database: config.database.database },
  passwordFile: config.connections.passwordFile,
  credentialBackend,
  origin: config.origin,
  resolveCurrentSession: identityAccess.resolveCurrentSession,
}) : undefined
const builderModel = config.builder && config.project ? resolveProjectModelAdmission({
  catalogFile: config.project.modelCatalogFile,
  admissionId: config.builder.modelAdmissionId,
  requiredCapabilities: ['BUILDER_CODING'],
  credentialRequired: false,
}) : undefined
const builderModelChoices = config.builder && config.project ? readProjectModelChoices({
  catalogFile: config.project.modelCatalogFile,
  requiredCapabilities: ['BUILDER_CODING'],
}) : undefined
let builder: ReturnType<typeof createConfiguredBuilderModule> | undefined
const mar = config.preview ? createMarModule({
  access: identityAccess.previewAccess,
  exactHubOrigin: config.origin,
  previewPort: config.preview.port,
  registryReader: (input) => {
    if (!builder) throw new Error('MAR_REGISTRY_READER_UNAVAILABLE')
    return builder.readApplicationFileBySource({
      accountId: input.accountId, projectId: input.projectId, sourceRevision: input.sourceRevision,
      artifactRevisionId: input.artifactRevisionId, path: input.path,
    })
  },
}) : undefined
const launchPreview = mar ? async (request: import('fastify').FastifyRequest, input: Parameters<NonNullable<Parameters<typeof createConfiguredBuilderModule>[0]['launchPreview']>>[1]) => {
  const opened = mar.openRoute({
    accountId: input.accountId,
    projectId: input.projectId,
    changeId: input.changeId,
    subjectDigest: input.subjectDigest,
    attemptId: input.attemptId,
    sourceRevision: input.artifact.sourceRevision,
    artifactRevisionId: input.artifactRevisionId,
    artifactDigest: input.artifactDigest,
    manifest: { entryPath: input.artifact.entryPath, files: input.artifact.files },
  })
  let issued: Awaited<ReturnType<typeof identityAccess.issuePreviewEntry>> | undefined
  try {
    issued = await identityAccess.issuePreviewEntry(request, { accountId: input.accountId, route: opened.route })
    if (!mar.isRouteOpening({ routeId: opened.route.routeId, generation: opened.route.generation, attemptId: opened.route.attemptId })) throw new Error('PREVIEW_LAUNCH_STALE')
    return {
      entryUrl: opened.entryUrl,
      previewUrl: opened.previewUrl,
      entryGrant: issued.entryGrant,
      artifactRevisionId: input.artifactRevisionId,
      artifactDigest: input.artifactDigest,
      expiresAt: new Date(opened.route.expiresAt).toISOString(),
    }
  } catch (error) {
    if (issued) identityAccess.previewAccess.discardEntryGrant(issued.entryGrant)
    mar.closeRoute(opened.route.routeId)
    throw error
  }
} : undefined
builder = config.builder && config.project && builderModel ? createConfiguredBuilderModule({
  database: {
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
  },
  builder: config.builder,
  applicationArtifacts: createApplicationArtifactStore(),
  ...(launchPreview ? { launchPreview } : {}),
  projectSource: {
    storageRoot: config.project.storageRoot,
    git: project?.sourceGit ?? createBuilderProjectGitCapability(config.project.storageRoot),
  },
  model: builderModel.model,
  modelIdentity: {
    admissionId: builderModel.admissionId,
    providerId: builderModel.providerId,
    modelId: builderModel.modelId,
  },
  ...(builderModelChoices ? { modelChoices: builderModelChoices } : {}),
  validateModelCredential: builderModel.validateCredential,
  ...(claudeAccount ? { resolveModel: (reference: Readonly<{ connectionId: string; generation: string }>, modelId: string) => claudeAccount.createModel(reference, modelId) } : {}),
  origin: config.origin,
  resolveCurrentSession: identityAccess.resolveCurrentSession,
}) : undefined
let keyConformanceSubjectPool: ReturnType<typeof createPostgresPool> | undefined
if (config.projectBindings?.brain) {
  if (!config.connections || !credentialBackend || !sharedSourceSnapshot) throw new Error('PROJECT_BINDING_BRAIN_RUNTIME_UNAVAILABLE')
  keyConformanceSubjectPool = createPostgresPool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: 'hub_r2_key_conformance_subject',
    password: readSecretFile(config.projectBindings.brain.keyConformanceSubjectPasswordFile),
  })
  const catalog = readSankhyaKeyConformanceRegistrationCatalog(config.projectBindings.brain.registrationCatalogFile)
  const resolveBasis = createProjectKeyConformanceBasisResolver({ pool: keyConformanceSubjectPool, sourceSnapshot: sharedSourceSnapshot })
  const resolveSubject = createSankhyaKeyConformanceSubjectResolver({ resolveBasis })
  // Keep observation separate from Connection-owned credential materialization.
  const registrations = catalog.map(({ descriptor, producer }) => ({
    ...descriptor,
    observe: createSankhyaKeyConformanceObserver({
      origin: resolveSankhyaOrigin(descriptor.environment),
      environment: descriptor.environment,
      companyCode: producer.companyCode,
      authenticate: (coordinate) => authenticateSankhya({
        configuration: { environment: descriptor.environment, companyCode: producer.companyCode },
        credentialCoordinate: coordinate,
        credentialBackend,
        responseAdmission: sankhyaProductionResponseAdmission,
      }),
    }),
  }))
  const conformance = createRegisteredKeyConformance({ registrations, resolveSubject })
  projectBindings = createConfiguredProjectBindingModule({
    database: {
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
    },
    bindings: {
      passwordFile: config.projectBindings.passwordFile,
      attesterPasswordFile: config.projectBindings.brain.attesterPasswordFile,
      storageRoot: config.projectBindings.storageRoot,
      sourceOwnershipManifestFile: config.projectBindings.brain.sourceOwnershipManifestFile,
    },
    sourceSnapshot: sharedSourceSnapshot,
    validator: createBrainBindingValidator({ conformance }),
    origin: config.origin,
    resolveCurrentSession: identityAccess.resolveCurrentSession,
  })
} else if (config.projectBindings) {
  projectBindings = createConfiguredProjectConnectionBindingModule({
    database: {
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
    },
    bindings: config.projectBindings,
    origin: config.origin,
    resolveCurrentSession: identityAccess.resolveCurrentSession,
  })
}
const app = await createHttpApp({
  registerRoutes: async (server) => [
    ...await identityAccess.registerIdentityAccessRoutes(server),
    ...(workspace ? await workspace.registerWorkspaceRoutes(server) : []),
    ...(project ? await project.registerProjectRoutes(server) : []),
    ...(brain ? await brain.registerBrainRoutes(server) : []),
    ...(connections ? await connections.registerConnectionRoutes(server) : []),
    ...(claudeAccount ? await claudeAccount.registerRoutes(server) : []),
    ...(builder ? await builder.registerBuilderRoutes(server) : []),
    ...(projectBindings ? await projectBindings.registerProjectConnectionBindingRoutes(server) : []),
    ...(projectBindings && 'registerProjectBrainBindingRoutes' in projectBindings
      ? await projectBindings.registerProjectBrainBindingRoutes(server) : []),
  ],
  staticRoot: resolve(import.meta.dirname, '../public'),
  ...(config.preview ? {
    previewCspSource: `https://*.conexus.localhost:${config.preview.port}`,
    https: {
      cert: readFileSync(config.preview.certFile),
      key: readFileSync(config.preview.keyFile),
    },
  } : {}),
})
const previewApp = mar && config.preview ? await createHttpApp({
  registerRoutes: mar.registerPreviewRoutes,
  staticRoot: null,
  https: {
    cert: readFileSync(config.preview.certFile),
    key: readFileSync(config.preview.keyFile),
  },
}) : undefined
await builder?.recover()

// Read-only, and it never stops the Hub. One capability holding a bad credential must not
// take the others down, and it must be named here rather than surfacing as a 28P01 inside
// somebody's request.
reportConnectionCensus(
  await censusConnections({ host: config.database.host, port: config.database.port, database: config.database.database }),
  line => process.stderr.write(line),
)

await app.listen({ host: '127.0.0.1', port: config.port })
if (previewApp && config.preview) await previewApp.listen({ host: '127.0.0.1', port: config.preview.port })

if (project) {
  const startedAt = performance.now()
  void project.warmGitImage().then((result) => {
    const durationMs = Math.round(performance.now() - startedAt)
    const outcome = result.status === 'VERIFIED' ? 'VERIFIED' : `REFUSED:${result.code}`
    process.stderr.write(`PROJECT_GIT_IMAGE_WARMUP:${outcome}:${durationMs}ms\n`)
  }, () => {
    const durationMs = Math.round(performance.now() - startedAt)
    process.stderr.write(`PROJECT_GIT_IMAGE_WARMUP:FAILED:${durationMs}ms\n`)
  })
}

let closed = false
const close = async (): Promise<void> => {
  if (closed) return
  closed = true
  await Promise.all([app.close(), previewApp?.close()])
  await mar?.close()
  await Promise.all([builder?.close(), claudeAccount?.close(), projectBindings?.close(), keyConformanceSubjectPool?.end(), connections?.close(), brain?.close(), project?.close(), workspace?.close(), identityAccess.close()])
}
process.once('SIGINT', close)
process.once('SIGTERM', close)
