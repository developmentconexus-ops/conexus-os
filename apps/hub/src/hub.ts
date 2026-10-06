import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { createApplicationRunnerClient } from './app-runner/module.js'
import { createConnectorModule } from './connectors/module.js'
import { createHttpApp } from './http/app.js'
import { createIdentityAccessModule } from './identity-access/module.js'
import { createHostingModule } from './hosting/module.js'
import { startJobs } from './platform/jobs.js'
import { readHubConfig } from './platform/config.js'
import { censusConnections, reportConnectionCensus } from './platform/connection-census.js'
import { openDatabase } from './platform/db.js'
import { assertSchemaCurrent, exitOnLostInstanceLock, takeInstanceLock } from './platform/lifecycle.js'
import { logLine } from './platform/logger.js'
import { createSecretEnvelope, readSecretFile } from './platform/secrets.js'
import { createRegistryModule } from './registry/module.js'
import { createWorkspaceModule } from './workspace/module.js'
import { Failure } from './platform/failure.js'

// Mastra is loaded only after the production entrypoint has disabled its
// optional telemetry. Keep this before the dynamic Project-module import.
// biome-ignore lint/style/noProcessEnv: debt: owning wave
process.env.MASTRA_TELEMETRY_DISABLED = '1'
const { createConfiguredProjectModule } = await import('./project/module.js')
const { builderProjectPorts, createConfiguredBuilderModule, purgeProjectBuilder } = await import('./builder/module.js')

export type HubPorts = Pick<Parameters<typeof createConfiguredBuilderModule>[0], 'conversationSandboxes'>

