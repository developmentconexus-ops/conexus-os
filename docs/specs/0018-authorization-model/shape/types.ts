import type { AccountId, BuilderRunId, ProjectId, ProjectRevision, WorkspaceId, WorkspaceRole } from '@conexus/contract'
import type { JobName, ReadTx, WriteTx } from '../../../../apps/hub/src/platform/db.js'

export type Mode = 'read' | 'write'
export type WorkspaceAction = 'workspace.read' | 'members.manage' | 'members.leave' | 'project.create'
export type ProjectAction = 'project.read' | 'project.build' | 'connections.bind' | 'application.manage' | 'project.delete'
export type OwnerRow = Readonly<{ accountId: AccountId; active: boolean }>
export type AccountScope = Readonly<{ kind: 'account'; accountId: AccountId }>
type WorkspaceBase = Readonly<{ kind: 'workspace'; accountId: AccountId; workspaceId: WorkspaceId; role: WorkspaceRole }>
type WorkspaceScopes = {
  [A in WorkspaceAction]: WorkspaceBase & Readonly<{ action: A }> &
    (A extends 'members.manage' | 'members.leave' ? Readonly<{ owners: readonly OwnerRow[] }> : object)
}[WorkspaceAction]
export type WorkspaceScope<A extends WorkspaceAction> = Extract<WorkspaceScopes, { action: A }>
export type ProjectScope<A extends ProjectAction> = Readonly<{
  kind: 'project'; accountId: AccountId; workspaceId: WorkspaceId; projectId: ProjectId; role: WorkspaceRole; action: A
}>
export type AdministratorScope =
  | Readonly<{ kind: 'installation-administrator'; accountId: AccountId; action: 'administrators.manage' }>
  | Readonly<{ kind: 'installation-administrator'; accountId: AccountId; action: 'connection.manage'; workspaceId: WorkspaceId }>
export type ApplicationScope = Readonly<{ kind: 'application'; accountId: AccountId; projectId: ProjectId; via: 'grant' | 'membership' }>
export type RunOwner = Readonly<{ ownerId: string }>
export type RunScope = Readonly<{ kind: 'run'; builderRunId: BuilderRunId; accountId: AccountId; projectId: ProjectId; owner: RunOwner; via: 'account' | 'executor' }>
export type SystemScope<J extends JobName = JobName> = Readonly<{ kind: 'system'; job: J }>
export type BootstrapScope = Readonly<{ kind: 'bootstrap'; issuer: string; subject: string }>
export type Scope = RunScope | SystemScope | BootstrapScope | AccountScope | WorkspaceScope<WorkspaceAction> | ProjectScope<ProjectAction> | AdministratorScope | ApplicationScope

declare class Proof<S extends Scope, M extends Mode> {
  private readonly proof
  readonly mode: M
  readonly scope: S
  readonly tx: M extends 'write' ? WriteTx : ReadTx
}
export type Admitted<S extends Scope, M extends Mode = 'write'> = Proof<S, M>
declare class ReadDoor { private readonly readDoor; readonly mode: 'read' }
declare class CommandDoor { private readonly commandDoor; readonly mode: 'write' }
export type ReadGate = ReadDoor
export type CommandGate = CommandDoor

export type ServedProjectScope = Readonly<{ kind: 'project'; accountId: AccountId; workspaceId: WorkspaceId; projectId: ProjectId; action: 'project.read' }>
declare class ServedProof<S extends ApplicationScope | ServedProjectScope> {
  private readonly checked
  readonly scope: S
  readonly tx: ReadTx
}
export type Checked<S extends ApplicationScope | ServedProjectScope> = ServedProof<S>

export type ProjectIdentity = Readonly<{ projectId: ProjectId; workspaceId: WorkspaceId; name: string }>
export type ProjectState =
  | Readonly<{ state: 'live'; projectRevision: ProjectRevision; archived: boolean }>
  | Readonly<{ state: 'deleting' }>
export type ProjectDetail = ProjectIdentity & ProjectState
