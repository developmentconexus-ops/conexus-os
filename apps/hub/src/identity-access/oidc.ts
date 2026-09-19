import * as oidc from 'openid-client'
import type { CustomFetch } from 'openid-client'
import { lookup } from 'node:dns'
import { Agent, fetch as undiciFetch } from 'undici'
import { parseEmailAddress } from './current-session.js'
import type { EmailAddress } from './current-session.js'
import { identityAccessError } from './errors.js'

export type OidcIdentity = Readonly<{ issuer: string; subject: string }>
export type VerifiedIdentity = OidcIdentity & Readonly<{ verifiedEmail: EmailAddress | null }>
export type OidcTransaction = Readonly<{ state: string; nonce: string; pkceVerifier: string; location: string }>
export type OidcCompletion = Readonly<{ currentUrl: string; pkceVerifier: string; expectedState: string; expectedNonce: string }>
export type OidcAdapter = Readonly<{
  begin(): Promise<OidcTransaction>
  complete(input: OidcCompletion): Promise<VerifiedIdentity>
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
export const resolveVerifiedEmail = (
  claims: Record<string, unknown>,
  log: (line: Readonly<{ event: string; claimType: string }>) => void = (line) => console.warn(JSON.stringify(line)),
): EmailAddress | null => {
  if ('email_verified' in claims && typeof claims.email_verified !== 'boolean') {
    log({ event: 'oidc_email_verified_unexpected_type', claimType: typeof claims.email_verified })
  }
  return claims.email_verified === true ? parseEmailAddress(claims.email) : null
}

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
    issuerUrl.pathname === '/realms/r1f' &&
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
    async complete({ currentUrl, pkceVerifier, expectedState, expectedNonce }: OidcCompletion): Promise<VerifiedIdentity> {
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
      const verifiedEmail = resolveVerifiedEmail(claims)
      return { issuer: claims.iss, subject: claims.sub, verifiedEmail }
    },
    close: () => {
      closePromise ??= localIssuerTransport?.close() ?? Promise.resolve()
      return closePromise
    },
  })
}
