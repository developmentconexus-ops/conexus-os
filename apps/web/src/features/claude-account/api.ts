import { clearAuthorityCache } from '../../app/query-client'

export type ClaudeConnection = Readonly<{
  connectionId: string
  label: string
  state: 'ACTIVE' | 'REVOKED'
  generation: string
  ownerAccountId: string
  workspaceId: string
  role: 'OWNER' | 'USER'
  revokedAt: string | null
}>

export type ClaudeAuthorization = Readonly<{ authorizationId: string; url: string; state: string }>

export class ClaudeAccountRequestError extends Error {
  readonly status: number | null
  readonly problemType: string | null

  constructor(status: number | null, problemType: string | null = null) {
    super(status === null ? 'Claude account request did not complete' : `Claude account request failed with ${status}`)
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
      throw new ClaudeAccountRequestError(response.status, problemType)
    }
    return response
  } catch (error) {
    if (error instanceof ClaudeAccountRequestError) throw error
    throw new ClaudeAccountRequestError(null)
  }
}

export async function listClaudeConnections(): Promise<readonly ClaudeConnection[]> {
  const response = await request('/api/control/me/claude-connections')
  const body = await response.json() as { connections: readonly ClaudeConnection[] }
  return body.connections
}

export async function startClaudeAuthorization(): Promise<ClaudeAuthorization> {
  const response = await request('/api/control/me/claude-connections/authorization', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  return response.json() as Promise<ClaudeAuthorization>
}

export async function completeClaudeAuthorization(input: Readonly<{ result: string; label: string }>) {
  const response = await request('/api/control/me/claude-connections/authorization/complete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
  return response.json() as Promise<ClaudeConnection>
}

export async function selectClaudeConnection(connectionId: string) {
  await request('/api/control/me/claude-connections/select', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ connectionId }) })
}

export async function shareClaudeConnection(input: Readonly<{ connectionId: string; accountId: string; workspaceId: string }>) {
  await request('/api/control/me/claude-connections/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
}

export async function revokeClaudeConnection(connectionId: string) {
  await request(`/api/control/me/claude-connections/${encodeURIComponent(connectionId)}/revoke`, { method: 'POST' })
}

export const claudeConnectionsQueryKey = ['claude-account', 'connections'] as const
