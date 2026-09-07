export type RegistryQueryClient = Readonly<{
  query(statement: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}>

export type RegistryBrainRevision = Readonly<{
  brainRevisionId: string
  brainDigest: string
  sourceRevision: string
  availability: 'AVAILABLE'
  payload: unknown
}>

export type RegistryReadPort = Readonly<{
  getWorkspaceBrain(client: RegistryQueryClient, workspaceId: string, admittedWorkspaceIds: readonly string[]): Promise<Readonly<{
    workspaceId: string
    publishedBrainRevisionId: string | null
  }> | null>
  listBrainRevisions(client: RegistryQueryClient, workspaceId: string, admittedWorkspaceIds: readonly string[]): Promise<readonly RegistryBrainRevision[]>
  getBrainRevision(client: RegistryQueryClient, workspaceId: string, brainRevisionId: string, admittedWorkspaceIds: readonly string[]): Promise<RegistryBrainRevision | null>
}>

const revision = (row: Record<string, unknown>): RegistryBrainRevision => ({
  brainRevisionId: String(row.brain_revision_id),
  brainDigest: String(row.brain_digest),
  sourceRevision: String(row.source_revision),
  availability: 'AVAILABLE',
  payload: row.payload,
})

export const createRegistryStore = (): RegistryReadPort => Object.freeze({
  async getWorkspaceBrain(client, workspaceId, admittedWorkspaceIds) {
    const result = await client.query(
      'SELECT * FROM reg.get_workspace_brain($1, $2::uuid[])',
      [workspaceId, admittedWorkspaceIds],
    )
    const row = result.rows[0]
    return row ? {
      workspaceId: String(row.workspace_id),
      publishedBrainRevisionId: row.published_brain_revision_id === null
        ? null
        : String(row.published_brain_revision_id),
    } : null
  },

  async listBrainRevisions(client, workspaceId, admittedWorkspaceIds) {
    const result = await client.query(
      'SELECT * FROM reg.list_brain_revisions($1, $2::uuid[])',
      [workspaceId, admittedWorkspaceIds],
    )
    return result.rows.map(revision)
  },

  async getBrainRevision(client, workspaceId, brainRevisionId, admittedWorkspaceIds) {
    const result = await client.query(
      'SELECT * FROM reg.get_brain_revision($1, $2, $3::uuid[])',
      [workspaceId, brainRevisionId, admittedWorkspaceIds],
    )
    const row = result.rows[0]
    return row ? revision(row) : null
  },
})
