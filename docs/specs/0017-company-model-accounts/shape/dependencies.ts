// Compile against the pinned upstream sources, extracted by compile.mjs.
// These imports become the delivered identity-access and platform/failure imports at build.
export type { AccountScope, Admitted, RunScope, SystemScope, ReadGate, CommandGate } from '#admission-types'
export type { Result, Code } from '#failure-types'
import type { FailureCode } from '#failure-types'
export type WaveFailure = Readonly<{ code: FailureCode }>
