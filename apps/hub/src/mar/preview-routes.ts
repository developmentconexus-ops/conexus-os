import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { classifyAppPath, SERVER_ROOT } from '../platform/application-path.js'
import type { Caller } from '../platform/caller.js'
import { Failure } from '../platform/failure.js'
import type { ApplicationInvoker } from './application-invoker.js'
import { digest } from '../platform/opaque-token.js'
import { previewContentSecurityPolicy } from '../platform/application-csp.js'
import { isExactOrigin } from '../platform/origin.js'

const PREVIEW_COOKIE = '__Host-conexus_preview'

type ManifestFile = Readonly<{ path: string; mediaType: string }>
type Manifest = Readonly<{ entryPath: 'index.html'; files: readonly ManifestFile[] }>

// A Preview's binding, as the session port resolves it: the launch it shows and its author as the caller.
type PreviewBinding = Readonly<{
  accountId: string
  projectId: string
  sourceRevision: string
  artifactRevisionId: string
  artifactDigest: string
  exactHost: string
  manifest: Manifest
  expiresAt: number
  caller: Caller
}>

type Refused = Readonly<{ kind: 'SIGN_IN_REQUIRED' }> | Readonly<{ kind: 'PROVIDER_UNAVAILABLE' }>

// The session port this host needs, declared structurally: the MAR owner does not import identity-access.
export type PreviewSessions = Readonly<{
  redeem(input: Readonly<{ handoff: string; target: Readonly<{ kind: 'PREVIEW'; exactHost: string }> }>): Promise<Readonly<{ sessionToken: string; maxAgeSeconds: number }> | null>
  previewAuthority(input: Readonly<{ sessionToken: string | undefined; exactHost: string }>): Promise<Readonly<{ kind: 'SIGNED_IN'; binding: PreviewBinding }> | Refused>
}>

type RegistryReader = (input: Readonly<{
  accountId: string
  projectId: string
  sourceRevision: string
  artifactRevisionId: string
  path: string
}> ) => Promise<Readonly<{ path: string; mediaType: string; bytes: Uint8Array; sha256: string }> | null>

export type PreviewRouteDependencies = Readonly<{
  sessions: PreviewSessions
  registryReader: RegistryReader
  invokeApplication?: ApplicationInvoker
  exactHubOrigin: string
  previewPort: number
  pendingRequests: Set<Promise<unknown>>
  isClosed: () => boolean
}>


const securityHeaders = (reply: { header(name: string, value: string): unknown; removeHeader(name: string): unknown }, exactHubOrigin: string): void => {
  reply.header('referrer-policy', 'no-referrer')
  reply.header('cache-control', 'no-store')
  reply.header('content-security-policy', previewContentSecurityPolicy(exactHubOrigin))
  reply.removeHeader('x-frame-options')
}

const sameBinding = (left: PreviewBinding, right: PreviewBinding): boolean => (
  left.accountId === right.accountId && left.projectId === right.projectId && left.sourceRevision === right.sourceRevision &&
  left.artifactRevisionId === right.artifactRevisionId && left.artifactDigest === right.artifactDigest && left.exactHost === right.exactHost
)

export const OPERATION = /^[a-z][A-Za-z0-9]{0,63}$/
export const API_BODY_LIMIT = 64 * 1024

