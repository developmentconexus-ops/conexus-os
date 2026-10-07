import type { AccountId, BuilderRunId, ProjectId } from '@conexus/contract'
import type { ReadTx, WriteTx } from '../../../../apps/hub/src/platform/db.js'
import type { FailureCode } from '../../../../packages/contract/src/failures.generated.js'

// Temporary signatures of upstream owners, never implementations or product imports.
// 0018 at 3d70bd7b supplies the nominal proof, read gate and run/system scopes.
// U2 extends its administrator action with model-account.manage.
export type AccountScope = Readonly<{ kind: 'account'; accountId: AccountId }>
export type AdministratorScope = Readonly<{ kind: 'installation-administrator'; accountId: AccountId; action: 'model-account.manage' }>
export type RunScope = Readonly<{ kind: 'run'; builderRunId: BuilderRunId; accountId: AccountId; projectId: ProjectId; owner: Readonly<{ ownerId: string }>; via: 'account' | 'executor' }>
export type ModelAccountJob = 'model-account-refusal' | 'model-account-capture'
export type SystemScope<J extends ModelAccountJob = ModelAccountJob> = Readonly<{ kind: 'system'; job: J }>
type Scope = AccountScope | AdministratorScope | RunScope | SystemScope
export declare class Admitted<S extends Scope, M extends 'read' | 'write' = 'write'> {
  private readonly proof
  readonly scope: S
  readonly mode: M
  readonly tx: M extends 'read' ? ReadTx : WriteTx
}
export declare class ReadGate { private readonly readDoor; readonly mode: 'read' }
export declare class CommandGate { private readonly commandDoor; readonly mode: 'write' }
export declare function admitAccount(gate: ReadGate): Promise<Admitted<AccountScope, 'read'>>
export declare function admitAccount(gate: CommandGate): Promise<Admitted<AccountScope>>
export declare function admitInstallationAdministrator(gate: CommandGate, input: Readonly<{ action: 'model-account.manage' }>): Promise<Admitted<AdministratorScope>>

// 0019 owns these semantics, checked at 3395649f. Import its merged Result/Failure/Code owners at build time.
export type ModelAccountRunCode = 'MODEL_ACCOUNT_MISSING' | 'MODEL_ACCOUNT_SIGN_IN_REQUIRED' | 'MODEL_ACCOUNT_INSTALLATION_SIGN_IN_REQUIRED' | 'MODEL_ACCOUNT_CHANGED'
export type WaveFailure = Readonly<{ code: FailureCode | ModelAccountRunCode | 'SECRET_CUSTODY_LOST' }>
// Exact two-parameter signature of 0019 shape/types.ts at 3395649f.
// WaveFailure codes become generated table codes in their owning unit.
export type Result<T, E extends Readonly<{ code: WaveFailure['code'] }>> = Readonly<{ ok: true; result: T }> | Readonly<{ ok: false; error: E }>
export type Database = Readonly<{
  read<T>(accountId: AccountId, work: (gate: ReadGate) => Promise<T>): Promise<T>
  transaction<T>(accountId: AccountId, work: (gate: CommandGate) => Promise<T>): Promise<T>
}>
