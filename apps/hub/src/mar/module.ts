import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { createApplicationInvoker } from './application-invoker.js'
import type { ApplicationFileReader, ApplicationRunnerInvoke } from './application-invoker.js'
import { registerPreviewRoutes } from './preview-routes.js'
import type { MarRouteInput, PreviewRouteDependencies } from './preview-routes.js'

type ArtifactManifest = Readonly<{
  entryPath: 'index.html'
  files: readonly Readonly<{ path: string; mediaType: string }>[]
}>

export type MarModule = Readonly<{
  openRoute(input: Readonly<Omit<MarRouteInput, 'routeId' | 'generation' | 'exactHost' | 'expiresAt' | 'manifest'> & {
    manifest: ArtifactManifest
    now?: number
  }>): Readonly<{
    route: MarRouteInput
    entryUrl: string
    previewUrl: string
  }>
  closeRoute(routeId: string): void
  isRouteOpening(input: Readonly<{ routeId: string; generation: string; attemptId: string }>): boolean
  registerPreviewRoutes(app: FastifyInstance): Promise<readonly ['MAR-Preview']>
  close(): Promise<void>
}>

type PreviewAccess = PreviewRouteDependencies['access']
type RegistryReader = PreviewRouteDependencies['registryReader']

export const createMarModule = ({
  access,
  registryReader,
  applicationRunner,
  exactHubOrigin,
  previewPort,
  now = () => Date.now(),
}: Readonly<{
  access: PreviewAccess
  registryReader: RegistryReader
  /** The runner's invoke and the registry read of server files; the module bounds admission to them. */
  applicationRunner?: Readonly<{ invoke: ApplicationRunnerInvoke; readFile: ApplicationFileReader }>
  exactHubOrigin: string
  previewPort: number
  now?: () => number
}>): MarModule => {
  if (!Number.isSafeInteger(previewPort) || previewPort < 1 || previewPort > 65_535 ||
    !/^https:\/\//.test(exactHubOrigin)) {
    throw new Error('MAR_CONFIG_REFUSED')
  }
  const routes = new Map<string, MarRouteInput & Readonly<{ lifecycle: 'OPENING' | 'ACTIVE' }>>()
  const pendingRequests = new Set<Promise<unknown>>()
  let closed = false
  let closing: Promise<void> | null = null
  const invokeApplication = applicationRunner ? createApplicationInvoker(applicationRunner) : undefined
  const dependencies: PreviewRouteDependencies = {
    routes, access, registryReader, ...(invokeApplication ? { invokeApplication } : {}), exactHubOrigin, previewPort, now, pendingRequests, isClosed: () => closed,
  }
  const prune = (): void => {
    const current = now()
    for (const [key, route] of routes) if (route.expiresAt <= current) routes.delete(key)
  }
  const openRoute = (input: Readonly<Omit<MarRouteInput, 'routeId' | 'generation' | 'exactHost' | 'expiresAt' | 'manifest'> & {
    manifest: ArtifactManifest
    now?: number
  }>) => {
    if (closed) throw new Error('MAR_CLOSED')
    prune()
    if (routes.size >= 4_096) throw new Error('MAR_ROUTE_CAPACITY')
    const routeId = randomUUID()
    const generation = randomUUID()
    const exactHost = `preview-${input.artifactRevisionId}.conexus.localhost`
    const expiresAt = input.now === undefined ? now() + 15 * 60 * 1000 : input.now + 15 * 60 * 1000
    const route: MarRouteInput & Readonly<{ lifecycle: 'OPENING' | 'ACTIVE' }> = Object.freeze({
      ...input,
      routeId,
      generation,
      exactHost,
      expiresAt,
      manifest: Object.freeze({
        entryPath: input.manifest.entryPath,
        files: Object.freeze(input.manifest.files.map((file) => Object.freeze({ ...file }))),
      }),
      lifecycle: 'OPENING',
    })
    routes.set(routeId, route)
    const origin = `https://${exactHost}:${previewPort}`
    return Object.freeze({ route, entryUrl: `${origin}/__conexus/preview-entry`, previewUrl: `${origin}/` })
  }
  const closeRoute = (routeId: string): void => { routes.delete(routeId) }
  const isRouteOpening = ({ routeId, generation, attemptId }: Readonly<{ routeId: string; generation: string; attemptId: string }>): boolean => {
    const route = routes.get(routeId)
    return !closed && route?.lifecycle === 'OPENING' && route.generation === generation && route.attemptId === attemptId && route.expiresAt > now()
  }
  const close = async (): Promise<void> => {
    if (closing !== null) return closing
    if (closed) return
    closed = true
    routes.clear()
    closing = Promise.resolve().then(async () => { await Promise.allSettled([...pendingRequests]); pendingRequests.clear() })
    await closing
  }
  return Object.freeze({
    openRoute,
    closeRoute,
    isRouteOpening,
    registerPreviewRoutes: (app: FastifyInstance) => registerPreviewRoutes(app, dependencies),
    close,
  })
}
