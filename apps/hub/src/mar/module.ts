import type { FastifyInstance } from 'fastify'
import type { ApplicationAddress } from '../platform/config.js'
import { registerApplicationHostRoutes } from './application-host-routes.js'
import type { ApplicationHostReader, ApplicationHostSessions } from './application-host-routes.js'
import { createApplicationInvoker } from './application-invoker.js'
import type { ApplicationFileReader, ApplicationRunnerInvoke } from './application-invoker.js'
import { registerPreviewRoutes } from './preview-routes.js'
import type { PreviewRouteDependencies, PreviewSessions } from './preview-routes.js'

export type MarModule = Readonly<{
  /** Where a Preview of this artifact revision is served: its own host on the Preview port. */
  previewAddress(artifactRevisionId: string): Readonly<{ exactHost: string; entryUrl: string; previewUrl: string }>
  registerPreviewRoutes(app: FastifyInstance): Promise<readonly ['MAR-Preview']>
  /** Each application on its own host; absent when the installation serves no applications. */
  registerApplicationHostRoutes: ((app: FastifyInstance) => Promise<readonly ['MAR-Application']>) | undefined
  close(): Promise<void>
}>

type RegistryReader = PreviewRouteDependencies['registryReader']

export const createMarModule = ({
  sessions,
  registryReader,
  applicationRunner,
  exactHubOrigin,
  previewPort,
  applicationHost,
}: Readonly<{
  sessions: PreviewSessions
  registryReader: RegistryReader
  /** The runner's invoke and the registry read of server files; the module bounds admission to them. */
  applicationRunner?: Readonly<{ invoke: ApplicationRunnerInvoke; readFile: ApplicationFileReader }>
  exactHubOrigin: string
  previewPort: number
  applicationHost?: Readonly<{ sessions: ApplicationHostSessions; reader: ApplicationHostReader; application: ApplicationAddress }>
}>): MarModule => {
  if (!Number.isSafeInteger(previewPort) || previewPort < 1 || previewPort > 65_535 ||
    !/^https:\/\//.test(exactHubOrigin)) {
    throw new Error('MAR_CONFIG_REFUSED')
  }
  const pendingRequests = new Set<Promise<unknown>>()
  let closed = false
  let closing: Promise<void> | null = null
  // One admission budget for both listeners: a busy application cannot starve every Preview, nor the reverse.
  const invokeApplication = applicationRunner ? createApplicationInvoker(applicationRunner) : undefined
  const dependencies: PreviewRouteDependencies = {
    sessions, registryReader, ...(invokeApplication ? { invokeApplication } : {}), exactHubOrigin, previewPort, pendingRequests, isClosed: () => closed,
  }
  const previewAddress = (artifactRevisionId: string) => {
    const exactHost = `preview-${artifactRevisionId}.conexus.localhost`
    const origin = `https://${exactHost}:${previewPort}`
    return Object.freeze({ exactHost, entryUrl: `${origin}/__conexus/preview-entry`, previewUrl: `${origin}/` })
  }
  const close = async (): Promise<void> => {
    if (closing !== null) return closing
    if (closed) return
    closed = true
    closing = Promise.resolve().then(async () => { await Promise.allSettled([...pendingRequests]); pendingRequests.clear() })
    await closing
  }
  return Object.freeze({
    previewAddress,
    registerPreviewRoutes: (app: FastifyInstance) => registerPreviewRoutes(app, dependencies),
    registerApplicationHostRoutes: applicationHost
      ? (app: FastifyInstance) => registerApplicationHostRoutes(app, {
        ...applicationHost, ...(invokeApplication ? { invokeApplication } : {}), exactHubOrigin,
      })
      : undefined,
    close,
  })
}
