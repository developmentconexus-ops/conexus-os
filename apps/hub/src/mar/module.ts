import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { HeaderFact } from '../http/access.js'
import type { ListenerPolicy } from '../http/access.js'
import { applicationHostContentSecurityPolicy, previewContentSecurityPolicy } from '../platform/application-csp.js'
import { applicationOrigin, applicationSlugOfHost, authority } from '../platform/config.js'
import type { ApplicationAddress } from '../platform/config.js'
import { registerApplicationHostRoutes } from './application-host-routes.js'
import type { ApplicationHostReader, ApplicationHostSessions } from './application-host-routes.js'
import { createApplicationInvoker } from './application-invoker.js'
import type { ApplicationFileReader, ApplicationRunnerInvoke, ConnectorPortOpener } from './application-invoker.js'
import { registerPreviewRoutes } from './preview-routes.js'
import type { PreviewHost, PreviewRouteDependencies, PreviewSessions } from './preview-routes.js'
import { Failure } from '../platform/failure.js'

type HostPolicy = Extract<ListenerPolicy, Readonly<{ listener: 'preview' | 'application' }>>

export type MarModule = Readonly<{
  /** Where a Preview of this artifact revision is served: its own host on the Preview port. */
  previewAddress(artifactRevisionId: string): Readonly<{ exactHost: string; entryUrl: string; previewUrl: string }>
  previewPolicy: HostPolicy
  registerPreviewRoutes(app: FastifyInstance): Promise<readonly ['MAR-Preview']>
  /** Each application on its own host; absent when the installation serves no applications. */
  applicationHost: Readonly<{ policy: HostPolicy; registerRoutes(app: FastifyInstance): Promise<readonly ['MAR-Application']> }> | undefined
  close(): Promise<void>
}>

type RegistryReader = PreviewRouteDependencies['registryReader']

const PREVIEW_DOMAIN = 'conexus.localhost'
const PREVIEW_HOST = /^preview-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.conexus\.localhost(?::\d+)?$/

const previewHost = (artifactRevisionId: string, previewPort: number): PreviewHost & Readonly<{ authority: string }> => {
  const hostAuthority = authority({ port: previewPort, domain: PREVIEW_DOMAIN }, `preview-${artifactRevisionId}`)
  return { artifactRevisionId, exactHost: `preview-${artifactRevisionId}.${PREVIEW_DOMAIN}`, origin: `https://${hostAuthority}`, authority: hostAuthority }
}

/** @public */
export const previewHostOf = (host: HeaderFact, previewPort: number): PreviewHost | null => {
  if (typeof host !== 'string') return null
  const artifactRevisionId = PREVIEW_HOST.exec(host)?.[1]
  if (!artifactRevisionId) return null
  const { authority: expected, ...parsed } = previewHost(artifactRevisionId, previewPort)
  return host === expected ? Object.freeze(parsed) : null
}

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
  applicationRunner?: Readonly<{ invoke: ApplicationRunnerInvoke; readFile: ApplicationFileReader; openConnectorPort?: ConnectorPortOpener }>
  exactHubOrigin: string
  previewPort: number
  applicationHost?: Readonly<{ sessions: ApplicationHostSessions; reader: ApplicationHostReader; application: ApplicationAddress }>
}>): MarModule => {
  if (!Number.isSafeInteger(previewPort) || previewPort < 1 || previewPort > 65_535 ||
    !/^https:\/\//.test(exactHubOrigin)) {
    throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'MAR_CONFIG_REFUSED' } })
  }
  const pendingRequests = new Set<Promise<unknown>>()
  let closed = false
  let closing: Promise<void> | null = null
  // One admission budget for both listeners: a busy application cannot starve every Preview, nor the reverse.
  const invokeApplication = applicationRunner ? createApplicationInvoker(applicationRunner) : undefined
  const previewHostOfRequest = (host: HeaderFact): PreviewHost | null => previewHostOf(host, previewPort)
  const dependencies: PreviewRouteDependencies = {
    sessions, registryReader, ...(invokeApplication ? { invokeApplication } : {}), previewHostOf: previewHostOfRequest, pendingRequests, isClosed: () => closed,
  }
  const previewAddress = (artifactRevisionId: string) => {
    const { exactHost, origin } = previewHost(artifactRevisionId, previewPort)
    return Object.freeze({ exactHost, entryUrl: `${origin}/__conexus/preview-entry`, previewUrl: `${origin}/` })
  }
  const previewPolicy: HostPolicy = Object.freeze({
    listener: 'preview',
    hubOrigin: exactHubOrigin,
    ownOrigin: (host: HeaderFact) => previewHostOfRequest(host)?.origin ?? null,
    onRequest: async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('referrer-policy', 'no-referrer')
      reply.header('cache-control', 'no-store')
      reply.header('content-security-policy', previewContentSecurityPolicy(exactHubOrigin))
      reply.removeHeader('x-frame-options')
      if (request.method === 'GET' || request.method === 'HEAD') {
        reply.header('access-control-allow-origin', exactHubOrigin)
        reply.header('access-control-allow-credentials', 'true')
      }
      if (closed) return reply.code(503).send()
      return undefined
    },
  })
  const close = async (): Promise<void> => {
    if (closing !== null) return closing
    if (closed) return
    closed = true
    closing = Promise.resolve().then(async () => { await Promise.allSettled([...pendingRequests]); pendingRequests.clear() })
    await closing
  }
  return Object.freeze({
    previewAddress,
    previewPolicy,
    registerPreviewRoutes: (app: FastifyInstance) => registerPreviewRoutes(app, dependencies),
    applicationHost: applicationHost ? Object.freeze({
      policy: Object.freeze({
        listener: 'application',
        hubOrigin: exactHubOrigin,
        ownOrigin: (host: HeaderFact) => {
          const slug = applicationSlugOfHost(applicationHost.application, typeof host === 'string' ? host : undefined)
          return slug ? applicationOrigin(applicationHost.application, slug) : null
        },
        onRequest: async (_request: FastifyRequest, reply: FastifyReply) => {
          reply.header('content-security-policy', applicationHostContentSecurityPolicy)
          reply.header('referrer-policy', 'no-referrer')
          reply.header('cache-control', 'no-store')
          reply.header('x-frame-options', 'DENY')
        },
      } satisfies HostPolicy),
      registerRoutes: (app: FastifyInstance) => registerApplicationHostRoutes(app, {
        ...applicationHost, ...(invokeApplication ? { invokeApplication } : {}), exactHubOrigin,
      }),
    }) : undefined,
    close,
  })
}
