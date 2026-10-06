import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AccountId, ApplicationFilePath, ProjectId, SourceRevision, ArtifactRevisionId, MediaType, Sha256 } from '@conexus/contract'
import { classifyAppPath, SERVER_ROOT } from '../platform/application-path.js'
import type { Caller } from '../platform/caller.js'
import { Failure } from '../platform/failure.js'
import type { ApplicationInvoker } from './application-invoker.js'
import { digest, presentedToken } from '../platform/opaque-token.js'
import type { RawToken } from '../platform/db.js'
import { routes } from '../http/access.js'
import type { HeaderFact } from '../http/access.js'
import { readCookie, setCookie } from '../http/cookies.js'

export type PreviewHost = Readonly<{ artifactRevisionId: ArtifactRevisionId; exactHost: string; origin: string }>

type ManifestFile = Readonly<{ path: ApplicationFilePath; mediaType: MediaType }>
type PreviewManifest = Readonly<{ sourceRevision: SourceRevision; entryPath: 'index.html'; files: readonly ManifestFile[] }>
type PreviewFile = Readonly<{ path: ApplicationFilePath; mediaType: MediaType; sha256: Sha256; bytes: Uint8Array }>

type Outcome<T> =
  | Readonly<{ kind: 'SERVED'; value: T }>
  | Readonly<{ kind: 'SIGN_IN_REQUIRED' }>
  | Readonly<{ kind: 'PROVIDER_UNAVAILABLE' }>

// A Preview request as the session port resolves it: the revision it shows, its author as the caller, and the access proof.
type PreviewRequest<C> = Readonly<{ caller: Caller; checked: C; accountId: AccountId; projectId: ProjectId; artifactRevisionId: ArtifactRevisionId }>

// The ports this host needs, generic over the access proof: the hosting owner names no identity-access type.
export type PreviewSessions<C> = Readonly<{
  redeem(input: Readonly<{ handoff: RawToken; artifactRevisionId: ArtifactRevisionId }>): Promise<Readonly<{ sessionToken: RawToken; maxAgeSeconds: number }> | null>
  withPreviewRequest<T>(presented: Readonly<{ artifactRevisionId: ArtifactRevisionId; token: RawToken }>, serve: (request: PreviewRequest<C>) => Promise<T>): Promise<Outcome<T>>
}>

export type PreviewReader<C> = Readonly<{
  readPreviewManifest(checked: C, artifactRevisionId: ArtifactRevisionId): Promise<PreviewManifest | null>
  readPreviewRevisionFile(checked: C, at: Readonly<{ sourceRevision: SourceRevision; artifactRevisionId: ArtifactRevisionId; path: ApplicationFilePath }>): Promise<PreviewFile | null>
}>

export type PreviewRouteDependencies<C> = Readonly<{
  sessions: PreviewSessions<C>
  reader: PreviewReader<C>
  invokeApplication?: ApplicationInvoker
  previewHostOf(host: HeaderFact): PreviewHost | null
  pendingRequests: Set<Promise<unknown>>
  isClosed: () => boolean
}>

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

