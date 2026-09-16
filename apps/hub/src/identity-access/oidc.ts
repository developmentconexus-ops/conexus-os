import * as oidc from 'openid-client'
import type { CustomFetch } from 'openid-client'
import { lookup } from 'node:dns'
import { Agent, fetch as undiciFetch } from 'undici'
import { identityAccessError } from './errors.js'

export type OidcIdentity = Readonly<{ issuer: string; subject: string }>
export type OidcTransaction = Readonly<{ state: string; nonce: string; pkceVerifier: string; location: string }>
export type OidcCompletion = Readonly<{ currentUrl: string; pkceVerifier: string; expectedState: string; expectedNonce: string }>
export type OidcAdapter = Readonly<{
  begin(): Promise<OidcTransaction>
  complete(input: OidcCompletion): Promise<OidcIdentity>
}>
type OidcDiscovery = typeof oidc.discovery

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
  const localIssuerHostname = issuerUrl.hostname === 'hub.conexus.localhost' || issuerUrl.hostname === 'conexus.localhost'
  const localIssuerTransport = new Agent({
    connect: {
      // WSL may not publish the operator's .localhost entry in NSS. Keep the
      // configured URL, SNI, and CA validation while binding this exact local
      // issuer hostname to its existing loopback listener.
      lookup: (hostname, options, callback) => {
        if (localIssuerHostname && hostname === issuerUrl.hostname) {
          if (options.all) return callback(null, [{ address: '127.0.0.1', family: 4 }])
          return callback(null, '127.0.0.1', 4)
        }
        return lookup(hostname, options, callback)
      },
    },
  })
  const localIssuerFetch: CustomFetch = (url, init) => undiciFetch(url, {
    ...init,
    dispatcher: localIssuerTransport,
  } as never) as unknown as Promise<Response>
  const options = {
    execute: [oidc.enableNonRepudiationChecks, ...(allowInsecureForTest ? [oidc.allowInsecureRequests] : [])],
    [oidc.customFetch]: localIssuerFetch,
  }
  const configuration = await discovery(issuerUrl, clientId, clientSecret, undefined, options)
  return Object.freeze({
    async begin(): Promise<OidcTransaction> {
      const pkceVerifier = oidc.randomPKCECodeVerifier()
      const codeChallenge = await oidc.calculatePKCECodeChallenge(pkceVerifier)
      const state = oidc.randomState()
      const nonce = oidc.randomNonce()
      const location = oidc.buildAuthorizationUrl(configuration, {
        redirect_uri: redirectUri,
        scope: 'openid',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
        nonce,
      })
      return { state, nonce, pkceVerifier, location: location.href }
    },
    async complete({ currentUrl, pkceVerifier, expectedState, expectedNonce }: OidcCompletion): Promise<OidcIdentity> {
      const tokens = await oidc.authorizationCodeGrant(configuration, new URL(currentUrl), {
        pkceCodeVerifier: pkceVerifier,
        expectedState,
        expectedNonce,
        idTokenExpected: true,
      })
      const claims = tokens.claims()
      if (!claims?.iss || !claims.sub) throw identityAccessError('OIDC_IDENTITY_MISSING')
      return { issuer: claims.iss, subject: claims.sub }
    },
  })
}
