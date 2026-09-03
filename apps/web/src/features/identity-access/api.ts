import { clearAuthorityCache, confirmAuthority } from '../../app/query-client'
import type {
  AccessContext,
  AccountSummary,
  ProvisionAccountInput,
} from '../../generated/iam-client'
import { iamClient } from '../../generated/iam-client'

export const accessContextQueryKey = ['identity-access', 'access-context'] as const

export class IdentityAccessRequestError extends Error {
  constructor(readonly status: number | null) {
    super(
      status === null
        ? 'Identity and access request did not complete'
        : `Identity and access request failed with ${status}`,
    )
  }
}

function reject(response: Response): never {
  if (response.status === 401) clearAuthorityCache()
  throw new IdentityAccessRequestError(response.status)
}

export async function getAccessContext(): Promise<AccessContext> {
  let response: Response
  try {
    response = await iamClient.getAccessContext()
  } catch {
    throw new IdentityAccessRequestError(null)
  }
  if (!response.ok) reject(response)
  const context = await response.json() as AccessContext
  confirmAuthority()
  return context
}

export async function provisionCurrentAccount(
  input: ProvisionAccountInput,
  idempotencyKey: string,
): Promise<AccountSummary> {
  let response: Response
  try {
    response = await iamClient.provisionAccount(input, idempotencyKey)
  } catch {
    throw new IdentityAccessRequestError(null)
  }
  if (response.status !== 201) reject(response)
  return response.json() as Promise<AccountSummary>
}

export async function endCurrentSession(): Promise<void> {
  let response: Response
  try {
    response = await iamClient.endSession()
  } catch {
    throw new IdentityAccessRequestError(null)
  }
  if (response.status === 204 || response.status === 401) {
    clearAuthorityCache()
    return
  }
  reject(response)
}

export function isAuthenticationRequired(error: unknown) {
  return error instanceof IdentityAccessRequestError && error.status === 401
}