/** Composes and starts the Hub. The ports are what a test stands in for; the production entry passes none. */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
export const startHub = async ({ conversationSandboxes }: HubPorts = {}): Promise<Readonly<{ close(): Promise<void> }>> => {
  const config = readHubConfig()
  const mainConnection = {
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    passwordFile: config.database.passwordFile,
  }
  const database = openDatabase(mainConnection)
  // Before anything that touches shared state (handler sockets, runs): a second Hub, or a database
  // behind this code, ends here with a named line and leaves the live Hub alone.
  const releaseInstanceLock = await takeInstanceLock(database, exitOnLostInstanceLock())
  await assertSchemaCurrent(database, resolve(import.meta.dirname, '../migrations'))
  const workspace = createWorkspaceModule({ database })
  const registry = createRegistryModule({ database })
  const identityAccessDependencies = {
    database,
    workspaceReader: workspace,
    origin: config.origin,
    issuer: config.oidc.issuer,
    clientId: config.oidc.clientId,
    clientSecret: readSecretFile(config.oidc.clientSecretFile),
    bootstrapSubject: config.bootstrapSubject,
    // Every Hub and application session keeps its Keycloak refresh token sealed with the installation's credential key.
    envelope: createSecretEnvelope(readSecretFile(config.secretKey.file), config.secretKey.previousFiles.map(readSecretFile)),
    application: config.application ? { address: config.application } : undefined,
  } satisfies Parameters<typeof createIdentityAccessModule>[0]
  const identityAccess = await createIdentityAccessModule(identityAccessDependencies)
  const connectors = createConnectorModule({
    database,
    envelope: identityAccessDependencies.envelope,
    gatewayOrigin: config.connectors.gatewayOrigin,
    socketDirectory: config.connectors.socketDirectory,
  })
  // A restarted Hub leaves no orphan handler socket still answering.
  await connectors.sweepHandlerPorts()
  const project = createConfiguredProjectModule({
    database,
    builder: builderProjectPorts,
    // The builder module owns the Conexus Git and is composed below; creation reaches it at request time.
    repository: {
      prepare: async (projectId) => {
        if (!builder) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'CONEXUS_GIT_NOT_CONFIGURED' } })
        return builder.prepareProjectRepository(projectId)
      },
    },
    // Every deletion port reaches a module composed below through the same request-time indirection
    // as repository.prepare above, since the Project module is composed before the Builder module is.
    deletion: {
      releaseApplicationData: async (projectId) => {
        if (!applicationRunner) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'APPLICATION_RUNNER_NOT_CONFIGURED' } })
        return applicationRunner.release({ projectId })
      },
      killSandboxes: async (projectId) => {
        if (!builder) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'CONEXUS_GIT_NOT_CONFIGURED' } })
        return builder.killProjectSandboxes(projectId)
      },
      deleteRepository: async (projectId) => {
        if (!builder) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'CONEXUS_GIT_NOT_CONFIGURED' } })
        return builder.deleteProjectRepository(projectId)
      },
      purgeIdentityAccess: identityAccess.purgeProject,
      purgeConnectorBindings: connectors.purgeProjectBindings,
      purgeRegistry: registry.purge,
      purgeBuilder: purgeProjectBuilder,
    },
    thumbnailReader: registry,
  })
  let builder: ReturnType<typeof createConfiguredBuilderModule> | undefined
  const applicationRunner = config.appRunner ? createApplicationRunnerClient(config.appRunner.socketPath) : undefined
  const hosting = config.preview ? createHostingModule({
    sessions: identityAccess.previewHost,
    exactHubOrigin: config.origin,
    previewPort: config.preview.port,
    registry,
    // The runner receives the admitted artifact's server tree as the registry holds it, never a path.
    // The hosting module bounds in-flight work and the tree's total size before any file is read, ahead of
    // the runner's own concurrency cap (apps/hub/src/hosting/application-invoker.ts).
    ...(applicationRunner ? {
      applicationRunner: {
        invoke: applicationRunner.invoke,
        // Each invocation gets its own connector port, minted by the Connector owner from the source.
        openConnectorPort: (source) => connectors.openHandlerPort(source),
      },
    } : {}),
    ...(config.application ? {
      applicationHost: { sessions: identityAccess.applicationHost, application: config.application },
    } : {}),
  }) : undefined
  type LaunchPreview = NonNullable<Parameters<typeof createConfiguredBuilderModule>[0]['launchPreview']>
  const launchPreview: LaunchPreview | undefined = hosting ? async (hubSessionDigest, input) => {
    const { launch } = input
    const address = hosting.previewAddress(launch.artifactRevisionId)
    const opened = await identityAccess.openPreview(hubSessionDigest, { accountId: input.accountId, projectId: input.projectId, artifactRevisionId: launch.artifactRevisionId })
    return {
      entryUrl: address.entryUrl,
      previewUrl: address.previewUrl,
      entryGrant: opened.entryGrant,
      artifactRevisionId: launch.artifactRevisionId,
      artifactDigest: launch.digest,
      expiresAt: opened.expiresAt.toISOString(),
    }
  } : undefined
  let preparing: Promise<unknown> = Promise.resolve()
  builder = config.builder && config.factory ? createConfiguredBuilderModule({
    data: database,
    database: {
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
    },
    builder: config.builder,
    factory: config.factory,
    secretKey: config.secretKey,
    ...(config.googleAiPro ? { googleAiPro: config.googleAiPro } : {}),
    registry,
    // A Project with an application keeps its Preview data: a divergent migration history is refused, never
    // reset. The presence answer holds until the runner settles, so an application created meanwhile waits.
    // The runner migrates one Project at a time anyway; one prepare at a time here holds one connection.
    ...(applicationRunner ? {
      applicationServer: {
        invoke: applicationRunner.invoke,
        prepare: (input) => {
          const prepared = preparing.catch(() => undefined).then(() => identityAccess.withApplicationPresence(input.projectId,
            (presence) => applicationRunner.prepare(presence.hasApplication ? { ...input, onDivergence: 'REFUSE' } : { ...input, onDivergence: 'RESET', signal: presence.lockLost })))
          preparing = prepared
          return prepared
        },
      },
    } : {}),
    ...(launchPreview ? { launchPreview } : {}),
    readProjectName: async (input) => {
      const name = await project?.readProjectName(input)
      if (!name) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'BUILDER_PROJECT_NOT_FOUND' } })
      return name
    },
    connectors: {
      openRun: connectors.openBuilderRun,
      tools: connectors.builderTools,
      toolPayloadProjection: connectors.toolPayloadProjection,
    },
    connectorObservability: connectors.observability,
    ...(conversationSandboxes ? { conversationSandboxes } : {}),
  }) : undefined
  const app = await createHttpApp({
    policy: {
      listener: 'hub',
      hubOrigin: config.origin,
      resolveHubSession: identityAccess.hub.resolve,
      ...(config.preview ? { previewCspSource: `https://*.conexus.localhost:${config.preview.port}` } : {}),
    },
    registerRoutes: async (server) => [
      ...await identityAccess.registerRoutes(server),
      ...(workspace ? await workspace.registerWorkspaceRoutes(server) : []),
      ...(project ? await project.registerProjectRoutes(server) : []),
      ...(builder ? await builder.registerBuilderRoutes(server) : []),
      ...(await connectors.registerConnectorRoutes(server)),
    ],
    staticRoot: resolve(import.meta.dirname, '../public'),
    ...(config.preview ? {
      https: {
        cert: readFileSync(config.preview.certFile),
        key: readFileSync(config.preview.keyFile),
      },
    } : {}),
  })
  const previewApp = hosting && config.preview ? await createHttpApp({
    policy: hosting.previewPolicy,
    registerRoutes: hosting.registerPreviewRoutes,
    staticRoot: null,
    https: {
      cert: readFileSync(config.preview.certFile),
      key: readFileSync(config.preview.keyFile),
    },
  }) : undefined
  const applicationApp = hosting?.applicationHost && config.preview && config.application ? await createHttpApp({
    policy: hosting.applicationHost.policy,
    registerRoutes: hosting.applicationHost.registerRoutes,
    staticRoot: null,
    https: {
      cert: readFileSync(config.preview.certFile),
      key: readFileSync(config.preview.keyFile),
    },
  }) : undefined
  // Read-only, and it never stops the Hub. One capability holding a bad credential must not
  // take the others down, and it must be named here rather than surfacing as a 28P01 inside
  // somebody's request.
  reportConnectionCensus(
    await censusConnections({ host: config.database.host, port: config.database.port, database: config.database.database }),
    logLine,
  )

  // Once the composition and the lock hold, and before the first listener: a start that fails past this
  // exits the process through `exitOnFailedStart`, which ends the jobs with it.
  const jobs = startJobs([...identityAccess.jobs, ...(builder?.jobs ?? [])])
  await app.listen({ host: '127.0.0.1', port: config.port })
  if (previewApp && config.preview) await previewApp.listen({ host: '127.0.0.1', port: config.preview.port })
  if (applicationApp && config.application) await applicationApp.listen({ host: '127.0.0.1', port: config.application.port })

  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    await jobs.close()
    await Promise.all([app.close(), previewApp?.close(), applicationApp?.close()])
    await hosting?.close()
    await Promise.all([builder?.close(), identityAccess.close()])
    await database.close()
    await releaseInstanceLock()
  }
  return { close }
}
