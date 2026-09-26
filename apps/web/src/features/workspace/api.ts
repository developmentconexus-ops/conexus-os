import { clearAuthorityCache } from '../../app/query-client'
import type {
  CreateWorkspaceInput,
  CreateWorkspaceResponse,
} from '../../generated/workspace-client'
import { workspaceClient } from '../../generated/workspace-client'

export class WorkspaceRequestError extends Error {
  constructor(readonly status: number | null) {
    super(
      status === null
        ? 'Workspace request did not complete'
        : `Workspace request failed with ${status}`,
    )
  }
}

function reject(response: Response): never {
  if (response.status === 401) clearAuthorityCache()
  throw new WorkspaceRequestError(response.status)
}

export async function createWorkspace(
  input: CreateWorkspaceInput,
  idempotencyKey: string,
): Promise<CreateWorkspaceResponse> {
  let response: Response
  try {
    response = await workspaceClient.createWorkspace(input, idempotencyKey)
  } catch {
    throw new WorkspaceRequestError(null)
  }
  if (response.status !== 201) reject(response)
  return response.json() as Promise<CreateWorkspaceResponse>
}
