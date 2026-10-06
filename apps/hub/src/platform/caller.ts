import { z } from 'zod'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The person an application request acts for. The platform builds it from a resolved session (the
 * Hub session for a Preview, the application session on an application host) and never from input.
 * The runner receives it beside the input and checks only its shape: the identity provider verified
 * the email and the account owns the name, so neither is judged again here.
 */
export const callerSchema = z.object({
  accountId: z.string().regex(UUID),
  email: z.string().min(1).nullable(),
  displayName: z.string().min(1),
}).strict().readonly()

export type Caller = z.infer<typeof callerSchema>

export const parseCaller = (value: unknown): Caller | null => {
  const parsed = callerSchema.safeParse(value)
  return parsed.success ? Object.freeze(parsed.data) : null
}
