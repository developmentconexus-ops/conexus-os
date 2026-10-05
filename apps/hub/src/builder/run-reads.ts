import { z } from 'zod'
import { ArtifactRevisionId, BuilderRunId, ProjectId, SourceRevision, type AccountId, type BuilderRunId as BuilderRunIdType, type ProjectId as ProjectIdType } from '../../../../packages/contract/dist/index.js'
import { BUILDER_RUN_RESULT_KINDS } from '../generated/builder-run-vocabulary.js'
import { admitProject, admitSystem } from '../identity-access/admission.js'
import { sql, type Database, type TxQueries } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import { OPEN_RUN_STATES } from '../generated/builder-run-vocabulary.js'
import { CODE_CHANGING_RESULT_KINDS, RUN_COLUMNS, RunRow, runSummary, type BuilderRunSummary } from './run-row.js'

type BuilderCodeChangingRun = Readonly<{
  builderRunId: BuilderRunIdType
  projectId: ProjectIdType
  conversationId: string
  baseSourceRevision: SourceRevision
  resultSourceRevision: SourceRevision
  resultKind: Exclude<(typeof BUILDER_RUN_RESULT_KINDS)[number], 'RESPONSE_ONLY'>
}>
/** The Preview a Project serves. `main` is not here: the Conexus Git holds it. */
type BuilderPreview = Readonly<{
  lastPreviewSourceRevision: SourceRevision | null
  lastPreviewArtifactRevisionId: ArtifactRevisionId | null
  lastPreviewArtifactDigest: string | null
}>

const CodeChangingRow = z.object({
  builder_run_id: BuilderRunId,
  project_id: ProjectId,
  conversation_id: z.string(),
  base_source_revision: SourceRevision,
  result_source_revision: SourceRevision,
  result_kind: z.enum(BUILDER_RUN_RESULT_KINDS).exclude(['RESPONSE_ONLY']),
})
const PreviewRow = z.object({
  last_preview_source_revision: SourceRevision.nullable(),
  last_preview_artifact_revision_id: ArtifactRevisionId.nullable(),
  last_preview_artifact_digest: z.string().nullable(),
})
const ConversationRow = z.object({ conversation_id: z.string() })
const LIST_LIMIT = { min: 1, max: 50, default: 20 } as const

export type RunReads = Readonly<{
  readBuilderRun(input: Readonly<{ accountId: AccountId; projectId: ProjectIdType }>): Promise<BuilderRunSummary | null>
  listBuilderRuns(input: Readonly<{ accountId: AccountId; projectId: ProjectIdType; limit?: number }>): Promise<readonly BuilderRunSummary[]>
  readLatestCodeChangingBuilderRun(input: Readonly<{ accountId: AccountId; projectId: ProjectIdType }>): Promise<BuilderCodeChangingRun | null>
  readPreviewSubject(input: Readonly<{ accountId: AccountId; projectId: ProjectIdType }>): Promise<BuilderPreview | null>
  /** The Preview subject of a launch: the account is admitted to build in the Project first, so a person who cannot build gets PROJECT_BUILD_DENIED before any read. */
  readLaunchSubject(input: Readonly<{ accountId: AccountId; projectId: ProjectIdType }>): Promise<BuilderPreview | null>
  /** mainRevision is `main` as the Hub just read it from the Conexus Git. */
  admitSourceRevision(input: Readonly<{ accountId: AccountId; projectId: ProjectIdType; sourceRevision: string; mainRevision: string | null }>): Promise<boolean>
  readOpenRunConversations(): Promise<ReadonlySet<string>>
}>

/** A Project the account cannot see answers as an absence, as the reads always did. */
const absentWhenHidden = <T>(fallback: T) => (error: unknown): T => {
  if (error instanceof Failure && error.id === 'PROJECT_NOT_FOUND') return fallback
  throw error
}

const previewOf = async (tx: TxQueries, projectId: ProjectIdType): Promise<BuilderPreview | null> => {
  const row = await tx.maybe(PreviewRow, sql`
    SELECT last_preview_source_revision, last_preview_artifact_revision_id, last_preview_artifact_digest
    FROM builder.project_working_state WHERE project_id = ${projectId}`)
  return row ? {
    lastPreviewSourceRevision: row.last_preview_source_revision,
    lastPreviewArtifactRevisionId: row.last_preview_artifact_revision_id,
    lastPreviewArtifactDigest: row.last_preview_artifact_digest,
  } : null
}

