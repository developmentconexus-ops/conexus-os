import { EmailAddress, endSession as endSessionOperation, getSession } from '@conexus/contract'
import { call, failureText, isFailure, query } from '../../app/http'
import { HubFailure } from '../../app/failure'
import { clearAuthorityCache, confirmAuthority } from '../../app/query-client'

const noInput = { params: undefined, query: undefined, headers: undefined, body: undefined } as const

const sessionRead = query(getSession, noInput)

export const sessionQueryKey = sessionRead.queryKey

export const sessionQuery = {
  queryKey: sessionQueryKey,
  queryFn: async (context: { signal: AbortSignal }) => {
    const session = await sessionRead.queryFn(context)
    confirmAuthority()
    return session
  },
}

export async function endCurrentSession(): Promise<void> {
  try {
    await call(endSessionOperation, noInput)
  } catch (error) {
    if (!isFailure(error, 'AUTHENTICATION_REQUIRED')) throw error
  }
  clearAuthorityCache()
}

export function isAuthenticationRequired(error: unknown) {
  return isFailure(error, 'AUTHENTICATION_REQUIRED')
}

/** An email typed into a form, parsed once where it enters; a refusal carries the table's sentence for it. */
export function parseEmail(raw: string): Readonly<{ email: EmailAddress }> | Readonly<{ message: string }> {
  const parsed = EmailAddress.safeParse(raw)
  return parsed.success ? { email: parsed.data } : { message: failureText(new HubFailure('EMAIL_INVALID', null)) }
}
