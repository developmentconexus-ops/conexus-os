import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ApplicationFilePath, SourceRevision, ArtifactRevisionId, MediaType, Sha256 } from '@conexus/contract'
import { classifyAppPath } from '../platform/application-path.js'
import { Failure } from '../platform/failure.js'
import { FAILURE_TEXT } from '../platform/failure-text.generated.js'
import type { HostOutcome, HostRequest, ScopedProof } from '../platform/host-outcome.js'
import type { ApplicationInvoker } from './application-invoker.js'
import { digest, presentedToken } from '../platform/opaque-token.js'
import type { RawToken } from '../platform/db.js'
import { routes } from '../http/access.js'
import type { HeaderFact } from '../http/access.js'
import { readCookie, setCookie } from '../http/cookies.js'
import { API_BODY_LIMIT, callerLeft, isJsonBody, OPERATION, page, sendPage } from './host-http.js'
import { readServerTree, serverFilesOf, serverPathsOf } from './server-tree.js'

export type PreviewHost = Readonly<{ artifactRevisionId: ArtifactRevisionId; exactHost: string; origin: string }>

type ManifestFile = Readonly<{ path: ApplicationFilePath; mediaType: MediaType }>
type PreviewManifest = Readonly<{ sourceRevision: SourceRevision; entryPath: 'index.html'; files: readonly ManifestFile[] }>
type PreviewFile = Readonly<{ path: ApplicationFilePath; mediaType: MediaType; sha256: Sha256; bytes: Uint8Array }>

// The ports this host needs, generic over the access proof: the hosting owner names no identity-access type.
export type PreviewSessions<C> = Readonly<{
  redeem(input: Readonly<{ handoff: RawToken; artifactRevisionId: ArtifactRevisionId }>): Promise<Readonly<{ sessionToken: RawToken; maxAgeSeconds: number }> | null>
  withPreviewRequest<T>(presented: Readonly<{ artifactRevisionId: ArtifactRevisionId; token: RawToken }>, serve: (request: HostRequest<C>) => Promise<T>): Promise<HostOutcome<T>>
}>

export type PreviewReader<C> = Readonly<{
  readPreviewManifest(checked: C, artifactRevisionId: ArtifactRevisionId): Promise<PreviewManifest | null>
  readPreviewRevisionFile(checked: C, at: Readonly<{ sourceRevision: SourceRevision; artifactRevisionId: ArtifactRevisionId; path: ApplicationFilePath }>): Promise<PreviewFile | null>
}>

export type PreviewRouteDependencies<C extends ScopedProof> = Readonly<{
  sessions: PreviewSessions<C>
  reader: PreviewReader<C>
  invokeApplication?: ApplicationInvoker
  previewHostOf(host: HeaderFact): PreviewHost | null
  pendingRequests: Set<Promise<unknown>>
  isClosed: () => boolean
}>

// A Preview whose session ended, or that this browser never entered, answers one page: the Hub opens a new one.
const ENDED = page('Prévia encerrada', FAILURE_TEXT.PREVIEW_REFUSED)

/** A Preview request: one of its host's outcomes, or no Preview host at all. */
type PreviewOutcome<T> = HostOutcome<T> | Readonly<{ kind: 'NO_HOST' }>

type Deps<C extends ScopedProof> = PreviewRouteDependencies<C>

const entryForm = (_request: FastifyRequest, body: string | Buffer, done: (error: Error | null, body?: unknown) => void): void => {
  const params = typeof body === 'string' ? new URLSearchParams(body) : null
  const entryGrant = params?.get('entryGrant')
  if (params && [...params.keys()].join() === 'entryGrant' && entryGrant) done(null, { entryGrant })
  else done(new Failure('PREVIEW_FORM_REFUSED'))
}

// The Hub's own page posts the entry handoff it was given for this host. Redemption opens the Preview's
// session only on the host the handoff names; a handoff presented anywhere else is refused and kept.
const enter = <C extends ScopedProof>(dependencies: Deps<C>) => async (request: FastifyRequest<{ Body: { entryGrant: string } }>, reply: FastifyReply): Promise<unknown> => {
  if (request.headers['content-type']?.split(';', 1)[0]?.trim() !== 'application/x-www-form-urlencoded') return reply.code(415).send()
  const host = dependencies.previewHostOf(request.headers.host)
  const handoff = presentedToken(request.body.entryGrant)
  if (!host || !handoff) return reply.code(403).send()
  const redeemed = await dependencies.sessions.redeem({ handoff, artifactRevisionId: host.artifactRevisionId })
  if (!redeemed) return reply.code(403).send()
  return setCookie(reply, 'previewSession', redeemed.sessionToken, redeemed.maxAgeSeconds).code(303).header('location', '/').send()
}

// One entry per request: the session, its parent's standing, the Project check and every read it serves.
const withPreview = async <C extends ScopedProof, T>(
  dependencies: Deps<C>,
  request: FastifyRequest,
  serve: (preview: HostRequest<C> & Readonly<{ artifactRevisionId: ArtifactRevisionId }>) => Promise<T>,
): Promise<PreviewOutcome<T>> => {
  const host = dependencies.previewHostOf(request.headers.host)
  if (!host) return { kind: 'NO_HOST' }
  const token = presentedToken(readCookie(request, 'previewSession'))
  if (!token) return { kind: 'SIGN_IN_REQUIRED' }
  const { artifactRevisionId } = host
  return dependencies.sessions.withPreviewRequest({ artifactRevisionId, token }, (preview) => serve({ ...preview, artifactRevisionId }))
}

