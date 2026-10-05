import type { AccountId, BuilderRunId } from '../../../../packages/contract/dist/index.js'
import { admitRun, type Admitted, type RunScope } from '../identity-access/admission.js'
import type { Database } from '../platform/db.js'
import { Failure } from '../platform/failure.js'

/** Who a run's write acts as: its author's account before the candidate, the executor for everything it settles. */
export type RunActor = Readonly<{ via: 'account'; accountId: AccountId }> | Readonly<{ via: 'executor' }>

/** Opens the entry the actor names and admits the run in it, so the work gets the run's proof and nothing else. */
export const withRun = <T>(database: Database, ownerId: string, builderRunId: BuilderRunId, actor: RunActor, work: (proof: Admitted<RunScope>) => Promise<T>): Promise<T> =>
  actor.via === 'account'
    ? database.transaction(actor.accountId, async (gate) => work(await admitRun(gate, builderRunId, { ownerId })))
    : database.system('builder-executor', async (gate) => work(await admitRun(gate, builderRunId, { ownerId })))

/** A run that is no longer admitted reads as the fallback; every other failure still throws. */
export const unlessNotAdmitted = <T>(fallback: T) => (error: unknown): T => {
  if (error instanceof Failure && error.id === 'BUILDER_RUN_NOT_ADMITTED') return fallback
  throw error
}
