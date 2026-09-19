import { clearAuthorityCache } from '../../app/query-client'

export type ModelConnection = Readonly<{
  connectionId: string
  label: string
  state: 'ACTIVE' | 'REVOKED'
  generation: string
  ownerAccountId: string
  workspaceId: string
  role: 'OWNER' | 'USER'
  revokedAt: string | null
  providerId: string
  credentialKind: 'OAUTH_TOKEN_SET' | 'API_KEY'
}>

export type ModelAuthorization = Readonly<{ authorizationId: string; url: string; state: string }>

export class ModelConnectionRequestError extends Error {
  readonly status: number | null
  readonly problemType: string | null

  constructor(status: number | null, problemType: string | null = null) {
    super(status === null ? 'Model connection request did not complete' : `Model connection request failed with ${status}`)
    this.status = status
    this.problemType = problemType
  }
}

const csrf = () => document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=')

async function request(path: string, init: RequestInit = {}) {
  try {
    const headers = new Headers(init.headers)
    if (init.method && init.method !== 'GET') headers.set('x-conexus-csrf', decodeURIComponent(csrf() ?? ''))
    const response = await fetch(path, { ...init, headers, credentials: 'same-origin' })
    if (response.status === 401) clearAuthorityCache()
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null)
      const problemType = typeof body === 'object' && body !== null && 'type' in body && typeof body.type === 'string' ? body.type : null
      throw new ModelConnectionRequestError(response.status, problemType)
    }
    return response
  } catch (error) {
    if (error instanceof ModelConnectionRequestError) throw error
    throw new ModelConnectionRequestError(null)
  }
}

export type ModelConnectionList = Readonly<{ connections: readonly ModelConnection[]; providers: readonly string[] }>

export async function listModelConnections(): Promise<ModelConnectionList> {
  const response = await request('/api/control/me/model-connections')
  const body = await response.json() as ModelConnectionList
  return { connections: body.connections ?? [], providers: body.providers ?? [] }
}

export async function startModelAuthorization(): Promise<ModelAuthorization> {
  const response = await request('/api/control/me/model-connections/authorization', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  return response.json() as Promise<ModelAuthorization>
}

export async function completeModelAuthorization(input: Readonly<{ result: string; label: string }>) {
  const response = await request('/api/control/me/model-connections/authorization/complete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
  return response.json() as Promise<ModelConnection>
}

// The key leaves the browser once, in this request body, and is never read back: no response
// carries it and no query caches it.
export async function addModelConnectionApiKey(input: Readonly<{ providerId: string; label: string; apiKey: string }>) {
  const response = await request('/api/control/me/model-connections/api-key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
  return response.json() as Promise<ModelConnection>
}

export async function selectModelConnection(connectionId: string) {
  await request('/api/control/me/model-connections/select', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ connectionId }) })
}

export async function shareModelConnection(input: Readonly<{ connectionId: string; workspaceId: string }>) {
  await request('/api/control/me/model-connections/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
}

export async function unshareModelConnection(input: Readonly<{ connectionId: string; workspaceId: string }>) {
  await request('/api/control/me/model-connections/unshare', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
}

export async function revokeModelConnection(connectionId: string) {
  await request(`/api/control/me/model-connections/${encodeURIComponent(connectionId)}/revoke`, { method: 'POST' })
}

export const modelConnectionsQueryKey = ['model-connection', 'connections'] as const
