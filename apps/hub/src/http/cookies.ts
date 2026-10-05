import type { FastifyReply, FastifyRequest } from 'fastify'
import { APPLICATION_SIGN_IN_COOKIE_SECONDS } from '../platform/lifetimes.js'

const NAMES = Object.freeze({
  hubSession: '__Host-conexus_session',
  bootstrap: '__Host-conexus_bootstrap',
  oidcState: '__Host-conexus_oidc_state',
  applicationSession: '__Host-conexus_app',
  applicationSignIn: '__Host-conexus_app_signin',
  previewSession: '__Host-conexus_preview',
})

export type CookieKey = keyof typeof NAMES
type RowLived = 'applicationSession' | 'previewSession'
type CredentialCookie = 'hubSession' | 'bootstrap'

const OPTIONS = Object.freeze({ path: '/', secure: true, httpOnly: true, sameSite: 'lax' } as const)

const FIXED_SECONDS: Readonly<Partial<Record<CookieKey, number>>> = Object.freeze({ applicationSignIn: APPLICATION_SIGN_IN_COOKIE_SECONDS })

type SetCookieArguments = { [Key in CookieKey]: Key extends RowLived ? [key: Key, value: string, maxAge: number] : [key: Key, value: string] }[CookieKey]

export const setCookie = (reply: FastifyReply, ...[key, value, rowSeconds]: SetCookieArguments): FastifyReply => {
  const maxAge = rowSeconds ?? FIXED_SECONDS[key]
  return reply.setCookie(NAMES[key], value, maxAge === undefined ? OPTIONS : { ...OPTIONS, maxAge })
}

export const clearCookie = (reply: FastifyReply, key: CookieKey): FastifyReply => reply.clearCookie(NAMES[key], OPTIONS)

export const readCookie = (request: FastifyRequest, key: Exclude<CookieKey, CredentialCookie>): string | undefined => request.cookies[NAMES[key]]

export const readCredentialCookie = (request: FastifyRequest, key: CredentialCookie): string | undefined => request.cookies[NAMES[key]]
