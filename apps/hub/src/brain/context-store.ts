import type { PostgresPool } from '../platform/postgres.js'
import type { ProjectBrainContextPorts } from './context.js'

type BasisPort = ProjectBrainContextPorts['basis']

const databaseCode = (error: unknown): string | undefined => error && typeof error === 'object' &&
  'code' in error && typeof error.code === 'string' ? error.code : undefined

export const createProjectBrainContextBasisPort = (pool: PostgresPool): BasisPort => Object.freeze({
  load: async ({ accountId, projectId }) => {
    try {
      const result = await pool.query('SELECT * FROM brn.get_project_brain_basis($1, $2)', [accountId, projectId])
      const row = result.rows[0]
      if (!row) return { status: 'NOT_FOUND' }
      if (result.rows.length !== 1) return { status: 'UNAVAILABLE' }
      return {
        status: 'FOUND',
        value: {
          authorization: { projectRead: true, brainRead: true, projectBuild: false },
          binding: {
            projectId: row.project_id,
            workspaceId: row.workspace_id,
            brainRevisionId: row.brain_revision_id,
            brainDigest: row.brain_digest,
            projectBindingDigest: row.project_binding_digest,
            validationState: row.validation_state,
            updateAvailable: row.update_available,
            currentProjectSourceRevision: row.current_project_source_revision,
            validationCandidate: row.validation_candidate,
          },
          revision: {
            brainRevisionId: row.brain_revision_id,
            brainDigest: row.brain_digest,
            sourceRevision: row.revision_source_revision,
            availability: 'AVAILABLE',
            payload: row.revision_payload,
          },
          health: {
            brainRevisionId: row.brain_revision_id,
            brainDigest: row.brain_digest,
            healthSnapshotDigest: row.health_snapshot_digest,
            items: row.health_items,
          },
        },
      }
    } catch (error) {
      const code = databaseCode(error)
      if (code === '42501') return { status: 'DENIED' }
      if (code === 'P0002' || code === '22P02') return { status: 'NOT_FOUND' }
      return { status: 'UNAVAILABLE' }
    }
  },
})
