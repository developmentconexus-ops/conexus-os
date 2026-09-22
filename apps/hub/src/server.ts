import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { createHttpApp } from './http/app.js'
import { createIdentityAccessModule } from './identity-access/module.js'
import { createMarModule } from './mar/module.js'
import { readHubConfig } from './platform/config.js'
import { censusConnections, reportConnectionCensus } from './platform/connection-census.js'
import { createPostgresPool } from './platform/postgres.js'
import { readSecretFile } from './platform/secrets.js'
import { createApplicationArtifactStore } from './registry/module.js'
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
builder = config.builder && config.project && config.factory ? createConfiguredBuilderModule({
  database: {
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
  },
  builder: config.builder,
  factory: config.factory,
  applicationArtifacts: createApplicationArtifactStore(),
  ...(launchPreview ? { launchPreview } : {}),
  origin: config.origin,
  resolveCurrentSession: identityAccess.resolveCurrentSession,
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

let closed = false
const close = async (): Promise<void> => {
  if (closed) return
  closed = true
  await Promise.all([app.close(), previewApp?.close()])
  await mar?.close()
  await Promise.all([builder?.close(), project?.close(), workspace?.close(), identityAccess.close()])
}
process.once('SIGINT', close)
process.once('SIGTERM', close)
