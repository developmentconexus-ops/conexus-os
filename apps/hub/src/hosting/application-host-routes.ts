import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ApplicationFilePath, type AccountId, type ArtifactRevisionId, type ProjectId, type MediaType, type Sha256 } from '@conexus/contract'
import type { Caller } from '../platform/caller.js'
import { applicationSlugOfHost } from '../platform/config.js'
import type { ApplicationAddress } from '../platform/config.js'
import type { ApplicationInvoker } from './application-invoker.js'
import { digest, opaqueToken, parseOpaqueToken } from '../platform/opaque-token.js'
import { routes } from '../http/access.js'
import { clearCookie, readCookie, setCookie } from '../http/cookies.js'
import { Failure } from '../platform/failure.js'
import { FAILURE_TEXT } from '../platform/failure-text.generated.js'
import { sendFailure } from '../http/problem.js'
import { classifyAppPath, SERVER_ROOT } from '../platform/application-path.js'
import { API_BODY_LIMIT, callerLeft, OPERATION } from './preview-routes.js'

const ENTRY_PATH = 'index.html'

type Authority =
  | Readonly<{ kind: 'SIGNED_IN'; accountId: AccountId; caller: Caller }>
  | Readonly<{ kind: 'SIGN_IN_REQUIRED' }>
  | Readonly<{ kind: 'PROVIDER_UNAVAILABLE' }>

// The ports this host needs, declared structurally: the hosting owner does not import identity-access.
export type ApplicationHostSessions = Readonly<{
  applicationBySlug(slug: string): Promise<ProjectId | null>
  applicationAuthority(input: Readonly<{ sessionToken: string | undefined; projectId: string; now?: Date }>): Promise<Authority>
  redeem(input: Readonly<{ handoff: string; target: Readonly<{ kind: 'APPLICATION'; projectId: string; binding: string }>; now?: Date }>): Promise<Readonly<{ sessionToken: string; maxAgeSeconds: number }> | null>
  signOut(sessionToken: string): Promise<void>
}>

export type ApplicationHostReader = Readonly<{
  readServedManifest(accountId: AccountId, projectId: ProjectId): Promise<Readonly<{
    artifactRevisionId: ArtifactRevisionId
    files: ReadonlyArray<Readonly<{ path: ApplicationFilePath; mediaType: MediaType }>>
  }> | null>
  readServedFile(accountId: AccountId, projectId: ProjectId, path: ApplicationFilePath): Promise<
    | Readonly<{ ok: true; artifactRevisionId: ArtifactRevisionId; file: Readonly<{ path: ApplicationFilePath; mediaType: MediaType; sha256: Sha256; bytes: Uint8Array }> }>
    | Readonly<{ ok: false; reason: 'NOT_SERVED' | 'NOT_FOUND' }>
  >
}>

export type ApplicationHostDependencies = Readonly<{
  sessions: ApplicationHostSessions
  reader: ApplicationHostReader
  invokeApplication?: ApplicationInvoker
  exactHubOrigin: string
  application: ApplicationAddress
  now?: () => Date
}>

