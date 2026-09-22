// The Factory owns every model account. Its own routes answer at their own paths, for the person
// signed in; sharing with everyone is the Hub's, behind the installation administrator role.
export type ModelAccountSource = 'none' | 'stored-user' | 'oauth-user' | 'stored-org' | 'oauth-org' | 'env' | 'stored' | 'oauth'
export type ModelProvider = Readonly<{
  provider: string
  source: ModelAccountSource
  userCredential?: 'api_key' | 'oauth'
  orgCredential?: 'api_key' | 'oauth'
  oauth?: Readonly<{ supported: boolean; modes: readonly ('paste-code' | 'device-code')[] }>
}>
export type ModelAccounts = Readonly<{ providers: readonly ModelProvider[]; orgKeyAdmin?: boolean }>
export type OAuthStart = Readonly<{ sessionId: string; kind: 'paste-code' | 'device-code'; url: string; userCode?: string; instructions?: string; nextPollMs?: number }>
export type OAuthStep = Readonly<{ status: 'complete' | 'pending' | 'failed'; nextPollMs?: number; error?: string }>
export type ModelDefaults = Readonly<{ build: string; fast: string }>
export type ModelDefaultsView = Readonly<{ installation: ModelDefaults | null; mine: ModelDefaults | null; administrator: boolean }>

export class ModelAccountsRequestError extends Error {
  constructor(readonly status: number, readonly type: string | null = null, readonly reason: string | null = null, readonly expiresAt: string | null = null) {
    super(`Model accounts request failed with ${status}`)
  }
}

const csrf = (): string => decodeURIComponent(document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=') ?? '')

const request = async <T>(method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, body?: unknown): Promise<T> => {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(method === 'GET' ? {} : { 'x-conexus-csrf': csrf() }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { type?: string; detail?: string; reason?: string; expiresAt?: string } | null
    throw new ModelAccountsRequestError(response.status, problem?.type ?? null, problem?.detail ?? problem?.reason ?? null, problem?.expiresAt ?? null)
  }
  return (response.status === 204 ? undefined : await response.json()) as T
}

const account = (provider: string) => `/web/config/providers/${encodeURIComponent(provider)}`
const sharing = (provider: string) => `/api/control/model-accounts/${encodeURIComponent(provider)}/share`

export const modelAccountsQueryKey = ['model-accounts'] as const
export const modelDefaultsQueryKey = ['model-defaults'] as const

export const listModelAccounts = () => request<ModelAccounts>('GET', '/web/config/providers')
export const saveApiKey = (provider: string, key: string) => request<unknown>('PUT', `${account(provider)}/key`, { key })
export const removeApiKey = (provider: string) => request<unknown>('DELETE', `${account(provider)}/key`)
export const signOut = (provider: string) => request<unknown>('DELETE', `${account(provider)}/oauth`)
export const startOAuth = (provider: string) => request<OAuthStart>('POST', `${account(provider)}/oauth/start`, {})
export const completeOAuth = (provider: string, sessionId: string, code: string) => request<OAuthStep>('POST', `${account(provider)}/oauth/complete`, { sessionId, code })
export const pollOAuth = (provider: string, sessionId: string) => request<OAuthStep>('POST', `${account(provider)}/oauth/poll`, { sessionId })
export const cancelOAuth = (provider: string, sessionId: string) => request<unknown>('DELETE', `${account(provider)}/oauth/session/${encodeURIComponent(sessionId)}`)
export const shareWithEveryone = (provider: string) => request<void>('POST', sharing(provider))
export const stopSharing = (provider: string) => request<void>('DELETE', sharing(provider))

export const readModelDefaults = () => request<ModelDefaultsView>('GET', '/api/control/model-defaults')
export const saveInstallationDefaults = (defaults: ModelDefaults) => request<unknown>('PUT', '/api/control/model-defaults/installation', defaults)
export const saveMyDefaults = (defaults: ModelDefaults) => request<unknown>('PUT', '/api/control/model-defaults/mine', defaults)
export const clearMyDefaults = () => request<void>('DELETE', '/api/control/model-defaults/mine')
