import { z } from 'zod'

export class InstallationRequestError extends Error {
  constructor(readonly status: number, readonly type: string | null = null) {
    super(`Installation request failed with ${status}`)
  }
}

const csrf = (): string => decodeURIComponent(document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=') ?? '')

async function request<T>(method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
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
    const problem = await response.json().catch(() => null) as { type?: string } | null
    throw new InstallationRequestError(response.status, problem?.type ?? null)
  }
  if (response.status === 204) return undefined as T
  return schema.parse(await response.json())
}

const installationStatusSchema = z.object({ administrator: z.boolean() })
export type InstallationStatus = z.infer<typeof installationStatusSchema>

const administratorSchema = z.object({
  accountId: z.string(),
  displayName: z.string(),
  email: z.string().nullable(),
  grantedVia: z.enum(['OPERATOR_BOOTSTRAP', 'ADMINISTRATOR']),
  grantedBy: z.object({ accountId: z.string(), displayName: z.string() }).nullable(),
  grantedAt: z.string(),
})
export type Administrator = z.infer<typeof administratorSchema>
const administratorsSchema = z.object({ administrators: z.array(administratorSchema) })

const memorySchema = z.object({ model: z.string().nullable() })

const githubRepositorySchema = z.object({
  slug: z.string(),
  state: z.enum(['reachable', 'missing', 'identity-changed', 'unknown']),
})
const githubStatusSchema = z.object({
  state: z.enum(['not-connected', 'connected', 'gone', 'unreachable']),
  organization: z.object({ login: z.string(), type: z.enum(['Organization', 'User']) }).nullable(),
  installUrl: z.string(),
  manageUrl: z.string().nullable(),
  repositories: z.array(githubRepositorySchema),
})
export type GithubStatus = z.infer<typeof githubStatusSchema>
export type GithubRepository = z.infer<typeof githubRepositorySchema>

export const installationQueryKey = ['installation'] as const
export const administratorsQueryKey = ['installation', 'administrators'] as const
export const installationMemoryQueryKey = ['installation', 'memory'] as const
export const installationGithubQueryKey = ['installation', 'github'] as const

export const getInstallationStatus = () => request('GET', '/api/control/installation', installationStatusSchema)

export const listAdministrators = () => request('GET', '/api/control/installation/administrators', administratorsSchema)
export const grantAdministrator = (email: string) =>
  request('POST', '/api/control/installation/administrators', z.object({ administrator: administratorSchema }), { email })
export const revokeAdministrator = (accountId: string) =>
  request('DELETE', `/api/control/installation/administrators/${encodeURIComponent(accountId)}`, z.unknown())

export const getMemoryModel = () => request('GET', '/api/control/installation/memory', memorySchema)
export const saveMemoryModel = (model: string | null) => request('PUT', '/api/control/installation/memory', memorySchema, { model })

export const getGithubStatus = () => request('GET', '/api/control/installation/github', githubStatusSchema)
export const connectGithub = () => request('POST', '/api/control/installation/github/connect', githubStatusSchema, {})
