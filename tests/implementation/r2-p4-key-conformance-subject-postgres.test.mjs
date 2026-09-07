import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import pg from 'pg'
import { runR2HubMigrations } from '../../scripts/run-hub-migrations.mjs'

const databaseConfigured = [
  'CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME',
  'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD',
].every((name) => process.env[name])

const quoteIdentifier = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('UNSAFE_TEST_IDENTIFIER')
  return `"${value}"`
}

const connect = async (configuration) => {
  const client = new pg.Client(configuration)
  await client.connect()
  return client
}

const expectCode = async (operation, code) => {
  await assert.rejects(operation, (error) => error?.code === code)
}

const databaseHarness = async () => {
  const admin = {
    host: process.env.CONEXUS_TEST_DB_HOST,
    port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME,
    user: process.env.CONEXUS_TEST_DB_USER,
    password: process.env.CONEXUS_TEST_DB_PASSWORD,
  }
  const database = `conexus_r2_subject_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  const control = await connect(admin)
  await control.query(`CREATE DATABASE ${quoteIdentifier(database)}`)
  await control.end()
  const fresh = { ...admin, database }
  const url = new URL('postgresql://localhost')
  url.hostname = fresh.host
  url.port = String(fresh.port)
  url.pathname = `/${database}`
  url.username = fresh.user
  url.password = fresh.password
  await runR2HubMigrations({ connectionString: url.toString() })

  const rolePassword = `subject-${randomUUID()}`
  const administrator = await connect(fresh)
  await administrator.query(
    `ALTER ROLE hub_r2_key_conformance_subject PASSWORD '${rolePassword}'`,
  )
  const runtimeConfiguration = {
    ...fresh,
    user: 'hub_r2_key_conformance_subject',
    password: rolePassword,
  }
  const cleanup = async () => {
    const cleanup = await connect(admin)
    try {
      await cleanup.query('ALTER ROLE hub_r2_key_conformance_subject PASSWORD NULL')
      await cleanup.query(`DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`)
    } finally {
      await cleanup.end()
    }
  }
  return { administrator, runtimeConfiguration, cleanup }
}

test('R2-P4 PostgreSQL resolves one fresh Sankhya subject and enforces owner/role boundaries', {
  skip: databaseConfigured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  const { administrator, runtimeConfiguration, cleanup } = await databaseHarness()
  let runtime
  t.after(async () => {
    await runtime?.end().catch(() => {})
    await administrator.end().catch(() => {})
    await cleanup()
  })

  const accountId = randomUUID()
  const workspaceId = randomUUID()
  const projectId = randomUUID()
  const connectionId = randomUUID()
  const connectionRevisionId = randomUUID()
  const qualificationId = randomUUID()
  const sourceRevision = 'a'.repeat(40)

  await administrator.query(`
    INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', 'r2-p4-subject', 'R2 P4 Subject')
  `, [accountId])
  await administrator.query(
    'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)',
    [workspaceId, 'Subject Workspace'],
  )
  await administrator.query(`
    INSERT INTO project.project(
      project_id, workspace_id, name, source_mode, source_revision, project_revision
    ) VALUES ($1, $2, 'Subject Project', 'NEW', $3, 'subject-project-v1')
  `, [projectId, workspaceId, sourceRevision])
  await administrator.query(`
    INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project)
    VALUES ($1, $2, false)
  `, [accountId, workspaceId])
  await administrator.query(`
    INSERT INTO iam.account_project_grant(
      account_id, project_id, can_read, can_manage, can_bind_brain, can_use_connection
    ) VALUES ($1, $2, true, true, true, true)
  `, [accountId, projectId])
  await administrator.query(`
    INSERT INTO con.connection(
      connection_id, owner_scope_kind, workspace_id, name,
      credential_generation, credential_generation_high_watermark
    ) VALUES ($1, 'WORKSPACE', $2, 'Sankhya Matriz', 7, 7)
  `, [connectionId, workspaceId])
  await administrator.query(`
    INSERT INTO con.connection_revision(
      connection_revision_id, connection_id, connector_definition_id,
      connector_version, configuration, configuration_digest
    ) VALUES ($1, $2, 'sankhya-om', '1.0.0', $3::jsonb, $4)
  `, [connectionRevisionId, connectionId,
    JSON.stringify({ environment: 'SANDBOX', companyCode: 1 }), 'b'.repeat(64)])
  await administrator.query(
    'UPDATE con.connection SET current_revision_id = $2 WHERE connection_id = $1',
    [connectionId, connectionRevisionId],
  )
  await administrator.query(`
    INSERT INTO con.connection_qualification(
      qualification_id, connection_id, connection_revision_id,
      credential_generation, environment, qualification_state, outcome,
      diagnostic, evidence_refs, tested_at
    ) VALUES ($1, $2, $3, 7, 'SANDBOX', 'COMPLETE', 'PASSED', '{}'::jsonb,
      ARRAY['local-postgresql'], clock_timestamp())
  `, [qualificationId, connectionId, connectionRevisionId])
  await administrator.query(`
    INSERT INTO project.connection_binding(
      project_id, connection_id, connection_revision_id, qualification_id,
      environment, binding_digest, project_source_revision
    ) VALUES ($1, $2, $3, $4, 'SANDBOX', $5, $6)
  `, [projectId, connectionId, connectionRevisionId, qualificationId,
    'c'.repeat(64), sourceRevision])

  runtime = await connect(runtimeConfiguration)
  const resolveSubject = () => runtime.query(
    'SELECT * FROM project.resolve_key_conformance_subject($1, $2, $3)',
    [accountId, projectId, connectionId],
  )

  assert.deepEqual((await resolveSubject()).rows, [{
    workspace_id: workspaceId,
    project_id: projectId,
    connection_id: connectionId,
    connection_revision_id: connectionRevisionId,
    qualification_id: qualificationId,
    credential_generation: '7',
    environment: 'SANDBOX',
    company_code: 1,
    connector_definition_id: 'sankhya-om',
    connector_version: '1.0.0',
    source_revision: sourceRevision,
  }])

  // A live binding-source intent fences subject resolution with P0001. Abort
  // the prepared intent before continuing so every later matrix case returns
  // to the same positive baseline.
  const activeIntentId = randomUUID()
  const activeIntent = (await administrator.query(`
    SELECT project.begin_connection_binding_intent($1,$2,$3,$4,$5,$6::jsonb,$7,$8) AS intent
  `, [accountId, projectId, connectionId, connectionRevisionId, 'SANDBOX',
    JSON.stringify({ state: 'PRESENT', connectionRevisionId, environment: 'SANDBOX' }), false, activeIntentId])).rows[0].intent
  assert.equal(activeIntent.state, 'PREPARING')
  await expectCode(resolveSubject(), 'P0001')
  await administrator.query(
    'SELECT project.abort_binding_source_intent($1,$2,$3,$4,$5) AS intent',
    [accountId, projectId, activeIntentId, activeIntent.version, 'P0001'],
  )
  assert.deepEqual((await resolveSubject()).rows, [{
    workspace_id: workspaceId,
    project_id: projectId,
    connection_id: connectionId,
    connection_revision_id: connectionRevisionId,
    qualification_id: qualificationId,
    credential_generation: '7',
    environment: 'SANDBOX',
    company_code: 1,
    connector_definition_id: 'sankhya-om',
    connector_version: '1.0.0',
    source_revision: sourceRevision,
  }])

  // The current IAM schema models project.read/manage as mandatory facts on
  // the direct grant row; revocation is therefore deletion of that grant.
  await administrator.query(
    'DELETE FROM iam.account_project_grant WHERE account_id = $1 AND project_id = $2',
    [accountId, projectId],
  )
  await expectCode(resolveSubject(), 'P0002')
  await administrator.query(`
    INSERT INTO iam.account_project_grant(
      account_id, project_id, can_read, can_manage, can_bind_brain, can_use_connection
    ) VALUES ($1, $2, true, true, true, true)
  `, [accountId, projectId])
  for (const permission of ['can_bind_brain', 'can_use_connection']) {
    await administrator.query(
      `UPDATE iam.account_project_grant SET ${permission} = false WHERE account_id = $1 AND project_id = $2`,
      [accountId, projectId],
    )
    await expectCode(resolveSubject(), '42501')
    await administrator.query(
      `UPDATE iam.account_project_grant SET ${permission} = true WHERE account_id = $1 AND project_id = $2`,
      [accountId, projectId],
    )
  }
  await administrator.query(
    'DELETE FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2',
    [accountId, workspaceId],
  )
  await expectCode(resolveSubject(), 'P0002')
  await administrator.query(
    'INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project) VALUES ($1, $2, false)',
    [accountId, workspaceId],
  )

  const foreignWorkspaceId = randomUUID()
  const foreignConnectionId = randomUUID()
  const foreignRevisionId = randomUUID()
  await administrator.query(
    'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)',
    [foreignWorkspaceId, 'Foreign Workspace'],
  )
  await administrator.query(`
    INSERT INTO con.connection(
      connection_id, owner_scope_kind, workspace_id, name,
      credential_generation, credential_generation_high_watermark
    ) VALUES ($1, 'WORKSPACE', $2, 'Foreign Sankhya', 1, 1)
  `, [foreignConnectionId, foreignWorkspaceId])
  await administrator.query(`
    INSERT INTO con.connection_revision(
      connection_revision_id, connection_id, connector_definition_id,
      connector_version, configuration, configuration_digest
    ) VALUES ($1, $2, 'sankhya-om', '1.0.0', $3::jsonb, $4)
  `, [foreignRevisionId, foreignConnectionId,
    JSON.stringify({ environment: 'SANDBOX', companyCode: 2 }), 'd'.repeat(64)])
  await administrator.query(
    'UPDATE con.connection SET current_revision_id = $2 WHERE connection_id = $1',
    [foreignConnectionId, foreignRevisionId],
  )
  await administrator.query(`
    INSERT INTO project.connection_binding(
      project_id, connection_id, connection_revision_id, qualification_id,
      environment, binding_digest, project_source_revision
    ) VALUES ($1, $2, $3, $4, 'SANDBOX', $5, $6)
  `, [projectId, foreignConnectionId, foreignRevisionId, randomUUID(),
    'e'.repeat(64), sourceRevision])
  await expectCode(runtime.query(
    'SELECT * FROM project.resolve_key_conformance_subject($1, $2, $3)',
    [accountId, projectId, foreignConnectionId],
  ), 'P0412')

  const foreignProjectId = randomUUID()
  const projectOwnedConnectionId = randomUUID()
  const projectOwnedRevisionId = randomUUID()
  const projectOwnedQualificationId = randomUUID()
  await administrator.query(
    `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
     VALUES ($1, $2, 'Foreign owner project', 'NEW', $3, 'foreign-owner-v1')`,
    [foreignProjectId, foreignWorkspaceId, sourceRevision],
  )
  await administrator.query(`
    INSERT INTO con.connection(
      connection_id, owner_scope_kind, project_id, name,
      credential_generation, credential_generation_high_watermark
    ) VALUES ($1, 'PROJECT', $2, 'Project-owned foreign Sankhya', 1, 1)
  `, [projectOwnedConnectionId, foreignProjectId])
  await administrator.query(`
    INSERT INTO con.connection_revision(
      connection_revision_id, connection_id, connector_definition_id,
      connector_version, configuration, configuration_digest
    ) VALUES ($1, $2, 'sankhya-om', '1.0.0', $3::jsonb, $4)
  `, [projectOwnedRevisionId, projectOwnedConnectionId,
    JSON.stringify({ environment: 'SANDBOX', companyCode: 2 }), 'f'.repeat(64)])
  await administrator.query(
    'UPDATE con.connection SET current_revision_id = $2 WHERE connection_id = $1',
    [projectOwnedConnectionId, projectOwnedRevisionId],
  )
  await administrator.query(`
    INSERT INTO con.connection_qualification(
      qualification_id, connection_id, connection_revision_id,
      credential_generation, environment, qualification_state, outcome,
      diagnostic, evidence_refs, tested_at
    ) VALUES ($1, $2, $3, 1, 'SANDBOX', 'COMPLETE', 'PASSED', '{}'::jsonb,
      ARRAY['local-postgresql'], clock_timestamp())
  `, [projectOwnedQualificationId, projectOwnedConnectionId, projectOwnedRevisionId])
  await administrator.query(`
    INSERT INTO project.connection_binding(
      project_id, connection_id, connection_revision_id, qualification_id,
      environment, binding_digest, project_source_revision
    ) VALUES ($1, $2, $3, $4, 'SANDBOX', $5, $6)
  `, [projectId, projectOwnedConnectionId, projectOwnedRevisionId, projectOwnedQualificationId,
    'a'.repeat(64), sourceRevision])
  await expectCode(runtime.query(
    'SELECT * FROM project.resolve_key_conformance_subject($1, $2, $3)',
    [accountId, projectId, projectOwnedConnectionId],
  ), 'P0412')
  await administrator.query(
    'DELETE FROM project.connection_binding WHERE project_id = $1 AND connection_id = $2',
    [projectId, projectOwnedConnectionId],
  )

  const failedQualificationId = randomUUID()
  await administrator.query(`
    INSERT INTO con.connection_qualification(
      qualification_id, connection_id, connection_revision_id,
      credential_generation, environment, qualification_state, outcome,
      diagnostic, evidence_refs, tested_at
    ) VALUES ($1, $2, $3, 7, 'SANDBOX', 'COMPLETE', 'FAILED', '{}'::jsonb,
      ARRAY['local-postgresql'], clock_timestamp() + interval '1 second')
  `, [failedQualificationId, connectionId, connectionRevisionId])
  await expectCode(resolveSubject(), 'P0412')
  await administrator.query(
    'DELETE FROM con.connection_qualification WHERE qualification_id = $1',
    [failedQualificationId],
  )

  await administrator.query(
    `UPDATE con.connection_revision SET configuration = $2::jsonb WHERE connection_revision_id = $1`,
    [connectionRevisionId, JSON.stringify({ environment: 'SANDBOX', companyCode: 'malformed' })],
  )
  await expectCode(resolveSubject(), 'P0412')
  await administrator.query(
    `UPDATE con.connection_revision SET configuration = $2::jsonb WHERE connection_revision_id = $1`,
    [connectionRevisionId, JSON.stringify({ environment: 'SANDBOX', companyCode: 1 })],
  )

  await administrator.query(
    'UPDATE project.connection_binding SET environment = $1 WHERE project_id = $2 AND connection_id = $3',
    ['PRODUCTION', projectId, connectionId],
  )
  await expectCode(resolveSubject(), 'P0412')
  await administrator.query(
    'UPDATE project.connection_binding SET environment = $1 WHERE project_id = $2 AND connection_id = $3',
    ['SANDBOX', projectId, connectionId],
  )

  await administrator.query(
    'UPDATE con.connection SET credential_generation = 8, credential_generation_high_watermark = 8 WHERE connection_id = $1',
    [connectionId],
  )
  await expectCode(resolveSubject(), 'P0412')
  await administrator.query(
    'UPDATE con.connection SET credential_generation = 7 WHERE connection_id = $1',
    [connectionId],
  )

  await administrator.query(
    'UPDATE project.project SET archived = true WHERE project_id = $1',
    [projectId],
  )
  await expectCode(resolveSubject(), 'P0002')
  await administrator.query(
    'UPDATE project.project SET archived = false WHERE project_id = $1',
    [projectId],
  )

  assert.deepEqual((await resolveSubject()).rows, [{
    workspace_id: workspaceId,
    project_id: projectId,
    connection_id: connectionId,
    connection_revision_id: connectionRevisionId,
    qualification_id: qualificationId,
    credential_generation: '7',
    environment: 'SANDBOX',
    company_code: 1,
    connector_definition_id: 'sankhya-om',
    connector_version: '1.0.0',
    source_revision: sourceRevision,
  }])

  const forbiddenStatements = [
    'SELECT * FROM project.project',
    'SELECT * FROM con.connection',
    'UPDATE project.project SET archived = false',
    `SELECT project.settle_connection_binding(
      '${accountId}', '${projectId}', '${connectionId}', '${connectionRevisionId}',
      'SANDBOX', '{}'::jsonb, false, '${sourceRevision}', '${'f'.repeat(40)}',
      '{}'::jsonb, '${'a'.repeat(64)}')`,
    `SELECT brn.persist_binding_validation(
      '${randomUUID()}', '${projectId}', '${randomUUID()}', '${'a'.repeat(64)}',
      '${'b'.repeat(64)}', '{}'::jsonb)`,
    `SELECT con.reserve_connection_credential(
      '${accountId}', '${connectionId}', '${'a'.repeat(64)}', '${'b'.repeat(64)}')`,
    `SELECT con.get_connection('${accountId}', '${connectionId}')`,
  ]
  for (const statement of forbiddenStatements) {
    await expectCode(runtime.query(statement), '42501')
  }

  const privileges = (await administrator.query(`
    SELECT n.nspname || '.' || p.proname AS function_name
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('iam','workspace','project','reg','brn','con')
      AND has_function_privilege('hub_r2_key_conformance_subject', p.oid, 'EXECUTE')
    ORDER BY function_name
  `)).rows
  assert.deepEqual(privileges, [{ function_name: 'project.resolve_key_conformance_subject' }])
})
