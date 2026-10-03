import type { QueryResultRow } from 'pg'
import type { PostgresPool } from '../platform/postgres.js'
import { logger, recordFailure } from '../platform/logger.js'
import { projectError, projectErrorCode } from './errors.js'

// The application's Preview data, the E2B VMs of the Project's conversations and the Project's
// repository in the Conexus Git, torn down once the tombstone names the Project. Each is idempotent
// by the Project id, so a retry after a crash repeats a finished step for free instead of refusing
// it. The VMs are killed before the purge, which drops the rows that name them; a VM that fails to
// die is logged, not a failed deletion.
export type ProjectDeletionPorts = Readonly<{
  releaseApplicationData(projectId: string): Promise<void>
  killSandboxes(projectId: string): Promise<void>
  deleteRepository(projectId: string): Promise<void>
}>

export type DeleteProjectInput = Readonly<{ accountId: string; projectId: string; confirmName: string }>

type TombstoneRow = QueryResultRow & Readonly<{
  project_id: string
  completed_at: string | null
}>

const errorText = (error: unknown): string => error instanceof Error ? error.message : ''
const isNotAdmitted = (error: unknown): boolean =>
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '42501'

export const createProjectDeletionOrchestrator = ({ commandPool, ports }: Readonly<{
  commandPool: PostgresPool
  ports: ProjectDeletionPorts
}>) => {
  const begin = async (input: DeleteProjectInput): Promise<TombstoneRow> => {
    const client = await commandPool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<TombstoneRow>(
        'SELECT * FROM project.begin_project_deletion($1, $2, $3)',
        [input.accountId, input.projectId, input.confirmName],
      )
      const row = result.rows[0]
      if (!row) throw projectError('OUTCOME_UNKNOWN')
      await client.query('COMMIT')
      return row
    } catch (error) {
      await client.query('ROLLBACK')
      if (isNotAdmitted(error)) throw projectError('AUTHORIZATION_DENIED')
      const text = errorText(error)
      if (text.startsWith('PROJECT_NOT_FOUND')) throw projectError('PROJECT_NOT_FOUND')
      if (text.startsWith('PROJECT_NAME_MISMATCH')) throw projectError('PROJECT_NAME_MISMATCH')
      if (text.startsWith('PROJECT_BUSY')) throw projectError('PROJECT_BUSY')
      throw error
    } finally {
      client.release()
    }
  }

  const purge = async (projectId: string): Promise<void> => {
    const client = await commandPool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT project.purge_project($1)', [projectId])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      if (errorText(error).startsWith('PROJECT_BUSY')) throw projectError('PROJECT_BUSY')
      throw error
    } finally {
      client.release()
    }
  }

  const complete = async (projectId: string): Promise<void> => {
    const client = await commandPool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT project.complete_project_deletion($1)', [projectId])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  // The tombstone is the only step that can refuse: not admitted, not found, the wrong name, or a
  // Project still busy building. Every step after it names the tombstone's own Project id, never the
  // caller's input again, so a retry with the same confirmName resumes instead of refusing.
  const deleteProject = async (input: DeleteProjectInput): Promise<void> => {
    const tombstone = await begin(input)
    if (tombstone.completed_at) return
    try {
      await ports.releaseApplicationData(tombstone.project_id)
      await ports.killSandboxes(tombstone.project_id)
      await purge(tombstone.project_id)
      await ports.deleteRepository(tombstone.project_id)
      await complete(tombstone.project_id)
    } catch (error) {
      if (projectErrorCode(error) === 'PROJECT_BUSY') throw error
      // The caller only ever sees DELETION_INCOMPLETE, so the step that failed is logged here.
      recordFailure(logger, 'PROJECT_DELETION_INCOMPLETE', error, { 'conexus.project_id': tombstone.project_id })
      throw projectError('DELETION_INCOMPLETE')
    }
  }

  return Object.freeze({ deleteProject })
}
