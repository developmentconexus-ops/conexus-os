import { z } from 'zod'
import type { AccountId, ModelAccountId, ModelAccountProvider } from '@conexus/contract'
import type { Credential, CredentialKind, ModelId, ModelRole } from './credential.js'
import type { AccountScope, AdministratorScope, Admitted, RunScope, SystemScope, Result, WaveFailure } from './dependencies.js'
import type { Sealed } from './secrets.js'
import type { OpenRun } from '#foundation-store'
export type { OpenRun } from '#foundation-store'
export const ConnectionGenerationId = z.uuid().brand<'ConnectionGenerationId'>()
export type ConnectionGenerationId = z.output<typeof ConnectionGenerationId>
export type Slot = Readonly<{ scope: 'personal'; ownerAccountId: AccountId }> | Readonly<{ scope: 'installation' }>
export type RowBase = Readonly<{ modelAccountId: ModelAccountId; generationId: ConnectionGenerationId; slot: Slot; connectedByName: string; connectedAt: Date; refusedAt: Date | null }>
export type AccountRow = RowBase & CredentialKind
export type HeldAccount<C extends Credential = Credential> = Readonly<{ row: RowBase; credential: C; sealed: Sealed<'model-account'> }>
export type WriteTarget = Readonly<{ scope: 'personal'; proof: Admitted<AccountScope> }> | Readonly<{ scope: 'installation'; proof: Admitted<Extract<AdministratorScope, {action:'model-account.manage'}>> }>
export type HoldError = Readonly<{ code:'SECRET_CUSTODY_LOST'; row: AccountRow; spent:Sealed<'model-account'> }> | Readonly<{code:Exclude<WaveFailure['code'],'SECRET_CUSTODY_LOST'>}>
export type Reread = Readonly<{state:'present';held:HeldAccount}> | Readonly<{state:'gone'}>
export type Persisted = Readonly<{state:'stored';held:HeldAccount}> | Readonly<{state:'superseded'}>
export type RefusalMark = Readonly<{row:AccountRow;spent:Sealed<'model-account'>;reason:'CUSTODY_CHANGED'|'PROVIDER_REFRESH_REFUSED'|'PROVIDER_CALL_REFUSED'}>
export type ModelAccountStore = Readonly<{
 readInstallationDefault(proof:Admitted<AccountScope,'read'>,role:ModelRole):Promise<ModelId|null>
 setInstallationBuildDefault(proof:Admitted<Extract<AdministratorScope,{action:'model-account.manage'}>>,modelId:ModelId):Promise<Result<void,WaveFailure>>
 list(proof:Admitted<AccountScope,'read'>):Promise<readonly AccountRow[]>
 connect(input:WriteTarget & Readonly<{credential:Credential;displayName:string}>):Promise<Result<ModelAccountId,WaveFailure>>
 remove(input:WriteTarget & Readonly<{provider:ModelAccountProvider}>):Promise<void>
 hold(proof:Admitted<RunScope>,provider:ModelAccountProvider):Promise<Result<HeldAccount,HoldError>>
 reread(openRun:OpenRun,held:HeldAccount):Promise<Result<Reread,HoldError>>
 persist(proof:Admitted<SystemScope>,held:HeldAccount,next:Credential):Promise<Result<Persisted,WaveFailure>>
 markRefused(proof:Admitted<SystemScope>,mark:RefusalMark):Promise<boolean>
}>
