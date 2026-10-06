import { z } from 'zod'
import type { AccountId, BuilderRunId, ConversationId, ProjectId, SourceRevision } from '@conexus/contract'
import { admitSystem } from '../identity-access/admission.js'
import { sql, type Database } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import { withRun } from './run-lifecycle.js'

const PROVIDER_SANDBOX_ID = /^[A-Za-z0-9_-]{1,128}$/
const SandboxRow = z.object({ provider_sandbox_id: z.string().nullable() })

export type ConversationStore = Readonly<{
  /** Upserts the mirror head, the synced `main` and the end of a turn, for the conversation the run spoke in. */
  recordConversationSession(input: Readonly<{ builderRunId: BuilderRunId; conversationId: ConversationId; mirrorHead: SourceRevision; syncedMain?: SourceRevision; turnEnded: boolean }>): Promise<void>
  /** The E2B sandbox a conversation's turns resume, by its provider id, recorded by the run that opened it. */
  recordConversationSandbox(input: Readonly<{ builderRunId: BuilderRunId; conversationId: ConversationId; providerSandboxId: string }>): Promise<void>
  readConversationSandbox(input: Readonly<{ accountId: AccountId; projectId: ProjectId; conversationId: ConversationId }>): Promise<string | null>
  readProjectSandboxes(projectId: ProjectId): Promise<readonly string[]>
}>

const refused = (): Failure => new Failure('BUILDER_CONVERSATION_SESSION_REFUSED')

// A session row is the run's own conversation in the run's own Project, so one statement checks both against the run row the proof names.
export const createConversationStore = ({ database, ownerId }: Readonly<{ database: Database; ownerId: string }>): ConversationStore => ({
  recordConversationSession: async ({ builderRunId, conversationId, mirrorHead, syncedMain, turnEnded }) => {
    await withRun(database, ownerId, builderRunId, { via: 'executor' }, async ({ scope, tx }) => {
      const written = await tx.run(sql`
        INSERT INTO builder.conversation_session AS session (conversation_id, project_id, mirror_head, synced_main, last_turn_ended_at)
        SELECT ${conversationId}, run.project_id, ${mirrorHead}, ${syncedMain ?? null}, CASE WHEN ${turnEnded}::boolean THEN clock_timestamp() END
        FROM builder.builder_run AS run
        WHERE run.builder_run_id = ${scope.builderRunId} AND run.project_id = ${scope.projectId} AND run.conversation_id = ${conversationId}
        ON CONFLICT (conversation_id) DO UPDATE SET
          mirror_head = EXCLUDED.mirror_head,
          synced_main = COALESCE(EXCLUDED.synced_main, session.synced_main),
          last_turn_ended_at = COALESCE(EXCLUDED.last_turn_ended_at, session.last_turn_ended_at)
        WHERE session.project_id = ${scope.projectId}`)
      if (written !== 1) throw refused()
    })
  },
  recordConversationSandbox: async ({ builderRunId, conversationId, providerSandboxId }) => {
    if (!PROVIDER_SANDBOX_ID.test(providerSandboxId)) throw refused()
    await withRun(database, ownerId, builderRunId, { via: 'executor' }, async ({ scope, tx }) => {
      const written = await tx.run(sql`
        INSERT INTO builder.conversation_session AS session (conversation_id, project_id, provider_sandbox_id)
        SELECT ${conversationId}, run.project_id, ${providerSandboxId}
        FROM builder.builder_run AS run
        WHERE run.builder_run_id = ${scope.builderRunId} AND run.project_id = ${scope.projectId} AND run.conversation_id = ${conversationId}
        ON CONFLICT (conversation_id) DO UPDATE SET provider_sandbox_id = EXCLUDED.provider_sandbox_id
        WHERE session.project_id = ${scope.projectId}`)
      if (written !== 1) throw refused()
    })
  },
  readConversationSandbox: async ({ accountId, projectId, conversationId }) => {
    return database.read(accountId, async (tx) => (await tx.maybe(SandboxRow, sql`
      SELECT provider_sandbox_id FROM builder.conversation_session
      WHERE conversation_id = ${conversationId} AND project_id = ${projectId}`))?.provider_sandbox_id ?? null)
  },
  readProjectSandboxes: (projectId) => database.system('project-purge', async (gate) => {
    const { tx } = await admitSystem(gate, 'project-purge')
    const rows = await tx.rows(SandboxRow, sql`
      SELECT provider_sandbox_id FROM builder.conversation_session
      WHERE project_id = ${projectId} AND provider_sandbox_id IS NOT NULL ORDER BY provider_sandbox_id`)
    return rows.flatMap((row) => (row.provider_sandbox_id === null ? [] : [row.provider_sandbox_id]))
  }),
})
