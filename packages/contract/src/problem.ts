import { z } from 'zod'
import { FAILURE_CODES, FAILURE_STATUS } from './failures.generated.js'

export const TraceId = z.string().regex(/^[0-9a-f]{32}$/).refine((value) => value !== '0'.repeat(32)).brand<'TraceId'>()
export type TraceId = z.output<typeof TraceId>

export const Problem = z.looseObject({
  type: z.string(),
  title: z.string(),
  status: z.int().min(100).max(599),
  code: z.enum(FAILURE_CODES),
  traceId: TraceId.optional(),
}).refine((problem) => problem.status === FAILURE_STATUS[problem.code]).meta({ id: 'Problem' })
export type Problem = z.output<typeof Problem>
