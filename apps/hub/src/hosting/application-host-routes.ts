import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { APPLICATION_NO_ACCESS_TEXT, ApplicationFilePath, ApplicationNoAccessReason } from '@conexus/contract'
import type { ArtifactRevisionId, MediaType, Sha256 } from '@conexus/contract'
import { applicationSlugOfHost } from '../platform/config.js'
import type { ApplicationAddress } from '../platform/config.js'
import type { ApplicationInvoker } from './application-invoker.js'
import { digest, mintToken, presentedToken } from '../platform/opaque-token.js'
import type { ApplicationSlug } from '../platform/application-slug.js'
import { digest as tokenDigest, type RawToken } from '../platform/db.js'
import { routes } from '../http/access.js'
import { clearCookie, readCookie, setCookie } from '../http/cookies.js'
import { Failure } from '../platform/failure.js'
import { FAILURE_TEXT } from '../platform/failure-text.generated.js'
import type { HostOutcome, HostRequest, ScopedProof } from '../platform/host-outcome.js'
import { currentTraceReference, failureResponse, sendFailureResponse } from '../http/problem.js'
import { classifyAppPath } from '../platform/application-path.js'
import { API_BODY_LIMIT, callerLeft, isJsonBody, OPERATION, page, sendPage } from './host-http.js'
import { readServerTree, serverFilesOf, serverPathsOf } from './server-tree.js'
import type { ServerFileRead } from './server-tree.js'

const ENTRY_PATH = 'index.html'

// The ports this host needs, generic over the access proof: the hosting owner names no identity-access type.
export type ApplicationHostSessions<C> = Readonly<{
  withApplicationRequest<T>(presented: Readonly<{ slug: ApplicationSlug; token: RawToken }>, serve: (request: HostRequest<C>) => Promise<T>): Promise<HostOutcome<T>>
  redeem(input: Readonly<{ handoff: RawToken; slug: ApplicationSlug; binding: RawToken }>): Promise<Readonly<{ sessionToken: RawToken; maxAgeSeconds: number }> | null>
  signOut(token: RawToken): Promise<void>
}>

export type ApplicationHostReader<C> = Readonly<{
  readServedManifest(checked: C): Promise<Readonly<{
    artifactRevisionId: ArtifactRevisionId
    files: ReadonlyArray<Readonly<{ path: ApplicationFilePath; mediaType: MediaType }>>
  }> | null>
  readServedFile(checked: C, path: ApplicationFilePath): Promise<
    | Readonly<{ ok: true; artifactRevisionId: ArtifactRevisionId; file: Readonly<{ path: ApplicationFilePath; mediaType: MediaType; sha256: Sha256; bytes: Uint8Array }> }>
    | Readonly<{ ok: false; reason: 'NOT_FOUND'; artifactRevisionId: ArtifactRevisionId }>
    | Readonly<{ ok: false; reason: 'NOT_SERVED' }>
  >
}>

export type ApplicationHostDependencies<C extends ScopedProof> = Readonly<{
  sessions: ApplicationHostSessions<C>
  reader: ApplicationHostReader<C>
  invokeApplication?: ApplicationInvoker
  exactHubOrigin: string
  application: ApplicationAddress
}>

const NO_ACCESS_TITLE: Readonly<Record<ApplicationNoAccessReason, string>> = {
  EMAIL_NOT_VERIFIED: 'E-mail não verificado',
  NOT_GRANTED: 'Sem acesso',
  SIGN_IN_FAILED: 'Não foi possível entrar',
}
const noAccessPage = (reason: ApplicationNoAccessReason): string => page(NO_ACCESS_TITLE[reason], FAILURE_TEXT[APPLICATION_NO_ACCESS_TEXT[reason]])
const NOT_READY = page('Aplicativo sem versão pronta', FAILURE_TEXT.APPLICATION_NOT_READY)
const UNAVAILABLE = page('Aplicativo indisponível', FAILURE_TEXT.IDENTITY_PROVIDER_UNAVAILABLE)

type Host<C extends ScopedProof> = ApplicationHostDependencies<C> & Readonly<{ slugOf(request: FastifyRequest): ApplicationSlug | null }>

