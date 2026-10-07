import type { BuilderRunId, WorkspaceId, ProjectId } from '@conexus/contract'
import type { AuthenticationGate, JobName } from '../../../../apps/hub/src/platform/db.js'
import type { Failure, FailureCode } from '../../../../apps/hub/src/platform/failure.js'
import type { ApplicationScope, BootstrapScope, Checked, AccountScope, AdministratorScope, Admitted, CommandGate, ProjectAction, ProjectReadAction, ProjectScope, ReadGate, RunOwner, RunScope, SystemScope, WorkspaceAction, WorkspaceReadAction, WorkspaceScope } from './types.js'

export declare function admitAccount(gate: ReadGate): Promise<Admitted<AccountScope, 'read'>>
export declare function admitAccount(gate: CommandGate | AuthenticationGate): Promise<Admitted<AccountScope>>
export declare function admitWorkspace<A extends WorkspaceReadAction>(gate: ReadGate, input: Readonly<{ workspaceId: WorkspaceId; action: A }>): Promise<Admitted<WorkspaceScope<A, 'read'>, 'read'>>
export declare function admitWorkspace<A extends WorkspaceAction>(gate: CommandGate, input: Readonly<{ workspaceId: WorkspaceId; action: A }>): Promise<Admitted<WorkspaceScope<A>>>
export declare function admitProject<A extends ProjectReadAction>(gate: ReadGate, input: Readonly<{ projectId: ProjectId; action: A }>): Promise<Admitted<ProjectScope<A>, 'read'>>
export declare function admitProject<A extends ProjectAction>(gate: CommandGate, input: Readonly<{ projectId: ProjectId; action: A }>): Promise<Admitted<ProjectScope<A>>>
export type AdministratorInput =
  | Readonly<{ action: 'administrators.manage' }>
  | Readonly<{ action: 'connection.manage'; workspaceId: WorkspaceId }>
export declare function admitInstallationAdministrator<I extends AdministratorInput>(gate: ReadGate, input: I): Promise<Admitted<Extract<AdministratorScope, { action: I['action'] }>, 'read'>>
export declare function admitInstallationAdministrator<I extends AdministratorInput>(gate: CommandGate, input: I): Promise<Admitted<Extract<AdministratorScope, { action: I['action'] }>>>
export declare function readAdministratorFlag(proof: Admitted<AccountScope, 'read'>): Promise<boolean>
// The existing Failure remains the refusal mechanism. Spec 0019 owns its replacement.
export declare function refuse(input: Readonly<{ code: FailureCode; reason: 'OUTSIDER' | 'FORBIDDEN' | 'TOMBSTONE' | 'INACTIVE' | 'NO_ACCOUNT' | 'RUN_NOT_HELD' }>): Failure

export declare function admitRun(gate: CommandGate, builderRunId: BuilderRunId, owner: RunOwner): Promise<Admitted<RunScope>>
export declare function admitSystem<J extends JobName>(gate: CommandGate, job: J): Promise<Admitted<SystemScope<J>>>

export declare function admitApplication(gate: CommandGate | AuthenticationGate, projectId: ProjectId): Promise<Admitted<ApplicationScope>>
export declare function checkApplication(gate: CommandGate | AuthenticationGate, projectId: ProjectId): Promise<Checked<ApplicationScope>>
export declare function checkProject(gate: CommandGate | AuthenticationGate, projectId: ProjectId): Promise<Checked<ProjectScope<'project.read'>>>
export declare function admitBootstrap(gate: AuthenticationGate, identity: import('../../../../apps/hub/src/identity-access/admission.js').ConfiguredIdentity): Promise<Admitted<BootstrapScope> | null>
