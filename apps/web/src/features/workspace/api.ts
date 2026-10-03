import { hubCall } from '../../app/http'
import type {
  CreateWorkspaceInput,
  CreateWorkspaceResponse,
} from '../../generated/workspace-client'
import { workspaceClient } from '../../generated/workspace-client'

export async function createWorkspace(
  input: CreateWorkspaceInput,
  idempotencyKey: string,
): Promise<CreateWorkspaceResponse> {
  const response = await hubCall(workspaceClient.createWorkspace(input, idempotencyKey), 201)
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return response.json() as Promise<CreateWorkspaceResponse>
}