// A browser without a session is sent to sign in, bound to a secret only this browser holds. A
// sign-in already in progress keeps its binding, so parallel navigations share it and every handoff
// they bring back redeems.
const startSignIn = <C extends ScopedProof>(host: Host<C>, request: FastifyRequest, reply: FastifyReply, slug: ApplicationSlug): unknown => {
  const binding = presentedToken(readCookie(request, 'applicationSignIn')) ?? mintToken()
  const login = new URL('/protocol/oidc/login', host.exactHubOrigin)
  login.searchParams.set('application', slug)
  login.searchParams.set('binding', tokenDigest(binding).toString('base64url'))
  setCookie(reply, 'applicationSignIn', binding)
  return clearCookie(reply, 'applicationSession').code(303).header('location', login.href).send()
}

const completeSignIn = <C extends ScopedProof>(host: Host<C>) => async (request: FastifyRequest<{ Querystring: Record<string, unknown> }>, reply: FastifyReply): Promise<unknown> => {
  const slug = host.slugOf(request)
  if (!slug) return reply.code(404).send()
  const handoff = presentedToken(request.query.handoff)
  const binding = presentedToken(readCookie(request, 'applicationSignIn'))
  if (!handoff || !binding) return sendPage(reply, 403, noAccessPage('SIGN_IN_FAILED'))
  // A handoff that fails here (another host, no binding, expired) is not consumed. The binding cookie is
  // left to expire: other navigations may still be bringing handoffs back.
  const redeemed = await host.sessions.redeem({ handoff, slug, binding })
  if (!redeemed) return sendPage(reply, 403, noAccessPage('SIGN_IN_FAILED'))
  return setCookie(reply, 'applicationSession', redeemed.sessionToken, redeemed.maxAgeSeconds).code(303).header('location', '/').send()
}

// The reason is user-controlled: only a value of the contract's table selects its text, and any other
// falls back to the plain no-access page.
const noAccess = <C extends ScopedProof>(host: Host<C>) => async (request: FastifyRequest<{ Querystring: Record<string, unknown> }>, reply: FastifyReply): Promise<unknown> => {
  if (!host.slugOf(request)) return reply.code(404).send()
  const reason = ApplicationNoAccessReason.safeParse(request.query.reason)
  return sendPage(reply, 403, noAccessPage(reason.success ? reason.data : 'NOT_GRANTED'))
}

const signOut = <C extends ScopedProof>(host: Host<C>) => async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
  if (!host.slugOf(request)) return reply.code(404).send()
  const token = presentedToken(readCookie(request, 'applicationSession'))
  if (token) await host.sessions.signOut(token)
  // A sign-in that started before this sign-out must not redeem afterward: its binding cookie
  // goes with the session, or a handoff still in flight would sign the person back in.
  clearCookie(reply, 'applicationSession')
  return clearCookie(reply, 'applicationSignIn').code(204).send()
}

const callOperation = <C extends ScopedProof>(host: Host<C>) => async (request: FastifyRequest<{ Params: { operation: string }; Body: unknown }>, reply: FastifyReply): Promise<unknown> => {
  const slug = host.slugOf(request)
  if (!slug) throw new Failure('APPLICATION_NOT_FOUND')
  if (!isJsonBody(request)) throw new Failure('CONTENT_TYPE_REFUSED')
  const token = presentedToken(readCookie(request, 'applicationSession'))
  if (!token) throw new Failure('APPLICATION_SIGN_IN_REQUIRED')
  const operation = OPERATION.test(request.params.operation) ? request.params.operation : null
  // The server tree is read in the entry that checked access, pinned to the manifest's revision.
  const outcome = await host.sessions.withApplicationRequest({ slug, token }, async ({ checked, caller }) => {
    const served = await host.reader.readServedManifest(checked)
    if (!served || !operation) return { caller, scope: checked.scope, served, tree: null }
    const tree = await readServerTree(serverPathsOf(served.files), async (path): Promise<ServerFileRead> => {
      const read = await host.reader.readServedFile(checked, path)
      // Each statement sees the served pointer as it is now: a revision that moved since the manifest is the next request's.
      if (!read.ok && read.reason === 'NOT_SERVED') return { kind: 'NOT_READY' }
      if (read.artifactRevisionId !== served.artifactRevisionId) return { kind: 'NOT_READY' }
      return read.ok ? { kind: 'FILE', sha256: read.file.sha256, bytes: read.file.bytes } : { kind: 'MISSING' }
    })
    return { caller, scope: checked.scope, served, tree }
  })
  if (outcome.kind === 'PROVIDER_UNAVAILABLE') throw new Failure('IDENTITY_PROVIDER_UNAVAILABLE')
  if (outcome.kind === 'SIGN_IN_REQUIRED') throw new Failure('APPLICATION_SIGN_IN_REQUIRED')
  const { caller, scope, served, tree } = outcome.value
  if (!served) throw new Failure('APPLICATION_NOT_READY')
  const files = tree ? serverFilesOf(tree) : []
  if (!operation || files.length === 0) throw new Failure('OPERATION_NOT_FOUND')
  if (!host.invokeApplication) throw new Failure('APPLICATION_RUNNER_UNAVAILABLE')
  // The entry has committed: the invocation holds no database connection.
  const result = await host.invokeApplication({
    source: { via: 'APPLICATION', accountId: scope.accountId, projectId: scope.projectId },
    files, operation, input: request.body, caller, callerLeft: callerLeft(reply),
  })
  return sendFailureResponse(reply, result)
}

