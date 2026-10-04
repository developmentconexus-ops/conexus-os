import type { CheckContext } from './context.js'
import type { Outcome } from './outcome.js'
import { STEP_IDS, type StepId } from './report.js'
import { boot } from './steps/boot.js'
import { build } from './steps/build.js'
import { generate } from './steps/generate.js'
import { server } from './steps/server-bundle.js'
import { typecheck } from './steps/typecheck.js'

const RUNNERS = { generate, typecheck, build, server, boot } as const satisfies Record<StepId, (ctx: CheckContext) => Promise<Outcome>>

/** The whole check: the order is `STEP_IDS`'s order, and a step with no runner is a compile error. */
export const STEPS = STEP_IDS.map((id) => ({ id, run: RUNNERS[id] }))
