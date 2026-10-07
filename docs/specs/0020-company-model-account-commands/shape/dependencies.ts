export type { AccountScope, AdministratorScope, Admitted, RunScope, SystemScope, ReadGate, CommandGate } from '#admission-types'
export type { Result, Code } from '#failure-types'
import type { FailureCode } from '#failure-types'
export type WaveFailure = Readonly<{ code: FailureCode }>
export type ModelAccountRunCode = 'MODEL_ACCOUNT_REQUIRED' | 'MODEL_ACCOUNT_CHANGED' | 'MODEL_ACCOUNT_PERSONAL_REFUSED' | 'MODEL_ACCOUNT_INSTALLATION_REFUSED'
