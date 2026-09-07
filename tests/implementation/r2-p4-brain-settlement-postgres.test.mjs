import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import pg from 'pg'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'
import { runR2HubMigrations } from '../../scripts/run-hub-migrations.mjs'

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
  const database = `conexus_r2_p4_brain_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  const query = async (connection, statement, values = []) => {
    const client = new pg.Client(connection)
    await client.connect()
    try { return await client.query(statement, values) } finally { await client.end() }
  }
  await query(admin, `CREATE DATABASE ${quoteIdentifier(database)}`)
  const fresh = { ...admin, database }
  t.after(async () => {
    await query(admin, 'ALTER ROLE hub_r2_project_binding PASSWORD NULL').catch(() => {})
    await query(admin, 'ALTER ROLE hub_r2_brain_attester PASSWORD NULL').catch(() => {})
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

const digestOf = (value) => sha256(canonicalBytes(value))
const SOURCE_OLD = 'a'.repeat(40)
const SOURCE_NEW = 'b'.repeat(40)
const OID_BASE = '1'.repeat(40)
const OID_PREVIOUS = '2'.repeat(40)
const OID_CANCEL_BASE = '3'.repeat(40)
const OID_CANCEL_APPLIED = '4'.repeat(40)

const makeCandidate = ({ workspaceId, projectId, connectionId, connectionRevisionId,
  qualificationId, brainRevisionId, brainDigest, sourceRevision = SOURCE_OLD,
  credentialGeneration = '1', inputDigest = 'd'.repeat(64) }) => {
  const registration = {
    queryId: 'fixture-document-keys', queryVersion: '1', workspaceId, projectId,
    connectionId, environment: 'SANDBOX', datasetId: 'documents', grainId: 'document',
    mappingDigest: 'e'.repeat(64),
  }
  const subject = {
    workspaceId, projectId, connectionId, connectionRevisionId, qualificationId,
    credentialGeneration, environment: 'SANDBOX', sourceScopeId: '8'.repeat(64),
    sourceRevision, inputDigest,
  }
  const registrationDigest = digestOf(registration)
  const subjectDigest = digestOf(subject)
  const counts = { totalRows: '0', nullKeyRows: '0', duplicateKeyGroups: '0' }
  const outcome = 'PASS'
  const proofDigest = digestOf({
    registrationDigest, subjectDigest, observationId: 'fixture-empty-document-observation',
    coherence: 'SINGLE_STATEMENT', ...counts, outcome,
  })
  const proof = {
    assertionId: 'document-keys', itemId: 'documents', predicateVersion: '1', outcome,
    registration, registrationDigest, subject, subjectDigest,
    observationId: 'fixture-empty-document-observation', coherence: 'SINGLE_STATEMENT',
    counts, empty: true, proofDigest,
  }
  return {
    schemaVersion: 'conexus-brain-binding-validation/v1', validationState: 'VALID',
    projectId, workspaceId, brainRevisionId, brainDigest, sourceRevision, inputDigest,
    manifestDigest: 'c'.repeat(64), applicableItemIds: ['documents'], proofs: [proof],
  }
}

const setupFixture = async (query, fresh, {
  sourceRevision = SOURCE_OLD, ownerScopeKind = 'PROJECT',
} = {}) => {
  const accountId = randomUUID()
  const workspaceId = randomUUID()
  const projectId = randomUUID()
  const connectionId = randomUUID()
  const connectionRevisionId = randomUUID()
  const qualificationId = randomUUID()
  const artifactId = randomUUID()
  const brainRevisionId = randomUUID()
  const brainDigest = 'a'.repeat(64)
  const configuration = { environment: 'SANDBOX', companyCode: 1 }
  const configurationDigest = digestOf(configuration)
  const brainPayload = {
    schemaVersion: 'conexus-brain/v2', reviewText: 'Synthetic reviewed Brain fixture.',
    knowledgeBrowse: { domains: [] }, items: [{ itemId: 'documents', kind: 'DATASET', grainId: 'document', dependsOn: [] }],
    assertions: [{ assertionId: 'document-keys', itemId: 'documents', kind: 'KEY_CONFORMANCE', predicateVersion: '1', scope: 'SELECTED' }],
  }

  await query(fresh, `
    INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', $2, 'R2 P4 Brain settlement fixture')
  `, [accountId, `r2-p4-brain-${accountId}`])
  await query(fresh, 'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)',
    [workspaceId, `R2 P4 Brain workspace ${workspaceId}`])
  await query(fresh, `
    INSERT INTO iam.workspace_membership(
      account_id, workspace_id, can_create_project, can_read_brain,
      can_read_connection, can_manage_connection, can_qualify_connection
    ) VALUES ($1, $2, false, true, true, true, true)
  `, [accountId, workspaceId])
  await query(fresh, `
    INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'R2 P4 Brain Project', 'NEW', $3, 'r2-p4-brain-project')
  `, [projectId, workspaceId, sourceRevision])
  await query(fresh, `
    INSERT INTO iam.account_project_grant(
      account_id, project_id, can_read, can_manage, can_read_connection,
      can_manage_connection, can_qualify_connection, can_bind_brain, can_use_connection
    ) VALUES ($1, $2, true, true, true, true, true, true, true)
  `, [accountId, projectId])
  await query(fresh, `
    INSERT INTO con.connection(
      connection_id, owner_scope_kind, workspace_id, project_id, name,
      credential_generation, credential_generation_high_watermark
    ) VALUES ($1, $2, $3, $4, 'Synthetic Brain connection', 1, 1)
  `, [connectionId, ownerScopeKind,
    ownerScopeKind === 'WORKSPACE' ? workspaceId : null,
    ownerScopeKind === 'PROJECT' ? projectId : null])
  await query(fresh, `
    INSERT INTO con.connection_revision(
      connection_revision_id, connection_id, connector_definition_id,
      connector_version, configuration, configuration_digest
    ) VALUES ($1, $2, 'synthetic-fixture', '1.0.0', $3::jsonb, $4)
  `, [connectionRevisionId, connectionId, JSON.stringify(configuration), configurationDigest])
  await query(fresh, 'UPDATE con.connection SET current_revision_id = $2 WHERE connection_id = $1',
    [connectionId, connectionRevisionId])
  await query(fresh, `
    INSERT INTO con.connection_qualification(
      qualification_id, connection_id, connection_revision_id, credential_generation,
      environment, qualification_state, outcome, diagnostic, evidence_refs, tested_at
    ) VALUES ($1, $2, $3, 1, 'SANDBOX', 'QUALIFIED', 'PASSED', $4::jsonb,
      ARRAY['fixture:r2-p4-brain'], clock_timestamp())
  `, [qualificationId, connectionId, connectionRevisionId,
    JSON.stringify({ title: 'Synthetic qualification', message: 'Controlled fixture; no provider claim.' })])
  await query(fresh, `
    INSERT INTO project.connection_binding(
      project_id, connection_id, connection_revision_id, qualification_id,
      environment, binding_digest, project_source_revision
    ) VALUES ($1, $2, $3, $4, 'SANDBOX', $5, $6)
  `, [projectId, connectionId, connectionRevisionId, qualificationId,
    digestOf({ connectionId, connectionRevisionId, qualificationId, environment: 'SANDBOX' }),
    sourceRevision])
  await query(fresh, `
    INSERT INTO reg.artifact(artifact_id, workspace_id, kind, semantic_name)
    VALUES ($1, $2, 'brain', 'Synthetic Published Brain')
  `, [artifactId, workspaceId])
  await query(fresh, `
    INSERT INTO reg.artifact_revision(
      artifact_revision_id, artifact_id, source_revision, digest, payload, availability
    ) VALUES ($1, $2, $3, $4, $5::jsonb, 'AVAILABLE')
  `, [brainRevisionId, artifactId, 'f'.repeat(40), brainDigest, JSON.stringify(brainPayload)])
  await query(fresh, 'UPDATE reg.artifact SET published_revision_id = $2 WHERE artifact_id = $1',
    [artifactId, brainRevisionId])

  const candidate = makeCandidate({ workspaceId, projectId, connectionId,
    connectionRevisionId, qualificationId, brainRevisionId, brainDigest, sourceRevision })
  const candidateDigest = digestOf(candidate)
  return {
    accountId, workspaceId, projectId, connectionId, connectionRevisionId, qualificationId,
    brainRevisionId, brainDigest, sourceRevision, candidate, candidateDigest,
  }
}

const snapshot = async (query, fresh, projectId) => (await query(fresh, `
  SELECT project.source_revision,
    (SELECT count(*)::int FROM project.binding_source_intent WHERE project_id = $1) AS intent_count,
    (SELECT count(*)::int FROM project.brain_binding WHERE project_id = $1) AS brain_binding_count,
    (SELECT count(*)::int FROM brn.binding_validation WHERE project_id = $1) AS validation_count
  FROM project.project WHERE project_id = $1