const serveFile = <C extends ScopedProof>(dependencies: Deps<C>) => async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
  const { reader } = dependencies
  const pathname = request.url.split('?', 1)[0] ?? ''
  if (classifyAppPath(request.method, pathname, () => true).kind === 'not-found') throw new Failure('NOT_FOUND')
  const outcome = await withPreview(dependencies, request, async ({ checked, artifactRevisionId }) => {
    const manifest = await reader.readPreviewManifest(checked, artifactRevisionId)
    if (!manifest) return null
    // The server tree is retained with the artifact for the runner; the classifier never serves it.
    const classified = classifyAppPath(request.method, pathname, (candidate) => manifest.files.some((file) => file.path === candidate))
    if (classified.kind === 'not-found') return null
    const path = classified.kind === 'file' ? classified.path : manifest.entryPath
    const declared = manifest.files.find((file) => file.path === path)
    if (!declared) return null
    const file = await reader.readPreviewRevisionFile(checked, { sourceRevision: manifest.sourceRevision, artifactRevisionId, path: declared.path })
    // A file that does not match its manifest entry is refused, never served.
    return { file: file && file.path === path && file.mediaType === declared.mediaType && digest(file.bytes).toString('hex') === file.sha256 ? file : null }
  })
  if (outcome.kind === 'NO_HOST') return reply.code(404).send()
  if (outcome.kind === 'SIGN_IN_REQUIRED') return sendPage(reply, 403, ENDED)
  if (outcome.kind === 'PROVIDER_UNAVAILABLE') return reply.code(503).send()
  if (!outcome.value) return reply.code(404).send()
  const { file } = outcome.value
  if (!file) return reply.code(403).send()
  return reply.type(file.mediaType).send(Buffer.from(file.bytes))
}

const callOperation = <C extends ScopedProof>(dependencies: Deps<C>) => async (request: FastifyRequest<{ Params: { operation: string }; Body: unknown }>, reply: FastifyReply): Promise<unknown> => {
  const { reader } = dependencies
  if (!isJsonBody(request)) throw new Failure('CONTENT_TYPE_REFUSED')
  const operation = OPERATION.test(request.params.operation) ? request.params.operation : null
  // The server tree is read in the entry that checked access, at the Preview's exact revision.
  const outcome = await withPreview(dependencies, request, async ({ checked, caller, artifactRevisionId }) => {
    const manifest = await reader.readPreviewManifest(checked, artifactRevisionId)
    if (!manifest || !operation) return { caller, scope: checked.scope, tree: null }
    const tree = await readServerTree(serverPathsOf(manifest.files), async (path) => {
      const file = await reader.readPreviewRevisionFile(checked, { sourceRevision: manifest.sourceRevision, artifactRevisionId, path })
      return file ? { kind: 'FILE', sha256: file.sha256, bytes: file.bytes } : { kind: 'MISSING' }
    })
    return { caller, scope: checked.scope, tree }
  })
  if (outcome.kind === 'PROVIDER_UNAVAILABLE') throw new Failure('IDENTITY_PROVIDER_UNAVAILABLE')
  if (outcome.kind !== 'SERVED') throw new Failure('PREVIEW_REFUSED')
  const { caller, scope, tree } = outcome.value
  const files = tree ? serverFilesOf(tree) : []
  if (!operation || files.length === 0) throw new Failure('OPERATION_NOT_FOUND')
  if (!dependencies.invokeApplication) throw new Failure('APPLICATION_RUNNER_UNAVAILABLE')
  // The entry has committed: the invocation holds no database connection.
  const result = await dependencies.invokeApplication({
    source: { via: 'PREVIEW', accountId: scope.accountId, projectId: scope.projectId },
    files, operation, input: request.body, caller, callerLeft: callerLeft(reply),
  })
  return reply.code(result.status).type('application/problem+json').send(JSON.stringify(result.body))
}

export const registerPreviewRoutes = async <C extends ScopedProof>(
  app: FastifyInstance,
  dependencies: PreviewRouteDependencies<C>,
): Promise<readonly ['Hosting-Preview']> => {
  const route = routes(app)
  const tracked = <Request extends FastifyRequest>(handler: (request: Request, reply: FastifyReply) => Promise<unknown>) =>
    async (request: Request, reply: FastifyReply): Promise<unknown> => {
      if (dependencies.isClosed()) return reply.code(503).send()
      const pending = handler(request, reply)
      dependencies.pendingRequests.add(pending)
      try { return await pending } finally { dependencies.pendingRequests.delete(pending) }
    }
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, entryForm)
  route['hub-entry']<{ Body: { entryGrant: string } }>({ method: 'POST', url: '/__conexus/preview-entry', handler: tracked(enter(dependencies)) })
  route['host-write']<{ Params: { operation: string }; Body: unknown }>({ method: 'POST', url: '/__conexus/api/:operation', bodyLimit: API_BODY_LIMIT, handler: tracked(callOperation(dependencies)) })
  route.navigation({ url: '/', handler: tracked(serveFile(dependencies)) })
  route.navigation({ url: '/*', handler: tracked(serveFile(dependencies)) })
  return ['Hosting-Preview']
}
