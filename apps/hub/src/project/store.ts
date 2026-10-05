import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  ProjectCard, ProjectId, ProjectName, ProjectRevision, SourceRevision, WorkspaceId, PRJ03,
  type AccountId, type IdempotencyKey, type Input, type ProjectCreated, type ProjectDetail, type ProjectListItem,
} from '../../../../packages/contract/dist/index.js'
import { admitWorkspace } from '../identity-access/admission.js'
import type { Database } from '../platform/db.js'
import { sql } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import { complete, reserve } from '../platform/receipt.js'
import { createProjectDeletion } from './deletion.js'
import type { ProjectDeletionPorts } from './deletion.js'

// Gives a Project that does not exist yet its repository in the Conexus Git, with the starter on
// `main`, and answers `main`. The same Project id always reaches the same repository, so calling it
// again converges.
export type ProjectRepositoryPort = Readonly<{
  prepare(projectId: ProjectId): Promise<string>
}>

type CreateProjectInput = Readonly<{
  accountId: AccountId
  workspaceId: WorkspaceId
  idempotencyKey: IdempotencyKey
  body: Input<typeof PRJ03>['body']
}>
type CreateProjectResult = Readonly<{ replayed: boolean; reply: ProjectCreated }>

export type ProjectStore = Readonly<{
  createProject(input: CreateProjectInput): Promise<CreateProjectResult>
  listProjects(input: Readonly<{ accountId: AccountId; workspaceId: WorkspaceId }>): Promise<ProjectListItem[]>
  getProject(input: Readonly<{ accountId: AccountId; projectId: ProjectId }>): Promise<ProjectDetail | null>
  listProjectSummariesWithActivity(input: Readonly<{ accountId: AccountId; workspaceId: WorkspaceId }>): Promise<ProjectCard[]>
  deleteProject(input: Readonly<{ accountId: AccountId; projectId: ProjectId; confirmName: string }>): Promise<void>
}>

const SummaryRow = z.object({ project_id: ProjectId, workspace_id: WorkspaceId, name: ProjectName, archived: z.boolean() })
const DetailRow = SummaryRow.extend({ project_revision: ProjectRevision, deleting: z.boolean() })
const TombstoneRow = z.object({ project_id: ProjectId, workspace_id: WorkspaceId, name: ProjectName })
const CardRow = z.object({
  project_id: ProjectId, name: ProjectName, archived: z.boolean(), last_activity_at: z.string(),
  run_state: z.string().nullable(), run_result_kind: z.string().nullable(), has_preview: z.boolean(), deleting: z.boolean(),
})

const toProjectCard = (row: z.output<typeof CardRow>): ProjectCard => ProjectCard.parse({
  projectId: row.project_id,
  name: row.name,
  archived: row.archived,
  lastActivityAt: row.last_activity_at,
  latestRun: row.run_state === null ? null : { state: row.run_state, resultKind: row.run_result_kind },
  hasPreview: row.has_preview,
  deleting: row.deleting,
})

// Conexus Git failures are named codes; only the code is kept, and anything else is a failure with no name.
const GIT_FAILURE_NAME = /^(CONEXUS_GIT_[A-Z_]+)$/
const gitFailureName = (error: unknown): string => GIT_FAILURE_NAME.exec(error instanceof Error ? error.message : '')?.[1] ?? 'CONEXUS_GIT_FAILED'

