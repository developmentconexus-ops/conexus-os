/**
 * The person an application request acts for. The platform builds it from a resolved session (the
 * Hub session for a Preview, the application session on an application host) and never from input.
 * The runner receives it beside the input and checks only its shape: the identity provider verified
 * the email and the account owns the name, so neither is judged again here.
 */
export type Caller = Readonly<{ accountId: string; email: string | null; displayName: string }>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.length > 0

export const parseCaller = (value: unknown): Caller | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const { accountId, email, displayName, ...rest } = value as Record<string, unknown>
  if (Object.keys(rest).length > 0) return null
  if (typeof accountId !== 'string' || !UUID.test(accountId)) return null
  if (email !== null && !nonEmpty(email)) return null
  if (!nonEmpty(displayName)) return null
  return Object.freeze({ accountId, email, displayName })
}