const serveFile = <C extends ScopedProof>(host: Host<C>) => async (request: FastifyRequest, reply: FastifyReply, { document }: Readonly<{ document: boolean }>): Promise<unknown> => {
  const pathname = request.url.split('?', 1)[0] ?? ''
  const classified = classifyAppPath(request.method, pathname, () => true)
  if (classified.kind === 'not-found') throw new Failure('NOT_FOUND')
  const slug = host.slugOf(request)
  if (!slug) return reply.code(404).send()
  const token = presentedToken(readCookie(request, 'applicationSession'))
  const signIn = (): unknown => document
    ? startSignIn(host, request, reply, slug)
    : sendFailureResponse(reply, failureResponse({ code: 'APPLICATION_SIGN_IN_REQUIRED', traceId: currentTraceReference() }))
  if (!token) return signIn()
  // Both reads of a client route, the file and then the fallback to the app index, run in the one entry.
  const outcome = await host.sessions.withApplicationRequest({ slug, token }, async ({ checked }) => {
    const read = async (path: string) => {
      const parsed = ApplicationFilePath.safeParse(path)
      return parsed.success ? host.reader.readServedFile(checked, parsed.data) : { ok: false, reason: 'NOT_FOUND' } as const
    }
    const requested = classified.kind === 'file' ? classified.path : ENTRY_PATH
    const file = await read(requested)
    if (file.ok || file.reason !== 'NOT_FOUND' || classified.kind !== 'file') return { requested, file }
    if (classifyAppPath(request.method, pathname, () => false).kind !== 'app-shell') return null
    return { requested: ENTRY_PATH, file: await read(ENTRY_PATH) }
  })
  if (outcome.kind === 'PROVIDER_UNAVAILABLE') return sendPage(reply, 503, UNAVAILABLE)
  if (outcome.kind === 'SIGN_IN_REQUIRED') return signIn()
  if (!outcome.value) return reply.code(404).send()
  const { requested, file } = outcome.value
  if (!file.ok && file.reason === 'NOT_SERVED') return sendPage(reply, 503, NOT_READY)
  if (!file.ok || file.file.path !== requested || digest(file.file.bytes).toString('hex') !== file.file.sha256) return reply.code(404).send()
  return reply.type(file.file.mediaType).send(Buffer.from(file.file.bytes))
}

export const registerApplicationHostRoutes = async <C extends ScopedProof>(
  app: FastifyInstance,
  dependencies: ApplicationHostDependencies<C>,
): Promise<readonly ['Hosting-Application']> => {
  const host: Host<C> = { ...dependencies, slugOf: (request) => applicationSlugOfHost(dependencies.application, request.headers.host) }
  const route = routes(app)
  route['sign-in']<{ Querystring: Record<string, unknown> }>({ url: '/__conexus/sign-in/complete', handler: completeSignIn(host) })
  route.navigation<{ Querystring: Record<string, unknown> }>({ url: '/__conexus/no-access', handler: noAccess(host) })
  route['host-write']({ method: 'POST', url: '/__conexus/sign-out', handler: signOut(host) })
  route['host-write']<{ Params: { operation: string }; Body: unknown }>({ method: 'POST', url: '/__conexus/api/:operation', bodyLimit: API_BODY_LIMIT, handler: callOperation(host) })
  route.navigation({ url: '/', handler: serveFile(host) })
  route.navigation({ url: '/*', handler: serveFile(host) })
  return ['Hosting-Application']
}
