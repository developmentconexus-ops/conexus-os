import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Caller } from '../platform/caller.js'
import { applicationOrigin, applicationSlugOfHost } from '../platform/config.js'
import type { ApplicationAddress } from '../platform/config.js'
import type { ApplicationInvoker } from './application-invoker.js'
import { digest, opaqueToken, parseOpaqueToken } from '../platform/opaque-token.js'
import { isExactOrigin } from '../platform/origin.js'
import { API_BODY_LIMIT, applicationHostContentSecurityPolicy, OPERATION, pathForRequest, SERVER_ROOT } from './preview-routes.js'

const SESSION_COOKIE = '__Host-conexus_app'
const SIGN_IN_COOKIE = '__Host-conexus_app_signin'
const SIGN_IN_SECONDS = 600

type Authority =
  | Readonly<{ kind: 'SIGNED_IN'; caller: Caller }>
  | Readonly<{ kind: 'SIGN_IN_REQUIRED' }>
  | Readonly<{ kind: 'PROVIDER_UNAVAILABLE' }>

// The ports this host needs, declared structurally: the MAR owner does not import identity-access.
export type ApplicationHostSessions = Readonly<{
  applicationBySlug(slug: string): Promise<string | null>
  applicationAuthority(input: Readonly<{ sessionToken: string | undefined; projectId: string; now?: Date }>): Promise<Authority>
  redeem(input: Readonly<{ handoff: string; target: Readonly<{ kind: 'APPLICATION'; projectId: string; binding: string }>; now?: Date }>): Promise<Readonly<{ sessionToken: string; maxAgeSeconds: number }> | null>
  signOut(sessionToken: string): Promise<void>
}>

