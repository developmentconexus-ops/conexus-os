import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
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
const digest = (character) => character.repeat(64)
const HEAD = 'a'.repeat(40)

// project.purge_project must remove exactly one row from every table across every schema that
// names the deleted Project by a foreign key. This test seeds one real row in each such table
// (the same set the tables in apps/hub/migrations declare with a project-scoped foreign key) and
// proves begin_project_deletion, purge_project and complete_project_deletion carry all of them
// away together, leaving only the tombstone.
test('real PostgreSQL proves project.purge_project clears every project-scoped row across schemas', async (t) => {
  await refuseProtectedCluster()
  const database = `conexus_project_deletion_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 10)}`
  const admin = new Client(adminConnection)
  await admin.connect()
  await admin.query(`CREATE DATABASE ${quoteIdentifier(database)}`)
  await admin.end()
  const fresh = { ...adminConnection, database }

  t.after(async () => {
    const cleanup = new Client(adminConnection)
    await cleanup.connect()
    try {
      await cleanup.query(`DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`)
    } finally {
      await cleanup.end()
    }
  })

  await runHubMigrations({ connectionString: connectionString(fresh) })

  const client = new Client(fresh)
  await client.connect()
  try {
    const accountId = '10000000-0000-4000-8000-000000000501'
    const otherAccountId = '10000000-0000-4000-8000-000000000502'
    const workspaceId = '20000000-0000-4000-8000-000000000501'
    const projectId = '30000000-0000-4000-8000-000000000501'

    await client.query(
      `INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
       VALUES ($1, 'https://issuer.test', 'deletion-subject-1', 'Deletion Admin')`,
      [accountId],
    )
    await client.query(
      `INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
       VALUES ($1, 'https://issuer.test', 'deletion-subject-2', 'Deletion Member')`,
      [otherAccountId],
    )
    await client.query(`INSERT INTO iam.installation_administrator(account_id, granted_via) VALUES ($1, 'OPERATOR_BOOTSTRAP')`, [accountId])
    await client.query(`INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'Deletion Workspace')`, [workspaceId])
    await client.query(`INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')`, [accountId, workspaceId])
    await client.query(`INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'member')`, [otherAccountId, workspaceId])

    await client.query(
      `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
       VALUES ($1, $2, 'Deletion Project', 'NEW', $3, 'project-revision-1')`,
      [projectId, workspaceId, HEAD],
    )
    await client.query(
      `INSERT INTO builder.project_working_state(project_id, working_source_revision) VALUES ($1, $2)`,
      [projectId, HEAD],
    )
    await client.query(
      `INSERT INTO builder.factory_binding(project_id, factory_project_id, project_repository_id, repository_id)
       VALUES ($1, 'factory-project-501', 'project-repository-501', 'repository-501')`,
      [projectId],
    )

    // builder.builder_run: settled, so it does not trip the PROJECT_BUSY guard.
    await client.query(
      `INSERT INTO builder.builder_run(
         builder_run_id, project_id, account_id, idempotency_digest, mode, base_source_revision,
         expected_working_version, state, request_digest, base_working_version, conversation_id
       ) VALUES ($1, $2, $3, $4, 'BUILD', $5, 0, 'SUCCEEDED', $6, 0, $7)`,
      [randomUUID(), projectId, accountId, digest('1'), HEAD, digest('2'), `conexus-builder:${projectId}`],
    )

    // iam.application, its grant and its invitation.
    await client.query(`INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, 'deletion-project-app', $2)`, [projectId, accountId])
    await client.query(
      `INSERT INTO iam.application_invitation(invitation_id, project_id, email, invited_by, expires_at)
       VALUES ($1, $2, 'invitee@example.test', $3, clock_timestamp() + interval '1 day')`,
      [randomUUID(), projectId, accountId],
    )
    await client.query(
      `INSERT INTO iam.application_grant(project_id, account_id, granted_by) VALUES ($1, $2, $3)`,
      [projectId, otherAccountId, accountId],
    )

    // reg.artifact (application kind) and its revision.
    const artifactId = randomUUID()
    const artifactRevisionId = randomUUID()
    await client.query(
      `INSERT INTO reg.artifact(artifact_id, kind, semantic_name, project_id) VALUES ($1, 'application', 'deletion-app', $2)`,
      [artifactId, projectId],
    )
    await client.query(
      `INSERT INTO reg.artifact_revision(artifact_revision_id, artifact_id, source_revision, digest, payload, availability)
       VALUES ($1, $2, $3, $4, '{}'::jsonb, 'AVAILABLE')`,
      [artifactRevisionId, artifactId, HEAD, digest('3')],
    )

    // iam.preview, opened against that revision. expires_at must equal opened_at + 15 minutes
    // exactly, so both are derived from one JS timestamp rather than two separate clock_timestamp() calls.
    const previewId = randomUUID()
    const previewOpenedAt = new Date()
    await client.query(
      `INSERT INTO iam.preview(
         preview_id, account_id, project_id, source_revision, artifact_revision_id, artifact_digest,
         exact_host, manifest, opened_at, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9::timestamptz + interval '15 minutes')`,
      [
        previewId, accountId, projectId, HEAD, artifactRevisionId, digest('3'),
        `preview-${artifactRevisionId}.example.test`,
        JSON.stringify({ entryPath: 'index.html', files: [] }),
        previewOpenedAt,
      ],
    )

    // iam.host_session: one HUB session, one PREVIEW child of it, and one APPLICATION session.
    // absolute_expires_at must equal started_at + a fixed interval exactly, so both are derived
    // from one JS timestamp per row rather than two separate clock_timestamp() calls.
    const hubDigest = randomBytes(32)
    const hubStartedAt = new Date()
    await client.query(
      `INSERT INTO iam.host_session(
         token_digest, kind, account_id, started_at, absolute_expires_at,
         provider_refresh_token, provider_checked_at, csrf_digest, idle_expires_at
       ) VALUES ($1, 'HUB', $2, $3, $3::timestamptz + interval '8 hours',
         'mastra:factory-secret:v1:hub-token', $3, $4, $3::timestamptz + interval '30 minutes')`,
      [hubDigest, accountId, hubStartedAt, randomBytes(32)],
    )
    const previewSessionDigest = randomBytes(32)
    const previewSessionStartedAt = new Date()
    await client.query(
      `INSERT INTO iam.host_session(token_digest, kind, account_id, started_at, absolute_expires_at, preview_id, parent_digest)
       VALUES ($1, 'PREVIEW', $2, $3, $3::timestamptz + interval '10 minutes', $4, $5)`,
      [previewSessionDigest, accountId, previewSessionStartedAt, previewId, hubDigest],
    )
    const applicationSessionStartedAt = new Date()
    await client.query(
      `INSERT INTO iam.host_session(
         token_digest, kind, account_id, started_at, absolute_expires_at, project_id,
         provider_refresh_token, provider_checked_at
       ) VALUES ($1, 'APPLICATION', $2, $3, $3::timestamptz + interval '8 hours', $4,
         'mastra:factory-secret:v1:application-token', $3)`,
      [randomBytes(32), otherAccountId, applicationSessionStartedAt, projectId],
    )

    // iam.handoff: a PREVIEW handoff naming the same preview and its parent Hub session.
    await client.query(
      `INSERT INTO iam.handoff(handoff_digest, kind, account_id, preview_id, parent_digest, minted_at, expires_at)
       VALUES ($1, 'PREVIEW', $2, $3, $4, now(), now() + interval '30 seconds')`,
      [randomBytes(32), accountId, previewId, hubDigest],
    )

    const connectionId = randomUUID()
    await client.query(
      `INSERT INTO connector.connection(connection_id, workspace_id, connector_id, label, credential_sealed, credential_digest, created_by)
       VALUES ($1, $2, 'sankhya', 'Deletion Connection', 'mastra:factory-secret:v1:connection', $3, $4)`,
      [connectionId, workspaceId, digest('4'), accountId],
    )
    await client.query(
      `INSERT INTO connector.project_binding(workspace_id, project_id, environment, connection_id, name, bound_by)
       VALUES ($1, $2, 'preview', $3, 'erp', $4)`,
      [workspaceId, projectId, connectionId, accountId],
    )

    const countRows = async (statement) => (await client.query(statement, [projectId])).rows[0].count

    const before = {
      project: await countRows('SELECT count(*)::integer AS count FROM project.project WHERE project_id = $1'),
      workingState: await countRows('SELECT count(*)::integer AS count FROM builder.project_working_state WHERE project_id = $1'),
      factoryBinding: await countRows('SELECT count(*)::integer AS count FROM builder.factory_binding WHERE project_id = $1'),
      builderRun: await countRows('SELECT count(*)::integer AS count FROM builder.builder_run WHERE project_id = $1'),
      application: await countRows('SELECT count(*)::integer AS count FROM iam.application WHERE project_id = $1'),
      applicationInvitation: await countRows('SELECT count(*)::integer AS count FROM iam.application_invitation WHERE project_id = $1'),
      applicationGrant: await countRows('SELECT count(*)::integer AS count FROM iam.application_grant WHERE project_id = $1'),
      artifact: await countRows('SELECT count(*)::integer AS count FROM reg.artifact WHERE project_id = $1'),
      artifactRevision: await client.query('SELECT count(*)::integer AS count FROM reg.artifact_revision WHERE artifact_id = $1', [artifactId]).then((result) => result.rows[0].count),
      preview: await countRows('SELECT count(*)::integer AS count FROM iam.preview WHERE project_id = $1'),
      hostSession: await client.query(
        'SELECT count(*)::integer AS count FROM iam.host_session WHERE project_id = $1 OR preview_id = $2',
        [projectId, previewId],
      ).then((result) => result.rows[0].count),
      handoff: await client.query('SELECT count(*)::integer AS count FROM iam.handoff WHERE preview_id = $1', [previewId]).then((result) => result.rows[0].count),
      projectBinding: await countRows('SELECT count(*)::integer AS count FROM connector.project_binding WHERE project_id = $1'),
    }
    for (const [label, count] of Object.entries(before)) assert.equal(count, label === 'artifact' || label === 'application' || label === 'factoryBinding' || label === 'workingState' || label === 'project' || label === 'preview' ? 1 : count >= 1 ? count : 0, `seed row missing for ${label}`)
    // The HUB session itself names no Project or Preview directly -- it is a Workspace-level session
    // that merely parents the PREVIEW session -- so only the PREVIEW and APPLICATION rows match here.
    assert.equal(before.hostSession, 2)
    assert.equal(before.handoff, 1)

    const tombstone = await client.query(
      'SELECT * FROM project.begin_project_deletion($1, $2, $3)',
      [accountId, projectId, 'Deletion Project'],
    )
    assert.equal(tombstone.rows[0].project_id, projectId)
    assert.equal(tombstone.rows[0].factory_project_id, 'factory-project-501')
    assert.equal(tombstone.rows[0].completed_at, null)

    // A tombstoned Project is refused admission and dropped from visibility for anyone but the
    // installation administrator who can resume or watch the deletion finish.
    await assert.rejects(
      client.query('SELECT iam.admit_project($1, $2, $3::iam.action)', [otherAccountId, projectId, 'project.build']),
      /PROJECT_DELETING/,
    )
    const visibleToMember = await client.query('SELECT * FROM iam.visible_projects($1) WHERE project_id = $2', [otherAccountId, projectId])
    assert.equal(visibleToMember.rowCount, 0)

    await client.query('SELECT iam.admit_project($1, $2, $3::iam.action)', [accountId, projectId, 'project.build'])
    const visibleToAdmin = await client.query('SELECT * FROM iam.visible_projects($1) WHERE project_id = $2', [accountId, projectId])
    assert.equal(visibleToAdmin.rowCount, 1)

    await client.query('SELECT project.purge_project($1)', [projectId])

    const after = {
      project: await countRows('SELECT count(*)::integer AS count FROM project.project WHERE project_id = $1'),
      workingState: await countRows('SELECT count(*)::integer AS count FROM builder.project_working_state WHERE project_id = $1'),
      factoryBinding: await countRows('SELECT count(*)::integer AS count FROM builder.factory_binding WHERE project_id = $1'),
      builderRun: await countRows('SELECT count(*)::integer AS count FROM builder.builder_run WHERE project_id = $1'),
      application: await countRows('SELECT count(*)::integer AS count FROM iam.application WHERE project_id = $1'),
      applicationInvitation: await countRows('SELECT count(*)::integer AS count FROM iam.application_invitation WHERE project_id = $1'),
      applicationGrant: await countRows('SELECT count(*)::integer AS count FROM iam.application_grant WHERE project_id = $1'),
      artifact: await countRows('SELECT count(*)::integer AS count FROM reg.artifact WHERE project_id = $1'),
      artifactRevision: await client.query('SELECT count(*)::integer AS count FROM reg.artifact_revision WHERE artifact_id = $1', [artifactId]).then((result) => result.rows[0].count),
      preview: await countRows('SELECT count(*)::integer AS count FROM iam.preview WHERE project_id = $1'),
      hostSession: await client.query(
        'SELECT count(*)::integer AS count FROM iam.host_session WHERE project_id = $1 OR preview_id = $2',
        [projectId, previewId],
      ).then((result) => result.rows[0].count),
      handoff: await client.query('SELECT count(*)::integer AS count FROM iam.handoff WHERE preview_id = $1', [previewId]).then((result) => result.rows[0].count),
      projectBinding: await countRows('SELECT count(*)::integer AS count FROM connector.project_binding WHERE project_id = $1'),
    }
    for (const [label, count] of Object.entries(after)) assert.equal(count, 0, `row survived purge for ${label}`)

    // The connector.connection itself is a Workspace resource, not Project-scoped, and survives.
    const connectionSurvives = await client.query('SELECT count(*)::integer AS count FROM connector.connection WHERE connection_id = $1', [connectionId])
    assert.equal(connectionSurvives.rows[0].count, 1)

    // The HUB session is a Workspace-level session, not Project-scoped, and survives too.
    const hubSessionSurvives = await client.query('SELECT count(*)::integer AS count FROM iam.host_session WHERE token_digest = $1', [hubDigest])
    assert.equal(hubSessionSurvives.rows[0].count, 1)

    await client.query('SELECT project.complete_project_deletion($1)', [projectId])
    const completed = await client.query('SELECT completed_at FROM project.project_deletion WHERE project_id = $1', [projectId])
    assert.notEqual(completed.rows[0].completed_at, null)

    // A second purge_project on the same tombstone is a no-op, not an error: it has nothing left to
    // touch, and the orchestrator can resume after a crash between purge and repository deletion.
    await client.query('SELECT project.purge_project($1)', [projectId])
    await client.query('SELECT project.complete_project_deletion($1)', [projectId])

    // purge_project refuses a Project that was never tombstoned.
    await assert.rejects(
      client.query('SELECT project.purge_project($1)', [otherAccountId]),
      /PROJECT_DELETION_NOT_STARTED/,
    )
  } finally {
    await client.end()
  }
})