export const createRunReads = ({ database }: Readonly<{ database: Database }>): RunReads => {
  const latestChange = (tx: TxQueries, projectId: ProjectIdType) => tx.maybe(CodeChangingRow, sql`
    SELECT run.builder_run_id, run.project_id, run.conversation_id, run.base_source_revision, run.result_source_revision, run.result_kind
    FROM builder.builder_run AS run
    WHERE run.project_id = ${projectId} AND run.result_kind = ANY(${CODE_CHANGING_RESULT_KINDS}::text[]) AND run.result_source_revision IS NOT NULL
    ORDER BY run.created_at DESC, run.builder_run_id DESC LIMIT 1`)
  return {
    readBuilderRun: ({ accountId, projectId }) => database.read(accountId, async (tx) => {
      const { scope } = await admitProject(tx, projectId, 'project.read')
      const row = await tx.maybe(RunRow, sql`SELECT ${RUN_COLUMNS} FROM builder.builder_run AS run WHERE run.project_id = ${scope.projectId} ORDER BY run.created_at DESC LIMIT 1`)
      return row ? runSummary(row) : null
    }).catch(absentWhenHidden(null)),
    listBuilderRuns: ({ accountId, projectId, limit = LIST_LIMIT.default }) => database.read(accountId, async (tx) => {
      const { scope } = await admitProject(tx, projectId, 'project.read')
      const rows = await tx.rows(RunRow, sql`
        SELECT ${RUN_COLUMNS} FROM builder.builder_run AS run
        WHERE run.account_id = ${accountId} AND run.project_id = ${scope.projectId}
        ORDER BY run.created_at DESC LIMIT ${Math.min(Math.max(limit, LIST_LIMIT.min), LIST_LIMIT.max)}`)
      return rows.map(runSummary)
    }).catch(absentWhenHidden([])),
    readLatestCodeChangingBuilderRun: ({ accountId, projectId }) => database.read(accountId, async (tx) => {
      const { scope } = await admitProject(tx, projectId, 'project.read')
      const row = await latestChange(tx, scope.projectId)
      return row ? {
        builderRunId: row.builder_run_id,
        projectId: row.project_id,
        conversationId: row.conversation_id,
        baseSourceRevision: row.base_source_revision,
        resultSourceRevision: row.result_source_revision,
        resultKind: row.result_kind,
      } : null
    }).catch(absentWhenHidden(null)),
    readPreviewSubject: ({ accountId, projectId }) => database.read(accountId, async (tx) => {
      const { scope } = await admitProject(tx, projectId, 'project.read')
      return previewOf(tx, scope.projectId)
    }).catch(absentWhenHidden(null)),
    readLaunchSubject: ({ accountId, projectId }) => database.transaction(accountId, async (gate) => {
      const { tx, scope } = await admitProject(gate, projectId, 'project.build')
      return previewOf(tx, scope.projectId)
    }),
    admitSourceRevision: ({ accountId, projectId, sourceRevision, mainRevision }) => {
      const revision = SourceRevision.safeParse(sourceRevision)
      if (!revision.success) return Promise.resolve(false)
      return database.read(accountId, async (tx) => {
        const { scope } = await admitProject(tx, projectId, 'project.read')
        if (revision.data === mainRevision) return true
        const preview = await tx.maybe(z.object({ present: z.literal(1) }), sql`
          SELECT 1 AS present FROM builder.project_working_state WHERE project_id = ${scope.projectId} AND last_preview_source_revision = ${revision.data}`)
        if (preview) return true
        const change = await latestChange(tx, scope.projectId)
        return change !== null && (change.base_source_revision === revision.data || change.result_source_revision === revision.data)
      }).catch(absentWhenHidden(false))
    },
    readOpenRunConversations: () => database.system('builder-executor', async (gate) => {
      const { tx } = await admitSystem(gate, 'builder-executor')
      const rows = await tx.rows(ConversationRow, sql`SELECT DISTINCT conversation_id FROM builder.builder_run WHERE state = ANY(${OPEN_RUN_STATES}::text[])`)
      return new Set(rows.map((row) => row.conversation_id))
    }),
  }
}