export type ApplicationHostReader = Readonly<{
  served(input: Readonly<{ accountId: string; projectId: string }>): Promise<Readonly<{
    artifactRevisionId: string
    files: readonly Readonly<{ path: string; mediaType: string }>[]
  }> | null>
  readServedFile(input: Readonly<{ accountId: string; projectId: string; path: string }>): Promise<
    | Readonly<{ kind: 'NOT_SERVED' }>
    | Readonly<{ kind: 'NOT_FOUND'; artifactRevisionId: string }>
    | Readonly<{ kind: 'FILE'; artifactRevisionId: string; file: Readonly<{ path: string; mediaType: string; bytes: Uint8Array; sha256: string }> }>
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

const NO_ACCESS = page('Sem acesso', 'Você não tem acesso a este aplicativo. Peça acesso a quem administra o Workspace.')
const NOT_READY = page('Aplicativo sem versão pronta', 'Este aplicativo ainda não tem uma versão pronta para uso. Tente de novo mais tarde.')
const SIGN_IN_FAILED = page('Não foi possível entrar', 'O link de entrada expirou ou já foi usado. Abra o endereço do aplicativo de novo para entrar.')
const UNAVAILABLE = page('Aplicativo indisponível', 'Não foi possível confirmar seu acesso agora. Tente de novo em alguns minutos.')

export const registerApplicationHostRoutes = async (
  app: FastifyInstance,
  dependencies: ApplicationHostDependencies,
): Promise<readonly ['MAR-Application']> => {
  const now = dependencies.now ?? (() => new Date())
  const cookieOptions = { path: '/', secure: true, httpOnly: true, sameSite: 'lax' as const }

  // Every answer: never framed, never cached, no referrer, and no CORS grant to anyone.
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('content-security-policy', applicationHostContentSecurityPolicy)
    reply.header('referrer-policy', 'no-referrer')
    reply.header('cache-control', 'no-store')
    reply.header('x-frame-options', 'DENY')
  })

  type Resolved = Readonly<{ slug: string; projectId: string }>
  const application = async (request: FastifyRequest): Promise<Resolved | null> => {
    const slug = applicationSlugOfHost(dependencies.application, request.headers.host)
    if (!slug) return null
    const projectId = await dependencies.sessions.applicationBySlug(slug)
    return projectId ? { slug, projectId } : null
  }
  const html = (reply: FastifyReply, status: number, body: string): unknown =>
    reply.code(status).type('text/html; charset=utf-8').send(body)
  const refuse = (reply: FastifyReply, status: number, code: string): unknown =>
    reply.code(status).type('application/json').send({ error: { code } })

  // A browser without a session is sent to sign in, bound to a secret only this browser holds. A
  // sign-in already in progress keeps its binding, so parallel navigations share it and every handoff
  // they bring back redeems.
  const startSignIn = (request: FastifyRequest, reply: FastifyReply, slug: string): unknown => {
    const held = request.cookies[SIGN_IN_COOKIE]
    const binding = parseOpaqueToken(held) ?? opaqueToken()
    const login = new URL('/protocol/oidc/login', dependencies.exactHubOrigin)
    login.searchParams.set('application', slug)
    login.searchParams.set('binding', digest(binding).toString('base64url'))
    return reply
      .setCookie(SIGN_IN_COOKIE, binding, { ...cookieOptions, maxAge: SIGN_IN_SECONDS })
      .clearCookie(SESSION_COOKIE, { path: '/', secure: true, sameSite: 'lax' })
      .code(303).header('location', login.href).send()
  }

  app.get<{ Querystring: Record<string, unknown> }>('/__conexus/sign-in/complete', async (request, reply) => {
    const target = await application(request)
    if (!target) return reply.code(404).send()
    const handoff = parseOpaqueToken(request.query.handoff)
    const binding = request.cookies[SIGN_IN_COOKIE]
    if (!handoff || !binding) return html(reply, 403, SIGN_IN_FAILED)
    // A handoff that fails here (another host, no binding, expired) is not consumed. The binding cookie is
    // left to expire: other navigations may still be bringing handoffs back.
    const redeemed = await dependencies.sessions.redeem({ handoff, target: { kind: 'APPLICATION', projectId: target.projectId, binding }, now: now() })
    if (!redeemed) return html(reply, 403, SIGN_IN_FAILED)
    return reply
      .setCookie(SESSION_COOKIE, redeemed.sessionToken, { ...cookieOptions, maxAge: redeemed.maxAgeSeconds })
      .code(303).header('location', '/').send()
  })

  app.get('/__conexus/no-access', async (request, reply) => {
    if (!applicationSlugOfHost(dependencies.application, request.headers.host)) return reply.code(404).send()
    return html(reply, 403, NO_ACCESS)
  })

  app.post('/__conexus/sign-out', async (request, reply) => {
    const target = await application(request)
    if (!target) return reply.code(404).send()
    if (!isExactOrigin(request.headers.origin, applicationOrigin(dependencies.application, target.slug))) return refuse(reply, 403, 'ORIGIN_REFUSED')
    const sessionToken = request.cookies[SESSION_COOKIE]
    if (sessionToken) await dependencies.sessions.signOut(sessionToken)
    // A sign-in that started before this sign-out must not redeem afterward: its binding cookie
    // goes with the session, or a handoff still in flight would sign the person back in.
    return reply
      .clearCookie(SESSION_COOKIE, { path: '/', secure: true, sameSite: 'lax' })
      .clearCookie(SIGN_IN_COOKIE, { path: '/', secure: true, sameSite: 'lax' })
      .code(204).send()
  })

  app.post<{ Params: { operation: string }; Body: unknown }>('/__conexus/api/:operation', { bodyLimit: API_BODY_LIMIT }, async (request, reply) => {
    const target = await application(request)
    if (!target) return refuse(reply, 404, 'APPLICATION_NOT_FOUND')
    // Every application host under the domain is one site, so SameSite does not stop a sibling
    // application's POST. The exact Origin of this application's own host is the only admission.
    if (!isExactOrigin(request.headers.origin, applicationOrigin(dependencies.application, target.slug))) return refuse(reply, 403, 'ORIGIN_REFUSED')
    if (request.headers['content-type']?.split(';', 1)[0]?.trim() !== 'application/json') return refuse(reply, 415, 'CONTENT_TYPE_REFUSED')
    const authority = await dependencies.sessions.applicationAuthority({ sessionToken: request.cookies[SESSION_COOKIE], projectId: target.projectId, now: now() })
    if (authority.kind === 'PROVIDER_UNAVAILABLE') return refuse(reply, 503, 'IDENTITY_PROVIDER_UNAVAILABLE')
    if (authority.kind === 'SIGN_IN_REQUIRED') return refuse(reply, 401, 'APPLICATION_SIGN_IN_REQUIRED')
    const served = await dependencies.reader.served({ accountId: authority.caller.accountId, projectId: target.projectId })
    if (!served) return refuse(reply, 503, 'APPLICATION_NOT_READY')
    const serverFiles = served.files.map((file) => file.path).filter((path) => path.startsWith(SERVER_ROOT))
    if (!OPERATION.test(request.params.operation) || serverFiles.length === 0) return refuse(reply, 404, 'OPERATION_NOT_FOUND')
    if (!dependencies.invokeApplication) return refuse(reply, 503, 'APPLICATION_RUNNER_UNAVAILABLE')
    let result: Awaited<ReturnType<ApplicationInvoker>>
    try {
      result = await dependencies.invokeApplication({
        source: { via: 'APPLICATION', accountId: authority.caller.accountId, projectId: target.projectId, artifactRevisionId: served.artifactRevisionId },
        serverFiles,
        operation: request.params.operation,
        input: request.body,
        caller: authority.caller,
      })
    } catch {
      return refuse(reply, 503, 'APPLICATION_RUNNER_UNAVAILABLE')
    }
    return reply.code(result.status).type('application/json').send(JSON.stringify(result.body))
  })

  const serve = async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
    const target = await application(request)
    if (!target) return reply.code(404).send()
    const authority = await dependencies.sessions.applicationAuthority({ sessionToken: request.cookies[SESSION_COOKIE], projectId: target.projectId, now: now() })
    if (authority.kind === 'PROVIDER_UNAVAILABLE') return html(reply, 503, UNAVAILABLE)
    if (authority.kind === 'SIGN_IN_REQUIRED') {
      // Only the page itself goes to sign in. A script, image or fetch without a session is refused,
      // so it neither follows a redirect to the Hub nor replaces the binding of a sign-in in progress.
      const navigation = request.headers['sec-fetch-mode'] === 'navigate' && request.headers['sec-fetch-dest'] === 'document'
      return navigation ? startSignIn(request, reply, target.slug) : refuse(reply, 401, 'APPLICATION_SIGN_IN_REQUIRED')
    }
    const path = pathForRequest(request.url.split('?', 1)[0] ?? '')
    // The server tree is the runner's; the browser never receives it.
    if (!path || path.startsWith(SERVER_ROOT)) return reply.code(404).send()
    const read = await dependencies.reader.readServedFile({ accountId: authority.caller.accountId, projectId: target.projectId, path })
    if (read.kind === 'NOT_SERVED') return html(reply, 503, NOT_READY)
    if (read.kind === 'NOT_FOUND' || read.file.path !== path || digest(read.file.bytes).toString('hex') !== read.file.sha256) return reply.code(404).send()
    return reply.type(read.file.mediaType).send(Buffer.from(read.file.bytes))
  }
  app.get('/', serve)
  app.get('/*', serve)
  return ['MAR-Application']
}
