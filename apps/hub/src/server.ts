import { resolve } from 'node:path'
import { createHttpApp } from './http/app.js'
import { createIdentityAccessModule } from './identity-access/module.js'
import { readHubConfig } from './platform/config.js'
import { createPostgresPool } from './platform/postgres.js'
import { readSecretFile } from './platform/secrets.js'
import { createWorkspaceModule } from './workspace/module.js'

// Mastra is loaded only after the production entrypoint has disabled its
// optional telemetry. Keep this before the dynamic Project-module import.
process.env.MASTRA_TELEMETRY_DISABLED = '1'
const { createConfiguredProjectModule } = await import('./project/module.js')

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
const workspace = config.database.workspace ? createWorkspaceModule({
  commandPool: createPostgresPool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: 'hub_ws01_command',
    password: readSecretFile(config.database.workspace.commandPasswordFile),
  }),
  readPool: s2ReadPool!,
  origin: config.origin,
  operatorIssuer: config.oidc.issuer,
  operatorSubject: config.bootstrapSubject,
  resolveCurrentSession: identityAccess.resolveCurrentSession,
}) : undefined
const project = config.project ? createConfiguredProjectModule({
  database: {
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
  },
  project: config.project,
  origin: config.origin,
  resolveCurrentSession: identityAccess.resolveCurrentSession,
}) : undefined
const app = await createHttpApp({
  registerRoutes: async (server) => [
    ...await identityAccess.registerIdentityAccessRoutes(server),
    ...(workspace ? await workspace.registerWorkspaceRoutes(server) : []),
    ...(project ? await project.registerProjectRoutes(server) : []),
  ],
  staticRoot: resolve(import.meta.dirname, '../public'),
})
await app.listen({ host: '127.0.0.1', port: config.port })

const close = async (): Promise<void> => {
  await app.close()
  await Promise.all([project?.close(), workspace?.close(), identityAccess.close()])
}
process.once('SIGINT', close)
process.once('SIGTERM', close)