export const registerPreviewRoutes = async <C>(
  app: FastifyInstance,
  dependencies: PreviewRouteDependencies<C>,
): Promise<readonly ['Hosting-Preview']> => {
  const { sessions, reader } = dependencies
  const route = routes(app)
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

  // The Hub's own page posts the entry handoff it was given for this host. Redemption opens the Preview's
  // session only on the host the handoff names; a handoff presented anywhere else is refused and kept.
  route['hub-entry']<{ Body: { entryGrant: string } }>({
    method: 'POST',
    url: '/__conexus/preview-entry',
    handler: tracked<FastifyRequest<{ Body: { entryGrant: string } }>>(async (request, reply) => {
      if (request.headers['content-type']?.split(';', 1)[0]?.trim() !== 'application/x-www-form-urlencoded') return reply.code(415).send()
      const host = dependencies.previewHostOf(request.headers.host)
      const handoff = presentedToken(request.body.entryGrant)
      if (!host || !handoff) return reply.code(403).send()
      const redeemed = await sessions.redeem({ handoff, artifactRevisionId: host.artifactRevisionId })
      if (!redeemed) return reply.code(403).send()
      return setCookie(reply, 'previewSession', redeemed.sessionToken, redeemed.maxAgeSeconds)
        .code(303)
        .header('location', '/')
        .send()
    }),
  })

  // One entry per request: the session, its parent's standing, the Project check and every read it serves.
  const withPreview = async <T>(request: FastifyRequest, serve: (preview: PreviewRequest<C>) => Promise<T>): Promise<T | number> => {
    const host = dependencies.previewHostOf(request.headers.host)
    if (!host) return 404
    const token = presentedToken(readCookie(request, 'previewSession'))
    if (!token) return 403
    const outcome = await sessions.withPreviewRequest({ artifactRevisionId: host.artifactRevisionId, token }, serve)
    if (outcome.kind === 'PROVIDER_UNAVAILABLE') return 503
    return outcome.kind === 'SERVED' ? outcome.value : 403
  }

  const serve = async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
    const pathname = request.url.split('?', 1)[0] ?? ''
    if (classifyAppPath(request.method, pathname, () => true).kind === 'not-found') throw new Failure('NOT_FOUND')
    const served = await withPreview(request, async ({ checked, artifactRevisionId }) => {
      const manifest = await reader.readPreviewManifest(checked, artifactRevisionId)
      if (!manifest) return 404
      // The server tree is retained with the artifact for the runner; the classifier never serves it.
      const classified = classifyAppPath(request.method, pathname, (candidate) => manifest.files.some((file) => file.path === candidate))
      if (classified.kind === 'not-found') return 404
      const path = classified.kind === 'file' ? classified.path : manifest.entryPath
      const declared = manifest.files.find((file) => file.path === path)
      if (!declared) return 404
      const file = await reader.readPreviewRevisionFile(checked, { sourceRevision: manifest.sourceRevision, artifactRevisionId, path: declared.path })
      return file && file.path === path && file.mediaType === declared.mediaType && digest(file.bytes).toString('hex') === file.sha256 ? file : 403
    })
    if (typeof served === 'number') return reply.code(served).send()
    return reply.type(served.mediaType).send(Buffer.from(served.bytes))
  }

  type ApiRequest = FastifyRequest<{ Params: { operation: string }; Body: unknown }>
  route['host-write']<{ Params: { operation: string }; Body: unknown }>({ method: 'POST', url: '/__conexus/api/:operation', bodyLimit: API_BODY_LIMIT, handler: tracked<ApiRequest>(async (request, reply) => {
    if (request.headers['content-type']?.split(';', 1)[0]?.trim() !== 'application/json') throw new Failure('CONTENT_TYPE_REFUSED')
    const active = await withPreview(request, async ({ checked, caller, accountId, projectId, artifactRevisionId }) =>
      ({ caller, accountId, projectId, artifactRevisionId, manifest: await reader.readPreviewManifest(checked, artifactRevisionId) }))
    if (typeof active === 'number') throw new Failure(active === 503 ? 'IDENTITY_PROVIDER_UNAVAILABLE' : 'PREVIEW_REFUSED')
    const { manifest } = active
    const serverFiles = manifest?.files.map((file) => file.path).filter((path) => path.startsWith(SERVER_ROOT)) ?? []
    if (!manifest || !OPERATION.test(request.params.operation) || serverFiles.length === 0) throw new Failure('OPERATION_NOT_FOUND')
    if (!dependencies.invokeApplication) throw new Failure('APPLICATION_RUNNER_UNAVAILABLE')
    // The entry has committed: the invocation holds no database connection.
    const result = await dependencies.invokeApplication({
      source: { via: 'PREVIEW', accountId: active.accountId, projectId: active.projectId, sourceRevision: manifest.sourceRevision, artifactRevisionId: active.artifactRevisionId },
      serverFiles, operation: request.params.operation, input: request.body, caller: active.caller, callerLeft: callerLeft(reply),
    })
    return reply.code(result.status).type('application/problem+json').send(JSON.stringify(result.body))
  }) })
  route.navigation({ url: '/', handler: tracked(serve) })
  route.navigation({ url: '/*', handler: tracked(serve) })
  return ['Hosting-Preview']
}