// Fastify's `request.signal` aborts as soon as the body is read. Node's `request.raw.signal` behaves
// like this helper, but @types/node 24.13.3 does not declare it.
export const callerLeft = (reply: FastifyReply): AbortSignal => {
  if (reply.raw.destroyed) return AbortSignal.abort()
  const left = new AbortController()
  reply.raw.once('close', () => { if (!reply.raw.writableEnded) left.abort() })
  return left.signal
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
export const registerPreviewRoutes = async (
  app: FastifyInstance,
  dependencies: PreviewRouteDependencies,
): Promise<readonly ['MAR-Preview']> => {
  app.addHook('onRequest', async (request, reply) => {
    securityHeaders(reply, dependencies.exactHubOrigin)
    if ((request.method === 'GET' || request.method === 'HEAD') && isExactOrigin(request.headers.origin, dependencies.exactHubOrigin)) {
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
    const refused = (): Failure => new Failure('PREVIEW_FORM_REFUSED')
    if (typeof body !== 'string') return done(refused())
    const params = new URLSearchParams(body)
    const fields = [...params.keys()]
    const entryGrant = params.get('entryGrant')
    if (fields.length !== 1 || fields[0] !== 'entryGrant' || !entryGrant) {
      return done(refused())
    }
    return done(null, { entryGrant })
  })

  // The Preview's host without the listener's port: the host a Preview is launched for.
  const routeHostOf = (requestHost: string | undefined): string | undefined =>
    typeof requestHost === 'string' && requestHost.endsWith(`:${dependencies.previewPort}`)
      ? requestHost.slice(0, -String(dependencies.previewPort).length - 1)
      : requestHost

  // The Hub's own page posts the entry handoff it was given for this host. Redemption opens the Preview's
  // session only on the host the handoff names; a handoff presented anywhere else is refused and kept.
  app.post<{ Body: { entryGrant: string } }>('/__conexus/preview-entry', tracked<FastifyRequest<{ Body: { entryGrant: string } }>>(async (request, reply) => {
    securityHeaders(reply, dependencies.exactHubOrigin)
    if (request.headers['content-type']?.split(';', 1)[0]?.trim() !== 'application/x-www-form-urlencoded') return reply.code(415).send()
    const routeHost = routeHostOf(request.headers.host)
    if (!routeHost || !isExactOrigin(request.headers.origin, dependencies.exactHubOrigin)) return reply.code(403).send()
    let redeemed: Awaited<ReturnType<PreviewSessions['redeem']>>
    try {
      redeemed = await dependencies.sessions.redeem({ handoff: request.body.entryGrant, target: { kind: 'PREVIEW', exactHost: routeHost } })
    } catch {
      return reply.code(503).send()
    }
    if (!redeemed) return reply.code(403).send()
    return reply
      .setCookie(PREVIEW_COOKIE, redeemed.sessionToken, { path: '/', secure: true, httpOnly: true, sameSite: 'lax', maxAge: redeemed.maxAgeSeconds })
      .code(303)
      .header('location', '/')
      .send()
  }))

  type PreviewRequest = { headers: { host?: string | undefined }; cookies: Record<string, string | undefined>; url: string; method: string }
  type PreviewReply = {
    code(status: number): PreviewReply
    header(name: string, value: string): PreviewReply
    removeHeader(name: string): PreviewReply
    type(value: string): PreviewReply
    send(value?: unknown): unknown
  }
  // The Preview this request's cookie is bound to on this host, or the status that refuses it.
  const activePreview = async (request: PreviewRequest): Promise<Readonly<{ binding: PreviewBinding; cookie: string }> | number> => {
    const routeHost = routeHostOf(request.headers.host)
    if (!routeHost) return 404
    const cookie = request.cookies[PREVIEW_COOKIE]
    if (!cookie) return 403
    let authority: Awaited<ReturnType<PreviewSessions['previewAuthority']>>
    try {
      authority = await dependencies.sessions.previewAuthority({ sessionToken: cookie, exactHost: routeHost })
    } catch {
      return 503
    }
    if (authority.kind === 'PROVIDER_UNAVAILABLE') return 503
    return authority.kind === 'SIGNED_IN' ? { binding: authority.binding, cookie } : 403
  }

  const serve = async (request: PreviewRequest, reply: PreviewReply): Promise<unknown> => {
    securityHeaders(reply, dependencies.exactHubOrigin)
    const active = await activePreview(request)
    if (typeof active === 'number') return reply.code(active).send()
    const { binding: before, cookie } = active
    // The server tree is retained with the artifact for the runner; the classifier never serves it.
    const served = classifyAppPath(request.method, request.url.split('?', 1)[0] ?? '', (candidate) => before.manifest.files.some((file) => file.path === candidate))
    if (served.kind === 'not-found') return reply.code(404).send()
    const path = served.kind === 'file' ? served.path : before.manifest.entryPath
    const declared = before.manifest.files.find((file) => file.path === path)
    if (!declared) return reply.code(404).send()
    let file: Awaited<ReturnType<RegistryReader>>
    try {
      file = await dependencies.registryReader({
        accountId: before.accountId,
        projectId: before.projectId,
        sourceRevision: before.sourceRevision,
        artifactRevisionId: before.artifactRevisionId,
        path,
      })
    } catch {
      return reply.code(503).send()
    }
    if (dependencies.isClosed()) return reply.code(503).send()
    // The binding is checked again after the asynchronous read: a session that ended meanwhile gets nothing.
    let after: Awaited<ReturnType<PreviewSessions['previewAuthority']>>
    try {
      after = await dependencies.sessions.previewAuthority({ sessionToken: cookie, exactHost: before.exactHost })
    } catch {
      return reply.code(503).send()
    }
    if (!file || after.kind !== 'SIGNED_IN' || !sameBinding(before, after.binding) ||
      file.path !== path || file.mediaType !== declared.mediaType || digest(file.bytes).toString('hex') !== file.sha256) return reply.code(403).send()
    return reply.type(file.mediaType).send(Buffer.from(file.bytes))
  }

  type ApiRequest = FastifyRequest<{ Params: { operation: string }; Body: unknown }>
  app.post<{ Params: { operation: string }; Body: unknown }>('/__conexus/api/:operation', { bodyLimit: API_BODY_LIMIT }, tracked<ApiRequest>(async (request, reply) => {
    securityHeaders(reply, dependencies.exactHubOrigin)
    if (request.headers['content-type']?.split(';', 1)[0]?.trim() !== 'application/json') throw new Failure('CONTENT_TYPE_REFUSED')
    const active = await activePreview(request)
    if (typeof active === 'number') throw new Failure(active === 503 ? 'IDENTITY_PROVIDER_UNAVAILABLE' : 'PREVIEW_REFUSED')
    const { binding } = active
    // Only the Preview's own page may call its API: a cross-site POST carries no Lax cookie, and a
    // sibling Preview on the same site sends its own Origin.
    if (!isExactOrigin(request.headers.origin, `https://${binding.exactHost}:${dependencies.previewPort}`)) throw new Failure('ORIGIN_REFUSED')
    const serverFiles = binding.manifest.files.map((file) => file.path).filter((path) => path.startsWith(SERVER_ROOT))
    if (!OPERATION.test(request.params.operation) || serverFiles.length === 0) throw new Failure('OPERATION_NOT_FOUND')
    if (!dependencies.invokeApplication) throw new Failure('APPLICATION_RUNNER_UNAVAILABLE')
    let result: Awaited<ReturnType<ApplicationInvoker>>
    try {
      result = await dependencies.invokeApplication({
        source: {
          via: 'PREVIEW', accountId: binding.accountId, projectId: binding.projectId,
          sourceRevision: binding.sourceRevision, artifactRevisionId: binding.artifactRevisionId,
        },
        serverFiles, operation: request.params.operation, input: request.body, caller: binding.caller, callerLeft: callerLeft(reply),
      })
    } catch (error) {
      throw new Failure('APPLICATION_RUNNER_UNAVAILABLE', { cause: error })
    }
    return reply.code(result.status).type('application/problem+json').send(JSON.stringify(result.body))
  }))
  app.get('/', tracked(serve))
  app.get('/*', tracked(serve))
  return ['MAR-Preview']
}
