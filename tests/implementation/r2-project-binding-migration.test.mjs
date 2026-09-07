import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import pg from 'pg'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'
import {
  loadMigrationFiles,
  loadR2MigrationFiles,
  runR2HubMigrations,
} from '../../scripts/run-hub-migrations.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const migrationsRoot = resolve(repositoryRoot, 'apps/hub/migrations')
const expectedR1Versions = Array.from({ length: 10 }, (_, index) => String(index + 1).padStart(3, '0'))
const expectedR2Versions = [...expectedR1Versions, '011', '012', '013', '014', '015', '016', '017', '018']

test('R2 migration custody admits 016/017/018 and preserves historical pins', () => {
  assert.deepEqual(loadMigrationFiles().map(({ version }) => version), expectedR1Versions)
  assert.deepEqual(loadR2MigrationFiles().map(({ version }) => version), expectedR2Versions)
  const fixture = mkdtempSync(resolve(tmpdir(), 'conexus-r2-p4-migrations-'))
  try {
    for (const name of readdirSync(migrationsRoot).filter((entry) => entry.endsWith('.sql'))) {
      copyFileSync(resolve(migrationsRoot, name), resolve(fixture, name))
    }
    writeFileSync(resolve(fixture, '011_r2_brain_connections.sql'), '\n-- drift\n', { flag: 'a' })
    assert.throws(() => loadR2MigrationFiles(fixture), /MIGRATION_011_DIGEST_REFUSED/)
    copyFileSync(resolve(migrationsRoot, '011_r2_brain_connections.sql'), resolve(fixture, '011_r2_brain_connections.sql'))
    writeFileSync(resolve(fixture, '012_r2_project_binding_recovery.sql'), '\n-- drift\n', { flag: 'a' })
    assert.throws(() => loadR2MigrationFiles(fixture), /MIGRATION_012_DIGEST_REFUSED/)
    copyFileSync(resolve(migrationsRoot, '012_r2_project_binding_recovery.sql'), resolve(fixture, '012_r2_project_binding_recovery.sql'))
    writeFileSync(resolve(fixture, '013_r2_binding_source_concordance.sql'), '\n-- drift\n', { flag: 'a' })
    assert.throws(() => loadR2MigrationFiles(fixture), /MIGRATION_013_DIGEST_REFUSED/)
    copyFileSync(resolve(migrationsRoot, '013_r2_binding_source_concordance.sql'), resolve(fixture, '013_r2_binding_source_concordance.sql'))
    writeFileSync(resolve(fixture, '014_r2_brain_binding_settlement.sql'), '\n-- drift\n', { flag: 'a' })
    assert.throws(() => loadR2MigrationFiles(fixture), /MIGRATION_014_DIGEST_REFUSED/)
    copyFileSync(resolve(migrationsRoot, '014_r2_brain_binding_settlement.sql'), resolve(fixture, '014_r2_brain_binding_settlement.sql'))
    writeFileSync(resolve(fixture, '015_r2_project_brain_read_envelopes.sql'), '\n-- drift\n', { flag: 'a' })
    assert.throws(() => loadR2MigrationFiles(fixture), /MIGRATION_015_DIGEST_REFUSED/)
    copyFileSync(resolve(migrationsRoot, '015_r2_project_brain_read_envelopes.sql'), resolve(fixture, '015_r2_project_brain_read_envelopes.sql'))
    writeFileSync(resolve(fixture, '016_r2_brain_binding_removal.sql'), '\n-- drift\n', { flag: 'a' })
    assert.throws(() => loadR2MigrationFiles(fixture), /MIGRATION_016_DIGEST_REFUSED/)
    copyFileSync(resolve(migrationsRoot, '016_r2_brain_binding_removal.sql'), resolve(fixture, '016_r2_brain_binding_removal.sql'))
    writeFileSync(resolve(fixture, '017_r2_key_conformance_subject.sql'), '\n-- drift\n', { flag: 'a' })
    assert.throws(() => loadR2MigrationFiles(fixture), /MIGRATION_017_DIGEST_REFUSED/)
    copyFileSync(resolve(migrationsRoot, '017_r2_key_conformance_subject.sql'), resolve(fixture, '017_r2_key_conformance_subject.sql'))
    writeFileSync(resolve(fixture, '018_r2_brain_revision_selection.sql'), '\n-- drift\n', { flag: 'a' })
    assert.throws(() => loadR2MigrationFiles(fixture), /MIGRATION_018_DIGEST_REFUSED/)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

const databaseConfigured = [
  'CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME',
  'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD',
].every((name) => process.env[name])
const quoteIdentifier = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('UNSAFE_TEST_IDENTIFIER')
  return `"${value}"`
}

const databaseHarness = async (t) => {
  const admin = {
    host: process.env.CONEXUS_TEST_DB_HOST,
    port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME,
    user: process.env.CONEXUS_TEST_DB_USER,
    password: process.env.CONEXUS_TEST_DB_PASSWORD,
  }
  const database = `conexus_r2_p4_migration_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  const query = async (connection, statement, values = []) => {
    const client = new pg.Client(connection)
    await client.connect()
    try { return await client.query(statement, values) } finally { await client.end() }
  }
  await query(admin, `CREATE DATABASE ${quoteIdentifier(database)}`)
  const fresh = { ...admin, database }
  t.after(async () => {
    await query(admin, 'ALTER ROLE hub_s6_inception_command PASSWORD NULL').catch(() => {})
    await query(admin, 'ALTER ROLE hub_r2_brain_attester PASSWORD NULL').catch(() => {})
    await query(admin, 'ALTER ROLE hub_r2_project_binding PASSWORD NULL').catch(() => {})
    await query(admin, `DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`)
  })
  const url = new URL('postgresql://localhost')
  url.hostname = fresh.host
  url.port = String(fresh.port)
  url.pathname = `/${fresh.database}`
  url.username = fresh.user
  url.password = fresh.password
  return { fresh, query, url: url.toString() }
}

test('R2-P4 migration catalog and ACL successor preserve 012..016 while admitting 017', {
  skip: databaseConfigured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  const harness = await databaseHarness(t)
  const { fresh, query, url } = harness
  const first = await runR2HubMigrations({ connectionString: url })
  assert.deepEqual(first.appliedNow, expectedR2Versions)
  assert.deepEqual(first.versions, expectedR2Versions)
  assert.deepEqual((await runR2HubMigrations({ connectionString: url.toString() })).appliedNow, [])

  await query(fresh, 'GRANT SELECT ON project.binding_source_intent TO hub_r2_project_binding')
  await assert.rejects(runR2HubMigrations({ connectionString: url }), /MIGRATION_014_TABLE_PRIVILEGE_REFUSED/)
  await query(fresh, 'REVOKE SELECT ON project.binding_source_intent FROM hub_r2_project_binding')

  await query(fresh, 'GRANT SELECT ON project.connection_binding TO hub_r2_project_binding')
  await assert.rejects(runR2HubMigrations({ connectionString: url }), /MIGRATION_014_TABLE_PRIVILEGE_REFUSED/)
  await query(fresh, 'REVOKE SELECT ON project.connection_binding FROM hub_r2_project_binding')

  await query(fresh, `GRANT EXECUTE ON FUNCTION
    project.prepare_connection_binding(uuid, uuid, uuid, uuid, text, jsonb, boolean)
    TO hub_r2_brain_read`)
  await assert.rejects(runR2HubMigrations({ connectionString: url }), /MIGRATION_014_RUNTIME_FUNCTION_ACL_REFUSED/)
  await query(fresh, `REVOKE EXECUTE ON FUNCTION
    project.prepare_connection_binding(uuid, uuid, uuid, uuid, text, jsonb, boolean)
    FROM hub_r2_brain_read`)

  await query(fresh, 'REVOKE EXECUTE ON FUNCTION con.get_connection(uuid, uuid) FROM hub_r2_connections')
  await assert.rejects(runR2HubMigrations({ connectionString: url }), /MIGRATION_014_RUNTIME_FUNCTION_ACL_REFUSED/)
  await query(fresh, 'GRANT EXECUTE ON FUNCTION con.get_connection(uuid, uuid) TO hub_r2_connections')

  await query(fresh, `GRANT EXECUTE ON FUNCTION
    reg.get_project_brain_candidate(uuid, uuid)
    TO hub_r2_brain_attester WITH GRANT OPTION`)
  await assert.rejects(runR2HubMigrations({ connectionString: url }), /MIGRATION_015_EXECUTE_GRANT_OPTION_REFUSED/)
  await query(fresh, `REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION
    reg.get_project_brain_candidate(uuid, uuid)
    FROM hub_r2_brain_attester`)

  await query(fresh, 'ALTER TABLE con.connection DROP CONSTRAINT connection_current_revision_fkey')
  await assert.rejects(runR2HubMigrations({ connectionString: url }), /MIGRATION_011_CONNECTION_CATALOG_REFUSED/)
  await query(fresh, `ALTER TABLE con.connection ADD CONSTRAINT connection_current_revision_fkey
    FOREIGN KEY (connection_id, current_revision_id)
    REFERENCES con.connection_revision(connection_id, connection_revision_id) ON DELETE RESTRICT`)

  await query(fresh, 'DROP INDEX project.binding_source_intent_one_active')
  await assert.rejects(runR2HubMigrations({ connectionString: url }), /MIGRATION_012_TABLE_CATALOG_REFUSED/)
  await query(fresh, `CREATE UNIQUE INDEX binding_source_intent_one_active
    ON project.binding_source_intent(project_id)
    WHERE state IN ('PREPARING', 'APPLYING', 'ABORTING')`)

  await query(fresh, `ALTER TABLE project.binding_source_intent
    DROP CONSTRAINT binding_source_intent_operation_shape,
    ADD CONSTRAINT binding_source_intent_operation_shape CHECK (true)`)
  await assert.rejects(runR2HubMigrations({ connectionString: url }), /MIGRATION_014_TABLE_CATALOG_REFUSED/)
  await query(fresh, `ALTER TABLE project.binding_source_intent
    DROP CONSTRAINT binding_source_intent_operation_shape,
    ADD CONSTRAINT binding_source_intent_operation_shape CHECK (
      (operation_kind = 'CONNECTION' AND connection_id IS NOT NULL
        AND connection_revision_id IS NOT NULL AND environment IS NOT NULL
        AND brain_revision_id IS NULL AND brain_digest IS NULL)
      OR (operation_kind = 'BRAIN' AND connection_id IS NULL
        AND connection_revision_id IS NULL AND environment IS NULL
        AND brain_revision_id IS NOT NULL AND brain_digest IS NOT NULL))`)

  await query(fresh, `ALTER FUNCTION project.abort_binding_source_intent(uuid, uuid, uuid, bigint, text)
    SECURITY INVOKER`)
  await assert.rejects(runR2HubMigrations({ connectionString: url }), /MIGRATION_014_FUNCTION_SECURITY_REFUSED/)
  await query(fresh, `ALTER FUNCTION project.abort_binding_source_intent(uuid, uuid, uuid, bigint, text)
    SECURITY DEFINER`)

  await query(fresh, 'GRANT USAGE ON SCHEMA reg TO hub_iam_runtime')
  await assert.rejects(runR2HubMigrations({ connectionString: url }), /MIGRATION_014_SCHEMA_PRIVILEGE_REFUSED/)
  await query(fresh, 'REVOKE USAGE ON SCHEMA reg FROM hub_iam_runtime')

  await query(fresh, 'ALTER FUNCTION project.validate_binding_source_intent(uuid, uuid, uuid, bigint) RENAME TO validate_binding_source_intent_drift')
  await assert.rejects(
    runR2HubMigrations({ connectionString: url }),
    /MIGRATION_(?:014_RUNTIME_FUNCTION_ACL|016_FUNCTION_SOURCE)_REFUSED/,
  )
  await query(fresh, 'ALTER FUNCTION project.validate_binding_source_intent_drift(uuid, uuid, uuid, bigint) RENAME TO validate_binding_source_intent')

  const final = await runR2HubMigrations({ connectionString: url })
  assert.deepEqual(final.appliedNow, [])
  assert.deepEqual(final.versions, expectedR2Versions)
  assert.deepEqual((await query(fresh, `
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'project' AND table_name = 'binding_source_intent') AS table_present,
      EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'project' AND indexname = 'binding_source_intent_one_active') AS partial_unique_present,
      EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'inception_binding_source_guard') AS trigger_present,
      EXISTS (SELECT 1 FROM pg_proc AS function_row JOIN pg_namespace AS namespace ON namespace.oid = function_row.pronamespace
        WHERE namespace.nspname = 'project' AND function_row.proname = 'get_binding_source_basis') AS basis_function_present,
      has_function_privilege('hub_r2_project_binding', 'project.validate_binding_source_intent(uuid, uuid, uuid, bigint)', 'EXECUTE') AS validate_execute,
      has_function_privilege('hub_r2_project_binding', 'project.get_binding_source_basis(uuid, uuid, uuid, bigint)', 'EXECUTE') AS basis_execute,
      has_function_privilege('hub_r2_project_binding', 'project.settle_connection_binding(uuid, uuid, uuid, uuid, text, jsonb, boolean, text, text, jsonb, text)', 'EXECUTE') AS old_settle_execute
  `)).rows, [{ table_present: true, partial_unique_present: true, trigger_present: true, basis_function_present: true, validate_execute: true, basis_execute: true, old_settle_execute: false }])
})

test('R2-P4 concordance migration guard refuses an active intent before DDL without changing its row', {
  skip: databaseConfigured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  const { fresh, query, url } = await databaseHarness(t)
  await runR2HubMigrations({ connectionString: url })

  const accountId = randomUUID()
  const workspaceId = randomUUID()
  const projectId = randomUUID()
  const intentId = randomUUID()
  await query(fresh, `
    INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', 'r2-p4-concordance-upgrade', 'R2 P4 Concordance Upgrade')
  `, [accountId])
  await query(fresh, 'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)',
    [workspaceId, 'R2 P4 Concordance Upgrade Workspace'])
  await query(fresh, `
    INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'R2 P4 Concordance Upgrade Project', 'NEW', $3, 'r2-p4-concordance-upgrade')
  `, [projectId, workspaceId, 'a'.repeat(40)])
  await query(fresh, `
    INSERT INTO project.binding_source_intent(
      intent_id, project_id, account_id, workspace_id, connection_id,
      connection_revision_id, environment, expected_current, remove_binding,
      source_revision, declaration
    ) VALUES ($1, $2, $3, $4, $5, $6, 'SANDBOX', '{}'::jsonb, false, $7, $8::jsonb)
  `, [intentId, projectId, accountId, workspaceId, randomUUID(), randomUUID(),
    'b'.repeat(40), JSON.stringify({ bindings: [] })])

  const before = (await query(fresh, `
    SELECT to_jsonb(stored) AS intent
    FROM project.binding_source_intent AS stored WHERE intent_id = $1
  `, [intentId])).rows[0]
  const migration013 = loadR2MigrationFiles().find(({ version }) => version === '013')
  // Exercise the exact migration's pre-DDL guard on a controlled current
  // catalog, not a historical rolling-deployment or old-runtime upgrade.
  assert.equal(migration013.bytes.toString('utf8'), readFileSync(resolve(migrationsRoot, migration013.name), 'utf8'))
  await assert.rejects(
    query(fresh, migration013.bytes.toString('utf8')),
    /PROJECT_BINDING_BASIS_MIGRATION_ACTIVE_INTENT/,
  )
  assert.deepEqual((await query(fresh, `
    SELECT to_jsonb(stored) AS intent
    FROM project.binding_source_intent AS stored WHERE intent_id = $1
  `, [intentId])).rows[0], before)
})

test('R2-P4 real restricted PostgreSQL Inception trigger preserves reservation/replay and refuses pending refinement before receipt insert', {
  skip: databaseConfigured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  const { fresh, query, url } = await databaseHarness(t)
  await runR2HubMigrations({ connectionString: url })

  const accountId = randomUUID()
  const workspaceId = randomUUID()
  const projectId = randomUUID()
  const connectionId = randomUUID()
  const connectionRevisionId = randomUUID()
  const qualificationId = randomUUID()
  const sourceRevision = 'a'.repeat(40)
  const configuration = { environment: 'SANDBOX', companyCode: 123 }
  const configurationDigest = sha256(canonicalBytes(configuration))

  await query(fresh, `
    INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', 'r2-p4-inception', 'R2 P4 Inception')
  `, [accountId])
  await query(fresh, 'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)',
    [workspaceId, 'R2 P4 Inception Workspace'])
  await query(fresh, `
    INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project)
    VALUES ($1, $2, true)
  `, [accountId, workspaceId])
  await query(fresh, `
    INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'R2 P4 Inception Project', 'NEW', $3, 'r2-p4-inception')
  `, [projectId, workspaceId, sourceRevision])
  await query(fresh, `
    INSERT INTO iam.account_project_grant(
      account_id, project_id, can_read, can_manage,
      can_read_connection, can_manage_connection, can_qualify_connection, can_use_connection
    ) VALUES ($1, $2, true, true, true, true, true, true)
  `, [accountId, projectId])

  await query(fresh, `
    INSERT INTO con.connection(
      connection_id, owner_scope_kind, project_id, name,
      credential_generation, credential_generation_high_watermark
    ) VALUES ($1, 'PROJECT', $2, 'R2 P4 test connection', 1, 1)
  `, [connectionId, projectId])
  await query(fresh, `
    INSERT INTO con.connection_revision(
      connection_revision_id, connection_id, connector_definition_id,
      connector_version, configuration, configuration_digest
    ) VALUES ($1, $2, 'sankhya-om', '1.0.0', $3, $4)
  `, [connectionRevisionId, connectionId, JSON.stringify(configuration), configurationDigest])
  await query(fresh, `
    UPDATE con.connection SET current_revision_id = $2 WHERE connection_id = $1
  `, [connectionId, connectionRevisionId])
  await query(fresh, `
    INSERT INTO con.connection_qualification(
      qualification_id, connection_id, connection_revision_id, credential_generation,
      environment, qualification_state, outcome, diagnostic, evidence_refs, tested_at
    ) VALUES ($1, $2, $3, 1, 'SANDBOX', 'QUALIFIED', 'PASSED', $4, ARRAY['r2-p4-test'], clock_timestamp())
  `, [qualificationId, connectionId, connectionRevisionId,
    JSON.stringify({ title: 'R2 P4 test', message: 'Restricted migration proof fixture' })])

  const inceptionPassword = 'r2-p4-inception-migration-test'
  const bindingPassword = 'r2-p4-binding-migration-test'
  await query(fresh, `ALTER ROLE hub_s6_inception_command PASSWORD '${inceptionPassword}'`)
  await query(fresh, `ALTER ROLE hub_r2_project_binding PASSWORD '${bindingPassword}'`)
  const inception = { ...fresh, user: 'hub_s6_inception_command', password: inceptionPassword }
  const binding = { ...fresh, user: 'hub_r2_project_binding', password: bindingPassword }

  const reserve = (key, request, attempt, priorCandidateDigest = null) => query(inception,
    'SELECT * FROM project.reserve_or_replay_inception($1,$2,$3,$4,$5,$6)',
    [accountId, projectId, sha256(Buffer.from(key)), sha256(canonicalBytes(request)), attempt, priorCandidateDigest])

  const requestA = { intent: 'Create the initial bounded Project baseline' }
  const keyA = 'r2-p4-inception-first-use'
  const attemptA = randomUUID()
  const reservedA = (await reserve(keyA, requestA, attemptA)).rows[0]
  assert.equal(reservedA.state, 'RESERVED')
  assert.equal(reservedA.source_revision, sourceRevision)

  const candidateAValue = {
    sourceRevision,
    sourceText: 'R2 P4 migration candidate A',
    applicationRuntimeProfile: 'MANAGED',
  }
  const candidateA = {
    candidateBaselineDigest: sha256(canonicalBytes(candidateAValue)),
    ...candidateAValue,
  }
  await query(inception, `SELECT project.complete_inception(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
  )`, [accountId, projectId, sha256(Buffer.from(keyA)), sha256(canonicalBytes(requestA)), attemptA,
    sourceRevision, null, candidateA.candidateBaselineDigest, candidateA.sourceText,
    candidateA.applicationRuntimeProfile, JSON.stringify(candidateA)])
  const replayA = (await reserve(keyA, requestA, randomUUID())).rows[0]
  assert.equal(replayA.state, 'REPLAY')
  assert.deepEqual(replayA.response_body, candidateA)

  const requestB = {
    intent: 'Refine the initial bounded Project baseline',
    priorCandidateBaselineDigest: candidateA.candidateBaselineDigest,
    reviewFeedback: 'Add a second bounded concern',
  }
  const keyB = 'r2-p4-inception-refinement'
  const attemptB = randomUUID()
  const reservedB = (await reserve(keyB, requestB, attemptB, candidateA.candidateBaselineDigest)).rows[0]
  assert.equal(reservedB.state, 'RESERVED')
  const candidateBValue = {
    sourceRevision,
    sourceText: 'R2 P4 migration candidate B',
    applicationRuntimeProfile: 'MANAGED',
  }
  const candidateB = {
    candidateBaselineDigest: sha256(canonicalBytes(candidateBValue)),
    ...candidateBValue,
  }
  await query(inception, `SELECT project.complete_inception(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
  )`, [accountId, projectId, sha256(Buffer.from(keyB)), sha256(canonicalBytes(requestB)), attemptB,
    sourceRevision, candidateA.candidateBaselineDigest, candidateB.candidateBaselineDigest,
    candidateB.sourceText, candidateB.applicationRuntimeProfile, JSON.stringify(candidateB)])
  const replayB = (await reserve(keyB, requestB, randomUUID(), candidateA.candidateBaselineDigest)).rows[0]
  assert.equal(replayB.state, 'REPLAY')
  assert.deepEqual(replayB.response_body, candidateB)

  const pendingIntentId = randomUUID()
  const pending = (await query(binding, `SELECT project.begin_connection_binding_intent(
    $1,$2,$3,$4,$5,$6,$7,$8
  ) AS intent`, [accountId, projectId, connectionId, connectionRevisionId, 'SANDBOX',
    JSON.stringify({ state: 'ABSENT' }), false, pendingIntentId])).rows[0].intent
  assert.equal(pending.state, 'PREPARING')

  await query(fresh, `
    INSERT INTO project.connection_binding(
      project_id, connection_id, connection_revision_id, qualification_id,
      environment, binding_digest, project_source_revision
    ) VALUES ($1, $2, $3, $4, 'SANDBOX', $5, $6)
  `, [projectId, connectionId, connectionRevisionId, qualificationId, 'c'.repeat(64), sourceRevision])
  await query(fresh, `
    INSERT INTO project.brain_binding(
      project_id, brain_revision_id, brain_digest, project_binding_digest,
      validation_state, project_source_revision
    ) VALUES ($1, $2, $3, $4, 'VALID', $5)
  `, [projectId, randomUUID(), 'd'.repeat(64), 'e'.repeat(64), sourceRevision])
  const basis = (await query(binding, `SELECT project.get_binding_source_basis(
    $1,$2,$3,$4
  ) AS basis`, [accountId, projectId, pendingIntentId, 0])).rows[0].basis
  assert.deepEqual(basis, {
    connectionDeclaration: {
      bindings: [{
        connectionId,
        connectionRevisionId,
        qualificationId,
        environment: 'SANDBOX',
      }],
    },
    brainBindingDigest: 'e'.repeat(64),
  })
  await assert.rejects(
    query(binding, `SELECT project.get_binding_source_basis($1,$2,$3,$4) AS basis`,
      [accountId, projectId, pendingIntentId, 1]),
    /PROJECT_BINDING_INTENT_CONFLICT/,
  )
  const wrongActorId = randomUUID()
  await query(fresh, `
    INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', 'r2-p4-concordance-wrong-actor', 'R2 P4 Concordance Wrong Actor')
  `, [wrongActorId])
  await assert.rejects(
    query(binding, `SELECT project.get_binding_source_basis($1,$2,$3,$4) AS basis`,
      [wrongActorId, projectId, pendingIntentId, 0]),
    /PROJECT_NOT_FOUND/,
  )
  await query(fresh, 'DELETE FROM project.brain_binding WHERE project_id = $1', [projectId])
  const absentBrainBasis = (await query(binding, `SELECT project.get_binding_source_basis(
    $1,$2,$3,$4
  ) AS basis`, [accountId, projectId, pendingIntentId, 0])).rows[0].basis
  assert.equal(absentBrainBasis.brainBindingDigest, null)
  await query(fresh, 'DELETE FROM project.connection_binding WHERE project_id = $1', [projectId])

  const abort = (intentId, version, refusalCode) => query(binding,
    'SELECT project.abort_binding_source_intent($1,$2,$3,$4,$5) AS intent',
    [accountId, projectId, intentId, version, refusalCode])
  await assert.rejects(
    abort(pendingIntentId, 1, 'XX000'),
    /PROJECT_BINDING_INTENT_CONFLICT/,
  )
  await assert.rejects(
    abort(pendingIntentId, null, 'XX000'),
    /PROJECT_BINDING_INTENT_CONFLICT/,
  )

  const pendingRequest = {
    intent: 'Refine while Project binding is pending',
    priorCandidateBaselineDigest: candidateB.candidateBaselineDigest,
    reviewFeedback: 'Must be refused before Inception receipt insertion',
  }
  const pendingKey = 'r2-p4-inception-pending-refinement'
  const pendingKeyDigest = sha256(Buffer.from(pendingKey))
  await assert.rejects(
    reserve(pendingKey, pendingRequest, randomUUID(), candidateB.candidateBaselineDigest),
    /PRJ07_BINDING_SOURCE_CONFLICT/,
  )
  assert.deepEqual((await query(fresh, `
    SELECT count(*)::integer AS count
    FROM project.inception_idempotency
    WHERE account_id = $1 AND project_id = $2 AND key_digest = $3
  `, [accountId, projectId, pendingKeyDigest])).rows, [{ count: 0 }])

  const abandoned = (await abort(pendingIntentId, 0, 'XX000')).rows[0].intent
  assert.equal(abandoned.state, 'ABORTED')
  assert.equal(abandoned.version, 1)
  assert.equal(abandoned.refusal_code, 'XX000')
  assert.equal(abandoned.terminal_source_revision, sourceRevision)
  for (const field of [
    'declaration_digest', 'base_tree', 'previous_declaration_blob',
    'apply_source_revision', 'cancel_base_source_revision', 'cancel_applied_source_revision',
  ]) assert.equal(abandoned[field], null)
  assert.deepEqual((await query(fresh, `
    SELECT project.source_revision,
      (SELECT count(*)::integer FROM project.connection_binding WHERE project_id = $1) AS binding_count
    FROM project.project WHERE project_id = $1
  `, [projectId])).rows, [{ source_revision: sourceRevision, binding_count: 0 }])

  await assert.rejects(query(binding, `SELECT project.freeze_binding_source_intent(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
  )`, [accountId, projectId, pendingIntentId, 0, '1'.repeat(64), '2'.repeat(40),
    '3'.repeat(40), '4'.repeat(40), '5'.repeat(40), '6'.repeat(40)]),
  /PROJECT_BINDING_INTENT_CONFLICT/)

  const resumedRequest = {
    intent: 'Refine after pending binding abandonment',
    priorCandidateBaselineDigest: candidateB.candidateBaselineDigest,
    reviewFeedback: 'The fenced pending intent no longer blocks admission',
  }
  const resumedReservation = (await reserve(
    'r2-p4-inception-after-abandonment', resumedRequest, randomUUID(), candidateB.candidateBaselineDigest,
  )).rows[0]
  assert.equal(resumedReservation.state, 'RESERVED')

  const applyingIntentId = randomUUID()
  const applying = (await query(binding, `SELECT project.begin_connection_binding_intent(
    $1,$2,$3,$4,$5,$6,$7,$8
  ) AS intent`, [accountId, projectId, connectionId, connectionRevisionId, 'SANDBOX',
    JSON.stringify({ state: 'ABSENT' }), false, applyingIntentId])).rows[0].intent
  assert.equal(applying.state, 'PREPARING')
  const frozen = (await query(binding, `SELECT project.freeze_binding_source_intent(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
  ) AS intent`, [accountId, projectId, applyingIntentId, 0, '7'.repeat(64), '8'.repeat(40),
    '9'.repeat(40), 'b'.repeat(40), 'c'.repeat(40), 'd'.repeat(40)])).rows[0].intent
  assert.equal(frozen.state, 'APPLYING')
  await assert.rejects(
    query(binding, `SELECT project.get_binding_source_basis($1,$2,$3,$4) AS basis`,
      [accountId, projectId, applyingIntentId, 1]),
    /PROJECT_BINDING_INTENT_CONFLICT/,
  )
  await assert.rejects(
    abort(applyingIntentId, 1, 'XX000'),
    /PROJECT_BINDING_REFUSAL_CODE_REFUSED/,
  )
  assert.equal((await query(fresh,
    'SELECT state FROM project.binding_source_intent WHERE intent_id = $1', [applyingIntentId])).rows[0].state,
  'APPLYING')
})
