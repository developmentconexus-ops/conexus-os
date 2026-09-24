import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { createHash } from 'node:crypto'
import type { Caller } from '../platform/caller.js'

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
  caller: Caller
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

// The admitted artifact's application API. The operation comes from the request path and must be one
// the artifact's own manifest declares; the Project, artifact and caller come from the Preview binding.
type ApplicationInvoker = (input: Readonly<{
  source: Readonly<{ via: 'PREVIEW'; accountId: string; projectId: string; sourceRevision: string; artifactRevisionId: string }>
  serverFiles: readonly string[]
  operation: string
  input: unknown
  caller: Caller
}>) => Promise<Readonly<{ status: number; body: unknown }>>

export type PreviewRouteDependencies = Readonly<{
  routes: Map<string, MarRoute>
  access: PreviewAccess
  registryReader: RegistryReader
  invokeApplication?: ApplicationInvoker
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
export const strictOrigin = (value: string | string[] | undefined, expected: string): boolean =>
  (Array.isArray(value) ? value[0] : value) === expected

// allow-forms lets a submit event reach the app's own handler; form-action 'none' still refuses
// any submission that would navigate or post somewhere. connect-src 'self' admits only the app's own
// same-origin API under /__conexus/api/.
export const applicationContentSecurityPolicy = (frameAncestors: string): string =>
  `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; worker-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors ${frameAncestors}; sandbox allow-scripts allow-same-origin allow-forms`

export const previewContentSecurityPolicy = (exactHubOrigin: string): string => applicationContentSecurityPolicy(exactHubOrigin)

const securityHeaders = (reply: { header(name: string, value: string): unknown; removeHeader(name: string): unknown }, exactHubOrigin: string): void => {
  reply.header('referrer-policy', 'no-referrer')
  reply.header('cache-control', 'no-store')
  reply.header('content-security-policy', previewContentSecurityPolicy(exactHubOrigin))
  reply.removeHeader('x-frame-options')
}

const sameBinding = (left: MarRoute, right: PreviewCookieBinding): boolean => (
  left.routeId === right.routeId && left.generation === right.generation && left.attemptId === right.attemptId &&
  left.accountId === right.accountId && left.projectId === right.projectId && left.changeId === right.changeId &&
  left.subjectDigest === right.subjectDigest && left.sourceRevision === right.sourceRevision &&
  left.artifactRevisionId === right.artifactRevisionId && left.artifactDigest === right.artifactDigest &&
  left.exactHost === right.exactHost
)

export const SERVER_ROOT = 'conexus-server/'
export const OPERATION = /^[a-z][A-Za-z0-9]{0,63}$/
export const API_BODY_LIMIT = 64 * 1024

export const pathForRequest = (pathname: string): string | null => {
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

  type PreviewRequest = { headers: { host?: string | undefined }; cookies: Record<string, string | undefined>; url: string }
  type PreviewReply = {
    code(status: number): PreviewReply
    header(name: string, value: string): PreviewReply
    removeHeader(name: string): PreviewReply
    type(value: string): PreviewReply
    send(value?: unknown): unknown
  }
  // The active route this request's cookie is bound to, or the status that refuses it.
  const activeRoute = async (request: PreviewRequest): Promise<Readonly<{ route: MarRoute; binding: PreviewCookieBinding; cookie: string }> | number> => {
    const requestHost = request.headers.host
    const routeHost = typeof requestHost === 'string' && requestHost.endsWith(`:${dependencies.previewPort}`)
      ? requestHost.slice(0, -String(dependencies.previewPort).length - 1)
      : requestHost
    if (!routeHost) return 404
    const cookie = request.cookies[PREVIEW_COOKIE]
    if (!cookie) return 403
    let before: PreviewCookieBinding | null
    try {
      before = await dependencies.access.resolvePreviewCookie({ cookie, exactHost: routeHost })
    } catch {
      return 503
    }
    const route = before ? dependencies.routes.get(before.routeId) : undefined
    if (!route || !before || !hostMatches(requestHost, route, dependencies.previewPort) || route.lifecycle !== 'ACTIVE' || route.expiresAt <= dependencies.now()) return 403
    const current = dependencies.routes.get(route.routeId)
    if (current?.lifecycle !== 'ACTIVE' || !sameBinding(current, before)) return 403
    return { route: current, binding: before, cookie }
  }

  const serve = async (request: PreviewRequest, reply: PreviewReply): Promise<unknown> => {
    securityHeaders(reply, dependencies.exactHubOrigin)
    const active = await activeRoute(request)
    if (typeof active === 'number') return reply.code(active).send()
    const { route, binding: before, cookie } = active
    const path = pathForRequest(request.url.split('?', 1)[0] ?? '')
    // The server tree is retained with the artifact for the runner; the browser never receives it.
    if (!path || path.startsWith(SERVER_ROOT) || !route.manifest.files.some((file) => file.path === path)) return reply.code(404).send()
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

  type ApiRequest = FastifyRequest<{ Params: { operation: string }; Body: unknown }>
  app.post<{ Params: { operation: string }; Body: unknown }>('/__conexus/api/:operation', { bodyLimit: API_BODY_LIMIT }, tracked<ApiRequest>(async (request, reply) => {
    securityHeaders(reply, dependencies.exactHubOrigin)
    const refuse = (status: number, code: string): unknown => reply.code(status).type('application/json').send({ error: { code } })
    if (request.headers['content-type']?.split(';', 1)[0]?.trim() !== 'application/json') return refuse(415, 'CONTENT_TYPE_REFUSED')
    const active = await activeRoute(request)
    if (typeof active === 'number') return refuse(active, 'PREVIEW_REFUSED')
    const { route, binding } = active
    // Only the Preview's own page may call its API: a cross-site POST carries no Lax cookie, and a
    // sibling Preview on the same site sends its own Origin.
    if (!strictOrigin(request.headers.origin, `https://${route.exactHost}:${dependencies.previewPort}`)) return refuse(403, 'ORIGIN_REFUSED')
    const serverFiles = route.manifest.files.map((file) => file.path).filter((path) => path.startsWith(SERVER_ROOT))
    if (!OPERATION.test(request.params.operation) || serverFiles.length === 0) return refuse(404, 'OPERATION_NOT_FOUND')
    if (!dependencies.invokeApplication) return refuse(503, 'APPLICATION_RUNNER_UNAVAILABLE')
    let result: Awaited<ReturnType<ApplicationInvoker>>
    try {
      result = await dependencies.invokeApplication({
        source: {
          via: 'PREVIEW', accountId: binding.accountId, projectId: binding.projectId,
          sourceRevision: binding.sourceRevision, artifactRevisionId: binding.artifactRevisionId,
        },
        serverFiles, operation: request.params.operation, input: request.body, caller: binding.caller,
      })
    } catch {
      return refuse(503, 'APPLICATION_RUNNER_UNAVAILABLE')
    }
    return reply.code(result.status).type('application/json').send(JSON.stringify(result.body))
  }))
  app.get('/', tracked(serve))
  app.get('/*', tracked(serve))
  return ['MAR-Preview']
}
