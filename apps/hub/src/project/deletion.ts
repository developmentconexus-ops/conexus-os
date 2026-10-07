import { z } from 'zod'
import { WorkspaceId, type AccountId, type ProjectId as ProjectIdType } from '@conexus/contract'
import { OPEN_RUN_STATES } from '../generated/builder-run-vocabulary.js'
import { admitInstallationAdministrator, admitSystem, type Admitted, type SystemScope } from '../identity-access/admission.js'
import type { Database, WriteTx } from '../platform/db.js'
import { sql } from '../platform/db.js'
import { Failure } from '../platform/failure.js'

export type ProjectDeletionPorts = Readonly<{
  releaseApplicationData(projectId: ProjectIdType, lost: AbortSignal): Promise<void>
  killSandboxes(projectId: ProjectIdType, lost: AbortSignal): Promise<void>
  deleteRepository(projectId: ProjectIdType, lost: AbortSignal): Promise<void>
  /** Deletes the Project's sessions, handoffs, sign in states, application access and address in the purge transaction. */
  purgeIdentityAccess(proof: Admitted<SystemScope<'project-purge'>>, projectId: ProjectIdType): Promise<void>
  /** Deletes the Project's Connection bindings in the purge transaction, which holds the Project row. */
  purgeConnectorBindings(proof: Admitted<SystemScope<'project-purge'>>, projectId: ProjectIdType): Promise<void>
  purgeRegistry(proof: Admitted<SystemScope<'project-purge'>>, projectId: ProjectIdType): Promise<void>
  /** Deletes the Project's runs, working state and repository marker in the purge transaction, after the registry's rows. */
  purgeBuilder(proof: Admitted<SystemScope<'project-purge'>>, projectId: ProjectIdType): Promise<void>
}>

type DeleteProjectInput = Readonly<{ accountId: AccountId; projectId: ProjectIdType; confirmName: string }>

const Tombstone = z.object({ name: z.string(), completed_at: z.date().nullable() })
const Target = z.object({ workspace_id: WorkspaceId, name: z.string() })
const LockKey = z.object({ lock_key: z.string().regex(/^-?\d+$/) })
const Present = z.object({ present: z.literal(1) })

const tombstoneOf = (tx: WriteTx, projectId: ProjectIdType) => tx.maybe(Tombstone, sql`
  SELECT name, completed_at FROM project.project_deletion WHERE project_id = ${projectId}`)

const busy = async (tx: WriteTx, projectId: ProjectIdType): Promise<boolean> => (await tx.maybe(Present, sql`
  SELECT 1 AS present FROM builder.builder_run WHERE project_id = ${projectId} AND state = ANY(${OPEN_RUN_STATES}::text[]) LIMIT 1`)) !== null

const settled = (tombstone: z.output<typeof Tombstone>, confirmName: string): Readonly<{ completed: boolean }> => {
  if (tombstone.name !== confirmName) throw new Failure('PROJECT_NAME_MISMATCH')
  return { completed: tombstone.completed_at !== null }
}

export function createProjectDeletion({ database, ports }: Readonly<{ database: Database; ports: ProjectDeletionPorts }>) {
  // The administrator's own transaction: account, tenure, then the project row, so a command admitted
  // on the project and this tombstone serialize on that row.
  const begin = ({ accountId, projectId, confirmName }: DeleteProjectInput) => database.transaction(accountId, async (gate) => {
    const administrator = await admitInstallationAdministrator(gate, 'project.delete')
    const tx = administrator.tx
    const existing = await tombstoneOf(tx, projectId)
    if (existing && !(await tx.maybe(Present, sql`SELECT 1 AS present FROM project.project WHERE project_id = ${projectId}`))) {
      if (existing.completed_at === null) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'PROJECT_DELETION_STRANDED' } })
      return settled(existing, confirmName)
    }
    const target = await tx.maybe(Target, sql`SELECT workspace_id, name FROM project.project WHERE project_id = ${projectId} FOR UPDATE`)
    const concurrent = await tombstoneOf(tx, projectId)
    if (concurrent) return settled(concurrent, confirmName)
    if (!target) throw new Failure('PROJECT_NOT_FOUND')
    if (target.name !== confirmName) throw new Failure('PROJECT_NAME_MISMATCH')
    if (await busy(tx, projectId)) throw new Failure('PROJECT_BUSY')
    const written = await tx.run(sql`
      INSERT INTO project.project_deletion (project_id, workspace_id, name, requested_by)
      SELECT project_id, workspace_id, name, ${administrator.scope.accountId}::uuid FROM project.project WHERE project_id = ${projectId}`)
    if (written !== 1) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'PROJECT_TOMBSTONE_NOT_WRITTEN' } })
    return { completed: false }
  })

  const finalizeDeletion = async (proof: Admitted<SystemScope<'project-purge'>>, projectId: ProjectIdType) => {
    const { tx } = proof
    // The purge takes the project row first, like every admission that reaches it; a retry after the row is gone goes on.
    const target = await tx.maybe(Present, sql`SELECT 1 AS present FROM project.project WHERE project_id = ${projectId} FOR UPDATE`)
    const deletion = await tombstoneOf(tx, projectId)
    if (deletion?.completed_at) return
    if (!target) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'PROJECT_DELETION_STRANDED' } })
    if (!deletion) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'PROJECT_DELETION_NOT_STARTED' } })
    if (await busy(tx, projectId)) throw new Failure('PROJECT_BUSY')
    await ports.purgeIdentityAccess(proof, projectId)
    await ports.purgeConnectorBindings(proof, projectId)
    await ports.purgeRegistry(proof, projectId)
    await ports.purgeBuilder(proof, projectId)
    await tx.run(sql`DELETE FROM platform.operation_receipt WHERE operation_id = 'createProject' AND resource_id = ${projectId}`)
    await tx.run(sql`DELETE FROM project.project WHERE project_id = ${projectId}`)
    await tx.run(sql`UPDATE project.project_deletion SET purged_at = clock_timestamp(), completed_at = clock_timestamp() WHERE project_id = ${projectId}`)
  }

  const deleteProject = async (input: DeleteProjectInput): Promise<void> => {
    const lockKey = await database.transaction(input.accountId, async (gate) => {
      const { tx } = await admitInstallationAdministrator(gate, 'project.delete')
      return tx.one(LockKey, sql`SELECT hashtextextended(${'conexus-hub:project-deletion:'}::text || ${input.projectId}::text, 0)::text AS lock_key`, 'INTERNAL_UNEXPECTED')
    })
    await database.session('conexus-hub:project-deletion', async (lock, lost) => {
      if (!(await lock.tryAdvisoryLock(BigInt(lockKey.lock_key)))) throw new Failure('PROJECT_BUSY')
      const tombstone = await begin(input)
      if (tombstone.completed) return
      try {
        for (const cleanup of [ports.releaseApplicationData, ports.killSandboxes, ports.deleteRepository]) {
          if (lost.aborted) throw new Failure('PROJECT_DELETION_INCOMPLETE', { cause: lost.reason })
          await cleanup(input.projectId, lost)
        }
        if (lost.aborted) throw new Failure('PROJECT_DELETION_INCOMPLETE', { cause: lost.reason })
        await database.system('project-purge', async (gate) => finalizeDeletion(await admitSystem(gate, 'project-purge'), input.projectId))
      } catch (error) {
        if (error instanceof Failure && error.id === 'PROJECT_BUSY') throw error
        throw new Failure('PROJECT_DELETION_INCOMPLETE', { cause: error, details: { projectId: input.projectId } })
      }
    })
  }

  return Object.freeze({ deleteProject })
}
