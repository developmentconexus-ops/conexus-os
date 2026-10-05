import { z } from 'zod'
import type { FailureCode } from './failures.generated.js'

/**
 * The failure a refused field answers, kept out of the global registry on purpose: Zod copies every
 * global metadata key into the JSON Schema it emits, and this one is not a JSON Schema keyword.
 */
export const fieldFailures = z.registry<{ failureCode: FailureCode }>()
