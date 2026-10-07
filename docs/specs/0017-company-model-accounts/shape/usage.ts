import type { AccountId, ModelAccountId } from '@conexus/contract'
import type { FastifyInstance } from 'fastify'
import type { Admitted, RunScope, Result, WaveFailure } from './dependencies.js'
import type { OpenRun, ModelAccountStore, HeldAccount } from './store.js'
import type { ModelId } from './credential.js'
import { createModelAccountModule, type ModelAccountDependencies, type ModelAccountModule } from './module.js'
import type { SecretEnvelope, Sealed, SealContext } from './secrets.js'
declare function recordPayingAccount(proof: Admitted<RunScope>, id: ModelAccountId): Promise<Result<void, WaveFailure>>
export async function builderCall(accounts: ModelAccountModule, openRun: OpenRun, modelId: ModelId) {
  const paid = await accounts.modelFor(openRun, { modelId, thinkingLevel: null })
  if (!paid.ok) return paid
  const recorded = await openRun(proof => recordPayingAccount(proof, paid.result.modelAccountId))
  if (!recorded.ok) return recorded
  return { ok: true, result: paid.result.model } as const
}
export async function hubComposition(deps: ModelAccountDependencies, app: FastifyInstance, accountId: AccountId) {
  const models = await createModelAccountModule(deps)
  const routes = await models.registerRoutes(app)
  const defaultModel = await models.readDefault(accountId, 'build')
  const preflight = defaultModel === null ? null : await models.checkBeforeRun(accountId, [defaultModel])
  return { routes, jobs: models.jobs, preflight, close: models.close }
}
// Persistence finishes first. Every waiter then opens its own current run admission.
// Owner callbacks must finish the read/command transaction before starting the system write.
export async function releaseWaiter(store: ModelAccountStore, openRun: OpenRun, held: HeldAccount) {
  return store.reread(openRun, held)
}
export function redeemHandoff(input: Readonly<{ envelope: SecretEnvelope; returnedToken: Sealed<'handoff'>; from: SealContext<'handoff'>; to: SealContext<'hub-session'> }>) {
  return input.envelope.reseal(input.returnedToken, input.from, input.to)
}

import { nativeModel, type NativeCredentialAccess } from './module.js'
export function nativeLeafBoundary(access: NativeCredentialAccess, modelId: ModelId) {
  return nativeModel(access, modelId)
}
