import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { createHash } from 'node:crypto'

const PREVIEW_COOKIE = '__Host-conexus_preview'

type ManifestFile = Readonly<{ path: string; mediaType: string }>
type Manifest = Readonly<{ entryPath: 'index.html'; files: readonly ManifestFile[] }>

export type MarRouteInput = Readonly<{
  routeId: string
  generation: string
  attemptId: string
  accountId: string
  projectId: string
  changeId: string
  subjectDigest: string
  sourceRevision: string
  artifactRevisionId: string
  artifactDigest: string
  exactHost: string
  expiresAt: number
  manifest: Manifest
}>

type MarRoute = MarRouteInput & Readonly<{ lifecycle: 'OPENING' | 'ACTIVE' }>

type PreviewCookieBinding = Readonly<{
  routeId: string
  generation: string
  attemptId: string
  accountId: string
  projectId: string
  changeId: string
  subjectDigest: string
  sourceRevision: string
  artifactRevisionId: string
  artifactDigest: string
  exactHost: string
  expiresAt: number
  issuer: string
  subject: string
}>

type PreviewAccess = Readonly<{
  consumeEntryGrant(input: Readonly<{ entryGrant: string; exactHost: string; now?: Date }>): Promise<Readonly<{
    cookie: string
    binding: PreviewCookieBinding
  }> | null>
  resolvePreviewCookie(input: Readonly<{ cookie: string; exactHost: string; now?: Date }>): Promise<PreviewCookieBinding | null>
  discardCookie(cookie: string): void
}>

type RegistryReader = (input: Readonly<{
  accountId: string
  projectId: string
  changeId: string
  sourceRevision: string
  artifactRevisionId: string
  path: string
}> ) => Promise<Readonly<{ path: string; mediaType: string; bytes: Uint8Array; sha256: string }> | null>

export type PreviewRouteDependencies = Readonly<{
  routes: Map<string, MarRoute>
  access: PreviewAccess
  registryReader: RegistryReader
  exactHubOrigin: string
  previewPort: number
  now: () => number
  pendingRequests: Set<Promise<unknown>>
  isClosed: () => boolean
}>

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const expectedHost = (route: Readonly<{ exactHost: string }>, port: number): readonly string[] => [route.exactHost, `${route.exactHost}:${port}`]
const hostMatches = (requestHost: string | undefined, route: Readonly<{ exactHost: string }>, port: number): boolean =>
  typeof requestHost === 'string' && expectedHost(route, port).includes(requestHost)
const strictOrigin = (value: string | string[] | undefined, expected: string): boolean =>
  (Array.isArray(value) ? value[0] : value) === expected

const securityHeaders = (reply: { header(name: string, value: string): unknown; removeHeader(name: string): unknown }, exactHubOrigin: string): void => {
  reply.header('referrer-policy', 'no-referrer')
  reply.header('cache-control', 'no-store')
  reply.header('content-security-policy', `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors ${exactHubOrigin}; sandbox allow-scripts allow-same-origin`)
  reply.removeHeader('x-frame-options')
}

const sameBinding = (left: MarRoute, right: PreviewCookieBinding): boolean => (
  left.routeId === right.routeId && left.generation === right.generation && left.attemptId === right.attemptId &&
  left.accountId === right.accountId && left.projectId === right.projectId && left.changeId === right.changeId &&
  left.subjectDigest === right.subjectDigest && left.sourceRevision === right.sourceRevision &&
  left.artifactRevisionId === right.artifactRevisionId && left.artifactDigest === right.artifactDigest &&
  left.exactHost === right.exactHost
)

const pathForRequest = (pathname: string): string | null => {
  if (pathname === '/') return 'index.html'
  try {
    const path = decodeURIComponent(pathname.slice(1))
    if (!path || path.includes('\0') || path.split('/').some((segment) => segment === '.' || segment === '..')) return null
    return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path) ? path : null
  } catch {
    return null
  }
}

