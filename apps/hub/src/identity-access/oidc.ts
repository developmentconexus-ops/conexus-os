import * as oidc from 'openid-client'
import type { CustomFetch } from 'openid-client'
import { lookup } from 'node:dns'
import { Agent, fetch as undiciFetch } from 'undici'
import { parseEmailAddress } from './current-session.js'
import type { EmailAddress } from './current-session.js'
import { identityAccessError } from './errors.js'

export type OidcIdentity = Readonly<{ issuer: string; subject: string }>
/**
 * `verifiedEmail` is null both when the claim says unverified and when it says verified but the
 * address is missing or unparseable. `emailVerified` keeps that second case distinguishable: it is
 * the raw `email_verified === true` claim, regardless of whether an address came with it.
 */
export type VerifiedIdentity = OidcIdentity & Readonly<{ verifiedEmail: EmailAddress | null; emailVerified: boolean }>
/** What a completed sign-in carries besides the identity: the provider's name claim and refresh token. */
export type CompletedSignIn = VerifiedIdentity & Readonly<{ displayName: string | null; refreshToken: string | null }>
/**
 * Why Keycloak refused a refresh, as far as its answer says: the user is disabled, the SSO session
 * ended (idle or maximum lifetime, or signed out in Keycloak), or anything else (a stale or reused
 * token, another subject). Keycloak says so only in error_description, so this names the ending and
 * never decides authority.
 */
export type ProviderRefusal = 'USER_DISABLED' | 'SESSION_ENDED' | 'REFUSED'
/** Keycloak's answer to a refresh: the person is still signed in, was refused, or could not be asked. */
export type ProviderCheck =
  | Readonly<{ kind: 'ACTIVE'; refreshToken: string }>
  | Readonly<{ kind: 'REFUSED'; reason: ProviderRefusal }>
  | Readonly<{ kind: 'UNAVAILABLE' }>

// Keycloak 26.7 TokenManager's descriptions for an invalid_grant refresh.
const providerRefusal = (description: string | undefined): ProviderRefusal => {
  if (description === 'User disabled') return 'USER_DISABLED'
  if (description === 'Session not active' || description === 'Offline session not active' || description === 'Client session not active') return 'SESSION_ENDED'
  return 'REFUSED'
}
export type OidcTransaction = Readonly<{ state: string; nonce: string; pkceVerifier: string; location: string }>
type OidcCompletion = Readonly<{ currentUrl: string; pkceVerifier: string; expectedState: string; expectedNonce: string }>
export type OidcAdapter = Readonly<{
  begin(): Promise<OidcTransaction>
  complete(input: OidcCompletion): Promise<CompletedSignIn>
  refresh(input: Readonly<{ refreshToken: string; expectedSubject: string }>): Promise<ProviderCheck>
  close(): Promise<void>
}>
type OidcDiscovery = typeof oidc.discovery

// Refusing an `email_verified` claim that is not the strict boolean `true` is the safe
// direction: the string `"false"` must never be treated as verified. But a claim shaped as the
// string `"true"` or `"false"` (some identity providers emit it that way) is refused identically
// to a genuinely unverified address, and an operator watching a real invited person get refused
// has no way to tell the two apart. Logging the claim's JavaScript type, and never the email or
// the claim's value, gives the operator that signal without disclosing anything about the
// identity being provisioned.
/** @public Tests import this at runtime from the built module. */
export const isEmailVerifiedClaim = (
  claims: Record<string, unknown>,
  log: (line: Readonly<{ event: string; claimType: string }>) => void = (line) => console.warn(JSON.stringify(line)),
): boolean => {
  if ('email_verified' in claims && typeof claims.email_verified !== 'boolean') {
    log({ event: 'oidc_email_verified_unexpected_type', claimType: typeof claims.email_verified })
  }
  return claims.email_verified === true
}

/** @public Tests import this at runtime from the built module. */
export const resolveVerifiedEmail = (
  claims: Record<string, unknown>,
  log: (line: Readonly<{ event: string; claimType: string }>) => void = (line) => console.warn(JSON.stringify(line)),
): EmailAddress | null => (isEmailVerifiedClaim(claims, log) ? parseEmailAddress(claims.email) : null)

