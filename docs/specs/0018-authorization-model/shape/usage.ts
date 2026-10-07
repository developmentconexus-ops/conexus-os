import type { AccountId, ProjectId, WorkspaceId } from '@conexus/contract'
import { admitAccount, admitProject, admitWorkspace, readAdministratorFlag } from './admission.js'
import { listProjects, listWorkspaces, readThumbnail, type Database } from './data.js'
export function thumbnail(database: Database, input: Readonly<{ accountId: AccountId; projectId: ProjectId }>) {
  return database.read(input.accountId, async (gate) => readThumbnail(await admitProject(gate, { projectId: input.projectId, action: 'project.read' })))
}
export function projects(database: Database, input: Readonly<{ accountId: AccountId; workspaceId: WorkspaceId }>) {
  return database.read(input.accountId, async (gate) => listProjects(await admitWorkspace(gate, { workspaceId: input.workspaceId, action: 'workspace.read' })))
}
export function session(database: Database, accountId: AccountId) {
  return database.read(accountId, async (gate) => {
    const proof = await admitAccount(gate)
    return { workspaces: await listWorkspaces(proof), administrator: await readAdministratorFlag(proof) }
  })
}

// Authentication callers retain their bound gate API.
export async function served(gate: import('../../../../apps/hub/src/platform/db.js').AuthenticationGate, projectId: ProjectId) {
  const { admitAccount, checkProject, checkApplication } = await import('./admission.js')
  const preview: import('./types.js').Checked<import('./types.js').ProjectScope<'project.read'>> = await checkProject(gate, projectId)
  return { account: await admitAccount(gate), preview, application: await checkApplication(gate, projectId) }
}

export function modelStanding(database: Database, accountId: AccountId) {
  return database.read(accountId, async (gate) => {
    const { readModelStanding } = await import('./data.js')
    return readModelStanding(await admitAccount(gate))
  })
}

export function heldCredential(
  database: Database,
  input: Readonly<{ builderRunId: import('@conexus/contract').BuilderRunId; modelAccountId: import('@conexus/contract').ModelAccountId; owner: import('./types.js').RunOwner }>,
) {
  return database.system('builder-executor', async (gate) => {
    const { admitRun } = await import('./admission.js')
    const { readRunCredential } = await import('./data.js')
    return readRunCredential(await admitRun(gate, input.builderRunId, input.owner), input.modelAccountId)
  })
}

// Revocation can refuse heldCredential. The owner can still commit a terminal failure.
export function closeRevokedRun(
  lifecycle: import('./run.js').RunLifecycle,
  builderRunId: import('@conexus/contract').BuilderRunId,
) {
  return lifecycle.failBuilderRun({ builderRunId, failureCode: 'BUILDER_RUN_NOT_ADMITTED' })
}

// preview-state.ts:79-82 command callback moves in U3; its normal reads move in U4.
export function previewCommand(database: Database, accountId: AccountId, projectId: ProjectId) {
  return database.transaction(accountId, (gate) => admitProject(gate, { projectId, action: 'project.build' }))
}

// The existing createRunSteps boundary consumes Pick<BuilderRegistry, 'retain'>.
export function settleAdmittedCandidate(
  registry: Pick<import('./run.js').BuilderRegistry, 'retain'>,
  proof: import('./types.js').Admitted<import('./types.js').SystemScope<'builder-executor'>>,
  input: Parameters<import('./run.js').RetainCandidate>[1],
) {
  return registry.retain(proof, input)
}
