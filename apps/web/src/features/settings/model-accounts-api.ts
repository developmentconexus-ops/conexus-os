// The caller's model accounts as `GET /api/control/model-accounts` lists them, and the one way the
// Settings cards call the model account routes. No answer ever carries a key or a token.

export type AccountKind = 'api_key' | 'oauth' | 'google_ai_pro'
export type Account = Readonly<{ provider: string; mine: boolean; kind: AccountKind | null; shared: boolean }>
export type Accounts = Readonly<{ administrator: boolean; accounts: readonly Account[] }>

export const accountsQueryKey = ['model-accounts'] as const
export const accountsUrl = '/api/control/model-accounts'

export class ModelAccountsRequestError extends Error {
  constructor(readonly status: number) {
    super(`Model accounts request failed with ${status}`)
  }
}

const csrf = (): string => decodeURIComponent(document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=') ?? '')

export const callModelAccounts = async <T,>(method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown): Promise<T> => {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? {} : { 'content-type': 'application/json', 'x-conexus-csrf': csrf() },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
  })
  if (!response.ok) throw new ModelAccountsRequestError(response.status)
  return (response.status === 204 ? undefined : await response.json()) as T
}
