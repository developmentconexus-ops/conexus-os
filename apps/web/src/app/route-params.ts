import type { z } from 'zod'
import { HubFailure } from './failure.ts'

export const routeParam = <S extends z.ZodType>(schema: S, value: string): z.output<S> => {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new HubFailure('HUB_RESPONSE_UNREADABLE', null)
  return parsed.data
}
