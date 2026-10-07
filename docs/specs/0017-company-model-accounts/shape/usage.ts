import type { WaveFailure } from './dependencies.js'
import type { ModelAccountId } from '@conexus/contract'
import type { Admitted, RunScope, Result } from './dependencies.js'
import type { OpenRun } from './store.js'
import type { ParsedModelId } from './credential.js'
import type { ModelAccountModule } from './module.js'
import type { SecretEnvelope, Sealed, SealContext } from './secrets.js'
declare function recordPayingAccount(proof: Admitted<RunScope>, id: ModelAccountId): Promise<Result<void, WaveFailure>>
export async function builderCall(input: Readonly<{ accounts: ModelAccountModule; openRun: OpenRun; modelId: ParsedModelId }>) {
  const paid = await input.accounts.modelFor(input.openRun, { modelId: input.modelId, thinkingLevel: null })
  if (!paid.ok) return paid
  const recorded = await input.openRun((proof) => recordPayingAccount(proof, paid.result.modelAccountId))
  if (!recorded.ok) return recorded
  return { ok: true, result: paid.result.model } as const
}
export function redeemHandoff(input: Readonly<{
  envelope: SecretEnvelope; returnedToken: Sealed<'handoff'>;
  from: SealContext<'handoff'>; to: SealContext<'hub-session'>
}>) {
  return input.envelope.reseal(input.returnedToken, input.from, input.to)
}
