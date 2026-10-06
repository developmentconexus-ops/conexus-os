import { z } from 'zod'
import { FAILURE_CODES } from './failures.generated.js'

export const Problem = z.looseObject({
  type: z.string(),
  title: z.string(),
  status: z.int().min(100).max(599),
  code: z.enum(FAILURE_CODES),
  traceId: z.string().optional(),
}).meta({ id: 'Problem' })
export type Problem = z.output<typeof Problem>
