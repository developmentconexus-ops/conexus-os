import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { runHubMigrations } from '../../scripts/run-hub-migrations.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

const { Client } = pg
const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_TEST_CONFIG_${name}`)
  return value
}
const adminConnection = {
  host: required('CONEXUS_TEST_DB_HOST'),
  port: Number(required('CONEXUS_TEST_DB_PORT')),
  database: required('CONEXUS_TEST_DB_NAME'),
  user: required('CONEXUS_TEST_DB_USER'),
  password: required('CONEXUS_TEST_DB_PASSWORD'),
}
const quoteIdentifier = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`UNSAFE_TEST_IDENTIFIER_${value}`)
  return `"${value}"`
}
const connectionString = ({ host, port, database, user, password }) => {
  const url = new URL('postgresql://localhost')
  url.hostname = host
  url.port = String(port)
  url.pathname = `/${encodeURIComponent(database)}`
  url.username = user
  url.password = password
  return url.toString()
}
const query = async (connection, statement, values = []) => {
  const client = new Client(connection)
  await client.connect()
  try {
    return await client.query(statement, values)
  } finally {
    await client.end()
  }
}

// This exercises project.list_project_summaries_with_activity(), the S3/R1 single query the
// project-summaries route reads: sort by most recent activity, the lastActivityAt fallback to a
// Project's own created_at when it has no Builder run yet, the latestRun shape, hasPreview, and
// the Workspace authority boundary list_project_summaries already proves for its sibling reads.
test('real PostgreSQL proves project-summaries activity ordering, fallback, and authority', async (t) => {
  await refuseProtectedCluster()
  const database = `conexus_project_summary_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 10)}`
  const admin = new Client(adminConnection)
  await admin.connect()
  await admin.query(`CREATE DATABASE ${quoteIdentifier(database)}`)
  await admin.end()
  const fresh = { ...adminConnection, database }

  t.after(async () => {
    const cleanup = new Client(adminConnection)
    await cleanup.connect()
    try {
      await cleanup.query('ALTER ROLE hub_project_read PASSWORD NULL').catch(() => {})
      await cleanup.query(`DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`)
    } finally {
      await cleanup.end()
    }
  })

  await runHubMigrations({ connectionString: connectionString(fresh) })

  const accountId = '10000000-0000-4000-8000-000000000091'
  const otherAccountId = '10000000-0000-4000-8000-000000000092'
  const workspaceId = '20000000-0000-4000-8000-000000000091'
  const otherWorkspaceId = '20000000-0000-4000-8000-000000000092'
  // No Builder run yet: falls back to its own created_at, older than the other two Projects'
  // Builder activity, so it sorts last.
  const staleProjectId = '30000000-0000-4000-8000-000000000091'
  // A Builder run in progress and no Preview yet.
  const runningProjectId = '30000000-0000-4000-8000-000000000092'
  // A succeeded run with source changes and a good Preview.
  const readyProjectId = '30000000-0000-4000-8000-000000000093'
  const crossWorkspaceProjectId = '30000000-0000-4000-8000-000000000094'
  const head = 'a'.repeat(40)

  await query(fresh, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES
    ($1, 'https://issuer.test', 'summary-reader', 'Summary Reader'),
    ($2, 'https://issuer.test', 'summary-other', 'Summary Other')`, [accountId, otherAccountId])
  await query(fresh, `INSERT INTO workspace.workspace(workspace_id, name) VALUES
    ($1, 'Summary Workspace'), ($2, 'Other Workspace')`, [workspaceId, otherWorkspaceId])
  await query(fresh, `INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES
    ($1, $2, 'owner'), ($3, $4, 'owner')`, [accountId, workspaceId, otherAccountId, otherWorkspaceId])
  await query(fresh, `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision, created_at) VALUES
    ($1, $5, 'Stale Project', 'NEW', $6, 'revision-stale', TIMESTAMPTZ '2026-01-01T00:00:00Z'),
    ($2, $5, 'Running Project', 'NEW', $6, 'revision-running', TIMESTAMPTZ '2026-01-02T00:00:00Z'),
    ($3, $5, 'Ready Project', 'NEW', $6, 'revision-ready', TIMESTAMPTZ '2026-01-03T00:00:00Z'),
    ($4, $7, 'Cross Workspace', 'NEW', $6, 'revision-cross', TIMESTAMPTZ '2026-01-04T00:00:00Z')`,
  [staleProjectId, runningProjectId, readyProjectId, crossWorkspaceProjectId, workspaceId, head, otherWorkspaceId])
  await query(fresh, `INSERT INTO builder.project_working_state(project_id, working_source_revision, last_preview_source_revision, last_preview_artifact_revision_id, last_preview_artifact_digest) VALUES
    ($1, $3, NULL, NULL, NULL), ($2, $3, $3, $4, $5)`,
  [runningProjectId, readyProjectId, head, randomUUID(), 'b'.repeat(64)])
  await query(fresh, `INSERT INTO builder.builder_run(
    builder_run_id, project_id, account_id, conversation_id, idempotency_digest, request_digest, mode, base_source_revision,
    expected_working_version, base_working_version, state, result_kind, result_source_revision, created_at
  ) VALUES
    ($1, $4, $5, $12, $7, $10, 'BUILD', $11, 0, 0, 'RUNNING', NULL, NULL, TIMESTAMPTZ '2026-02-01T00:00:00Z'),
    ($2, $6, $5, $13, $8, $10, 'BUILD', $11, 0, 0, 'SUCCEEDED', 'SOURCE_CHANGED', $11, TIMESTAMPTZ '2026-02-02T00:00:00Z'),
    ($3, $6, $5, $13, $9, $10, 'BUILD', $11, 0, 0, 'FAILED', 'SOURCE_CHANGED_BUILD_FAILED', NULL, TIMESTAMPTZ '2026-02-03T00:00:00Z')`,
  [randomUUID(), randomUUID(), randomUUID(), runningProjectId, accountId, readyProjectId, '7'.repeat(64), '8'.repeat(64), '9'.repeat(64), 'c'.repeat(64), head,
    `conexus-builder:${runningProjectId}`, `conexus-builder:${readyProjectId}`])

  const readPassword = 'summary-activity-read-test-only'
  await query(fresh, `ALTER ROLE hub_project_read PASSWORD '${readPassword}'`)
  const read = new Client({ ...fresh, user: 'hub_project_read', password: readPassword })
  await read.connect()
  try {
    const answer = await read.query('SELECT project.list_project_summaries_with_activity($1, $2) AS value', [accountId, workspaceId])
    const projects = answer.rows[0].value
    assert.deepEqual(projects.map((project) => project.projectId), [readyProjectId, runningProjectId, staleProjectId])
    assert.deepEqual(projects.find((project) => project.projectId === readyProjectId), {
      projectId: readyProjectId, name: 'Ready Project', archived: false,
      lastActivityAt: '2026-02-03T00:00:00.000Z',
      latestRun: { state: 'FAILED', resultKind: 'SOURCE_CHANGED_BUILD_FAILED' },
      hasPreview: true,
    })
    assert.deepEqual(projects.find((project) => project.projectId === runningProjectId), {
      projectId: runningProjectId, name: 'Running Project', archived: false,
      lastActivityAt: '2026-02-01T00:00:00.000Z',
      latestRun: { state: 'RUNNING', resultKind: null },
      hasPreview: false,
    })
    // No Builder run: the Project's own created_at, and no working_state row, so no Preview.
    assert.deepEqual(projects.find((project) => project.projectId === staleProjectId), {
      projectId: staleProjectId, name: 'Stale Project', archived: false,
      lastActivityAt: '2026-01-01T00:00:00.000Z',
      latestRun: null,
      hasPreview: false,
    })

    // The Workspace is the authority boundary, same as list_project_summaries: nothing from the
    // other Workspace leaks in, and a caller with no membership sees nothing at all.
    assert.deepEqual((await read.query('SELECT project.list_project_summaries_with_activity($1, $2) AS value', [accountId, otherWorkspaceId])).rows[0].value, [])
    assert.deepEqual((await read.query('SELECT project.list_project_summaries_with_activity($1, $2) AS value', [otherAccountId, workspaceId])).rows[0].value, [])

    await assert.rejects(read.query('SELECT * FROM builder.builder_run'), /permission denied/)
    await assert.rejects(read.query('SELECT * FROM builder.project_working_state'), /permission denied/)
  } finally {
    await read.end()
  }
})
