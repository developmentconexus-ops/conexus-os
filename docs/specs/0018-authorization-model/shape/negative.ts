import type { AccountId, ProjectId, ProjectRevision, WorkspaceId } from '@conexus/contract'
import { admitProject, admitWorkspace, admitInstallationAdministrator } from './admission.js'
import { beginDeletion, listProjects } from './data.js'
import type { Admitted, CommandGate, ProjectScope, ReadGate, WorkspaceScope, ProjectDetail, Checked, ApplicationScope, RunScope, SystemScope } from './types.js'
import type { Malformed, RoleCells } from './catalog.js'
declare const gate: ReadGate
declare const accountId: AccountId
declare const workspaceId: WorkspaceId
declare const revision: ProjectRevision
declare const projectId: ProjectId
declare const read: Admitted<ProjectScope<'project.read'>, 'read'>
declare const view: Checked<ApplicationScope>
declare const systemProof: Admitted<SystemScope>
// @ts-expect-error A closed gate has no SQL method.
gate.rows()
// @ts-expect-error A structural object cannot mint a gate.
const forgedGate: CommandGate = { mode: 'write' }
// @ts-expect-error A read proof cannot write.
beginDeletion(read, 'Example')
// @ts-expect-error A Checked read is not an admitted deletion command.
beginDeletion(view, 'Example')
// @ts-expect-error Proofs are nominal.
const forgedProof: Admitted<WorkspaceScope<'workspace.read'>, 'read'> = { mode: 'read', scope: { kind: 'workspace', accountId, workspaceId, role: 'owner', action: 'workspace.read' }, tx: {} }
// @ts-expect-error Id brands cannot be swapped.
admitProject(gate, { projectId: workspaceId, action: 'project.read' })
// @ts-expect-error Only Project proofs can delete.
beginDeletion(forgedProof, 'Example')
// @ts-expect-error A list uses its proof's subject, with no request id beside it.
listProjects(forgedProof, workspaceId)
// @ts-expect-error Missing role is rejected.
const missingRole: RoleCells = { owner: 'ALLOWED' }
// @ts-expect-error Unknown role is rejected.
const extraRole: RoleCells = { owner: 'ALLOWED', member: 'ALLOWED', administrator: 'ALLOWED' }
// @ts-expect-error A role refusal is a 403, never the subject's 404.
const wrongRoleCode: RoleCells = { owner: 'ALLOWED', member: 'PROJECT_NOT_FOUND' }
// @ts-expect-error The parameter owns its malformed code.
const malformed: Malformed<'workspaceId'> = { workspaceId: 'PROJECT_NOT_FOUND' }
// @ts-expect-error Connection management names its Workspace.
admitInstallationAdministrator(gate, { action: 'connection.manage' })
// @ts-expect-error A deleting Project has no fake live revision.
const deleting: ProjectDetail = { projectId, workspaceId, name: 'Example', state: 'deleting', projectRevision: revision }
// @ts-expect-error Owner-set commands carry the locked owner rows.
const missingOwners: WorkspaceScope<'members.manage'> = { kind: 'workspace', accountId, workspaceId, role: 'owner', action: 'members.manage' }
// @ts-expect-error A system proof cannot become an executor-owned run proof.
const forgedRun: Admitted<RunScope> = systemProof

// @ts-expect-error Read admission cannot authorize deletion.
admitProject(gate, { projectId, action: 'project.delete' })
// @ts-expect-error Read admission cannot manage the owner set.
admitWorkspace(gate, { workspaceId, action: 'members.manage' })
