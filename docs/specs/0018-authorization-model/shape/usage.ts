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
  return { account: await admitAccount(gate), preview: await checkProject(gate, projectId), application: await checkApplication(gate, projectId) }
}