`, [projectId])).rows[0]

const assertRefusedWithoutMutation = async (operation, code, query, fresh, projectId, before) => {
  await assert.rejects(operation, (error) => error?.code === code)
  assert.deepEqual(await snapshot(query, fresh, projectId), before)
}

test('R2-P4 production PostgreSQL Brain settlement proves begin-freeze-validate-complete and source CAS', {
  skip: databaseConfigured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  const { fresh, query, url } = await databaseHarness(t)
  await runR2HubMigrations({ connectionString: url })
  const f = await setupFixture(query, fresh, { ownerScopeKind: 'WORKSPACE' })
  const runtimePassword = randomUUID().replaceAll('-', '')
  const attesterPassword = randomUUID().replaceAll('-', '')
  await query(fresh, `ALTER ROLE hub_r2_project_binding PASSWORD '${runtimePassword}'`)
  await query(fresh, `ALTER ROLE hub_r2_brain_attester PASSWORD '${attesterPassword}'`)
  const runtime = { ...fresh, user: 'hub_r2_project_binding', password: runtimePassword }
  const attesterRuntime = { ...fresh, user: 'hub_r2_brain_attester', password: attesterPassword }
  const pool = new pg.Pool(runtime)
  const validationPool = new pg.Pool(attesterRuntime)
  const restricted = (statement, values = []) => pool.query(statement, values)
  const expected = { state: 'ABSENT' }
  const intentId = randomUUID()
  await validationPool.query(
    'SELECT brn.persist_binding_validation($1,$2,$3,$4,$5,$6)',
    [intentId, f.projectId, f.brainRevisionId, f.brainDigest, f.candidateDigest, f.candidate],
  )
  const begin = (candidate = f.candidate, brainDigest = f.brainDigest, expectedCurrent = expected) => restricted(
    'SELECT project.begin_brain_binding_intent($1,$2,$3,$4,$5,$6,$7,$8) AS intent',
    [f.accountId, f.projectId, f.brainRevisionId, brainDigest, expectedCurrent, candidate,
      digestOf(candidate), intentId],
  )
  const prepared = (await begin()).rows[0].intent
  assert.equal(prepared.state, 'PREPARING')
  assert.equal(prepared.source_revision, SOURCE_OLD)
  assert.deepEqual(prepared.declaration, f.candidate)
  assert.equal(prepared.prepared_result.projectBindingDigest, f.candidateDigest)

  const frozen = (await restricted(
    'SELECT project.freeze_binding_source_intent($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS intent',
    [f.accountId, f.projectId, intentId, prepared.version, f.candidateDigest,
      OID_BASE, OID_PREVIOUS, SOURCE_NEW, OID_CANCEL_BASE, OID_CANCEL_APPLIED],
  )).rows[0].intent
  assert.equal(frozen.state, 'APPLYING')
  assert.equal(frozen.declaration_digest, f.candidateDigest)
  assert.equal(frozen.base_tree, OID_BASE)
  assert.equal(frozen.previous_declaration_blob, OID_PREVIOUS)

  const validated = (await restricted(
    'SELECT project.validate_binding_source_intent($1,$2,$3,$4) AS intent',
    [f.accountId, f.projectId, intentId, frozen.version],
  )).rows[0].intent
  assert.equal(validated.state, 'APPLYING')
  const completed = (await restricted(
    'SELECT project.complete_binding_source_intent($1,$2,$3,$4) AS intent',
    [f.accountId, f.projectId, intentId, frozen.version],
  )).rows[0].intent
  assert.equal(completed.state, 'COMPLETED')
  assert.equal(completed.terminal_source_revision, SOURCE_NEW)
  assert.deepEqual((await query(fresh, `
    SELECT project.source_revision,
      binding.brain_revision_id, binding.brain_digest, binding.project_binding_digest,
      binding.validation_state AS binding_validation_state, binding.project_source_revision,
      validation.candidate, validation.validation_state AS proof_validation_state
    FROM project.project
    JOIN project.brain_binding AS binding USING (project_id)
    JOIN brn.binding_validation AS validation
      ON validation.project_id = binding.project_id
      AND validation.project_binding_digest = binding.project_binding_digest
    WHERE project.project_id = $1
  `, [f.projectId])).rows, [{
    source_revision: SOURCE_NEW, brain_revision_id: f.brainRevisionId,
    brain_digest: f.brainDigest, project_binding_digest: f.candidateDigest,
    binding_validation_state: 'VALID', project_source_revision: SOURCE_NEW,
    candidate: f.candidate, proof_validation_state: 'VALID',
  }])
  await pool.end()
  await validationPool.end()
})

test('R2-P4 production PostgreSQL Brain settlement permits a fresh attestation retry after terminal abort', {
  skip: databaseConfigured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  const { fresh, query, url } = await databaseHarness(t)
  await runR2HubMigrations({ connectionString: url })
  const f = await setupFixture(query, fresh)
  const runtimePassword = randomUUID().replaceAll('-', '')
  const attesterPassword = randomUUID().replaceAll('-', '')
  await query(fresh, `ALTER ROLE hub_r2_project_binding PASSWORD '${runtimePassword}'`)
  await query(fresh, `ALTER ROLE hub_r2_brain_attester PASSWORD '${attesterPassword}'`)
  const pool = new pg.Pool({ ...fresh, user: 'hub_r2_project_binding', password: runtimePassword })
  const validationPool = new pg.Pool({ ...fresh, user: 'hub_r2_brain_attester', password: attesterPassword })
  const firstId = randomUUID()
  const retryId = randomUUID()
  const persist = (validationId) => validationPool.query(
    'SELECT brn.persist_binding_validation($1,$2,$3,$4,$5,$6)',
    [validationId, f.projectId, f.brainRevisionId, f.brainDigest,
      f.candidateDigest, f.candidate],
  )
  const begin = (validationId) => pool.query(
    'SELECT project.begin_brain_binding_intent($1,$2,$3,$4,$5,$6,$7,$8) AS intent',
    [f.accountId, f.projectId, f.brainRevisionId, f.brainDigest, { state: 'ABSENT' },
      f.candidate, f.candidateDigest, validationId],
  )

  await persist(firstId)
  const first = (await begin(firstId)).rows[0].intent
  const aborted = (await pool.query(
    'SELECT project.abort_binding_source_intent($1,$2,$3,$4,$5) AS intent',
    [f.accountId, f.projectId, firstId, first.version, 'XX000'],
  )).rows[0].intent
  assert.equal(aborted.state, 'ABORTED')

  await persist(retryId)
  const retry = (await begin(retryId)).rows[0].intent
  assert.equal(retry.state, 'PREPARING')
  assert.equal(retry.intent_id, retryId)
  assert.deepEqual((await query(fresh, `
    SELECT binding_validation_id FROM brn.binding_validation
    WHERE project_id = $1 AND project_binding_digest = $2
    ORDER BY binding_validation_id
  `, [f.projectId, f.candidateDigest])).rows.map(({ binding_validation_id }) => binding_validation_id),
  [firstId, retryId].sort())

  await pool.end()
  await validationPool.end()
})

test('R2-P4 production PostgreSQL Brain settlement refuses revoked and stale proof bases without mutation', {
  skip: databaseConfigured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  const { fresh, query, url } = await databaseHarness(t)
  await runR2HubMigrations({ connectionString: url })
  const runtimePassword = randomUUID().replaceAll('-', '')
  const attesterPassword = randomUUID().replaceAll('-', '')
  await query(fresh, `ALTER ROLE hub_r2_project_binding PASSWORD '${runtimePassword}'`)
  await query(fresh, `ALTER ROLE hub_r2_brain_attester PASSWORD '${attesterPassword}'`)
  const runtime = { ...fresh, user: 'hub_r2_project_binding', password: runtimePassword }
  const attesterRuntime = { ...fresh, user: 'hub_r2_brain_attester', password: attesterPassword }
  const pool = new pg.Pool(runtime)
  const validationPool = new pg.Pool(attesterRuntime)
  const restricted = (statement, values = []) => pool.query(statement, values)

  const runCase = async (name, mutate, expectedCode, options = {}) => {
    const f = await setupFixture(query, fresh)
    if (mutate) await mutate(f)
    const candidate = options.candidate ? options.candidate(f) : f.candidate
    const brainDigest = options.brainDigest ? options.brainDigest(f) : f.brainDigest
    const expectedCurrent = options.expectedCurrent ? options.expectedCurrent(f) : { state: 'ABSENT' }
    const intentId = randomUUID()
    await validationPool.query(
      'SELECT brn.persist_binding_validation($1,$2,$3,$4,$5,$6)',
      [intentId, f.projectId, f.brainRevisionId, brainDigest, digestOf(candidate), candidate],
    )
    const before = await snapshot(query, fresh, f.projectId)
    await assertRefusedWithoutMutation(() => restricted(
      'SELECT project.begin_brain_binding_intent($1,$2,$3,$4,$5,$6,$7,$8)',
      [f.accountId, f.projectId, f.brainRevisionId, brainDigest, expectedCurrent, candidate,
        digestOf(candidate), intentId],
    ), expectedCode, query, fresh, f.projectId, before)
    return name
  }

  await runCase('brain.bind', async (f) => query(fresh,
    'UPDATE iam.account_project_grant SET can_bind_brain = false WHERE account_id = $1 AND project_id = $2',
    [f.accountId, f.projectId]), '42501')
  await runCase('connection.use', async (f) => query(fresh,
    'UPDATE iam.account_project_grant SET can_use_connection = false WHERE account_id = $1 AND project_id = $2',
    [f.accountId, f.projectId]), '42501')
  await runCase('missing Project binding', async (f) => query(fresh,
    'DELETE FROM project.connection_binding WHERE project_id = $1 AND connection_id = $2',
    [f.projectId, f.connectionId]), 'P0412')
  await runCase('credential', async (f) => query(fresh,
    'UPDATE con.connection SET credential_generation = 2, credential_generation_high_watermark = 2 WHERE connection_id = $1',
    [f.connectionId]), 'P0412')
  await runCase('qualification', async (f) => query(fresh,
    'UPDATE con.connection_qualification SET outcome = \'FAILED\' WHERE qualification_id = $1',
    [f.qualificationId]), 'P0412')
  await runCase('superseded qualification', async (f) => query(fresh, `
    INSERT INTO con.connection_qualification(
      qualification_id, connection_id, connection_revision_id, credential_generation,
      environment, qualification_state, outcome, diagnostic, evidence_refs, tested_at
    ) VALUES ($1, $2, $3, 1, 'SANDBOX', 'QUALIFIED', 'FAILED', $4::jsonb,
      ARRAY['fixture:r2-p4-brain-newer-failure'], clock_timestamp() + interval '1 second')
  `, [randomUUID(), f.connectionId, f.connectionRevisionId,
    JSON.stringify({ title: 'Newer failure', message: 'Synthetic revocation fixture.' })]), 'P0412')
  await runCase('current revision', async (f) => {
    const nextRevisionId = randomUUID()
    const nextQualificationId = randomUUID()
    await query(fresh, `
      INSERT INTO con.connection_revision(
        connection_revision_id, connection_id, connector_definition_id,
        connector_version, configuration, configuration_digest
      ) VALUES ($1, $2, 'synthetic-fixture', '2.0.0', $3::jsonb, $4)
    `, [nextRevisionId, f.connectionId, JSON.stringify({ environment: 'SANDBOX', companyCode: 2 }), 'f'.repeat(64)])
    await query(fresh, 'UPDATE con.connection SET current_revision_id = $2 WHERE connection_id = $1',
      [f.connectionId, nextRevisionId])
    await query(fresh, `
      INSERT INTO con.connection_qualification(
        qualification_id, connection_id, connection_revision_id, credential_generation,
        environment, qualification_state, outcome, diagnostic, evidence_refs, tested_at
      ) VALUES ($1, $2, $3, 1, 'SANDBOX', 'QUALIFIED', 'PASSED', $4::jsonb,
        ARRAY['fixture:r2-p4-brain-new-current'], clock_timestamp() + interval '1 second')
    `, [nextQualificationId, f.connectionId, nextRevisionId,
      JSON.stringify({ title: 'New current revision', message: 'Old Project binding remains explicit.' })])
  }, 'P0412')
  await runCase('expected current', null, 'P0412', {
    expectedCurrent: () => ({ state: 'PRESENT', projectBindingDigest: '9'.repeat(64) }),
  })
  await runCase('Brain digest', null, 'P0002', {
    brainDigest: () => 'f'.repeat(64),
    candidate: (f) => ({ ...f.candidate, brainDigest: 'f'.repeat(64) }),
  })
  const invalid = await setupFixture(query, fresh)
  for (const mutateCandidate of [
    (candidate) => { candidate.proofs[0].registrationDigest = '0'.repeat(64) },
    (candidate) => { candidate.proofs[0].registration.projectId = null },
    (candidate) => { candidate.sourceRevision = null },
  ]) {
    const invalidCandidate = structuredClone(invalid.candidate)
    mutateCandidate(invalidCandidate)
    const beforeInvalid = await snapshot(query, fresh, invalid.projectId)
    await assertRefusedWithoutMutation(() => validationPool.query(
      'SELECT brn.persist_binding_validation($1,$2,$3,$4,$5,$6)',
      [randomUUID(), invalid.projectId, invalid.brainRevisionId, invalid.brainDigest,
        digestOf(invalidCandidate), invalidCandidate],
    ), '22023', query, fresh, invalid.projectId, beforeInvalid)
  }
  await pool.end()
  await validationPool.end()
})
