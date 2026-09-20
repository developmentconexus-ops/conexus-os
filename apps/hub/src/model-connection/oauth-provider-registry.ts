import type { OAuthProviderDescriptor } from './oauth-provider.js'

// What Conexus calls itself to a model provider. It is deliberately not the value either vendor's
// own CLI sends: naming somebody else's client would be impersonation, and it would deny the
// provider the one lever it has to refuse this caller specifically. A refusal aimed at this string
// is an answer, not an obstacle.
export const CONEXUS_ORIGINATOR = 'conexus-os'

export const ANTHROPIC_OAUTH: OAuthProviderDescriptor = Object.freeze({
  providerId: 'anthropic',
  displayName: 'Claude',
  pays: Object.freeze({ registryProviderId: 'anthropic' }),
  codePrefix: 'ANTHROPIC_OAUTH',
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  authorizeUrl: 'https://claude.ai/oauth/authorize',
  tokenUrl: 'https://platform.claude.com/v1/oauth/token',
  redirectUri: 'https://platform.claude.com/oauth/code/callback',
  scopes: 'user:profile user:inference',
  authorizeParams: Object.freeze({ code: 'true' }),
  tokenEncoding: 'json',
  stateInExchange: true,
  pastedResult: 'code-hash-state',
})

// The ChatGPT subscription sign-in. The redirect is a loopback port on the user's own machine,
// which this Hub cannot listen on, so the user pastes the redirect URL the browser failed to load.
// expires_in is defaulted because the reference implementation defaults it, which means it has
// been seen missing. The account id is mandatory: the inference endpoint routes on it, so a
// sign-in that cannot produce one is a failed sign-in rather than a connection that cannot work.
export const OPENAI_CODEX_OAUTH: OAuthProviderDescriptor = Object.freeze({
  providerId: 'openai-codex',
  displayName: 'ChatGPT',
  // The account's own catalog is what is offered (listOpenAICodexModels). This list is what is
  // offered when that catalog cannot be read: the five ids it listed, and that answered real runs,
  // on 2026-09-20.
  pays: Object.freeze({ registryProviderId: 'openai', modelIds: Object.freeze(['gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5']) }),
  codePrefix: 'OPENAI_CODEX_OAUTH',
  clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
  authorizeUrl: 'https://auth.openai.com/oauth/authorize',
  tokenUrl: 'https://auth.openai.com/oauth/token',
  redirectUri: 'http://localhost:1455/auth/callback',
  scopes: 'openid profile email offline_access api.connectors.read api.connectors.invoke',
  authorizeParams: Object.freeze({
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    originator: CONEXUS_ORIGINATOR,
  }),
  tokenEncoding: 'form',
  stateInExchange: false,
  pastedResult: 'redirect-url',
  defaultExpiresInSeconds: 3600,
  accountId: Object.freeze({ claim: 'chatgpt_account_id', namespace: 'https://api.openai.com/auth' }),
})

export const OAUTH_PROVIDERS: Readonly<Record<string, OAuthProviderDescriptor>> = Object.freeze({
  [ANTHROPIC_OAUTH.providerId]: ANTHROPIC_OAUTH,
  [OPENAI_CODEX_OAUTH.providerId]: OPENAI_CODEX_OAUTH,
})

export const oauthProvider = (providerId: string): OAuthProviderDescriptor => {
  const descriptor = Object.hasOwn(OAUTH_PROVIDERS, providerId) ? OAUTH_PROVIDERS[providerId] : undefined
  if (!descriptor) throw new Error('MODEL_OAUTH_PROVIDER_UNKNOWN')
  return descriptor
}