export const createProjectStore = ({
  database,
  repository,
  deletion,
  mintRevision = randomUUID,
}: Readonly<{
  database: Database
  repository: ProjectRepositoryPort
  deletion: ProjectDeletionPorts
  mintRevision?: () => string
}>): ProjectStore => {
  const createProject = async ({ accountId, workspaceId, idempotencyKey, body }: CreateProjectInput): Promise<CreateProjectResult> => {
    // Starting from an existing repository is not offered yet, and never from the host Git path.
    if (body.sourceBootstrap.mode !== 'NEW') throw new Failure('PROJECT_SOURCE_REFUSED')
    const projectRevision = ProjectRevision.parse(mintRevision())
    const receiptInput = { params: { workspaceId }, query: undefined, body }

    // The reserved receipt is the intent: a retry with the same key reaches the same Project id, and
    // so the repository this call may already have created.
    const reserved = await database.transaction(accountId, async (tx) =>
      reserve(await admitWorkspace(tx, accountId, workspaceId, 'project.create'), PRJ03, idempotencyKey, receiptInput, ProjectId))
    if (reserved.kind === 'replay') return { replayed: true, reply: reserved.reply }
    const projectId = reserved.resourceId

    const prepared = await repository.prepare(projectId).catch((error: unknown) => {
      throw new Failure('PROJECT_REPOSITORY_UNAVAILABLE', { cause: error, details: { reason: gitFailureName(error) } })
    })
    const starterRevision = SourceRevision.safeParse(prepared)
    if (!starterRevision.success) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'PROJECT_STARTER_REVISION_UNREADABLE' } })

    return database.transaction(accountId, async (tx) => {
      const proof = await admitWorkspace(tx, accountId, workspaceId, 'project.create')
      const receipt = await reserve(proof, PRJ03, idempotencyKey, receiptInput, ProjectId)
      if (receipt.kind === 'replay') return { replayed: true, reply: receipt.reply }
      if (receipt.resourceId !== projectId) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'PROJECT_RECEIPT_RESOURCE_CHANGED' } })
      await proof.tx.run(sql`
        INSERT INTO project.project (project_id, workspace_id, name, source_mode, source_revision, project_revision)
        VALUES (${projectId}, ${workspaceId}, ${body.name}, 'NEW', ${starterRevision.data}, ${projectRevision})`)
      await proof.tx.run(sql`SELECT builder.register_project_repository(${projectId})`)
      const reply: ProjectCreated = { projectId, workspaceId, name: body.name, projectRevision, archived: false }
      await complete(proof, PRJ03, idempotencyKey, receiptInput, projectId, reply)
      return { replayed: false, reply }
    })
  }

  return Object.freeze({
    createProject,
    listProjects: ({ accountId, workspaceId }) => database.read(accountId, async (tx) =>
      (await tx.rows(SummaryRow, sql`
        SELECT project_id, workspace_id, name, archived FROM project.project
        WHERE workspace_id = ${workspaceId} ORDER BY name, project_id`))
        .map((row) => ({ projectId: row.project_id, workspaceId: row.workspace_id, name: row.name, archived: row.archived }))),
    getProject: ({ accountId, projectId }) => database.read(accountId, async (tx): Promise<ProjectDetail | null> => {
      const live = await tx.maybe(DetailRow, sql`
        SELECT project_id, workspace_id, name, project_revision, archived,
          EXISTS (SELECT 1 FROM project.project_deletion AS deletion
            WHERE deletion.project_id = project.project_id AND deletion.completed_at IS NULL) AS deleting
        FROM project.project WHERE project_id = ${projectId}`)
      if (live) {
        return { projectId: live.project_id, workspaceId: live.workspace_id, name: live.name, projectRevision: live.project_revision, archived: live.archived, deleting: live.deleting }
      }
      const purged = await tx.maybe(TombstoneRow, sql`
        SELECT project_id, workspace_id, name FROM project.project_deletion
        WHERE project_id = ${projectId} AND completed_at IS NULL AND (SELECT iam.acting_installation_administrator())`)
      return purged ? { projectId: purged.project_id, workspaceId: purged.workspace_id, name: purged.name, projectRevision: '', archived: false, deleting: true } : null
    }),
    listProjectSummariesWithActivity: ({ accountId, workspaceId }) => database.read(accountId, async (tx) =>
      (await tx.rows(CardRow, sql`
        SELECT * FROM (
          SELECT stored.project_id, stored.name, stored.archived,
            to_char(coalesce(latest.created_at, stored.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_activity_at,
            coalesce(latest.created_at, stored.created_at) AS sort_at,
            CASE WHEN deletion.project_id IS NULL THEN latest.state END AS run_state,
            CASE WHEN deletion.project_id IS NULL THEN latest.result_kind END AS run_result_kind,
            deletion.project_id IS NULL AND working.last_preview_source_revision IS NOT NULL AS has_preview,
            deletion.project_id IS NOT NULL AS deleting
          FROM project.project AS stored
          LEFT JOIN LATERAL (
            SELECT run.state, run.result_kind, run.created_at FROM builder.builder_run AS run
            WHERE run.project_id = stored.project_id ORDER BY run.created_at DESC, run.builder_run_id DESC LIMIT 1
          ) AS latest ON true
          LEFT JOIN builder.project_working_state AS working ON working.project_id = stored.project_id
          LEFT JOIN project.project_deletion AS deletion ON deletion.project_id = stored.project_id AND deletion.completed_at IS NULL
          WHERE stored.workspace_id = ${workspaceId}
          UNION ALL
          SELECT tombstone.project_id, tombstone.name, false,
            to_char(tombstone.requested_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            tombstone.requested_at, NULL, NULL, false, true
          FROM project.project_deletion AS tombstone
          WHERE tombstone.workspace_id = ${workspaceId} AND tombstone.completed_at IS NULL AND tombstone.purged_at IS NOT NULL
            AND (SELECT iam.acting_installation_administrator())
        ) AS combined ORDER BY sort_at DESC, project_id`)).map(toProjectCard)),
    deleteProject: createProjectDeletion({ database, ports: deletion }).deleteProject,
  })
}
