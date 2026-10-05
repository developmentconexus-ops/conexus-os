import { z } from 'zod'
import { ConversationId, type AccountId, type ProjectId } from '../../../../packages/contract/dist/index.js'
import { OPEN_RUN_STATES } from '../generated/builder-run-vocabulary.js'
import { admitSystem } from '../identity-access/admission.js'
import { sql, type Database } from '../platform/db.js'
import { RUN_COLUMNS, RunRow, runSummary, type BuilderRunSummary } from './run-row.js'

const ConversationRow = z.object({ conversation_id: ConversationId })
const LIST_LIMIT = { min: 1, max: 50, default: 20 } as const

export type RunReads = Readonly<{
  readBuilderRun(input: Readonly<{ accountId: AccountId; projectId: ProjectId }>): Promise<BuilderRunSummary | null>
  listBuilderRuns(input: Readonly<{ accountId: AccountId; projectId: ProjectId; limit?: number }>): Promise<readonly BuilderRunSummary[]>
  readOpenRunConversations(): Promise<ReadonlySet<string>>
}>

export const createRunReads = ({ database }: Readonly<{ database: Database }>): RunReads => ({
    // The reader's policies show a Project's rows to the accounts that see the Project, so a hidden Project reads as an absence.
    readBuilderRun: ({ accountId, projectId }) => database.read(accountId, async (tx) => {
      const row = await tx.maybe(RunRow, sql`SELECT ${RUN_COLUMNS} FROM builder.builder_run AS run WHERE run.project_id = ${projectId} ORDER BY run.created_at DESC LIMIT 1`)
      return row ? runSummary(row) : null
    }),
    listBuilderRuns: ({ accountId, projectId, limit = LIST_LIMIT.default }) => database.read(accountId, async (tx) => {
      const rows = await tx.rows(RunRow, sql`
        SELECT ${RUN_COLUMNS} FROM builder.builder_run AS run
        WHERE run.account_id = ${accountId} AND run.project_id = ${projectId}
        ORDER BY run.created_at DESC LIMIT ${Math.min(Math.max(limit, LIST_LIMIT.min), LIST_LIMIT.max)}`)
      return rows.map(runSummary)
    }),
    readOpenRunConversations: () => database.system('builder-executor', async (gate) => {
      const { tx } = await admitSystem(gate, 'builder-executor')
      const rows = await tx.rows(ConversationRow, sql`SELECT DISTINCT conversation_id FROM builder.builder_run WHERE state = ANY(${OPEN_RUN_STATES}::text[])`)
      return new Set(rows.map((row) => row.conversation_id))
    }),
})
