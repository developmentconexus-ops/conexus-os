// The caller's model accounts as `GET /api/control/model-accounts` lists them, and the one way the
// Settings cards call the model account routes. No answer ever carries a key or a token.

import { hubCall, hubFetch } from '../../app/http'

type AccountKind = 'api_key' | 'oauth' | 'google_ai_pro'
type Account = Readonly<{ provider: string; providerName: string; mine: boolean; kind: AccountKind | null; shared: boolean }>
export type Accounts = Readonly<{ administrator: boolean; accounts: readonly Account[] }>

export const accountsQueryKey = ['model-accounts'] as const
export const accountsUrl = '/api/control/model-accounts'

export const callModelAccounts = async <T,>(method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown): Promise<T> => {
  const response = await hubCall(hubFetch(url, {
    method,
    headers: method === 'GET' ? {} : { 'content-type': 'application/json' },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
  }))
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return (response.status === 204 ? undefined : await response.json()) as T
}
