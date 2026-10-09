import { BuilderRunId, ConversationId, ProjectId, SourceRevision, type AccountId, type ProjectId as ProjectIdType } from '@conexus/contract'
import { BUILDER_RUN_RESULT_KINDS } from '../generated/builder-run-vocabulary.js'
import { admitProject } from '../identity-access/public.js'
import type { Admitted, ProjectScope } from '../identity-access/public.js'
import { sql, type Database } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import type { BuilderRegistry, ServedLaunch } from './application-build.js'
import { CODE_CHANGING_RESULT_KINDS } from './run-row.js'

type BuilderCodeChangingRun = Readonly<{
  builderRunId: BuilderRunId
  projectId: ProjectIdType
  conversationId: ConversationId
  baseSourceRevision: SourceRevision
  resultSourceRevision: SourceRevision
  resultKind: Exclude<(typeof BUILDER_RUN_RESULT_KINDS)[number], 'RESPONSE_ONLY'>
}>
const CodeChangingRow = z.object({
  builder_run_id: BuilderRunId,
  project_id: ProjectId,
  conversation_id: ConversationId,
  base_source_revision: SourceRevision,
  result_source_revision: SourceRevision,
  result_kind: z.enum(BUILDER_RUN_RESULT_KINDS).exclude(['RESPONSE_ONLY']),
})
export type PreviewState = Readonly<{
  readLatestCodeChangingBuilderRun(input: Readonly<{ accountId: AccountId; projectId: ProjectIdType }>): Promise<BuilderCodeChangingRun | null>
  /** Admits the build, reads the launch and hands both to `open` in the one transaction; null when nothing is built yet. */
  openLaunch<T>(input: Readonly<{ accountId: AccountId; projectId: ProjectIdType }>, open: (proof: Admitted<ProjectScope<'project.build'>>, launch: ServedLaunch) => Promise<T>): Promise<T | null>
  /** `readMain` reads `main` from the Conexus Git, and runs only once the account is known to see the Project. */
  admitSourceRevision(input: Readonly<{ accountId: AccountId; projectId: ProjectIdType; sourceRevision: SourceRevision; readMain(): Promise<SourceRevision> }>): Promise<boolean>
}>

export const createPreviewState = ({ database, registry }: Readonly<{ database: Database; registry: Pick<BuilderRegistry, 'readLaunch' | 'readPreviewSubject'> }>): PreviewState => {
  const latestChange = (proof: Admitted<ProjectScope<'project.read'>, 'read'>) => proof.tx.maybe(CodeChangingRow, sql`
    SELECT run.builder_run_id, run.project_id, run.conversation_id, run.base_source_revision, run.result_source_revision, run.result_kind
    FROM builder.builder_run AS run
    WHERE run.project_id = ${proof.scope.projectId} AND run.result_kind = ANY(${CODE_CHANGING_RESULT_KINDS}::text[]) AND run.result_source_revision IS NOT NULL
    ORDER BY run.created_at DESC, run.builder_run_id DESC LIMIT 1`)
  return {
    readLatestCodeChangingBuilderRun: ({ accountId, projectId }) => database.read(accountId, async (gate) => {
      const proof = await admitProject(gate, { projectId, action: 'project.read' })
      const row = await latestChange(proof)
      return row ? {
        builderRunId: row.builder_run_id,
        projectId: row.project_id,
        conversationId: row.conversation_id,
        baseSourceRevision: row.base_source_revision,
        resultSourceRevision: row.result_source_revision,
        resultKind: row.result_kind,
      } : null
    }),
    openLaunch: ({ accountId, projectId }, open) => database.transaction(accountId, async (gate) => {
      const proof = await admitProject(gate, { projectId, action: 'project.build' })
      const launch = await registry.readLaunch(proof)
      return launch ? open(proof, launch) : null
    }),
    admitSourceRevision: ({ accountId, projectId, sourceRevision, readMain }) =>
      database.read(accountId, async (gate) => {
        const proof = await admitProject(gate, { projectId, action: 'project.read' })
        const { tx, scope } = proof
        if (sourceRevision === await readMain()) return true
        const preview = await registry.readPreviewSubject(proof)
        if (preview.kind === 'READY' && preview.sourceRevision === sourceRevision) return true
        const run = await tx.maybe(z.object({ present: z.literal(1) }), sql`
          SELECT 1 AS present FROM builder.builder_run
          WHERE project_id = ${scope.projectId} AND result_source_revision IS NOT NULL
            AND (base_source_revision = ${sourceRevision} OR result_source_revision = ${sourceRevision})
          LIMIT 1`)
        return run !== null
      }).catch((error: unknown) => {
        if (error instanceof Failure && error.id === 'PROJECT_NOT_FOUND') return false
        throw error
      }),
  }
}
import { z } from 'zod'
