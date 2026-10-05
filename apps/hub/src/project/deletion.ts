import { z } from 'zod'
import { WorkspaceId, type AccountId, type ProjectId as ProjectIdType } from '../../../../packages/contract/dist/index.js'
import { BUILDER_RUN_STATES } from '../generated/builder-run-vocabulary.js'
import { admitInstallationAdministrator, admitSystem, type Admitted, type SystemScope, type WorkspaceScope } from '../identity-access/admission.js'
import type { Database, WriteTx } from '../platform/db.js'
import { sql } from '../platform/db.js'
import { Failure } from '../platform/failure.js'

// The application's Preview data, the E2B VMs of the Project's conversations and the Project's
// repository in the Conexus Git, torn down once the tombstone names the Project. Each is idempotent
// by the Project id, so a retry after a crash repeats a finished step for free instead of refusing
// it. The VMs are killed before the purge, which drops the rows that name them; a VM that fails to
// die is logged, not a failed deletion.
/** The Builder's two writes on the Project transactions: each takes the proof of its own job, which is its check. */
export type BuilderProjectPorts = Readonly<{
  register(proof: Admitted<WorkspaceScope<'project.create'>>, projectId: ProjectIdType): Promise<void>
  purge(proof: Admitted<SystemScope<'project-purge'>>, projectId: ProjectIdType): Promise<void>
}>

export type ProjectDeletionPorts = Readonly<{
  releaseApplicationData(projectId: ProjectIdType): Promise<void>
  killSandboxes(projectId: ProjectIdType): Promise<void>
  deleteRepository(projectId: ProjectIdType): Promise<void>
}>

type DeleteProjectInput = Readonly<{ accountId: AccountId; projectId: ProjectIdType; confirmName: string }>

const Tombstone = z.object({ name: z.string(), completed_at: z.date().nullable() })
const Target = z.object({ workspace_id: WorkspaceId, name: z.string() })
const Present = z.object({ present: z.literal(1) })

const tombstoneOf = (tx: WriteTx, projectId: ProjectIdType) => tx.maybe(Tombstone, sql`
  SELECT name, completed_at FROM project.project_deletion WHERE project_id = ${projectId}`)

const SETTLED_RUN_STATES = BUILDER_RUN_STATES.filter((state) => state !== 'QUEUED' && state !== 'RUNNING')

const busy = async (tx: WriteTx, projectId: ProjectIdType): Promise<boolean> => (await tx.maybe(Present, sql`
  SELECT 1 AS present FROM builder.builder_run WHERE project_id = ${projectId} AND state <> ALL(${SETTLED_RUN_STATES}::text[]) LIMIT 1`)) !== null

const settled = (tombstone: z.output<typeof Tombstone>, confirmName: string): Readonly<{ completed: boolean }> => {
  if (tombstone.name !== confirmName) throw new Failure('PROJECT_NAME_MISMATCH')
  return { completed: tombstone.completed_at !== null }
}

export const createProjectDeletion = ({ database, ports, builder }: Readonly<{ database: Database; ports: ProjectDeletionPorts; builder: BuilderProjectPorts }>) => {
  // The administrator's own transaction: account, tenure, then the project row, so a command admitted
  // on the project and this tombstone serialize on that row.
  const begin = ({ accountId, projectId, confirmName }: DeleteProjectInput) => database.transaction(accountId, async (gate) => {
    const administrator = await admitInstallationAdministrator(gate, 'project.delete')
    const tx = administrator.tx
    const existing = await tombstoneOf(tx, projectId)
    if (existing) return settled(existing, confirmName)
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

  const removeProject = async (proof: Admitted<SystemScope<'project-purge'>>, projectId: ProjectIdType) => {
    const { tx } = proof
    // The purge takes the project row first, like every admission that reaches it; a retry after the row is gone goes on.
    await tx.maybe(Present, sql`SELECT 1 AS present FROM project.project WHERE project_id = ${projectId} FOR UPDATE`)
    if (!(await tombstoneOf(tx, projectId))) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'PROJECT_DELETION_NOT_STARTED' } })
    if (await busy(tx, projectId)) throw new Failure('PROJECT_BUSY')
    await tx.run(sql`SELECT iam.purge_project(${projectId})`)
    await tx.run(sql`SELECT connector.purge_project(${projectId})`)
    await tx.run(sql`SELECT reg.purge_project(${projectId})`)
    await builder.purge(proof, projectId)
    await tx.run(sql`DELETE FROM platform.operation_receipt WHERE operation_id = 'PRJ-03' AND resource_id = ${projectId}`)
    await tx.run(sql`DELETE FROM project.project WHERE project_id = ${projectId}`)
    await tx.run(sql`UPDATE project.project_deletion SET purged_at = coalesce(purged_at, now()) WHERE project_id = ${projectId}`)
  }

  const purge = (projectId: ProjectIdType) => database.system('project-purge', async (gate) => removeProject(await admitSystem(gate, 'project-purge'), projectId))

  const complete = (projectId: ProjectIdType) => database.system('project-purge', async (gate) => {
    const { tx } = await admitSystem(gate, 'project-purge')
    return tx.run(sql`
      UPDATE project.project_deletion SET completed_at = clock_timestamp() WHERE project_id = ${projectId} AND completed_at IS NULL`)
  })

  // The tombstone is the only step that can refuse: not admitted, not found, the wrong name, or a
  // Project still busy building. Every step after it names the tombstone's own Project id, never the
  // caller's input again, so a retry with the same confirmName resumes instead of refusing.
  const deleteProject = async (input: DeleteProjectInput): Promise<void> => {
    const tombstone = await begin(input)
    if (tombstone.completed) return
    try {
      await ports.releaseApplicationData(input.projectId)
      await ports.killSandboxes(input.projectId)
      await purge(input.projectId)
      await ports.deleteRepository(input.projectId)
      await complete(input.projectId)
    } catch (error) {
      if (error instanceof Failure && error.id === 'PROJECT_BUSY') throw error
      // The caller only sees the row; the step that failed is the cause the exit logs.
      throw new Failure('PROJECT_DELETION_INCOMPLETE', { cause: error, details: { projectId: input.projectId } })
    }
  }

  return Object.freeze({ deleteProject, purge })
}
