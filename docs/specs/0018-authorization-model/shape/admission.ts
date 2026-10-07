import type { BuilderRunId, WorkspaceId, ProjectId } from '@conexus/contract'
import type { JobName } from '../../../../apps/hub/src/platform/db.js'
import type { Failure, FailureCode } from '../../../../apps/hub/src/platform/failure.js'
import type { AccountScope, AdministratorScope, Admitted, CommandGate, ProjectAction, ProjectScope, ReadGate, RunOwner, RunScope, SystemScope, WorkspaceAction, WorkspaceScope } from './types.js'

export declare function admitAccount(gate: ReadGate): Promise<Admitted<AccountScope, 'read'>>
export declare function admitAccount(gate: CommandGate): Promise<Admitted<AccountScope>>
export declare function admitWorkspace<A extends WorkspaceAction>(gate: ReadGate, input: Readonly<{ workspaceId: WorkspaceId; action: A }>): Promise<Admitted<WorkspaceScope<A>, 'read'>>
export declare function admitWorkspace<A extends WorkspaceAction>(gate: CommandGate, input: Readonly<{ workspaceId: WorkspaceId; action: A }>): Promise<Admitted<WorkspaceScope<A>>>
export declare function admitProject<A extends ProjectAction>(gate: ReadGate, input: Readonly<{ projectId: ProjectId; action: A }>): Promise<Admitted<ProjectScope<A>, 'read'>>
export declare function admitProject<A extends ProjectAction>(gate: CommandGate, input: Readonly<{ projectId: ProjectId; action: A }>): Promise<Admitted<ProjectScope<A>>>
export type AdministratorInput =
  | Readonly<{ action: 'administrators.manage' }>
  | Readonly<{ action: 'connection.manage'; workspaceId: WorkspaceId }>
export declare function admitInstallationAdministrator(gate: ReadGate, input: AdministratorInput): Promise<Admitted<AdministratorScope, 'read'>>
export declare function admitInstallationAdministrator(gate: CommandGate, input: AdministratorInput): Promise<Admitted<AdministratorScope>>
export declare function readAdministratorFlag(proof: Admitted<AccountScope, 'read'>): Promise<boolean>
// The existing Failure remains the refusal mechanism. Spec 0019 owns its replacement.
export declare function refuse(input: Readonly<{ code: FailureCode | 'PROJECT_DELETING'; reason: 'OUTSIDER' | 'FORBIDDEN' | 'TOMBSTONE' | 'INACTIVE' | 'NO_ACCOUNT' | 'RUN_NOT_HELD' }>): Failure

export declare function admitRun(gate: CommandGate, builderRunId: BuilderRunId, owner: RunOwner): Promise<Admitted<RunScope>>
export declare function admitSystem<J extends JobName>(gate: CommandGate, job: J): Promise<Admitted<SystemScope<J>>>