const page = (title: string, text: string): string =>
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`

const NO_ACCESS = page('Sem acesso', FAILURE_TEXT.APPLICATION_NO_ACCESS)
const EMAIL_NOT_VERIFIED = page('E-mail não verificado', FAILURE_TEXT.APPLICATION_EMAIL_NOT_VERIFIED)
const NOT_READY = page('Aplicativo sem versão pronta', FAILURE_TEXT.APPLICATION_NOT_READY)
const SIGN_IN_FAILED = page('Não foi possível entrar', FAILURE_TEXT.APPLICATION_SIGN_IN_FAILED)
const UNAVAILABLE = page('Aplicativo indisponível', FAILURE_TEXT.IDENTITY_PROVIDER_UNAVAILABLE)

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
export const registerApplicationHostRoutes = async (
  app: FastifyInstance,
  dependencies: ApplicationHostDependencies,
): Promise<readonly ['MAR-Application']> => {
  const now = dependencies.now ?? (() => new Date())
  const route = routes(app)

  type Resolved = Readonly<{ slug: string; projectId: ProjectId }>
  const application = async (request: FastifyRequest): Promise<Resolved | null> => {
    const slug = applicationSlugOfHost(dependencies.application, request.headers.host)
    if (!slug) return null
    const projectId = await dependencies.sessions.applicationBySlug(slug)
    return projectId ? { slug, projectId } : null
  }
  const html = (reply: FastifyReply, status: number, body: string): unknown =>
    reply.code(status).type('text/html; charset=utf-8').send(body)

  // A browser without a session is sent to sign in, bound to a secret only this browser holds. A
  // sign-in already in progress keeps its binding, so parallel navigations share it and every handoff
  // they bring back redeems.
  const startSignIn = (request: FastifyRequest, reply: FastifyReply, slug: string): unknown => {
    const binding = parseOpaqueToken(readCookie(request, 'applicationSignIn')) ?? opaqueToken()
    const login = new URL('/protocol/oidc/login', dependencies.exactHubOrigin)
    login.searchParams.set('application', slug)
    login.searchParams.set('binding', digest(binding).toString('base64url'))
    setCookie(reply, 'applicationSignIn', binding)
    return clearCookie(reply, 'applicationSession').code(303).header('location', login.href).send()
  }

  route['sign-in']<{ Querystring: Record<string, unknown> }>({ url: '/__conexus/sign-in/complete', handler: async (request, reply) => {
    const target = await application(request)
    if (!target) return reply.code(404).send()
    const handoff = parseOpaqueToken(request.query.handoff)
    const binding = readCookie(request, 'applicationSignIn')
    if (!handoff || !binding) return html(reply, 403, SIGN_IN_FAILED)
    // A handoff that fails here (another host, no binding, expired) is not consumed. The binding cookie is
    // left to expire: other navigations may still be bringing handoffs back.
    const redeemed = await dependencies.sessions.redeem({ handoff, target: { kind: 'APPLICATION', projectId: target.projectId, binding }, now: now() })
    if (!redeemed) return html(reply, 403, SIGN_IN_FAILED)
    return setCookie(reply, 'applicationSession', redeemed.sessionToken, redeemed.maxAgeSeconds).code(303).header('location', '/').send()
  } })

  route.navigation<{ Querystring: Record<string, unknown> }>({ url: '/__conexus/no-access', handler: async (request, reply) => {
    if (!applicationSlugOfHost(dependencies.application, request.headers.host)) return reply.code(404).send()
    // Only a fixed, known reason selects distinct copy: a query parameter is user-controlled, and every
    // other value falls back to the generic page.
    const body = request.query.reason === 'EMAIL_NOT_VERIFIED' ? EMAIL_NOT_VERIFIED : NO_ACCESS
    return html(reply, 403, body)
  } })

  route['host-write']({ method: 'POST', url: '/__conexus/sign-out', handler: async (request, reply) => {
    const target = await application(request)
    if (!target) return reply.code(404).send()
    const sessionToken = readCookie(request, 'applicationSession')
    if (sessionToken) await dependencies.sessions.signOut(sessionToken)
    // A sign-in that started before this sign-out must not redeem afterward: its binding cookie
    // goes with the session, or a handoff still in flight would sign the person back in.
    clearCookie(reply, 'applicationSession')
    return clearCookie(reply, 'applicationSignIn').code(204).send()
  } })

  route['host-write']<{ Params: { operation: string }; Body: unknown }>({ method: 'POST', url: '/__conexus/api/:operation', bodyLimit: API_BODY_LIMIT, handler: async (request, reply) => {
    const target = await application(request)
    if (!target) throw new Failure('APPLICATION_NOT_FOUND')
    if (request.headers['content-type']?.split(';', 1)[0]?.trim() !== 'application/json') throw new Failure('CONTENT_TYPE_REFUSED')
    const authority = await dependencies.sessions.applicationAuthority({ sessionToken: readCookie(request, 'applicationSession'), projectId: target.projectId, now: now() })
    if (authority.kind === 'PROVIDER_UNAVAILABLE') throw new Failure('IDENTITY_PROVIDER_UNAVAILABLE')
    if (authority.kind === 'SIGN_IN_REQUIRED') throw new Failure('APPLICATION_SIGN_IN_REQUIRED')
    const { accountId } = authority
    const projectId = target.projectId
    const served = await dependencies.reader.readServedManifest(accountId, projectId)
    if (!served) throw new Failure('APPLICATION_NOT_READY')
    const serverFiles = served.files.map((file) => file.path).filter((path) => path.startsWith(SERVER_ROOT))
    if (!OPERATION.test(request.params.operation) || serverFiles.length === 0) throw new Failure('OPERATION_NOT_FOUND')
    if (!dependencies.invokeApplication) throw new Failure('APPLICATION_RUNNER_UNAVAILABLE')
    const result = await dependencies.invokeApplication({
      source: { via: 'APPLICATION', accountId, projectId, artifactRevisionId: served.artifactRevisionId },
      serverFiles,
      operation: request.params.operation,
      input: request.body,
      caller: authority.caller,
      callerLeft: callerLeft(reply),
    })
    return reply.code(result.status).type('application/problem+json').send(JSON.stringify(result.body))
  } })

  const serve = async (request: FastifyRequest, reply: FastifyReply, { document }: Readonly<{ document: boolean }>): Promise<unknown> => {
    const pathname = request.url.split('?', 1)[0] ?? ''
    let served = classifyAppPath(request.method, pathname, () => true)
    if (served.kind === 'not-found') throw new Failure('NOT_FOUND')
    const target = await application(request)
    if (!target) return reply.code(404).send()
    const authority = await dependencies.sessions.applicationAuthority({ sessionToken: readCookie(request, 'applicationSession'), projectId: target.projectId, now: now() })
    if (authority.kind === 'PROVIDER_UNAVAILABLE') return html(reply, 503, UNAVAILABLE)
    if (authority.kind === 'SIGN_IN_REQUIRED') {
      return document ? startSignIn(request, reply, target.slug) : sendFailure(reply, new Failure('APPLICATION_SIGN_IN_REQUIRED'))
    }
    const { accountId } = authority
    const projectId = target.projectId
    const readFile = async (path: string) => {
      const parsed = ApplicationFilePath.safeParse(path)
      return parsed.success ? dependencies.reader.readServedFile(accountId, projectId, parsed.data) : { ok: false, reason: 'NOT_FOUND' } as const
    }
    let requested = served.kind === 'file' ? served.path : ENTRY_PATH
    let read = await readFile(requested)
    if (!read.ok && read.reason === 'NOT_FOUND' && served.kind === 'file') {
      served = classifyAppPath(request.method, pathname, () => false)
      if (served.kind !== 'app-shell') return reply.code(404).send()
      requested = ENTRY_PATH
      read = await readFile(requested)
    }
    if (!read.ok && read.reason === 'NOT_SERVED') return html(reply, 503, NOT_READY)
    if (!read.ok || read.file.path !== requested || digest(read.file.bytes).toString('hex') !== read.file.sha256) return reply.code(404).send()
    return reply.type(read.file.mediaType).send(Buffer.from(read.file.bytes))
  }
  route.navigation({ url: '/', handler: serve })
  route.navigation({ url: '/*', handler: serve })
  return ['MAR-Application']
}
