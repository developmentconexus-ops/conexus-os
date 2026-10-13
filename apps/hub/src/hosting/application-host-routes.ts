import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { APPLICATION_NO_ACCESS_TEXT, ApplicationNoAccessReason } from '@conexus/contract'
import { applicationSlugOfHost } from '../identity-access/public.js'
import type { ApplicationAddress } from '../platform/config.js'
import { mintToken, presentedToken } from '../platform/opaque-token.js'
import type { ApplicationSlug } from '../identity-access/public.js'
import { digest as tokenDigest, type RawToken } from '../platform/db.js'
import { routes } from '../http/access.js'
import { clearCookie, readCookie, setCookie } from '../http/cookies.js'
import { Failure } from '../platform/failure.js'
import { FAILURE_TEXT } from '../platform/failure-text.generated.js'
import type { HostOutcome, HostRequest, ScopedProof } from '../identity-access/public.js'
import { currentTraceReference, failureResponse, sendFailureResponse } from '../http/problem.js'
import { classifyAppPath } from './application-path.js'
import { API_BODY_LIMIT, isJsonBody, page, sendPage } from './host-http.js'

// The ports this host needs, generic over the access proof: the hosting owner names no identity-access type.
export type ApplicationHostSessions<C> = Readonly<{
  withApplicationRequest<T>(presented: Readonly<{ slug: ApplicationSlug; token: RawToken }>, serve: (request: HostRequest<C>) => Promise<T>): Promise<HostOutcome<T>>
  redeem(input: Readonly<{ handoff: RawToken; slug: ApplicationSlug; binding: RawToken }>): Promise<Readonly<{ sessionToken: RawToken; maxAgeSeconds: number }> | null>
  signOut(token: RawToken): Promise<void>
}>

export type ApplicationHostDependencies<C extends ScopedProof> = Readonly<{
  sessions: ApplicationHostSessions<C>
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
  const outcome = await host.sessions.withApplicationRequest({ slug, token }, async () => undefined)
  if (outcome.kind === 'PROVIDER_UNAVAILABLE') throw new Failure('IDENTITY_PROVIDER_UNAVAILABLE')
  if (outcome.kind === 'SIGN_IN_REQUIRED') throw new Failure('APPLICATION_SIGN_IN_REQUIRED')
  throw new Failure('APPLICATION_NOT_READY')
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
  const outcome = await host.sessions.withApplicationRequest({ slug, token }, async () => undefined)
  if (outcome.kind === 'PROVIDER_UNAVAILABLE') return sendPage(reply, 503, UNAVAILABLE)
  if (outcome.kind === 'SIGN_IN_REQUIRED') return signIn()
  return sendPage(reply, 503, NOT_READY)
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