export const registerPreviewRoutes = async (
  app: FastifyInstance,
  dependencies: PreviewRouteDependencies,
): Promise<readonly ['MAR-Preview']> => {
  app.addHook('onRequest', async (request, reply) => {
    securityHeaders(reply, dependencies.exactHubOrigin)
    if ((request.method === 'GET' || request.method === 'HEAD') && request.headers.origin === dependencies.exactHubOrigin) {
      reply.header('access-control-allow-origin', dependencies.exactHubOrigin)
      reply.header('access-control-allow-credentials', 'true')
      reply.header('vary', 'Origin')
    }
    if (dependencies.isClosed()) return reply.code(503).send()
  })
  const tracked = <Request extends FastifyRequest>(handler: (request: Request, reply: FastifyReply) => Promise<unknown>) =>
    async (request: Request, reply: FastifyReply): Promise<unknown> => {
      if (dependencies.isClosed()) return reply.code(503).send()
      const pending = handler(request, reply)
      dependencies.pendingRequests.add(pending)
      try { return await pending } finally { dependencies.pendingRequests.delete(pending) }
    }
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
    const refused = (): Error => Object.assign(new Error('PREVIEW_FORM_REFUSED'), { statusCode: 400 })
    if (typeof body !== 'string') return done(refused())
    const params = new URLSearchParams(body)
    const fields = [...params.keys()]
    const entryGrant = params.get('entryGrant')
    if (fields.length !== 1 || fields[0] !== 'entryGrant' || !entryGrant) {
      return done(refused())
    }
    return done(null, { entryGrant })
  })

  app.post<{ Body: { entryGrant: string } }>('/__conexus/preview-entry', tracked<FastifyRequest<{ Body: { entryGrant: string } }>>(async (request, reply) => {
    securityHeaders(reply, dependencies.exactHubOrigin)
    if (request.headers['content-type']?.split(';', 1)[0]?.trim() !== 'application/x-www-form-urlencoded') return reply.code(415).send()
    const requestHost = request.headers.host
    const routeHost = typeof requestHost === 'string' && requestHost.endsWith(`:${dependencies.previewPort}`)
      ? requestHost.slice(0, -String(dependencies.previewPort).length - 1)
      : requestHost
    if (!routeHost || !strictOrigin(request.headers.origin, dependencies.exactHubOrigin)) return reply.code(403).send()
    let redeemed: Awaited<ReturnType<PreviewAccess['consumeEntryGrant']>>
    try {
      redeemed = await dependencies.access.consumeEntryGrant({ entryGrant: request.body.entryGrant, exactHost: routeHost })
    } catch {
      return reply.code(503).send()
    }
    if (!redeemed) return reply.code(403).send()
    const route = dependencies.routes.get(redeemed.binding.routeId)
    if (route?.lifecycle !== 'OPENING' || !hostMatches(requestHost, route, dependencies.previewPort) ||
      !sameBinding(route, redeemed.binding) || route.expiresAt <= dependencies.now()) {
      dependencies.access.discardCookie(redeemed.cookie)
      return reply.code(403).send()
    }
    const current = dependencies.routes.get(route.routeId)
    if (current?.lifecycle !== 'OPENING' || current.generation !== route.generation || current.attemptId !== route.attemptId) {
      dependencies.access.discardCookie(redeemed.cookie)
      return reply.code(403).send()
    }
    dependencies.routes.set(route.routeId, Object.freeze({ ...current, lifecycle: 'ACTIVE' }))
    const maxAge = Math.max(1, Math.min(900, Math.floor((route.expiresAt - dependencies.now()) / 1000)))
    return reply
      .setCookie(PREVIEW_COOKIE, redeemed.cookie, { path: '/', secure: true, httpOnly: true, sameSite: 'lax', maxAge })
      .code(303)
      .header('location', '/')
      .send()
  }))

  const serve = async (request: { headers: { host?: string | undefined }; cookies: Record<string, string | undefined>; url: string }, reply: {
    code(status: number): typeof reply
    header(name: string, value: string): typeof reply
    removeHeader(name: string): typeof reply
    type(value: string): typeof reply
    send(value?: unknown): unknown
  }): Promise<unknown> => {
    const requestHost = request.headers.host
    const routeHost = typeof requestHost === 'string' && requestHost.endsWith(`:${dependencies.previewPort}`)
      ? requestHost.slice(0, -String(dependencies.previewPort).length - 1)
      : requestHost
    securityHeaders(reply, dependencies.exactHubOrigin)
    if (!routeHost) return reply.code(404).send()
    const cookie = request.cookies[PREVIEW_COOKIE]
    if (!cookie) return reply.code(403).send()
    let before: PreviewCookieBinding | null
    try {
      before = await dependencies.access.resolvePreviewCookie({ cookie, exactHost: routeHost })
    } catch {
      return reply.code(503).send()
    }
    const route = before ? dependencies.routes.get(before.routeId) : undefined
    if (!route || !before || !hostMatches(requestHost, route, dependencies.previewPort) || route.lifecycle !== 'ACTIVE' || route.expiresAt <= dependencies.now()) return reply.code(403).send()
    const current = dependencies.routes.get(route.routeId)
    if (current?.lifecycle !== 'ACTIVE' || !sameBinding(current, before)) return reply.code(403).send()
    const path = pathForRequest(request.url.split('?', 1)[0] ?? '')
    if (!path || !route.manifest.files.some((file) => file.path === path)) return reply.code(404).send()
    let file: Awaited<ReturnType<RegistryReader>>
    try {
      file = await dependencies.registryReader({
        accountId: before.accountId,
        projectId: before.projectId,
        changeId: before.changeId,
        sourceRevision: before.sourceRevision,
        artifactRevisionId: before.artifactRevisionId,
        path,
      })
    } catch {
      return reply.code(503).send()
    }
    let after: PreviewCookieBinding | null
    if (dependencies.isClosed()) return reply.code(503).send()
    try {
      after = await dependencies.access.resolvePreviewCookie({ cookie, exactHost: route.exactHost })
    } catch {
      return reply.code(503).send()
    }
    const latest = dependencies.routes.get(route.routeId)
    if (!file || !after || !latest || latest.lifecycle !== 'ACTIVE' || !sameBinding(latest, after) ||
      file.path !== path || file.mediaType !== route.manifest.files.find((entry) => entry.path === path)?.mediaType ||
      sha256(file.bytes) !== file.sha256) return reply.code(403).send()
    return reply.type(file.mediaType).send(Buffer.from(file.bytes))
  }

  app.get('/', tracked(serve))
  app.get('/*', tracked(serve))
  return ['MAR-Preview']
}
