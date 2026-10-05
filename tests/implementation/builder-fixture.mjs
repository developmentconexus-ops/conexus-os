import { randomUUID } from 'node:crypto'
import { query } from './hub-database.mjs'
import { HEAD, ID, setupProjects } from './project-fixture.mjs'

export const OWNER = '0f000000-0000-4000-8000-000000000a01'
export const OTHER_OWNER = '0f000000-0000-4000-8000-000000000a02'

// The Project fixture of part 3 plus the Builder rows a run needs, written by the administrator connection.
export const setupBuilder = async (t, prefix) => {
  const fixture = await setupProjects(t, prefix)
  const { connection } = fixture
  const seedBuilderProject = async (name = 'Atlas', workspaceId = ID.workspace) => {
    const projectId = await fixture.seedProject(name, workspaceId)
    return projectId
  }
  // A run row as it stands in a given state; `owner` and `heartbeatAgoMs` are for the executor's rows.
  const seedRun = async (projectId, { accountId = ID.owner, state = 'RUNNING', phase = null, owner = OWNER, conversationId = projectId, createdAgoMs = 0, candidate = null, result = null } = {}) => {
    const builderRunId = randomUUID()
    await query(connection, `INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, idempotency_digest, request_digest, base_source_revision,
        state, phase, owner_id, heartbeat_at, started_at, candidate_revision, result_source_revision, created_at, result_kind, failure_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), CASE WHEN $8 = 'QUEUED' THEN NULL ELSE now() END, $11, $12, clock_timestamp() - ($13 || ' milliseconds')::interval,
        CASE WHEN $8 = 'SUCCEEDED' THEN 'RESPONSE_ONLY' END, CASE $8 WHEN 'FAILED' THEN 'INTERNAL_UNEXPECTED' WHEN 'INTERRUPTED' THEN 'HUB_RESTART' END)`,
    [builderRunId, projectId, accountId, conversationId, randomUUID().replaceAll('-', '').repeat(2), '1'.repeat(64), HEAD, state, phase, state === 'QUEUED' ? null : owner, candidate, result, String(createdAgoMs)])
    return builderRunId
  }
  const runRow = async (builderRunId) => (await query(connection, `SELECT state, phase, owner_id, failure_code, result_kind, candidate_revision, result_source_revision,
    cancellation_requested_at IS NOT NULL AS cancellation_requested, cancellation_reason FROM builder.builder_run WHERE builder_run_id = $1`, [builderRunId])).rows[0]
  return { ...fixture, seedBuilderProject, seedRun, runRow }
}
