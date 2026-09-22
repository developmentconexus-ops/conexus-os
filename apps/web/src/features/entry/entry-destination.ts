type WorkspaceRef = Readonly<{ workspaceId: string }>

export type EntryDestination =
  | Readonly<{ kind: 'create-workspace' }>
  | Readonly<{ kind: 'workspace'; workspaceId: string }>
  | Readonly<{ kind: 'choose-workspace' }>

// Where "/" sends a signed-in person: the only Workspace, the last one used if it is still theirs,
// otherwise the list. Signed-out people never reach this; they go straight to sign-in.
export function entryDestination(workspaces: readonly WorkspaceRef[], lastWorkspaceId: string | null): EntryDestination {
  if (workspaces.length === 0) return { kind: 'create-workspace' }
  const only = workspaces.length === 1 ? workspaces[0] : undefined
  if (only) return { kind: 'workspace', workspaceId: only.workspaceId }
  const last = workspaces.find((workspace) => workspace.workspaceId === lastWorkspaceId)
  return last ? { kind: 'workspace', workspaceId: last.workspaceId } : { kind: 'choose-workspace' }
}

const LAST_WORKSPACE_KEY = 'conexus-last-workspace'

// A convenience only: the server still decides what the person may open.
export function readLastWorkspace(): string | null {
  try {
    return window.localStorage.getItem(LAST_WORKSPACE_KEY)
  } catch {
    return null
  }
}

export function rememberWorkspace(workspaceId: string): void {
  try {
    window.localStorage.setItem(LAST_WORKSPACE_KEY, workspaceId)
  } catch {
    // Private windows may refuse storage; the list is the fallback.
  }
}
