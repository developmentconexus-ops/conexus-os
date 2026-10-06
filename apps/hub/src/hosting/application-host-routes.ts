import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ApplicationFilePath, type AccountId, type ArtifactRevisionId, type ProjectId, type MediaType, type Sha256 } from '@conexus/contract'
import type { Caller } from '../platform/caller.js'
import { applicationSlugOfHost } from '../platform/config.js'
import type { ApplicationAddress } from '../platform/config.js'
import type { ApplicationInvoker } from './application-invoker.js'
import { digest, opaqueToken, parseOpaqueToken, presentedToken } from '../platform/opaque-token.js'
import type { ApplicationSlug } from '../platform/application-slug.js'
import type { RawToken } from '../platform/db.js'
import { routes } from '../http/access.js'
import { clearCookie, readCookie, setCookie } from '../http/cookies.js'
import { Failure } from '../platform/failure.js'
import { FAILURE_TEXT } from '../platform/failure-text.generated.js'
import { sendFailure } from '../http/problem.js'
import { classifyAppPath, SERVER_ROOT } from '../platform/application-path.js'
import { API_BODY_LIMIT, callerLeft, OPERATION } from './preview-routes.js'

const ENTRY_PATH = 'index.html'

/** A request on an application host: served, sent to sign in, or refused because Keycloak could not be asked. */
type Outcome<T> =
  | Readonly<{ kind: 'SERVED'; value: T }>
  | Readonly<{ kind: 'SIGN_IN_REQUIRED' }>
  | Readonly<{ kind: 'PROVIDER_UNAVAILABLE' }>

type HostRequest<C> = Readonly<{ caller: Caller; checked: C; accountId: AccountId; projectId: ProjectId }>

// The ports this host needs, generic over the access proof: the hosting owner names no identity-access type.
export type ApplicationHostSessions<C> = Readonly<{
  withApplicationRequest<T>(presented: Readonly<{ slug: ApplicationSlug; token: RawToken }>, serve: (request: HostRequest<C>) => Promise<T>): Promise<Outcome<T>>
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
    | Readonly<{ ok: false; reason: 'NOT_SERVED' | 'NOT_FOUND' }>
  >
}>

export type ApplicationHostDependencies<C> = Readonly<{
  sessions: ApplicationHostSessions<C>
  reader: ApplicationHostReader<C>
  invokeApplication?: ApplicationInvoker
  exactHubOrigin: string
  application: ApplicationAddress
}>

