import * as oidc from 'openid-client'
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
  const options = {
    execute: [oidc.enableNonRepudiationChecks, ...(allowInsecureForTest ? [oidc.allowInsecureRequests] : [])],
  }
  const configuration = await discovery(new URL(issuer), clientId, clientSecret, undefined, options)
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
