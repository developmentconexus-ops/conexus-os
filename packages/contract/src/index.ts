export * from './ids.js'
export * from './builder.js'
export * from './failures.generated.js'
export * from './failure-client.js'
export * from './identity-access.js'
export * from './connectors.js'
export * from './model-account.js'
export * from './operation.js'
export * from './problem.js'
export * from './project.js'
export type { Result } from './result.js'
export * from './workspace.js'

import { listWorkspaceConnections, createWorkspaceConnection, checkWorkspaceConnection, disableWorkspaceConnection, listProjectConnectionBindings, bindProjectConnection, unbindProjectConnection } from './connectors.js'
import { listProjects, getProject, createProject, deleteProject, listProjectSummaries, getProjectThumbnail } from './project.js'
import { listProjectSourceTree, getProjectSourceFile, getBuilderSession, sendBuilderMessage, cancelBuilderRun, getBuilderRunTrace, compareProjectSourceRevisions, launchBuilderPreview } from './builder.js'
import { getSession, endSession, getWorkspaceRoster, inviteWorkspaceMember, removeWorkspaceMember, cancelWorkspaceInvitation, setWorkspaceMemberRole, getApplicationAccess, grantApplicationAccess, revokeApplicationGrant, cancelApplicationInvitation, listInstallationAdministrators, addInstallationAdministrator, removeInstallationAdministrator } from './identity-access.js'
import { operationRegistry } from './operation.js'
import { createWorkspace } from './workspace.js'
import { listAvailableModels, listModelAccounts, setModelAccountApiKey, startClaudeModelLogin, completeClaudeModelLogin, startCodexModelLogin, pollCodexModelLogin, getGoogleModelConnection, startGoogleModelLogin, completeGoogleModelLogin, getGoogleModelLoginStatus } from './model-account.js'
export const OPERATIONS = operationRegistry({
  getSession,
  endSession,
  getWorkspaceRoster,
  inviteWorkspaceMember,
  removeWorkspaceMember,
  cancelWorkspaceInvitation,
  setWorkspaceMemberRole,
  getApplicationAccess,
  grantApplicationAccess,
  revokeApplicationGrant,
  cancelApplicationInvitation,
  listInstallationAdministrators,
  addInstallationAdministrator,
  removeInstallationAdministrator,
  createWorkspace,
  listProjects,
  getProject,
  createProject,
  deleteProject,
  listProjectSummaries,
  getProjectThumbnail,
  listWorkspaceConnections,
  createWorkspaceConnection,
  checkWorkspaceConnection,
  disableWorkspaceConnection,
  listProjectConnectionBindings,
  bindProjectConnection,
  unbindProjectConnection,
  listProjectSourceTree,
  getProjectSourceFile,
  getBuilderSession,
  sendBuilderMessage,
  cancelBuilderRun,
  getBuilderRunTrace,
  compareProjectSourceRevisions,
  launchBuilderPreview,
  listAvailableModels,
  listModelAccounts,
  setModelAccountApiKey,
  startClaudeModelLogin,
  completeClaudeModelLogin,
  startCodexModelLogin,
  pollCodexModelLogin,
  getGoogleModelConnection,
  startGoogleModelLogin,
  completeGoogleModelLogin,
  getGoogleModelLoginStatus,
})
