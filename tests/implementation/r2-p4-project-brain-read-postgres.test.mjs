import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import pg from 'pg'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'
import { runR2HubMigrations } from '../../scripts/run-hub-migrations.mjs'

const configured = ['CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME',
  'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD'].every((name) => process.env[name])
const id = () => randomUUID()
const digest = (character) => character.repeat(64)
const source = (character) => character.repeat(40)
const quote = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('UNSAFE_TEST_IDENTIFIER')
  return `"${value}"`
}
const query = async (config, statement, values = []) => {
  const client = new pg.Client(config)
  await client.connect()
  try { return await client.query(statement, values) } finally { await client.end() }
}

test('R2-P4 PostgreSQL proves PRJ-10 manage read, PRJ-11 preflight and raw BRN-14 basis', {
  skip: configured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  const admin = {
    host: process.env.CONEXUS_TEST_DB_HOST,
    port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME,
    user: process.env.CONEXUS_TEST_DB_USER,
    password: process.env.CONEXUS_TEST_DB_PASSWORD,
  }
  const database = `conexus_r2_p4_reads_${process.pid}_${id().replaceAll('-', '').slice(0, 8)}`
  await query(admin, `CREATE DATABASE ${quote(database)}`)
  const fresh = { ...admin, database }
  const passwords = new Map()
  t.after(async () => {
    for (const [role] of passwords) await query(admin, `ALTER ROLE ${role} PASSWORD NULL`).catch(() => {})
    await query(admin, `DROP DATABASE ${quote(database)} WITH (FORCE)`).catch(() => {})
  })

  const connectionString = new URL('postgresql://localhost')
  connectionString.hostname = fresh.host
  connectionString.port = String(fresh.port)
  connectionString.pathname = `/${fresh.database}`
  connectionString.username = fresh.user
  connectionString.password = fresh.password
  await runR2HubMigrations({ connectionString: connectionString.toString() })

  const accountId = id()
  const manageDeniedAccountId = id()
  const manageCapabilityDeniedAccountId = id()
  const bindDeniedAccountId = id()
  const projectReadDeniedAccountId = id()
  const workspaceId = id()
  const projectId = id()
  const foreignWorkspaceId = id()
  const foreignProjectId = id()
  const artifactId = id()
  const brainRevisionId = id()
  const publishedRevisionId = id()
  const bindingValidationId = id()
  const brainDigest = digest('a')
  const oldSourceRevision = source('c')
  const newSourceRevision = source('d')
  const brainSourceRevision = source('e')
  const candidate = {
    schemaVersion: 'conexus-brain-binding-validation/v1', validationState: 'VALID',
    projectId, workspaceId, brainRevisionId, brainDigest, sourceRevision: oldSourceRevision,
    inputDigest: digest('1'), manifestDigest: digest('2'), applicableItemIds: [], proofs: [],
  }
  const candidateDigest = sha256(canonicalBytes(candidate))
  const payload = {
    schemaVersion: 'conexus-brain/v2', reviewText: 'Raw basis fixture.',
    knowledgeBrowse: { domains: [] }, items: [], assertions: [],
  }
  await query(fresh, `
    INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', $2, 'Authorized'),
      ($3, 'https://issuer.test', $4, 'Manage denied'),
      ($5, 'https://issuer.test', $6, 'Manage capability denied'),
      ($7, 'https://issuer.test', $8, 'Bind denied'),
      ($9, 'https://issuer.test', $10, 'Project read denied')
  `, [accountId, `account-${accountId}`, manageDeniedAccountId, `account-${manageDeniedAccountId}`,
    manageCapabilityDeniedAccountId, `account-${manageCapabilityDeniedAccountId}`,
    bindDeniedAccountId, `account-${bindDeniedAccountId}`,
    projectReadDeniedAccountId, `account-${projectReadDeniedAccountId}`])
  await query(fresh, `
    INSERT INTO workspace.workspace(workspace_id, name)
    VALUES ($1, 'R2 P4 read workspace'), ($2, 'Foreign workspace')
  `, [workspaceId, foreignWorkspaceId])
  await query(fresh, `
    INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project, can_read_brain)
    VALUES ($1, $2, false, true), ($3, $2, false, true), ($4, $2, false, true),
      ($5, $2, false, true), ($6, $2, false, true)
  `, [accountId, workspaceId, manageDeniedAccountId, manageCapabilityDeniedAccountId,
    bindDeniedAccountId, projectReadDeniedAccountId])
  await query(fresh, `
    INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'R2 P4 read project', 'NEW', $3, 'project-revision'),
      ($4, $5, 'Foreign project', 'NEW', $3, 'foreign-project-revision')
  `, [projectId, workspaceId, oldSourceRevision, foreignProjectId, foreignWorkspaceId])
  await query(fresh, `
    INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage, can_bind_brain)
    VALUES ($1, $2, true, true, true), ($3, $2, true, true, false),
      ($4, $2, true, true, false), ($5, $2, true, true, true)
  `, [accountId, projectId, manageCapabilityDeniedAccountId, bindDeniedAccountId,
    projectReadDeniedAccountId])
  await query(fresh, `
    INSERT INTO reg.artifact(artifact_id, workspace_id, kind, semantic_name)
    VALUES ($1, $2, 'brain', 'R2 P4 Raw Basis Brain')
  `, [artifactId, workspaceId])
  await query(fresh, `
    INSERT INTO reg.artifact_revision(
      artifact_revision_id, artifact_id, source_revision, digest, payload, availability
    ) VALUES ($1, $2, $3, $4, $5::jsonb, 'AVAILABLE'),
      ($6, $2, $7, $8, $5::jsonb, 'AVAILABLE')
  `, [brainRevisionId, artifactId, brainSourceRevision, brainDigest, JSON.stringify(payload),
    publishedRevisionId, source('f'), digest('f')])
  await query(fresh, 'UPDATE reg.artifact SET published_revision_id = $2 WHERE artifact_id = $1', [artifactId, publishedRevisionId])

  const bootstrapPassword = `bootstrap-${id()}`
  const attesterPassword = `attester-${id()}`
  const bindingPassword = `binding-${id()}`
  const brainReadPassword = `brain-read-${id()}`
  for (const [role, password] of [
    ['hub_r2_brain_bootstrap', bootstrapPassword], ['hub_r2_brain_attester', attesterPassword],
    ['hub_r2_project_binding', bindingPassword],
    ['hub_r2_brain_read', brainReadPassword],
  ]) {
    passwords.set(role, password)
    await query(fresh, `ALTER ROLE ${role} PASSWORD '${password}'`)
  }
  const bootstrap = { ...fresh, user: 'hub_r2_brain_bootstrap', password: bootstrapPassword }
  const attester = { ...fresh, user: 'hub_r2_brain_attester', password: attesterPassword }
  const bindingRuntime = { ...fresh, user: 'hub_r2_project_binding', password: bindingPassword }
  const brainRead = { ...fresh, user: 'hub_r2_brain_read', password: brainReadPassword }

  await query(attester,
    'SELECT brn.persist_binding_validation($1,$2,$3,$4,$5,$6)',
    [bindingValidationId, projectId, brainRevisionId, brainDigest, candidateDigest, candidate])
  await query(bootstrap,
    'SELECT brn.bootstrap_brain_health($1,$2,$3,$4::jsonb)',
    [digest('9'), brainRevisionId, brainDigest, '[]'])
  assert.deepEqual((await query(attester,
    'SELECT * FROM reg.get_project_brain_candidate($1,$2)', [workspaceId, brainRevisionId])).rows, [{
    brain_revision_id: brainRevisionId, brain_digest: brainDigest,
    source_revision: brainSourceRevision, payload,
  }])
  await assert.rejects(
    query(bindingRuntime, 'SELECT * FROM reg.get_project_brain_candidate($1,$2)',
      [workspaceId, brainRevisionId]),
    (error) => error?.code === '42501',
  )
  await assert.rejects(
    query(bindingRuntime, 'SELECT brn.persist_binding_validation($1,$2,$3,$4,$5,$6)',
      [id(), projectId, brainRevisionId, brainDigest, candidateDigest, candidate]),
    (error) => error?.code === '42501',
  )

  const preflight = (account = accountId) => query(bindingRuntime,
    'SELECT * FROM project.admit_brain_binding_preflight($1,$2)', [account, projectId])
  assert.deepEqual((await preflight()).rows, [{
    project_id: projectId, workspace_id: workspaceId,
    current_project_source_revision: oldSourceRevision,
    connection_permitted: false,
  }])
  await query(fresh, 'UPDATE project.project SET archived = true WHERE project_id = $1', [projectId])
  await assert.rejects(preflight(), (error) => error?.code === 'P0002')
  await query(fresh, 'UPDATE project.project SET archived = false WHERE project_id = $1', [projectId])
  await assert.rejects(preflight(manageDeniedAccountId), (error) => error?.code === 'P0002')
  await assert.rejects(preflight(bindDeniedAccountId), (error) => error?.code === '42501')
  await assert.rejects(
    query(bindingRuntime, 'SELECT * FROM project.admit_brain_binding_preflight($1,$2)', [accountId, foreignProjectId]),
    (error) => error?.code === 'P0002',
  )
  assert.deepEqual((await query(bindingRuntime,
    'SELECT * FROM project.get_project_brain_binding($1,$2)', [bindDeniedAccountId, projectId])).rows, [])
  await query(fresh, 'ALTER TABLE iam.account_project_grant DROP CONSTRAINT account_project_grant_can_manage_check')
  await query(fresh, 'UPDATE iam.account_project_grant SET can_manage = false WHERE account_id = $1 AND project_id = $2',
    [manageCapabilityDeniedAccountId, projectId])
  await assert.rejects(
    query(bindingRuntime, 'SELECT * FROM project.get_project_brain_binding($1,$2)',
      [manageCapabilityDeniedAccountId, projectId]),
    (error) => error?.code === '42501',
  )
  await query(fresh, 'UPDATE iam.account_project_grant SET can_manage = true WHERE account_id = $1 AND project_id = $2',
    [manageCapabilityDeniedAccountId, projectId])
  await query(fresh,
    'ALTER TABLE iam.account_project_grant ADD CONSTRAINT account_project_grant_can_manage_check CHECK (can_manage)')

  const intentId = bindingValidationId
  const begin = (await query(bindingRuntime,
    'SELECT project.begin_brain_binding_intent($1,$2,$3,$4,$5,$6,$7,$8) AS intent',
    [accountId, projectId, brainRevisionId, brainDigest, { state: 'ABSENT' }, candidate,
      candidateDigest, intentId])).rows[0].intent
  assert.equal(begin.state, 'PREPARING')
  assert.equal(begin.source_revision, oldSourceRevision)
  await assert.rejects(preflight(), (error) => error?.code === 'P0001')
  await query(bindingRuntime,
    'SELECT project.freeze_binding_source_intent($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [accountId, projectId, intentId, 0, candidateDigest, source('1'), source('2'),
      newSourceRevision, source('4'), source('5')])
  await query(bindingRuntime,
    'SELECT project.validate_binding_source_intent($1,$2,$3,$4)',
    [accountId, projectId, intentId, 1])
  const completed = (await query(bindingRuntime,
    'SELECT project.complete_binding_source_intent($1,$2,$3,$4) AS intent',
    [accountId, projectId, intentId, 1])).rows[0].intent
  assert.equal(completed.state, 'COMPLETED')

  const settled = (await query(fresh, `
    SELECT project.source_revision, binding.project_source_revision,
      validation.candidate->>'sourceRevision' AS validation_source_revision
    FROM project.project AS project
    JOIN project.brain_binding AS binding ON binding.project_id = project.project_id
    JOIN brn.binding_validation AS validation
      ON validation.project_id = binding.project_id
      AND validation.project_binding_digest = binding.project_binding_digest
    WHERE project.project_id = $1
  `, [projectId])).rows[0]
  assert.deepEqual(settled, {
    source_revision: newSourceRevision,
    project_source_revision: newSourceRevision,
    validation_source_revision: oldSourceRevision,
  })

  const bindingRead = (await query(bindingRuntime,
    'SELECT * FROM project.get_project_brain_binding($1,$2)', [accountId, projectId])).rows[0]
  assert.deepEqual(bindingRead, {
    project_id: projectId, workspace_id: workspaceId, current_project_source_revision: newSourceRevision,
    brain_revision_id: brainRevisionId, brain_digest: brainDigest, project_binding_digest: candidateDigest,
    validation_state: 'VALID', update_available: true,
  })
  assert.deepEqual((await query(bindingRuntime,
    'SELECT * FROM project.get_project_brain_binding($1,$2)', [bindDeniedAccountId, projectId])).rows, [bindingRead])
  await query(fresh, 'ALTER TABLE iam.account_project_grant DROP CONSTRAINT account_project_grant_can_manage_check')
  await query(fresh, 'UPDATE iam.account_project_grant SET can_manage = false WHERE account_id = $1 AND project_id = $2',
    [manageCapabilityDeniedAccountId, projectId])
  await assert.rejects(
    query(bindingRuntime, 'SELECT * FROM project.get_project_brain_binding($1,$2)',
      [manageCapabilityDeniedAccountId, projectId]),
    (error) => error?.code === '42501',
  )
  await query(fresh, 'UPDATE iam.account_project_grant SET can_manage = true WHERE account_id = $1 AND project_id = $2',
    [manageCapabilityDeniedAccountId, projectId])
  await query(fresh,
    'ALTER TABLE iam.account_project_grant ADD CONSTRAINT account_project_grant_can_manage_check CHECK (can_manage)')
  await assert.rejects(
    query(bindingRuntime, 'SELECT * FROM project.get_project_brain_binding($1,$2)', [manageDeniedAccountId, projectId]),
    (error) => error?.code === 'P0002',
  )
  await assert.rejects(
    query(bindingRuntime, 'SELECT * FROM project.get_project_brain_binding($1,$2)', [accountId, foreignProjectId]),
    (error) => error?.code === 'P0002',
  )
  await assert.rejects(
    query(bindingRuntime, 'SELECT * FROM project.get_project_brain_binding($1,$2)', [accountId, id()]),
    (error) => error?.code === 'P0002',
  )

  const basis = (await query(brainRead,
    'SELECT * FROM brn.get_project_brain_basis($1,$2)', [accountId, projectId])).rows[0]
  assert.equal(basis.project_id, projectId)
  assert.equal(basis.workspace_id, workspaceId)
  assert.equal(basis.current_project_source_revision, newSourceRevision)
  assert.equal(basis.validation_source_revision, oldSourceRevision)
  assert.equal(basis.revision_source_revision, brainSourceRevision)
  assert.equal(basis.brain_revision_id, brainRevisionId)
  assert.equal(basis.brain_digest, brainDigest)
  assert.equal(basis.project_binding_digest, candidateDigest)
  assert.equal(basis.validation_state, 'VALID')
  assert.equal(basis.update_available, true)
  assert.deepEqual(basis.revision_payload, payload)
  assert.deepEqual(basis.health_items, [])
  assert.equal(basis.published_brain_revision_id, publishedRevisionId)
  assert.equal(basis.published_brain_digest, digest('f'))
  await assert.rejects(
    query(brainRead, 'SELECT * FROM brn.get_project_brain_basis($1,$2)', [manageDeniedAccountId, projectId]),
    (error) => error?.code === 'P0002',
  )
  await query(fresh, 'ALTER TABLE iam.account_project_grant DROP CONSTRAINT account_project_grant_can_read_check')
  await query(fresh, 'UPDATE iam.account_project_grant SET can_read = false WHERE account_id = $1 AND project_id = $2',
    [projectReadDeniedAccountId, projectId])
  await assert.rejects(
    query(brainRead, 'SELECT * FROM brn.get_project_brain_basis($1,$2)', [projectReadDeniedAccountId, projectId]),
    (error) => error?.code === '42501',
  )
  await query(fresh, 'UPDATE iam.account_project_grant SET can_read = true WHERE account_id = $1 AND project_id = $2',
    [projectReadDeniedAccountId, projectId])
  await query(fresh,
    'ALTER TABLE iam.account_project_grant ADD CONSTRAINT account_project_grant_can_read_check CHECK (can_read)')
  await assert.rejects(
    query(brainRead, 'SELECT * FROM brn.get_project_brain_basis($1,$2)', [accountId, foreignProjectId]),
    (error) => error?.code === 'P0002',
  )
  await query(fresh, `
    UPDATE iam.workspace_membership SET can_read_brain = false
    WHERE account_id = $1 AND workspace_id = $2
  `, [manageDeniedAccountId, workspaceId])
  await query(fresh, `
    INSERT INTO iam.account_project_grant(
      account_id, project_id, can_read, can_manage, can_bind_brain
    ) VALUES ($1, $2, true, true, false)
  `, [manageDeniedAccountId, projectId])
  await assert.rejects(
    query(brainRead, 'SELECT * FROM brn.get_project_brain_basis($1,$2)', [manageDeniedAccountId, projectId]),
    (error) => error?.code === '42501',
  )
  await assert.rejects(
    query(brainRead, 'SELECT * FROM brn.get_project_brain_basis($1,$2)', [accountId, id()]),
    (error) => error?.code === 'P0002',
  )

  const catalog = (await query(fresh, `
    SELECT n.nspname || '.' || p.proname AS name, pg_get_userbyid(p.proowner) AS owner,
      p.prosecdef, p.proconfig,
      has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE (n.nspname, p.proname) IN (
      ('iam', 'admit_project_brain_context'), ('reg', 'get_project_binding_update'),
      ('reg', 'get_project_brain_snapshot'), ('reg', 'get_project_brain_candidate'),
      ('project', 'get_project_brain_binding'),
      ('project', 'admit_brain_binding_preflight'), ('project', 'get_project_brain_read_basis'),
      ('brn', 'get_project_binding_attestation'), ('brn', 'get_project_brain_basis')
    ) ORDER BY n.nspname, p.proname
  `)).rows
  assert.equal(catalog.length, 9)
  for (const row of catalog) {
    assert.equal(row.prosecdef, true, row.name)
    assert.deepEqual(row.proconfig, ['search_path=pg_catalog, pg_temp'], row.name)
    assert.equal(row.public_execute, false, row.name)
  }
  assert.deepEqual((await query(fresh, `
    SELECT count(*)::int AS count FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'brn' AND p.proname = 'get_project_brain_context'
  `)).rows, [{ count: 0 }])
  const acl = (await query(fresh, `
    SELECT has_table_privilege('hub_s3_read', 'project.brain_binding', 'SELECT') AS project_read_table,
      has_table_privilege('hub_r2_brain_read', 'project.brain_binding', 'SELECT') AS brain_project_table,
      has_table_privilege('hub_r2_brain_read', 'brn.binding_validation', 'SELECT') AS brain_attestation_table,
      has_function_privilege('hub_s3_read', 'project.get_project_brain_binding(uuid, uuid)', 'EXECUTE') AS read_role_execute,
      has_function_privilege('hub_r2_project_binding', 'project.get_project_brain_binding(uuid, uuid)', 'EXECUTE') AS binding_role_execute,
      has_function_privilege('hub_r2_brain_attester', 'reg.get_project_brain_candidate(uuid, uuid)', 'EXECUTE') AS candidate_role_execute,
      has_function_privilege('hub_r2_brain_attester', 'brn.persist_binding_validation(uuid, uuid, uuid, text, text, jsonb)', 'EXECUTE') AS attestation_role_execute,
      has_function_privilege('hub_r2_brain_bootstrap', 'reg.get_project_brain_candidate(uuid, uuid)', 'EXECUTE') AS bootstrap_candidate_execute,
      has_function_privilege('hub_r2_project_binding', 'reg.get_project_brain_candidate(uuid, uuid)', 'EXECUTE') AS binding_candidate_execute,
      has_function_privilege('hub_r2_project_binding', 'brn.persist_binding_validation(uuid, uuid, uuid, text, text, jsonb)', 'EXECUTE') AS binding_attestation_execute,
      has_function_privilege('hub_r2_brain_attester', 'brn.bootstrap_brain_health(text, uuid, text, jsonb)', 'EXECUTE') AS attester_health_execute,
      has_function_privilege('hub_r2_brain_attester', 'reg.bootstrap_workspace_brain(uuid, uuid, uuid, text, text, jsonb)', 'EXECUTE') AS attester_publication_execute,
      has_function_privilege('hub_r2_brain_read', 'reg.get_project_brain_candidate(uuid, uuid)', 'EXECUTE') AS brain_candidate_execute,
      pg_has_role('hub_s3_read', 'project_owner', 'MEMBER') AS project_owner_member,
      pg_has_role('hub_r2_brain_read', 'brain_owner', 'MEMBER') AS brain_owner_member
  `)).rows[0]
  assert.deepEqual(acl, {
    project_read_table: false, brain_project_table: false, brain_attestation_table: false,
    read_role_execute: false, binding_role_execute: true,
    candidate_role_execute: true, attestation_role_execute: true,
    bootstrap_candidate_execute: false, binding_candidate_execute: false,
    binding_attestation_execute: false, attester_health_execute: false,
    attester_publication_execute: false, brain_candidate_execute: false,
    project_owner_member: false, brain_owner_member: false,
  })
})
