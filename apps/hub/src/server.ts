import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { createApplicationRunnerClient } from './app-runner/module.js'
import { createHttpApp } from './http/app.js'
import { createIdentityAccessModule } from './identity-access/module.js'
import { createMarModule } from './mar/module.js'
import { readHubConfig } from './platform/config.js'
import { censusConnections, reportConnectionCensus } from './platform/connection-census.js'
import { createPostgresPool } from './platform/postgres.js'
import { createSecretEnvelope, readSecretFile } from './platform/secrets.js'
import { createApplicationArtifactStore, createServedApplicationReader } from './registry/module.js'
import { createWorkspaceModule } from './workspace/module.js'

// Mastra is loaded only after the production entrypoint has disabled its
// optional telemetry. Keep this before the dynamic Project-module import.
process.env.MASTRA_TELEMETRY_DISABLED = '1'
const { createConfiguredProjectModule } = await import('./project/module.js')
const { createConfiguredBuilderModule } = await import('./builder/module.js')

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
  user: 'hub_workspace_read',
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
  // The application host requires the Builder, and so the Factory, whose credential key seals the
  // application sessions' refresh tokens (readHubConfig refuses one without the other).
  application: config.application && config.factory ? {
    address: config.application,
    envelope: createSecretEnvelope(readSecretFile(config.factory.secretKeyFile), config.factory.previousSecretKeyFiles.map(readSecretFile)),
  } : undefined,
  allowInsecureForTest: config.oidc.allowInsecureForTest,
} satisfies Parameters<typeof createIdentityAccessModule>[0] & Readonly<{ workspaceReadPool: typeof s2ReadPool }>
const identityAccess = await createIdentityAccessModule(identityAccessDependencies)
const workspace = config.database.workspace && s2ReadPool ? createWorkspaceModule({
  commandPool: createPostgresPool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: 'hub_workspace_command',
    password: readSecretFile(config.database.workspace.commandPasswordFile),
  }),
  readPool: s2ReadPool,
  origin: config.origin,
  resolveCurrentSession: identityAccess.resolveCurrentSession,
}) : undefined
const project = config.project ? createConfiguredProjectModule({
  database: {
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
  },
  project: config.project,
  // The builder module owns the Factory and is composed below; creation reaches it at request time.
  repository: {
    prepare: async (input) => {
      const prepare = builder?.prepareProjectRepository
      if (!prepare) throw new Error('FACTORY_NOT_CONFIGURED')
      return prepare(input)
    },
  },
  origin: config.origin,
  resolveCurrentSession: identityAccess.resolveCurrentSession,
}) : undefined
let builder: ReturnType<typeof createConfiguredBuilderModule> | undefined
const applicationRunner = config.appRunner ? createApplicationRunnerClient(config.appRunner.socketPath) : undefined
// The application host reads only the artifact an application serves, gated by access to it.
const servedPool = config.application && config.builder ? createPostgresPool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: 'hub_builder_executor',
  password: readSecretFile(config.builder.executorPasswordFile),
}) : undefined
const servedApplications = servedPool ? createServedApplicationReader(servedPool) : undefined
const mar = config.preview ? createMarModule({
  sessions: identityAccess.hostSessions,
  exactHubOrigin: config.origin,
  previewPort: config.preview.port,
  registryReader: (input) => {
    if (!builder) throw new Error('MAR_REGISTRY_READER_UNAVAILABLE')
    return builder.readApplicationFileBySource({
      accountId: input.accountId, projectId: input.projectId, sourceRevision: input.sourceRevision,
      artifactRevisionId: input.artifactRevisionId, path: input.path,
    })
  },
  // The runner receives the admitted artifact's server tree as the registry holds it, never a path.
  // The MAR module bounds in-flight work and the tree's total size before any file is read, ahead of
  // the runner's own concurrency cap (apps/hub/src/mar/application-invoker.ts).
  ...(applicationRunner ? {
    applicationRunner: {
      readFile: ({ source, path }) => {
        if (source.via === 'APPLICATION') {
          if (!servedApplications) throw new Error('MAR_REGISTRY_READER_UNAVAILABLE')
          return servedApplications.readFile({ accountId: source.accountId, projectId: source.projectId, artifactRevisionId: source.artifactRevisionId, path })
        }
        const reader = builder
        if (!reader) throw new Error('MAR_REGISTRY_READER_UNAVAILABLE')
        return reader.readApplicationFileBySource({
          accountId: source.accountId, projectId: source.projectId, sourceRevision: source.sourceRevision, artifactRevisionId: source.artifactRevisionId, path,
        })
      },
      invoke: applicationRunner.invoke,
    },
  } : {}),
  ...(config.application && servedApplications ? {
    applicationHost: { sessions: identityAccess.hostSessions, reader: servedApplications, application: config.application },
  } : {}),
}) : undefined
const launchPreview = mar ? async (request: import('fastify').FastifyRequest, input: Parameters<NonNullable<Parameters<typeof createConfiguredBuilderModule>[0]['launchPreview']>>[1]) => {
  const address = mar.previewAddress(input.artifactRevisionId)
  const opened = await identityAccess.openPreview(request, {
    accountId: input.accountId,
    projectId: input.projectId,
    sourceRevision: input.artifact.sourceRevision,
    artifactRevisionId: input.artifactRevisionId,
    artifactDigest: input.artifactDigest,
    exactHost: address.exactHost,
    manifest: { entryPath: input.artifact.entryPath, files: input.artifact.files },
  })
  return {
    entryUrl: address.entryUrl,
    previewUrl: address.previewUrl,
    entryGrant: opened.entryGrant,
    artifactRevisionId: input.artifactRevisionId,
    artifactDigest: input.artifactDigest,
    expiresAt: new Date(opened.expiresAt).toISOString(),
  }
} : undefined
builder = config.builder && config.project && config.factory ? createConfiguredBuilderModule({
  database: {
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
  },
  builder: config.builder,
  factory: config.factory,
  ...(config.googleAiPro ? { googleAiPro: config.googleAiPro } : {}),
  applicationArtifacts: createApplicationArtifactStore(),
  ...(applicationRunner ? { applicationServer: { prepare: applicationRunner.prepare } } : {}),
  ...(launchPreview ? { launchPreview } : {}),
  origin: config.origin,
  resolveCurrentSession: identityAccess.resolveCurrentSession,
  isInstallationAdministrator: identityAccess.installationAdministration.isInstallationAdministrator,
}) : undefined
const app = await createHttpApp({
  registerRoutes: async (server) => [
    ...await identityAccess.registerIdentityAccessRoutes(server),
    ...(workspace ? await workspace.registerWorkspaceRoutes(server) : []),
    ...(project ? await project.registerProjectRoutes(server) : []),
    ...(builder ? await builder.registerBuilderRoutes(server) : []),
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
const applicationApp = mar?.registerApplicationHostRoutes && config.preview && config.application ? await createHttpApp({
  registerRoutes: mar.registerApplicationHostRoutes,
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
if (applicationApp && config.application) await applicationApp.listen({ host: '127.0.0.1', port: config.application.port })

let closed = false
const close = async (): Promise<void> => {
  if (closed) return
  closed = true
  await Promise.all([app.close(), previewApp?.close(), applicationApp?.close()])
  await mar?.close()
  await Promise.all([builder?.close(), project?.close(), workspace?.close(), identityAccess.close(), servedPool?.end()])
}
process.once('SIGINT', close)
process.once('SIGTERM', close)
