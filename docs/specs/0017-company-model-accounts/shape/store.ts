import type { AccountId, ModelAccountId, ModelAccountProvider } from '@conexus/contract'
import type { Credential, CredentialKind } from './credential.js'
import type { AccountScope, Admitted, RunScope, Result, WaveFailure } from './dependencies.js'
import type { Sealed } from './secrets.js'
type RowBase = Readonly<{ modelAccountId: ModelAccountId; ownerAccountId: AccountId; connectedAt: Date; refusedAt: Date | null }>
type RowVariant<K extends CredentialKind> = K extends CredentialKind ? RowBase & Readonly<{ provider: K['provider']; credentialKind: K }> : never
export type AccountRow = RowVariant<CredentialKind>
type HeldVariant<C extends Credential> = C extends Credential ? RowBase & Readonly<{
  provider: C['provider']; credentialKind: Pick<C, 'provider' | 'kind'>; credential: C; sealed: Sealed<'model-account'>
}> : never
export type HeldAccount = HeldVariant<Credential>
export type HoldError = Readonly<{ code: 'SECRET_CUSTODY_LOST'; row: AccountRow; spent: Sealed<'model-account'> }> |
  Readonly<{ code: Exclude<WaveFailure['code'], 'SECRET_CUSTODY_LOST'> }>
export type OpenRun = <T>(work: (proof: Admitted<RunScope>) => Promise<Result<T, WaveFailure>>) => Promise<Result<T, WaveFailure>>
export type Reread = Readonly<{ state: 'present'; held: HeldAccount }> | Readonly<{ state: 'gone' }>
export declare function list(proof: Admitted<AccountScope, 'read'>): Promise<readonly AccountRow[]>
export declare function connect(input: Readonly<{ proof: Admitted<AccountScope>; credential: Credential; displayName: string }>): Promise<Result<ModelAccountId, WaveFailure>>
export declare function hold(proof: Admitted<RunScope>, provider: ModelAccountProvider): Promise<Result<HeldAccount, HoldError>>
export declare function reread(openRun: OpenRun, held: HeldAccount): Promise<Result<Reread, WaveFailure>>
