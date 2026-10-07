import type { z } from 'zod'
import { ReceivedFailure } from '@conexus/contract'

export const routeParam = <S extends z.ZodType>(schema: S, value: string): z.output<S> => {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new ReceivedFailure('HUB_RESPONSE_UNREADABLE', null)
  return parsed.data
}
