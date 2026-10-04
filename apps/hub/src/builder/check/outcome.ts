import { z } from 'zod'
import { FAILURE_CODES, type CheckFailureCode, type CheckSkipCode, type Problem, problemSchema, SKIP_CODES } from './report.js'

/** How one step ended, before the runner times it. A worker prints one as its only line. */
type Passed = Readonly<{ kind: 'ok'; thumbnailBase64?: string }>
type Failed = Readonly<{ kind: 'failed'; code: CheckFailureCode; problems: readonly Problem[]; thumbnailBase64?: string }>
export type Outcome = Passed | Failed | Readonly<{ kind: 'skipped'; code: CheckSkipCode; reason: string }>

export const outcomeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ok'), thumbnailBase64: z.string().exactOptional() }),
  z.strictObject({ kind: z.literal('failed'), code: z.enum(FAILURE_CODES), problems: z.array(problemSchema), thumbnailBase64: z.string().exactOptional() }),
  z.strictObject({ kind: z.literal('skipped'), code: z.enum(SKIP_CODES), reason: z.string() }),
])

export const OK: Passed = Object.freeze({ kind: 'ok' })
export const failed = (code: CheckFailureCode, problems: readonly Problem[]): Failed => ({ kind: 'failed', code, problems })
export const timedOut = (step: string, limitMs: number): Outcome =>
  failed('STEP_TIMEOUT', [{ code: 'STEP_TIMEOUT', message: `${step} exceeded ${limitMs / 1000} s and was stopped` }])