const page = (title: string, text: string): string =>
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`

const NO_ACCESS = page('Sem acesso', FAILURE_TEXT.APPLICATION_NO_ACCESS)
const EMAIL_NOT_VERIFIED = page('E-mail não verificado', FAILURE_TEXT.APPLICATION_EMAIL_NOT_VERIFIED)
const NOT_READY = page('Aplicativo sem versão pronta', FAILURE_TEXT.APPLICATION_NOT_READY)
const SIGN_IN_FAILED = page('Não foi possível entrar', FAILURE_TEXT.APPLICATION_SIGN_IN_FAILED)
const UNAVAILABLE = page('Aplicativo indisponível', FAILURE_TEXT.IDENTITY_PROVIDER_UNAVAILABLE)

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
export const registerApplicationHostRoutes = async <C>(
  app: FastifyInstance,
  dependencies: ApplicationHostDependencies<C>,
): Promise<readonly ['Hosting-Application']> => {
  const { sessions, reader } = dependencies
  const route = routes(app)

  const slugOf = (request: FastifyRequest): ApplicationSlug | null => applicationSlugOfHost(dependencies.application, request.headers.host)
  const html = (reply: FastifyReply, status: number, body: string): unknown =>
    reply.code(status).type('text/html; charset=utf-8').send(body)

  // A browser without a session is sent to sign in, bound to a secret only this browser holds. A
  // sign-in already in progress keeps its binding, so parallel navigations share it and every handoff
  // they bring back redeems.
  const startSignIn = (request: FastifyRequest, reply: FastifyReply, slug: ApplicationSlug): unknown => {
    const binding = parseOpaqueToken(readCookie(request, 'applicationSignIn')) ?? opaqueToken()
    const login = new URL('/protocol/oidc/login', dependencies.exactHubOrigin)
    login.searchParams.set('application', slug)
    login.searchParams.set('binding', digest(binding).toString('base64url'))
    setCookie(reply, 'applicationSignIn', binding)
    return clearCookie(reply, 'applicationSession').code(303).header('location', login.href).send()
  }

  route['sign-in']<{ Querystring: Record<string, unknown> }>({ url: '/__conexus/sign-in/complete', handler: async (request, reply) => {
    const slug = slugOf(request)
    if (!slug) return reply.code(404).send()
    const handoff = presentedToken(request.query.handoff)
    const binding = presentedToken(readCookie(request, 'applicationSignIn'))
    if (!handoff || !binding) return html(reply, 403, SIGN_IN_FAILED)
    // A handoff that fails here (another host, no binding, expired) is not consumed. The binding cookie is
    // left to expire: other navigations may still be bringing handoffs back.
    const redeemed = await sessions.redeem({ handoff, slug, binding })
    if (!redeemed) return html(reply, 403, SIGN_IN_FAILED)
    return setCookie(reply, 'applicationSession', redeemed.sessionToken, redeemed.maxAgeSeconds).code(303).header('location', '/').send()
  } })

  route.navigation<{ Querystring: Record<string, unknown> }>({ url: '/__conexus/no-access', handler: async (request, reply) => {
    if (!slugOf(request)) return reply.code(404).send()
    // Only a fixed, known reason selects distinct copy: a query parameter is user-controlled, and every
    // other value falls back to the generic page.
    const body = request.query.reason === 'EMAIL_NOT_VERIFIED' ? EMAIL_NOT_VERIFIED : NO_ACCESS
    return html(reply, 403, body)
  } })

  route['host-write']({ method: 'POST', url: '/__conexus/sign-out', handler: async (request, reply) => {
    if (!slugOf(request)) return reply.code(404).send()
    const token = presentedToken(readCookie(request, 'applicationSession'))
    if (token) await sessions.signOut(token)
    // A sign-in that started before this sign-out must not redeem afterward: its binding cookie
    // goes with the session, or a handoff still in flight would sign the person back in.
    clearCookie(reply, 'applicationSession')
    return clearCookie(reply, 'applicationSignIn').code(204).send()
  } })

  route['host-write']<{ Params: { operation: string }; Body: unknown }>({ method: 'POST', url: '/__conexus/api/:operation', bodyLimit: API_BODY_LIMIT, handler: async (request, reply) => {
    const slug = slugOf(request)
    if (!slug) throw new Failure('APPLICATION_NOT_FOUND')
    if (request.headers['content-type']?.split(';', 1)[0]?.trim() !== 'application/json') throw new Failure('CONTENT_TYPE_REFUSED')
    const token = presentedToken(readCookie(request, 'applicationSession'))
    if (!token) throw new Failure('APPLICATION_SIGN_IN_REQUIRED')
    const outcome = await sessions.withApplicationRequest({ slug, token }, async ({ checked, caller, accountId, projectId }) =>
      ({ caller, accountId, projectId, served: await reader.readServedManifest(checked) }))
    if (outcome.kind === 'PROVIDER_UNAVAILABLE') throw new Failure('IDENTITY_PROVIDER_UNAVAILABLE')
    if (outcome.kind === 'SIGN_IN_REQUIRED') throw new Failure('APPLICATION_SIGN_IN_REQUIRED')
    const { caller, accountId, projectId, served } = outcome.value
    if (!served) throw new Failure('APPLICATION_NOT_READY')
    const serverFiles = served.files.map((file) => file.path).filter((path) => path.startsWith(SERVER_ROOT))
    if (!OPERATION.test(request.params.operation) || serverFiles.length === 0) throw new Failure('OPERATION_NOT_FOUND')
    if (!dependencies.invokeApplication) throw new Failure('APPLICATION_RUNNER_UNAVAILABLE')
    // The entry has committed: the invocation holds no database connection.
    const result = await dependencies.invokeApplication({
      source: { via: 'APPLICATION', accountId, projectId, artifactRevisionId: served.artifactRevisionId },
      serverFiles,
      operation: request.params.operation,
      input: request.body,
      caller,
      callerLeft: callerLeft(reply),
    })
    return reply.code(result.status).type('application/problem+json').send(JSON.stringify(result.body))
  } })

  const serve = async (request: FastifyRequest, reply: FastifyReply, { document }: Readonly<{ document: boolean }>): Promise<unknown> => {
    const pathname = request.url.split('?', 1)[0] ?? ''
    const classified = classifyAppPath(request.method, pathname, () => true)
    if (classified.kind === 'not-found') throw new Failure('NOT_FOUND')
    const slug = slugOf(request)
    if (!slug) return reply.code(404).send()
    const token = presentedToken(readCookie(request, 'applicationSession'))
    const signIn = (): unknown => document ? startSignIn(request, reply, slug) : sendFailure(reply, new Failure('APPLICATION_SIGN_IN_REQUIRED'))
    if (!token) return signIn()
    // Both reads of a client route, the file and then the fallback to the app index, run in the one entry.
    const outcome = await sessions.withApplicationRequest({ slug, token }, async ({ checked }) => {
      const read = async (path: string) => {
        const parsed = ApplicationFilePath.safeParse(path)
        return parsed.success ? reader.readServedFile(checked, parsed.data) : { ok: false, reason: 'NOT_FOUND' } as const
      }
      const requested = classified.kind === 'file' ? classified.path : ENTRY_PATH
      const file = await read(requested)
      if (file.ok || file.reason !== 'NOT_FOUND' || classified.kind !== 'file') return { requested, file }
      if (classifyAppPath(request.method, pathname, () => false).kind !== 'app-shell') return null
      return { requested: ENTRY_PATH, file: await read(ENTRY_PATH) }
    })
    if (outcome.kind === 'PROVIDER_UNAVAILABLE') return html(reply, 503, UNAVAILABLE)
    if (outcome.kind === 'SIGN_IN_REQUIRED') return signIn()
    if (!outcome.value) return reply.code(404).send()
    const { requested, file } = outcome.value
    if (!file.ok && file.reason === 'NOT_SERVED') return html(reply, 503, NOT_READY)
    if (!file.ok || file.file.path !== requested || digest(file.file.bytes).toString('hex') !== file.file.sha256) return reply.code(404).send()
    return reply.type(file.file.mediaType).send(Buffer.from(file.file.bytes))
  }
  route.navigation({ url: '/', handler: serve })
  route.navigation({ url: '/*', handler: serve })
  return ['Hosting-Application']
}
