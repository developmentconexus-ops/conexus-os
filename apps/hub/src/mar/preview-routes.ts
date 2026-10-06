import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { AccountId, ApplicationFilePath, ArtifactRevisionId, ProjectId, SourceRevision, type MediaType, type Sha256 } from '../../../../packages/contract/dist/index.js'
import { classifyAppPath, SERVER_ROOT } from '../platform/application-path.js'
import type { Caller } from '../platform/caller.js'
import { Failure } from '../platform/failure.js'
import type { ApplicationInvoker } from './application-invoker.js'
import { digest } from '../platform/opaque-token.js'
import { routes } from '../http/access.js'
import type { HeaderFact } from '../http/access.js'
import { readCookie, setCookie } from '../http/cookies.js'

export type PreviewHost = Readonly<{ artifactRevisionId: string; exactHost: string; origin: string }>

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

/** The registry's read of one file of the exact revision a Preview launched on, declared structurally: the MAR owner does not import the registry. */
type RegistryReader = (accountId: AccountId, at: Readonly<{
  projectId: ProjectId
  sourceRevision: SourceRevision
  artifactRevisionId: ArtifactRevisionId
  path: ApplicationFilePath
}>) => Promise<Readonly<{ path: ApplicationFilePath; mediaType: MediaType; sha256: Sha256; bytes: Uint8Array }> | null>

export type PreviewRouteDependencies = Readonly<{
  sessions: PreviewSessions
  registryReader: RegistryReader
  invokeApplication?: ApplicationInvoker
  previewHostOf(host: HeaderFact): PreviewHost | null
  pendingRequests: Set<Promise<unknown>>
  isClosed: () => boolean
}>

const sameBinding = (left: PreviewBinding, right: PreviewBinding): boolean => (
  left.accountId === right.accountId && left.projectId === right.projectId && left.sourceRevision === right.sourceRevision &&
  left.artifactRevisionId === right.artifactRevisionId && left.artifactDigest === right.artifactDigest && left.exactHost === right.exactHost
)

// The binding comes from a Preview session row; the registry takes it as branded ids.
const subjectOf = (binding: PreviewBinding) => ({
  accountId: AccountId.parse(binding.accountId),
  projectId: ProjectId.parse(binding.projectId),
  sourceRevision: SourceRevision.parse(binding.sourceRevision),
  artifactRevisionId: ArtifactRevisionId.parse(binding.artifactRevisionId),
})

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
      if (!host) return reply.code(403).send()
      let redeemed: Awaited<ReturnType<PreviewSessions['redeem']>>
      try {
        redeemed = await dependencies.sessions.redeem({ handoff: request.body.entryGrant, target: { kind: 'PREVIEW', exactHost: host.exactHost } })
      } catch {
        return reply.code(503).send()
      }
      if (!redeemed) return reply.code(403).send()
      return setCookie(reply, 'previewSession', redeemed.sessionToken, redeemed.maxAgeSeconds)
        .code(303)
        .header('location', '/')
        .send()
    }),
  })

  // The Preview this request's cookie is bound to on this host, or the status that refuses it.
  const activePreview = async (request: FastifyRequest): Promise<Readonly<{ binding: PreviewBinding; cookie: string }> | number> => {
    const host = dependencies.previewHostOf(request.headers.host)
    if (!host) return 404
    const cookie = readCookie(request, 'previewSession')
    if (!cookie) return 403
    let authority: Awaited<ReturnType<PreviewSessions['previewAuthority']>>
    try {
      authority = await dependencies.sessions.previewAuthority({ sessionToken: cookie, exactHost: host.exactHost })
    } catch {
      return 503
    }
    if (authority.kind === 'PROVIDER_UNAVAILABLE') return 503
    return authority.kind === 'SIGNED_IN' ? { binding: authority.binding, cookie } : 403
  }

  const serve = async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
    const pathname = request.url.split('?', 1)[0] ?? ''
    if (classifyAppPath(request.method, pathname, () => true).kind === 'not-found') throw new Failure('NOT_FOUND')
    const active = await activePreview(request)
    if (typeof active === 'number') return reply.code(active).send()
    const { binding: before, cookie } = active
    // The server tree is retained with the artifact for the runner; the classifier never serves it.
    const served = classifyAppPath(request.method, pathname, (candidate) => before.manifest.files.some((file) => file.path === candidate))
    if (served.kind === 'not-found') return reply.code(404).send()
    const path = served.kind === 'file' ? served.path : before.manifest.entryPath
    const declared = before.manifest.files.find((file) => file.path === path)
    if (!declared) return reply.code(404).send()
    let file: Awaited<ReturnType<RegistryReader>>
    try {
      const { accountId, ...at } = subjectOf(before)
      file = await dependencies.registryReader(accountId, { ...at, path: ApplicationFilePath.parse(path) })
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
  route['host-write']<{ Params: { operation: string }; Body: unknown }>({ method: 'POST', url: '/__conexus/api/:operation', bodyLimit: API_BODY_LIMIT, handler: tracked<ApiRequest>(async (request, reply) => {
    if (request.headers['content-type']?.split(';', 1)[0]?.trim() !== 'application/json') throw new Failure('CONTENT_TYPE_REFUSED')
    const active = await activePreview(request)
    if (typeof active === 'number') throw new Failure(active === 503 ? 'IDENTITY_PROVIDER_UNAVAILABLE' : 'PREVIEW_REFUSED')
    const { binding } = active
    const serverFiles = binding.manifest.files.map((file) => file.path).filter((path) => path.startsWith(SERVER_ROOT))
    if (!OPERATION.test(request.params.operation) || serverFiles.length === 0) throw new Failure('OPERATION_NOT_FOUND')
    if (!dependencies.invokeApplication) throw new Failure('APPLICATION_RUNNER_UNAVAILABLE')
    const result = await dependencies.invokeApplication({
      source: { via: 'PREVIEW', ...subjectOf(binding) },
      serverFiles: serverFiles.map((path) => ApplicationFilePath.parse(path)), operation: request.params.operation, input: request.body, caller: binding.caller, callerLeft: callerLeft(reply),
    })
    return reply.code(result.status).type('application/problem+json').send(JSON.stringify(result.body))
  }) })
  route.navigation({ url: '/', handler: tracked(serve) })
  route.navigation({ url: '/*', handler: tracked(serve) })
  return ['MAR-Preview']
}
