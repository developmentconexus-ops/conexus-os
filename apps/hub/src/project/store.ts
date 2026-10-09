import { randomUUID } from 'node:crypto'
import {
  ProjectId, ProjectRevision, createProject,
  type AccountId, type SourceRevision, type IdempotencyKey, type Input, type ProjectCreated, type ProjectCard, type ProjectDetail, type ProjectListRow, type WorkspaceId,
} from '@conexus/contract'
import { admitProject, admitWorkspace, receiptOf, type Admitted, type WorkspaceScope } from '../identity-access/public.js'
import type { Database } from '../platform/db.js'
import { sql } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import { gitUnavailableAs } from '../platform/git-failure.js'
import { complete, reserve } from '../platform/receipt.js'
import { CardRow, DetailRow, ListRow } from './rows.js'
import { createProjectDeletion } from './deletion.js'
import type { ProjectDeletionPorts } from './deletion.js'

/** What the Builder writes on the Project's creation transaction: its proof is the check. */
export type BuilderProjectPorts = Readonly<{
  register(proof: Admitted<WorkspaceScope<'project.create'>>, projectId: ProjectId): Promise<void>
}>

// Gives a Project that does not exist yet its repository in the Conexus Git, with the starter on
// `main`, and answers `main`. The same Project id always reaches the same repository, so calling it
// again converges.
export type ProjectRepositoryPort = Readonly<{
  prepare(projectId: ProjectId): Promise<SourceRevision>
}>

type CreateProjectInput = Readonly<{
  accountId: AccountId
  workspaceId: WorkspaceId
  idempotencyKey: IdempotencyKey
  body: Input<typeof createProject>['body']
}>
type CreateProjectResult = Readonly<{ replayed: boolean; reply: ProjectCreated }>

export type ProjectStore = Readonly<{
  createProject(input: CreateProjectInput): Promise<CreateProjectResult>
  listProjects(input: Readonly<{ accountId: AccountId; workspaceId: WorkspaceId }>): Promise<ProjectListRow[]>
  getProject(input: Readonly<{ accountId: AccountId; projectId: ProjectId }>): Promise<ProjectDetail | null>
  listProjectSummariesWithActivity(input: Readonly<{ accountId: AccountId; workspaceId: WorkspaceId }>): Promise<ProjectCard[]>
  deleteProject(input: Readonly<{ accountId: AccountId; projectId: ProjectId; confirmName: string }>): Promise<void>
}>

