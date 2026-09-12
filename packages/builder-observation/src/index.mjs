import { z } from 'zod'

const id = z.string().min(1).max(160)
const event = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('TEXT_START'), blockId: id }),
  z.strictObject({ kind: z.literal('TEXT_DELTA'), blockId: id, text: z.string().max(65_536) }),
  z.strictObject({ kind: z.literal('TEXT_END'), blockId: id }),
  z.strictObject({ kind: z.literal('ACTIVITY'), activityId: id,
    label: z.enum(['READ_FILES', 'EDIT_FILES', 'RUN_COMMAND', 'WORKSPACE']),
    state: z.enum(['started', 'succeeded', 'failed', 'interrupted']) }),
  z.strictObject({ kind: z.literal('PHASE'), phase: z.enum(['CODING', 'VERIFYING', 'CORRECTING']) }),
  z.strictObject({ kind: z.literal('OBSERVATION_END') }),
  z.strictObject({ kind: z.literal('OBSERVATION_UNAVAILABLE'), code: z.enum(['RUNTIME_FAILED', 'LIMIT_REACHED']) }),
])

export const observationEventSchema = z.strictObject({
  generation: id, sequence: z.number().int().positive(), event,
})

export const parseObservationEvent = (value) => observationEventSchema.parse(value)
