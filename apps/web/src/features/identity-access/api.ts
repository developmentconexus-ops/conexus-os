import { hubCall, isFailure } from '../../app/http'
import { clearAuthorityCache, confirmAuthority } from '../../app/query-client'
import type {
  AccessContext,
  AccountSummary,
  ProvisionAccountInput,
} from '../../generated/iam-client'
import { iamClient } from '../../generated/iam-client'

export const accessContextQueryKey = ['identity-access', 'access-context'] as const

export async function getAccessContext(): Promise<AccessContext> {
  const response = await hubCall(iamClient.getAccessContext())
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const context = await response.json() as AccessContext
  confirmAuthority()
  return context
}

export async function provisionCurrentAccount(
  input: ProvisionAccountInput,
  idempotencyKey: string,
): Promise<AccountSummary> {
  const response = await hubCall(iamClient.provisionAccount(input, idempotencyKey), 201)
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return response.json() as Promise<AccountSummary>
}

export async function endCurrentSession(): Promise<void> {
  try {
    await hubCall(iamClient.endSession(), 204)
  } catch (error) {
    if (!isFailure(error, 'AUTHENTICATION_REQUIRED')) throw error
  }
  clearAuthorityCache()
}

export function isAuthenticationRequired(error: unknown) {
  return isFailure(error, 'AUTHENTICATION_REQUIRED')
}
