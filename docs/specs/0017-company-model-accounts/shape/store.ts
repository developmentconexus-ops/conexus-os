import type { AccountId, ModelAccountId, ModelAccountProvider } from '@conexus/contract'
import type { Credential, CredentialKind } from './credential.js'
import type { AccountScope, Admitted, RunScope, SystemScope, Result, WaveFailure } from './dependencies.js'
import type { Sealed } from './secrets.js'
export type Slot = Readonly<{ scope: 'personal'; ownerAccountId: AccountId }> | Readonly<{ scope: 'installation' }>
type RowBase = Readonly<{ modelAccountId: ModelAccountId; slot: Slot; connectedAt: Date; refusedAt: Date | null }>
export type AccountRow = RowBase & CredentialKind
// The credential is the only provider/kind/value source in a hold.
export type HeldAccount = Readonly<{ row: RowBase; credential: Credential; sealed: Sealed<'model-account'> }>
export type HoldError = Readonly<{ code: 'SECRET_CUSTODY_LOST'; row: AccountRow; spent: Sealed<'model-account'> }> | Readonly<{ code: Exclude<WaveFailure['code'], 'SECRET_CUSTODY_LOST'> }>
export type OpenRun = <T>(work: (proof: Admitted<RunScope>) => Promise<Result<T, WaveFailure>>) => Promise<Result<T, WaveFailure>>
export type Reread = Readonly<{ state: 'present'; held: HeldAccount }> | Readonly<{ state: 'gone' }>
export type Persisted = Readonly<{ state: 'stored'; held: HeldAccount }> | Readonly<{ state: 'superseded' }>
export type ModelAccountStore = Readonly<{
  list(proof: Admitted<AccountScope, 'read'>): Promise<readonly AccountRow[]>
  connect(input: Readonly<{ proof: Admitted<AccountScope>; credential: Credential; displayName: string }>): Promise<Result<ModelAccountId, WaveFailure>>
  hold(proof: Admitted<RunScope>, provider: ModelAccountProvider): Promise<Result<HeldAccount, HoldError>>
  reread(openRun: OpenRun, held: HeldAccount): Promise<Result<Reread, HoldError>>
  // Owner-internal write: no still-live run required to keep already rotated tokens.
  persist(proof: Admitted<SystemScope>, held: HeldAccount, next: Credential): Promise<Result<Persisted, WaveFailure>>
}>
