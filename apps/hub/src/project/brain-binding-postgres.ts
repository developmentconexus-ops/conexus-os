import type { PostgresPool } from '../platform/postgres.js'
import type {
  ProjectBrainBindingAttester,
  ProjectBrainBindingProjectPort,
  ProjectBrainBindingReadPort,
  ProjectBrainBindingRegistryPort,
} from './brain-binding.js'

export type ProjectBrainBindingDatabasePorts = Readonly<{
  project: ProjectBrainBindingProjectPort
  binding: ProjectBrainBindingReadPort
  registry: ProjectBrainBindingRegistryPort
  attester: ProjectBrainBindingAttester
}>

export const createProjectBrainBindingDatabasePorts = ({
  bindingPool,
  brainAuthorityPool,
}: Readonly<{
  bindingPool: PostgresPool
  brainAuthorityPool: PostgresPool
}>): ProjectBrainBindingDatabasePorts => Object.freeze({
  project: Object.freeze({
    getBindingContext: async ({ accountId, projectId }: Readonly<{ accountId: string; projectId: string }>) => {
      const result = await bindingPool.query(
        'SELECT * FROM project.admit_brain_binding_preflight($1, $2)',
        [accountId, projectId],
      )
      const row = result.rows[0]
      if (result.rows.length > 1) throw new Error('PROJECT_BRAIN_BINDING_CONTEXT_INVALID')
      return row ? {
        projectId: row.project_id,
        workspaceId: row.workspace_id,
        sourceRevision: row.current_project_source_revision,
        connectionPermitted: row.connection_permitted,
      } : null
    },
  }),
  binding: Object.freeze({
    getCurrent: async ({ accountId, projectId }: Readonly<{ accountId: string; projectId: string }>) => {
      const result = await bindingPool.query(
        'SELECT * FROM project.get_project_brain_binding($1, $2)',
        [accountId, projectId],
      )
      const row = result.rows[0]
      if (result.rows.length > 1) throw new Error('PROJECT_BRAIN_BINDING_PROJECTION_INVALID')
      return row ? {
        projectId: row.project_id,
        workspaceId: row.workspace_id,
        brainRevisionId: row.brain_revision_id,
        brainDigest: row.brain_digest,
        projectBindingDigest: row.project_binding_digest,
        validationState: row.validation_state,
        updateAvailable: row.update_available,
      } : null
    },
  }),
  registry: Object.freeze({
    getRevision: async ({ workspaceId, brainRevisionId }: Readonly<{
      workspaceId: string
      brainRevisionId: string
    }>) => {
      const result = await brainAuthorityPool.query(
        'SELECT * FROM reg.get_project_brain_candidate($1, $2)',
        [workspaceId, brainRevisionId],
      )
      const row = result.rows[0]
      if (result.rows.length > 1) throw new Error('PROJECT_BRAIN_REVISION_PROJECTION_INVALID')
      return row ? {
        brainRevisionId: row.brain_revision_id,
        brainDigest: row.brain_digest,
        payload: row.payload,
      } : null
    },
  }),
  attester: Object.freeze({
    persist: async (input: Readonly<{
      bindingValidationId: string
      projectId: string
      brainRevisionId: string
      brainDigest: string
      projectBindingDigest: string
      candidate: unknown
    }>) => {
      await brainAuthorityPool.query(
        'SELECT brn.persist_binding_validation($1, $2, $3, $4, $5, $6)',
        [input.bindingValidationId, input.projectId, input.brainRevisionId,
          input.brainDigest, input.projectBindingDigest, input.candidate],
      )
    },
  }),
})
