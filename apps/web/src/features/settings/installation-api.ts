import { z } from 'zod'
import { hubFetch } from '../../app/http'

export class InstallationRequestError extends Error {
  constructor(readonly status: number, readonly type: string | null = null) {
    super(`Installation request failed with ${status}`)
  }
}

async function request<T>(method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  const response = await hubFetch(url, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
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

export const installationQueryKey = ['installation'] as const
export const administratorsQueryKey = ['installation', 'administrators'] as const

export const getInstallationStatus = () => request('GET', '/api/control/installation', installationStatusSchema)

export const listAdministrators = () => request('GET', '/api/control/installation/administrators', administratorsSchema)
export const grantAdministrator = (email: string) =>
  request('POST', '/api/control/installation/administrators', z.object({ administrator: administratorSchema }), { email })
export const revokeAdministrator = (accountId: string) =>
  request('DELETE', `/api/control/installation/administrators/${encodeURIComponent(accountId)}`, z.unknown())