export const createOidcAdapter = async ({
  issuer,
  clientId,
  clientSecret,
  redirectUri,
  allowInsecureForTest = false,
}: Readonly<{ issuer: string; clientId: string; clientSecret: string; redirectUri: string; allowInsecureForTest?: boolean }>, {
  discovery = oidc.discovery,
}: Readonly<{ discovery?: OidcDiscovery }> = {}): Promise<OidcAdapter> => {
  const issuerUrl = new URL(issuer)
  const localIssuerAdmitted = issuerUrl.protocol === 'https:' &&
    issuerUrl.hostname === 'hub.conexus.localhost' &&
    issuerUrl.port === '8443' &&
    issuerUrl.pathname === '/realms/conexus' &&
    !issuerUrl.search && !issuerUrl.hash
  const localIssuerTransport = localIssuerAdmitted ? new Agent({
    connect: {
      // WSL may not publish the operator's .localhost entry in NSS. Keep the
      // configured URL, SNI, and CA validation while binding this exact local
      // issuer hostname to its existing loopback listener.
      lookup: (hostname, options, callback) => {
        if (hostname === issuerUrl.hostname) {
          if (options.all) return callback(null, [{ address: '127.0.0.1', family: 4 }])
          return callback(null, '127.0.0.1', 4)
        }
        return lookup(hostname, options, callback)
      },
    },
  }) : undefined
  const options: Parameters<OidcDiscovery>[4] = {
    execute: [oidc.enableNonRepudiationChecks, ...(allowInsecureForTest ? [oidc.allowInsecureRequests] : [])],
  }
  if (localIssuerTransport) {
    const localIssuerFetch: CustomFetch = (url, init) => undiciFetch(url, {
        ...init,
        dispatcher: localIssuerTransport,
      } as never) as unknown as Promise<Response>
    options[oidc.customFetch] = localIssuerFetch
  }
  let configuration: Awaited<ReturnType<OidcDiscovery>>
  try {
    configuration = await discovery(issuerUrl, clientId, clientSecret, undefined, options)
  } catch (error) {
    await localIssuerTransport?.close()
    throw error
  }
  let closePromise: Promise<void> | undefined
  return Object.freeze({
    async begin(): Promise<OidcTransaction> {
      const pkceVerifier = oidc.randomPKCECodeVerifier()
      const codeChallenge = await oidc.calculatePKCECodeChallenge(pkceVerifier)
      const state = oidc.randomState()
      const nonce = oidc.randomNonce()
      const location = oidc.buildAuthorizationUrl(configuration, {
        redirect_uri: redirectUri,
        scope: 'openid email',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
        nonce,
      })
      return { state, nonce, pkceVerifier, location: location.href }
    },
    async complete({ currentUrl, pkceVerifier, expectedState, expectedNonce }: OidcCompletion): Promise<CompletedSignIn> {
      const tokens = await oidc.authorizationCodeGrant(configuration, new URL(currentUrl), {
        pkceCodeVerifier: pkceVerifier,
        expectedState,
        expectedNonce,
        idTokenExpected: true,
      })
      const claims = tokens.claims()
      if (!claims?.iss || !claims.sub) throw identityAccessError('OIDC_IDENTITY_MISSING')
      // An unverified address, or a realm that asserts no address at all, is not an error.
      // It only means this identity can claim no invitation.
      const emailVerified = isEmailVerifiedClaim(claims)
      const verifiedEmail = emailVerified ? parseEmailAddress(claims.email) : null
      const name = typeof claims.name === 'string' && /\S/.test(claims.name) ? claims.name.trim().slice(0, 200) : null
      return { issuer: claims.iss, subject: claims.sub, verifiedEmail, emailVerified, displayName: name, refreshToken: tokens.refresh_token ?? null }
    },
    // Keycloak answers invalid_grant for a disabled user, an ended SSO session or a stale token.
    // Anything that is not an answer from Keycloak leaves the person's standing unknown.
    async refresh({ refreshToken, expectedSubject }): Promise<ProviderCheck> {
      let tokens: Awaited<ReturnType<typeof oidc.refreshTokenGrant>>
      try {
        tokens = await oidc.refreshTokenGrant(configuration, refreshToken)
      } catch (error) {
        return error instanceof oidc.ResponseBodyError && error.error === 'invalid_grant'
          ? { kind: 'REFUSED', reason: providerRefusal(error.error_description) }
          : { kind: 'UNAVAILABLE' }
      }
      const subject = tokens.claims()?.sub
      if (subject !== undefined && subject !== expectedSubject) return { kind: 'REFUSED', reason: 'REFUSED' }
      return { kind: 'ACTIVE', refreshToken: tokens.refresh_token ?? refreshToken }
    },
    close: () => {
      closePromise ??= localIssuerTransport?.close() ?? Promise.resolve()
      return closePromise
    },
  })
}
