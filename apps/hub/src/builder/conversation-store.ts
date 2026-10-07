import { z } from 'zod'
import { OPEN_RUN_STATES } from '../generated/builder-run-vocabulary.js'
import { admitProject } from '../identity-access/admission.js'
import { ConversationId, ProjectId, type AccountId, type BuilderRunId, type SourceRevision } from '@conexus/contract'
import { admitSystem } from '../identity-access/admission.js'
import { sql, type Database } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import { withRun } from './run-lifecycle.js'

const PROVIDER_SANDBOX_ID = /^[A-Za-z0-9_-]{1,128}$/
const SandboxRow = z.object({ provider_sandbox_id: z.string().nullable() })
const RunPlace = z.object({ project_id: ProjectId, conversation_id: ConversationId })
const HeldRun = RunPlace.extend({ owner_id: z.string().nullable() })
const Present = z.object({ present: z.literal(1) })

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
    const writeContent = () => withRun(database, ownerId, builderRunId, { via: 'executor' }, async ({ scope, tx }) => {
      const written = await tx.run(sql`
        INSERT INTO builder.conversation_session AS session (conversation_id, project_id, mirror_head, synced_main)
        SELECT ${conversationId}, run.project_id, ${mirrorHead}, ${syncedMain ?? null}
        FROM builder.builder_run AS run
        WHERE run.builder_run_id = ${scope.builderRunId} AND run.project_id = ${scope.projectId} AND run.conversation_id = ${conversationId}
        ON CONFLICT (conversation_id) DO UPDATE SET
          mirror_head = EXCLUDED.mirror_head,
          synced_main = COALESCE(EXCLUDED.synced_main, session.synced_main)
        WHERE session.project_id = ${scope.projectId}`)
      if (written !== 1) throw refused()
    })
    let refusedNewWork = false
    try {
      await writeContent()
    } catch (error) {
      if (!(error instanceof Failure) || error.id !== 'BUILDER_RUN_NOT_ADMITTED' || !turnEnded) throw error
      refusedNewWork = true
    }
    if (turnEnded) await database.system('builder-executor', async (gate) => {
      const { tx } = await admitSystem(gate, 'builder-executor')
      const place = await tx.maybe(RunPlace, sql`SELECT project_id, conversation_id FROM builder.builder_run WHERE builder_run_id = ${builderRunId}`)
      if (!place || place.conversation_id !== conversationId || !await tx.maybe(Present, sql`SELECT 1 AS present FROM project.project WHERE project_id = ${place.project_id} FOR SHARE`)) throw refused()
      const run = await tx.maybe(HeldRun, sql`
        SELECT project_id, conversation_id, owner_id::text AS owner_id FROM builder.builder_run
        WHERE builder_run_id = ${builderRunId} AND project_id = ${place.project_id} AND state = ANY(${OPEN_RUN_STATES}::text[]) FOR UPDATE`)
      if (run?.owner_id !== ownerId || run.conversation_id !== conversationId) throw refused()
      const written = await tx.run(sql`
        UPDATE builder.conversation_session SET last_turn_ended_at = COALESCE(last_turn_ended_at, clock_timestamp())
        WHERE project_id = ${place.project_id} AND conversation_id = ${conversationId}`)
      if (written !== 1) throw refused()
    })
    if (refusedNewWork) return
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
    return database.read(accountId, async (gate) => {
      const proof = await admitProject(gate, { projectId, action: 'project.read' })
      return (await proof.tx.maybe(SandboxRow, sql`
      SELECT provider_sandbox_id FROM builder.conversation_session
      WHERE conversation_id = ${conversationId} AND project_id = ${proof.scope.projectId}`))?.provider_sandbox_id ?? null
    })
  },
  readProjectSandboxes: (projectId) => database.system('project-purge', async (gate) => {
    const { tx } = await admitSystem(gate, 'project-purge')
    const rows = await tx.rows(SandboxRow, sql`
      SELECT provider_sandbox_id FROM builder.conversation_session
      WHERE project_id = ${projectId} AND provider_sandbox_id IS NOT NULL ORDER BY provider_sandbox_id`)
    return rows.flatMap((row) => (row.provider_sandbox_id === null ? [] : [row.provider_sandbox_id]))
  }),
})
