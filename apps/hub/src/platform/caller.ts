import { z } from 'zod'
import { AccountId } from '../../../../packages/contract/dist/index.js'

/**
 * The person an application request acts for. The platform builds it from a resolved session (the
 * Hub session for a Preview, the application session on an application host) and never from input.
 * The runner receives it beside the input and checks only its shape: the identity provider verified
 * the email and the account owns the name, so neither is judged again here.
 */
export const callerSchema = z.object({
  accountId: AccountId,
  email: z.string().min(1).nullable(),
  displayName: z.string().min(1),
}).strict().readonly()

export type Caller = z.infer<typeof callerSchema>

export const parseCaller = (value: unknown): Caller | null => {
  const parsed = callerSchema.safeParse(value)
  return parsed.success ? Object.freeze(parsed.data) : null
}