export const createProjectStore = ({
  database,
  repository,
  deletion,
  builder,
  mintRevision = randomUUID,
}: Readonly<{
  database: Database
  repository: ProjectRepositoryPort
  deletion: ProjectDeletionPorts
  builder: BuilderProjectPorts
  mintRevision?: () => string
}>): ProjectStore => {
  const create = async ({ accountId, workspaceId, idempotencyKey, body }: CreateProjectInput): Promise<CreateProjectResult> => {
    // Starting from an existing repository is not offered yet, and never from the host Git path.
    if (body.sourceBootstrap.mode !== 'NEW') throw new Failure('PROJECT_SOURCE_REFUSED')
    const projectRevision = ProjectRevision.parse(mintRevision())
    const receiptInput = { params: { workspaceId }, query: undefined, body }

    // The reserved receipt is the intent: a retry with the same key reaches the same Project id, and
    // so the repository this call may already have created.
    const reserved = await database.transaction(accountId, async (gate) =>
      reserve(receiptOf(await admitWorkspace(gate, { workspaceId, action: 'project.create' })), createProject, idempotencyKey, receiptInput, ProjectId))
    if (reserved.kind === 'replay') return { replayed: true, reply: reserved.reply }
    const projectId = reserved.resourceId

    const starterRevision = await repository.prepare(projectId).catch(gitUnavailableAs('PROJECT_REPOSITORY_UNAVAILABLE'))

    return database.transaction(accountId, async (gate) => {
      const proof = await admitWorkspace(gate, { workspaceId, action: 'project.create' })
      const receipt = await reserve(receiptOf(proof), createProject, idempotencyKey, receiptInput, ProjectId)
      if (receipt.kind === 'replay') return { replayed: true, reply: receipt.reply }
      if (receipt.resourceId !== projectId) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'PROJECT_RECEIPT_RESOURCE_CHANGED' } })
      await proof.tx.run(sql`
        INSERT INTO project.project (project_id, workspace_id, name, source_mode, source_revision, project_revision)
        VALUES (${projectId}, ${workspaceId}, ${body.name}, 'NEW', ${starterRevision}, ${projectRevision})`)
      await builder.register(proof, projectId)
      const reply: ProjectCreated = { projectId, workspaceId, name: body.name, projectRevision, archived: false }
      await complete(receiptOf(proof), createProject, idempotencyKey, receiptInput, projectId, reply)
      return { replayed: false, reply }
    })
  }

  return Object.freeze({
    createProject: create,
    listProjects: ({ accountId, workspaceId }) => database.read(accountId, async (gate) => {
      const proof = await admitWorkspace(gate, { workspaceId, action: 'workspace.read' })
      return [...await proof.tx.rows(ListRow, sql`
        SELECT stored.project_id, stored.workspace_id, stored.name,
          CASE WHEN deletion.project_id IS NULL THEN 'live' ELSE 'deleting' END AS state,
          CASE WHEN deletion.project_id IS NULL THEN stored.archived END AS archived
        FROM project.project AS stored
        LEFT JOIN project.project_deletion AS deletion
          ON deletion.project_id = stored.project_id AND deletion.completed_at IS NULL
        WHERE stored.workspace_id = ${proof.scope.workspaceId} ORDER BY stored.name, stored.project_id`)]
    }),
    getProject: ({ accountId, projectId }) => database.read(accountId, async (gate): Promise<ProjectDetail | null> => {
      const proof = await admitProject(gate, { projectId, action: 'project.read' })
      const live = await proof.tx.maybe(DetailRow, sql`
        SELECT stored.project_id, stored.workspace_id, stored.name,
          CASE WHEN deletion.project_id IS NULL THEN 'live' ELSE 'deleting' END AS state,
          CASE WHEN deletion.project_id IS NULL THEN stored.project_revision END AS project_revision,
          CASE WHEN deletion.project_id IS NULL THEN stored.archived END AS archived
        FROM project.project AS stored
        LEFT JOIN project.project_deletion AS deletion
          ON deletion.project_id = stored.project_id AND deletion.completed_at IS NULL
        WHERE stored.project_id = ${proof.scope.projectId}`)
      return live
    }),
    listProjectSummariesWithActivity: ({ accountId, workspaceId }) => database.read(accountId, async (gate) => {
      const proof = await admitWorkspace(gate, { workspaceId, action: 'workspace.read' })
      return [...await proof.tx.rows(CardRow, sql`
        SELECT * FROM (
          SELECT stored.project_id, stored.name,
            CASE WHEN deletion.project_id IS NULL THEN 'live' ELSE 'deleting' END AS state,
            CASE WHEN deletion.project_id IS NULL THEN stored.archived END AS archived,
            CASE WHEN deletion.project_id IS NULL THEN to_char(coalesce(latest.created_at, stored.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END AS last_activity_at,
            coalesce(latest.created_at, stored.created_at) AS sort_at,
            CASE WHEN deletion.project_id IS NULL THEN latest.state END AS run_state,
            CASE WHEN deletion.project_id IS NULL THEN latest.result_kind END AS run_result_kind,
            deletion.project_id IS NULL AND working.last_preview_source_revision IS NOT NULL AS has_preview
          FROM project.project AS stored
          LEFT JOIN LATERAL (
            SELECT run.state, run.result_kind, run.created_at FROM builder.builder_run AS run
            WHERE run.project_id = stored.project_id ORDER BY run.created_at DESC, run.builder_run_id DESC LIMIT 1
          ) AS latest ON true
          LEFT JOIN builder.project_working_state AS working ON working.project_id = stored.project_id
          LEFT JOIN project.project_deletion AS deletion ON deletion.project_id = stored.project_id AND deletion.completed_at IS NULL
          WHERE stored.workspace_id = ${proof.scope.workspaceId}
        ) AS combined ORDER BY sort_at DESC, project_id`)]
    }),
    deleteProject: createProjectDeletion({ database, ports: deletion }).deleteProject,
  })
}
