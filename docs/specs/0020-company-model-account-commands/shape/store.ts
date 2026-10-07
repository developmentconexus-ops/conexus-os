import type { AccountId, ModelAccountId, ModelAccountProvider } from '@conexus/contract'
import type { Credential, CredentialKind } from './credential.js'
import type { AccountScope, AdministratorScope, Admitted, RunScope, SystemScope, Result, ModelAccountRunCode, WaveFailure } from './dependencies.js'
import type { Sealed } from './secrets.js'
export type Slot<P extends ModelAccountProvider = ModelAccountProvider> =
  | Readonly<{ scope: 'personal'; ownerAccountId: AccountId; provider: P }>
  | Readonly<{ scope: 'installation'; provider: P }>
type RowBase = Readonly<{ modelAccountId: ModelAccountId; connectedBy: AccountId; connectedByName: string; connectedAt: Date; refusedAt: Date | null }>
type RowVariant<K extends CredentialKind> = K extends CredentialKind ? RowBase & Readonly<{ slot: Slot<K['provider']>; credentialKind: K }> : never
export type AccountRow = RowVariant<CredentialKind>
type HeldVariant<C extends Credential> = C extends Credential ? RowBase & Readonly<{
  slot: Slot<C['provider']>; credentialKind: Pick<C, 'provider' | 'kind'>; credential: C; sealed: Sealed<'model-account'>
}> : never
export type HeldAccount = HeldVariant<Credential>
export type InUse = Readonly<{ source: 'row'; row: AccountRow }> | Readonly<{ source: 'none' }>
export type OpenRun = <T>(work: (proof: Admitted<RunScope>) => Promise<Result<T, WaveFailure>>) => Promise<Result<T, WaveFailure>>
export type Reread = Readonly<{ state: 'present'; held: HeldAccount }> | Readonly<{ state: 'gone' }>
export type WriteTarget =
  | Readonly<{ proof: Admitted<AccountScope>; scope: 'personal' }>
  | Readonly<{ proof: Admitted<AdministratorScope>; scope: 'installation' }>
export declare function accountInUse(input: Readonly<{ rows: readonly AccountRow[]; accountId: AccountId; provider: ModelAccountProvider }>): InUse
export declare function refusalOf(inUse: InUse): Readonly<{ code: ModelAccountRunCode }> | null
export declare function list(proof: Admitted<AccountScope, 'read'>): Promise<readonly AccountRow[]>
export declare function connect(input: WriteTarget & Readonly<{ credential: Credential; displayName: string }>): Promise<Result<Readonly<{ modelAccountId: ModelAccountId; event: 'MODEL_ACCOUNT_CONNECTED' | 'MODEL_ACCOUNT_REPLACED' }>, WaveFailure>>
export declare function remove(input: WriteTarget & Readonly<{ provider: ModelAccountProvider }>): Promise<void>
export type HoldError = Readonly<{ code: 'SECRET_CUSTODY_LOST'; row: AccountRow; spent: Sealed<'model-account'> }> | Readonly<{ code: Exclude<WaveFailure['code'], 'SECRET_CUSTODY_LOST'> }>
export declare function hold(proof: Admitted<RunScope>, provider: ModelAccountProvider): Promise<Result<HeldAccount, HoldError>>
export declare function reread(openRun: OpenRun, held: HeldAccount): Promise<Result<Reread, WaveFailure>>
export declare function swap<C extends Credential>(input: Readonly<{ proof: Admitted<RunScope> | Admitted<SystemScope<'model-account-capture'>>; held: HeldVariant<C>; next: Extract<Credential, Pick<NoInfer<C>, 'provider' | 'kind'>> }>): Promise<boolean>
export type RefusalMark = Readonly<{
  reason: 'CUSTODY_CHANGED' | 'PROVIDER_CALL_REFUSED' | 'PROVIDER_REFRESH_REFUSED';
  row: AccountRow; spent: Sealed<'model-account'>
}>
export declare function markRefused(input: Readonly<{ proof: Admitted<SystemScope<'model-account-refusal'>>; mark: RefusalMark }>): Promise<boolean>
