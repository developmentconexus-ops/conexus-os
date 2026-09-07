import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import pg from 'pg'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'
import { runHubMigrations, runR2HubMigrations } from '../../scripts/run-hub-migrations.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const gitLive = process.env.CONEXUS_R2_P4_GIT_LIVE === 'true'
const databaseConfigured = [
  'CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME',
  'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD',
].every((name) => process.env[name])

test('R2-P4 binding Git program cannot garbage-collect another writer\'s unreferenced objects', () => {
  const source = readFileSync(resolve(repositoryRoot, 'apps/hub/src/project/git-execution.ts'), 'utf8')
  const program = source.match(/const PROJECT_BINDING_CAS_PROGRAM = `([\s\S]*?)\n`/)[1]
  const destructiveGit = /run\(\[\s*['"](?:prune|gc|repack)['"]/
  assert.doesNotMatch(program, destructiveGit)
  assert.match("run(['prune', '--expire', 'now', '--no-progress'])", destructiveGit)
})

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
  const database = `conexus_r2_p4_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  const query = async (connection, statement, values = []) => {
    const client = new pg.Client(connection)
    await client.connect()
    try { return await client.query(statement, values) } finally { await client.end() }
  }
  await query(admin, `CREATE DATABASE ${quoteIdentifier(database)}`)
  const fresh = { ...admin, database }
  t.after(() => query(admin, `DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`))
  const url = new URL('postgresql://localhost')
  url.hostname = fresh.host
  url.port = String(fresh.port)
  url.pathname = `/${fresh.database}`
  url.username = fresh.user
  url.password = fresh.password
  return { admin, fresh, query, url: url.toString() }
}

test('R2-P4 real PostgreSQL proves receipt-scoped backfill, future settlement and independent revocation', {
  skip: databaseConfigured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  const harness = await databaseHarness(t)
  const { query, fresh, url } = harness
  await runHubMigrations({ connectionString: url })

  const creatorId = randomUUID()
  const genericGrantId = randomUUID()
  const futureCreatorId = randomUUID()
  const workspaceId = randomUUID()
  const existingProjectId = randomUUID()
  const foreignReceiptProjectId = randomUUID()
  const futureProjectId = randomUUID()
  const existingKeyDigest = '1'.repeat(64)
  const existingRequestDigest = '2'.repeat(64)
  const foreignReceiptKeyDigest = '5'.repeat(64)
  const foreignReceiptRequestDigest = '6'.repeat(64)
  const futureKeyDigest = '3'.repeat(64)
  const futureRequestDigest = '4'.repeat(64)

  await query(fresh, `
    INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', 'r2-p4-creator', 'R2 P4 Creator'),
      ($2, 'https://issuer.test', 'r2-p4-generic', 'R2 P4 Generic Grant'),
      ($3, 'https://issuer.test', 'r2-p4-future', 'R2 P4 Future Creator')
  `, [creatorId, genericGrantId, futureCreatorId])
  await query(fresh, 'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, 'R2 P4 Workspace'])
  await query(fresh, `
    INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project)
    VALUES ($1, $4, true), ($2, $4, false), ($3, $4, true)
  `, [creatorId, genericGrantId, futureCreatorId, workspaceId])
  await query(fresh, `
    INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'Existing Creator Project', 'NEW', 'source-existing', 'project-existing')
  `, [existingProjectId, workspaceId])
  await query(fresh, `
    INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'Foreign Receipt Project', 'NEW', 'source-foreign', 'project-foreign')
  `, [foreignReceiptProjectId, workspaceId])
  await query(fresh, `
    INSERT INTO project.operation_idempotency(
      operation_id, account_id, workspace_id, key_digest, request_digest,
      reserved_project_id, outcome, response_status, response_digest, response_body, completed_at
    ) VALUES ('PRJ-03', $1, $2, $3, $4, $5, 'SUCCEEDED', 201, $6, '{}'::jsonb, clock_timestamp())
  `, [creatorId, workspaceId, existingKeyDigest, existingRequestDigest, existingProjectId, 'a'.repeat(64)])
  await query(fresh, `
    INSERT INTO project.operation_idempotency(
      operation_id, account_id, workspace_id, key_digest, request_digest,
      reserved_project_id, outcome, response_status, response_digest, response_body, completed_at
    ) VALUES ('PRJ-03', $1, $2, $3, $4, $5, 'SUCCEEDED', 201, $6, '{}'::jsonb, clock_timestamp())
  `, [genericGrantId, workspaceId, foreignReceiptKeyDigest, foreignReceiptRequestDigest, foreignReceiptProjectId, 'b'.repeat(64)])
  await query(fresh, `
    INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage)
    VALUES ($1, $3, true, true), ($2, $3, true, true)
  `, [creatorId, genericGrantId, existingProjectId])

  await runR2HubMigrations({ connectionString: url })

  const grantsAfterBackfill = (await query(fresh, `
    SELECT account_id, can_read, can_manage,
      can_read_connection, can_manage_connection, can_qualify_connection,
      can_bind_brain, can_use_connection
    FROM iam.account_project_grant
    WHERE project_id = $1
    ORDER BY account_id
  `, [existingProjectId])).rows
  assert.deepEqual(grantsAfterBackfill.map((row) => ({
    ...row,
    account_id: row.account_id === creatorId ? 'creator' : 'generic',
  })).sort((left, right) => left.account_id.localeCompare(right.account_id)), [
    {
      account_id: 'creator', can_read: true, can_manage: true,
      can_read_connection: true, can_manage_connection: true, can_qualify_connection: true,
      can_bind_brain: true, can_use_connection: true,
    },
    {
      account_id: 'generic', can_read: true, can_manage: true,
      can_read_connection: true, can_manage_connection: true, can_qualify_connection: true,
      can_bind_brain: false, can_use_connection: false,
    },
  ])

  await query(fresh, `
    INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'Future Creator Project', 'NEW', 'source-future', 'project-future')
  `, [futureProjectId, workspaceId])
  await query(fresh, `
    INSERT INTO project.operation_idempotency(
      operation_id, account_id, workspace_id, key_digest, request_digest, reserved_project_id, outcome
    ) VALUES ('PRJ-03', $1, $2, $3, $4, $5, 'RESERVED')
  `, [futureCreatorId, workspaceId, futureKeyDigest, futureRequestDigest, futureProjectId])
  await query(fresh, 'SELECT iam.establish_project_creator_grant($1, $2, $3, $4, $5)', [
    futureCreatorId, workspaceId, futureKeyDigest, futureRequestDigest, futureProjectId,
  ])

  assert.deepEqual((await query(fresh, `
    SELECT can_read, can_manage,
      can_read_connection, can_manage_connection, can_qualify_connection,
      can_bind_brain, can_use_connection
    FROM iam.account_project_grant WHERE account_id = $1 AND project_id = $2
  `, [futureCreatorId, futureProjectId])).rows, [{
    can_read: true, can_manage: true,
    can_read_connection: true, can_manage_connection: true, can_qualify_connection: true,
    can_bind_brain: true, can_use_connection: true,
  }])

  await query(fresh, `
    UPDATE iam.account_project_grant
    SET can_bind_brain = false
    WHERE account_id = $1 AND project_id = $2
  `, [futureCreatorId, futureProjectId])
  assert.deepEqual((await query(fresh, `
    SELECT can_read, can_manage,
      can_read_connection, can_manage_connection, can_qualify_connection,
      can_bind_brain, can_use_connection
    FROM iam.account_project_grant WHERE account_id = $1 AND project_id = $2
  `, [futureCreatorId, futureProjectId])).rows, [{
    can_read: true, can_manage: true,
    can_read_connection: true, can_manage_connection: true, can_qualify_connection: true,
    can_bind_brain: false, can_use_connection: true,
  }])

  await query(fresh, `
    UPDATE iam.account_project_grant
    SET can_bind_brain = true, can_use_connection = false
    WHERE account_id = $1 AND project_id = $2
  `, [futureCreatorId, futureProjectId])
  assert.deepEqual((await query(fresh, `
    SELECT can_bind_brain, can_use_connection
    FROM iam.account_project_grant WHERE account_id = $1 AND project_id = $2
  `, [futureCreatorId, futureProjectId])).rows, [{
    can_bind_brain: true, can_use_connection: false,
  }])

  await runR2HubMigrations({ connectionString: url })
  assert.deepEqual((await query(fresh, `
    SELECT can_bind_brain, can_use_connection
    FROM iam.account_project_grant WHERE account_id = $1 AND project_id = $2
  `, [futureCreatorId, futureProjectId])).rows, [{
    can_bind_brain: true, can_use_connection: false,
  }])
})

test('R2-P4 production PostgreSQL binding SQL proves current-state settlement and owner isolation (fixture source OIDs; no Git/provider claim)', {
  skip: databaseConfigured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  const harness = await databaseHarness(t)
  const { fresh, query, url } = harness
  await runR2HubMigrations({ connectionString: url })

  const accountId = randomUUID()
  const foreignAccountId = randomUUID()
  const workspaceId = randomUUID()
  const projectId = randomUUID()
  const foreignProjectId = randomUUID()
  const connectionId = randomUUID()
  const connectionRevisionId = randomUUID()
  const qualificationId = randomUUID()
  const sourceOld = 'a'.repeat(40)
  const sourceNew = 'b'.repeat(40)
  const sourceTampered = 'c'.repeat(40)
  const sourceRemoved = 'd'.repeat(40)
  const qualificationFixture = {
    title: 'Fixture qualification',
    message: 'Trusted owner fixture; no provider or credential claim.',
  }
  const expectedAbsent = { state: 'ABSENT' }
  const expectedPresent = {
    state: 'PRESENT', connectionRevisionId, environment: 'SANDBOX',
  }

  await query(fresh, `
    INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', 'r2-p4-sql-manager', 'R2 P4 SQL manager'),
      ($2, 'https://issuer.test', 'r2-p4-sql-foreign', 'R2 P4 SQL foreign owner')
  `, [accountId, foreignAccountId])
  await query(fresh, 'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, 'R2 P4 SQL Workspace'])
  await query(fresh, `
    INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project)
    VALUES ($1, $3, false), ($2, $3, false)
  `, [accountId, foreignAccountId, workspaceId])
  await query(fresh, `
    INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $3, 'R2 P4 SQL Project', 'NEW', $4, 'project-revision'),
      ($2, $3, 'R2 P4 SQL Foreign Project', 'NEW', $5, 'foreign-project-revision')
  `, [projectId, foreignProjectId, workspaceId, sourceOld, 'e'.repeat(40)])
  await query(fresh, `
    INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage, can_use_connection)
    VALUES ($1, $3, true, true, true), ($2, $4, true, true, true)
  `, [accountId, foreignAccountId, projectId, foreignProjectId])
  await query(fresh, `
    INSERT INTO con.connection(
      connection_id, owner_scope_kind, workspace_id, name,
      credential_generation, credential_generation_high_watermark
    ) VALUES ($1, 'WORKSPACE', $2, 'Sankhya Finance', 1, 1)
  `, [connectionId, workspaceId])
  await query(fresh, `
    INSERT INTO con.connection_revision(
      connection_revision_id, connection_id, connector_definition_id,
      connector_version, configuration, configuration_digest
    ) VALUES ($1, $2, 'sankhya-om', '1.0.0',
      '{"environment":"SANDBOX","companyCode":1}'::jsonb, $3)
  `, [connectionRevisionId, connectionId, 'f'.repeat(64)])
  await query(fresh, 'UPDATE con.connection SET current_revision_id = $2 WHERE connection_id = $1', [connectionId, connectionRevisionId])
  await query(fresh, `
    INSERT INTO con.connection_qualification(
      qualification_id, connection_id, connection_revision_id,
      credential_generation, environment, qualification_state, outcome,
      diagnostic, evidence_refs, tested_at
    ) VALUES ($1, $2, $3, 1, 'SANDBOX', 'QUALIFIED', 'PASSED', $4::jsonb,
      ARRAY['fixture:r2-p4-sql'], clock_timestamp())
  `, [qualificationId, connectionId, connectionRevisionId, JSON.stringify(qualificationFixture)])

  const runtimePassword = randomUUID().replaceAll('-', '')
  await query(fresh, `ALTER ROLE hub_r2_project_binding PASSWORD '${runtimePassword}'`)
  const runtime = { ...fresh, user: 'hub_r2_project_binding', password: runtimePassword }
  const pool = new pg.Pool(runtime)
  t.after(() => pool.end())
  const restricted = (statement, values = []) => pool.query(statement, values)
  const assertCode = async (operation, code) => {
    await assert.rejects(operation, (error) => error?.code === code)
  }
  const legacyPrepare = (project, connection, revision, environment, expected, remove = false) => restricted(
    'SELECT * FROM project.prepare_connection_binding($1, $2, $3, $4, $5, $6, $7)',
    [accountId, project, connection, revision, environment, expected, remove],
  )
  const legacySettle = (project, connection, revision, environment, expected, remove, oldSource, newSource, declaration, digest) => restricted(
    'SELECT project.settle_connection_binding($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) AS result',
    [accountId, project, connection, revision, environment, expected, remove, oldSource, newSource, declaration, digest],
  )
  const begin = (project, connection, revision, environment, expected, remove = false, intentId = randomUUID()) => restricted(
    'SELECT project.begin_connection_binding_intent($1, $2, $3, $4, $5, $6, $7, $8) AS intent',
    [accountId, project, connection, revision, environment, expected, remove, intentId],
  )
  const freeze = (intent, applySourceRevision, cancelBaseSourceRevision, cancelAppliedSourceRevision) => restricted(
    'SELECT project.freeze_binding_source_intent($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) AS intent',
    [accountId, intent.project_id, intent.intent_id, intent.version,
      sha256(canonicalBytes(intent.declaration)), 'e'.repeat(40), null,
      applySourceRevision, cancelBaseSourceRevision, cancelAppliedSourceRevision],
  )
  const complete = (intent) => restricted(
    'SELECT project.complete_binding_source_intent($1, $2, $3, $4) AS intent',
    [accountId, intent.project_id, intent.intent_id, intent.version],
  )
  const abort = (intent, code) => restricted(
    'SELECT project.abort_binding_source_intent($1, $2, $3, $4, $5) AS intent',
    [accountId, intent.project_id, intent.intent_id, intent.version, code],
  )
  const completeAbort = (intent, sourceRevision) => restricted(
    'SELECT project.complete_binding_source_abort($1, $2, $3, $4, $5) AS intent',
    [accountId, intent.project_id, intent.intent_id, intent.version, sourceRevision],
  )

  // Listing is a Project-manage read and remains empty when use is revoked;
  // selecting a Connection for binding is separately denied by can_use_connection.
  await query(fresh, 'UPDATE iam.account_project_grant SET can_use_connection = false WHERE account_id = $1 AND project_id = $2',
    [accountId, projectId])
  assert.deepEqual((await restricted('SELECT * FROM project.list_connection_bindings($1, $2)', [accountId, projectId])).rows, [])
  await assertCode(legacyPrepare(projectId, connectionId, connectionRevisionId, 'SANDBOX', expectedAbsent), '42501')
  await assertCode(legacySettle(
    projectId, connectionId, connectionRevisionId, 'SANDBOX', expectedAbsent, false,
    sourceOld, sourceNew, { bindings: [] }, sha256(canonicalBytes({ bindings: [] })),
  ), '42501')
  await assertCode(begin(projectId, connectionId, connectionRevisionId, 'SANDBOX', expectedAbsent), '42501')
  await query(fresh, 'UPDATE iam.account_project_grant SET can_use_connection = true WHERE account_id = $1 AND project_id = $2',
    [accountId, projectId])

  const preparedIntent = (await begin(projectId, connectionId, connectionRevisionId, 'SANDBOX', expectedAbsent)).rows[0].intent
  assert.equal(preparedIntent.state, 'PREPARING')
  assert.equal(preparedIntent.source_revision, sourceOld)
  const declaration = preparedIntent.declaration
  const digest = sha256(canonicalBytes(declaration))
  assert.deepEqual(declaration, {
    bindings: [{ connectionId, connectionRevisionId, environment: 'SANDBOX', qualificationId }],
  })
  assert.deepEqual(preparedIntent.prepared_result, {
    connectionId, connectionRevisionId, environment: 'SANDBOX', connectionName: 'Sankhya Finance',
  })
  const frozenIntent = (await freeze(preparedIntent, sourceNew, 'c'.repeat(40), 'd'.repeat(40))).rows[0].intent
  assert.equal(frozenIntent.state, 'APPLYING')
  assert.equal(frozenIntent.declaration_digest, digest)
  const completedIntent = (await complete(frozenIntent)).rows[0].intent
  assert.equal(completedIntent.state, 'COMPLETED')
  assert.deepEqual(completedIntent.terminal_result, preparedIntent.prepared_result)
  assert.deepEqual((await query(fresh, `
    SELECT project.source_revision, binding.connection_id, binding.connection_revision_id,
      binding.qualification_id, binding.environment, binding.binding_digest,
      binding.project_source_revision
    FROM project.project AS project
    JOIN project.connection_binding AS binding ON binding.project_id = project.project_id
    WHERE project.project_id = $1
  `, [projectId])).rows, [{
    source_revision: sourceNew, connection_id: connectionId,
    connection_revision_id: connectionRevisionId, qualification_id: qualificationId,
    environment: 'SANDBOX', binding_digest: digest, project_source_revision: sourceNew,
  }])

  // A consumed ABSENT expectation and stale source both fail with the frozen
  // precondition code and leave source/binding state unchanged.
  await assertCode(begin(projectId, connectionId, connectionRevisionId, 'SANDBOX', expectedAbsent), 'P0412')
  const staleIntent = (await begin(projectId, connectionId, connectionRevisionId, 'SANDBOX', expectedPresent)).rows[0].intent
  const staleFrozen = (await freeze(staleIntent, sourceTampered, 'e'.repeat(40), 'f'.repeat(40))).rows[0].intent
  await query(fresh, 'UPDATE project.project SET source_revision = $2 WHERE project_id = $1', [projectId, sourceTampered])
  await assertCode(complete(staleFrozen), 'P0412')
  await query(fresh, 'UPDATE project.project SET source_revision = $2 WHERE project_id = $1', [projectId, sourceNew])
  const staleAborting = (await abort(staleFrozen, 'P0412')).rows[0].intent
  const staleAborted = (await completeAbort(staleAborting, 'e'.repeat(40))).rows[0].intent
  assert.equal(staleAborted.state, 'ABORTED')
  await query(fresh, 'UPDATE project.project SET source_revision = $2 WHERE project_id = $1', [projectId, sourceNew])
  const tamperedDeclaration = {
    bindings: [{ ...declaration.bindings[0], qualificationId: randomUUID() }],
  }
  const tamperedIntent = (await begin(projectId, connectionId, connectionRevisionId, 'SANDBOX', expectedPresent)).rows[0].intent
  await query(fresh, 'UPDATE project.binding_source_intent SET declaration = $2 WHERE intent_id = $1',
    [tamperedIntent.intent_id, tamperedDeclaration])
  const tamperedFrozen = (await restricted(
    'SELECT project.get_binding_source_intent($1, $2, $3) AS intent',
    [accountId, projectId, tamperedIntent.intent_id],
  )).rows[0].intent
  const tamperedApplying = (await freeze(tamperedFrozen, sourceTampered, '1'.repeat(40), '2'.repeat(40))).rows[0].intent
  await assertCode(complete(tamperedApplying), 'P0001')
  const tamperedAborting = (await abort(tamperedApplying, 'P0001')).rows[0].intent
  await completeAbort(tamperedAborting, '1'.repeat(40))
  await query(fresh, 'UPDATE project.project SET source_revision = $2 WHERE project_id = $1', [projectId, sourceNew])
  assert.deepEqual((await query(fresh, `
    SELECT project.source_revision, connection_revision_id, qualification_id,
      binding_digest, project_source_revision
    FROM project.project AS project
    JOIN project.connection_binding AS binding ON binding.project_id = project.project_id
    WHERE project.project_id = $1 AND binding.connection_id = $2
  `, [projectId, connectionId])).rows, [{
    source_revision: sourceNew, connection_revision_id: connectionRevisionId,
    qualification_id: qualificationId, binding_digest: digest, project_source_revision: sourceNew,
  }])

  // Latest qualification basis changes are fail-closed for binding selection;
  // the current Project source and binding remain untouched.
  await query(fresh, `
    INSERT INTO con.connection_qualification(
      qualification_id, connection_id, connection_revision_id,
      credential_generation, environment, qualification_state, outcome,
      diagnostic, evidence_refs, tested_at
    ) VALUES ($1, $2, $3, 2, 'SANDBOX', 'QUALIFIED', 'PASSED', $4::jsonb,
      ARRAY['fixture:r2-p4-sql-generation-2'], clock_timestamp() + interval '1 second')
  `, [randomUUID(), connectionId, connectionRevisionId, JSON.stringify(qualificationFixture)])
  await assertCode(begin(projectId, connectionId, connectionRevisionId, 'SANDBOX', expectedPresent), 'P0002')
  await query(fresh, `
    INSERT INTO con.connection_qualification(
      qualification_id, connection_id, connection_revision_id,
      credential_generation, environment, qualification_state, outcome,
      diagnostic, evidence_refs, tested_at
    ) VALUES ($1, $2, $3, 1, 'SANDBOX', 'QUALIFIED', 'PASSED', $4::jsonb,
      ARRAY['fixture:r2-p4-sql-environment'], clock_timestamp() + interval '2 seconds')
  `, [randomUUID(), connectionId, connectionRevisionId, JSON.stringify(qualificationFixture)])
  await assertCode(begin(projectId, connectionId, connectionRevisionId, 'PRODUCTION', expectedPresent), 'P0002')

  // Removal is narrowing under Project manage: it still succeeds after use
  // revocation and qualification obsolescence, with exact current-state data.
  await query(fresh, 'UPDATE iam.account_project_grant SET can_use_connection = false WHERE account_id = $1 AND project_id = $2',
    [accountId, projectId])
  await query(fresh, 'UPDATE con.connection SET credential_generation = NULL WHERE connection_id = $1', [connectionId])
  const removalDeclaration = { bindings: [] }
  const preparedRemoval = (await begin(
    projectId, connectionId, connectionRevisionId, 'SANDBOX', expectedPresent, true,
  )).rows[0].intent
  assert.equal(preparedRemoval.source_revision, sourceNew)
  assert.deepEqual(preparedRemoval.declaration, removalDeclaration)
  assert.equal(preparedRemoval.prepared_result, null)
  const frozenRemoval = (await freeze(preparedRemoval, sourceRemoved, '1'.repeat(40), '2'.repeat(40))).rows[0].intent
  const completedRemoval = (await complete(frozenRemoval)).rows[0].intent
  assert.equal(completedRemoval.state, 'COMPLETED')
  assert.equal(completedRemoval.terminal_result, null)
  assert.deepEqual((await query(fresh, `
    SELECT source_revision, (SELECT count(*) FROM project.connection_binding WHERE project_id = $1) AS bindings
    FROM project.project WHERE project_id = $1
  `, [projectId])).rows, [{ source_revision: sourceRemoved, bindings: '0' }])

  // A foreign Project is scoped as absent, not disclosed as a permission
  // distinction; owner tables and cross-owner helpers are not callable here.
  await assertCode(begin(foreignProjectId, connectionId, connectionRevisionId, 'SANDBOX', expectedAbsent), 'P0002')
  for (const statement of [
    'SELECT * FROM project.project',
    'SELECT * FROM project.connection_binding',
    'SELECT * FROM con.connection',
    `SELECT con.get_project_binding_name('${projectId}', '${workspaceId}', '${connectionId}')`,
    `SELECT * FROM con.admit_project_binding_revision('${projectId}', '${workspaceId}', '${connectionId}', '${connectionRevisionId}', 'SANDBOX')`,
  ]) await assertCode(restricted(statement), '42501')
})

const compileGitCapability = () => {
  const outputRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-p4-git-build-'))
  const compiled = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
    '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', outputRoot,
  ], { encoding: 'utf8' })
  if (compiled.status !== 0) {
    rmSync(outputRoot, { recursive: true, force: true })
    throw new Error(`R2_P4_HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
  }
  return {
    outputRoot,
    built: (path) => pathToFileURL(resolve(outputRoot, path)).href,
  }
}

const realComposedProofOptions = () => ({
  skip: gitLive && databaseConfigured ? false : 'requires admitted OCI Git and real PostgreSQL configuration',
  timeout: 900_000,
})

// Every composed scenario owns a disposable database, restricted runtime role
// password, Git storage root, and compiled production module graph. The seed
// ownership projection is the same source contract used by NEW projects; the
// binding module then adds its two reserved PLATFORM-CONTRACT paths.
const createComposedFixture = async (t, name) => {
  const { outputRoot, built } = compileGitCapability()
  const storageRoot = mkdtempSync(`/tmp/conexus-r2-p4-composed-${name}-`)
  let pool
  const closePool = async () => {
    const current = pool
    pool = undefined
    await current?.end()
  }
  t.after(async () => {
    await closePool()
    rmSync(storageRoot, { recursive: true, force: true })
    rmSync(outputRoot, { recursive: true, force: true })
  })
  const { admin, fresh, query, url } = await databaseHarness(t)

  await runR2HubMigrations({ connectionString: url })
  const { createOciGitExecutionPort, createOciProjectBindingGitCapability } = await import(built('project/git-execution.js'))
  const { createProjectConnectionBindingStore } = await import(built('project/store.js'))
  const { createProjectBindingRecovery } = await import(built('project/binding-recovery.js'))
  const { composeProjectSourceOwnership } = await import(built('project/module.js'))
  const { createProjectSourceSnapshot } = await import(built('project/source-snapshot.js'))
  const { R1C14_GIT_IDENTITY } = await import(built('generated/r1c14-git-identity.js'))
  const { R1_NEW_PROJECT_SEED } = await import(built('generated/r1-new-project-seed.js'))
  const accountId = randomUUID()
  const workspaceId = randomUUID()
  const foreignWorkspaceId = randomUUID()
  const projectId = randomUUID()
  const foreignProjectId = randomUUID()
  const attemptId = randomUUID()
  const source = createOciGitExecutionPort({ projectStorageRoot: storageRoot })
  const staged = await source.stageNewProjectSource({ projectId, attemptId })
  assert.equal(staged.status, 'STAGED', JSON.stringify(staged))
  assert.equal((await source.promoteStagedProjectSource({ projectId, attemptId, sourceRevision: staged.sourceRevision })).status, 'PROMOTED')
  const repository = resolve(storageRoot, 'projects', projectId)
  const gitHead = () => readFileSync(resolve(repository, 'refs/heads/main'), 'utf8').trim()
  const databaseSource = async () => (await query(fresh,
    'SELECT source_revision FROM project.project WHERE project_id = $1', [projectId])).rows[0].source_revision
  await query(fresh, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', 'p4-composed', 'P4 manager')`, [accountId])
  await query(fresh, 'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $3), ($2, $4)',
    [workspaceId, foreignWorkspaceId, 'P4 Workspace', 'Foreign Workspace'])
  await query(fresh, `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'P4 Project', 'NEW', $3, 'project-fixture')`, [projectId, workspaceId, staged.sourceRevision])
  await query(fresh, `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'Foreign Project', 'NEW', $3, 'foreign-project-fixture')`, [foreignProjectId, foreignWorkspaceId, 'f'.repeat(40)])
  await query(fresh, `INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project)
    VALUES ($1, $2, false)`, [accountId, workspaceId])
  await query(fresh, `INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage, can_use_connection)
    VALUES ($1, $2, true, true, false)`, [accountId, projectId])

  // Trusted owner fixtures establish qualification bases, not live provider
  // or credential-backend proof. Binding commands themselves use production
  // SQL, the restricted runtime role, and the exact real Git capability.
  const subjects = []
  for (let index = 0; index < 7; index += 1) {
    const subject = { connectionId: randomUUID(), connectionRevisionId: randomUUID(),
      qualificationId: randomUUID(), name: `Connection ${index}`, environment: 'SANDBOX' }
    subjects.push(subject)
    await query(fresh, `INSERT INTO con.connection(connection_id, owner_scope_kind, workspace_id, name,
      credential_generation, credential_generation_high_watermark) VALUES ($1, 'WORKSPACE', $2, $3, 1, 1)`,
    [subject.connectionId, index === 5 ? foreignWorkspaceId : workspaceId, subject.name])
    await query(fresh, `INSERT INTO con.connection_revision(connection_revision_id, connection_id,
      connector_definition_id, connector_version, configuration, configuration_digest)
      VALUES ($1, $2, $3, '1.0.0', '{"environment":"SANDBOX","companyCode":1}', $4)`,
    [subject.connectionRevisionId, subject.connectionId, index === 6 ? 'not-admitted' : 'sankhya-om', 'a'.repeat(64)])
    await query(fresh, 'UPDATE con.connection SET current_revision_id = $2 WHERE connection_id = $1',
      [subject.connectionId, subject.connectionRevisionId])
    await query(fresh, `INSERT INTO con.connection_qualification(qualification_id, connection_id, connection_revision_id,
      credential_generation, environment, qualification_state, outcome, diagnostic, evidence_refs, tested_at)
      VALUES ($1, $2, $3, 1, 'SANDBOX', 'QUALIFIED', 'PASSED',
        '{"title":"Fixture","message":"Owner qualification fixture; no provider proof"}',
        ARRAY['fixture:qualification-basis'], clock_timestamp())`,
    [subject.qualificationId, subject.connectionId, subject.connectionRevisionId])
  }
  const runtimePassword = randomUUID().replaceAll('-', '')
  await query(fresh, `ALTER ROLE hub_r2_project_binding PASSWORD '${runtimePassword}'`)
  const runtime = { ...fresh, user: 'hub_r2_project_binding', password: runtimePassword }
  pool = new pg.Pool(runtime)
  const newCapability = () => createOciProjectBindingGitCapability({ projectStorageRoot: storageRoot })
  const newStore = (git = newCapability()) => createProjectConnectionBindingStore({ pool, git })
  const command = (subject, expectedCurrent = { state: 'ABSENT' }) => ({ accountId, projectId, body: {
    connectionId: subject.connectionId, connectionRevisionId: subject.connectionRevisionId,
    environment: subject.environment, expectedCurrent,
  } })
  const expectedValue = (subject) => ({ connectionId: subject.connectionId,
    connectionRevisionId: subject.connectionRevisionId, environment: subject.environment, connectionName: subject.name })
  const sourceOwnership = composeProjectSourceOwnership(Object.fromEntries(R1_NEW_PROJECT_SEED.entries
    .map((entry) => [entry.path, entry.class])))
  return {
    built, admin, fresh, query, runtime, pool, closePool, storageRoot, repository, projectId, foreignProjectId,
    accountId, workspaceId, staged, gitHead, databaseSource, subjects, newCapability,
    newStore, command, expectedValue, sourceOwnership, createProjectBindingRecovery,
    createProjectSourceSnapshot, R1C14_GIT_IDENTITY,
  }
}

// These are the exact §E crash boundaries, each exercised in a fresh child so
// the durable SQL transaction and the OCI Git capability are the deciding
// subjects. The child exits only after the named boundary has acknowledged;
// no intent row is inserted by test setup.
const spawnBindingCrashChild = ({ fixture, subject, fault }) => {
  const command = fixture.command(subject)
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
import pg from 'pg'
const { createProjectConnectionBindingStore } = await import(${JSON.stringify(fixture.built('project/store.js'))})
const { createOciProjectBindingGitCapability } = await import(${JSON.stringify(fixture.built('project/git-execution.js'))})
const fault = ${JSON.stringify(fault)}
const input = JSON.parse(process.env.CONEXUS_P4_COMMAND)
const pool = new pg.Pool(JSON.parse(process.env.CONEXUS_P4_RUNTIME))
const capability = createOciProjectBindingGitCapability({ projectStorageRoot: ${JSON.stringify(fixture.storageRoot)} })
const adminConfig = JSON.parse(process.env.CONEXUS_P4_ADMIN_DATABASE)
const revokeUse = async () => {
  const admin = new pg.Pool(adminConfig)
  await admin.query('UPDATE iam.account_project_grant SET can_use_connection = false WHERE account_id = $1 AND project_id = $2', [input.accountId, input.projectId])
  await admin.end()
}
const git = { ...capability }
if (fault === 'PREPARING_BEFORE_STAGE') {
  git.stageProjectBindingIntent = async () => process.exit(71)
}
if (fault === 'APPLYING_BEFORE_REF') {
  git.applyProjectBindingIntent = async () => process.exit(72)
}
if (fault === 'ABORTING_BEFORE_CANCEL' || fault === 'CANCEL_REF_COMMITTED') {
  git.applyProjectBindingIntent = async value => {
    const result = await capability.applyProjectBindingIntent(value)
    if (result.status === 'APPLIED') await revokeUse()
    return result
  }
  git.cancelProjectBindingIntent = async value => {
    if (fault === 'ABORTING_BEFORE_CANCEL') process.exit(73)
    const result = await capability.cancelProjectBindingIntent(value)
    if (result.status !== 'CANCELLED_APPLIED') process.exit(98)
    process.exit(74)
  }
}
if (fault === 'TERMINAL_COMMIT_LOST') {
  const connect = pool.connect.bind(pool)
  pool.connect = async (...args) => {
    const client = await connect(...args)
    let previous = ''
    const query = client.query.bind(client)
    client.query = async (...queryArgs) => {
      const sql = typeof queryArgs[0] === 'string' ? queryArgs[0] : queryArgs[0]?.text ?? ''
      const result = await query(...queryArgs)
      if (sql.trim().toUpperCase() === 'COMMIT' && previous.includes('complete_binding_source_intent')) process.exit(75)
      previous = sql
      return result
    }
    return client
  }
}
const store = createProjectConnectionBindingStore({ pool, git })
await store.setConnectionBinding(input)
await pool.end()
process.exit(99)
`], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      CONEXUS_P4_COMMAND: JSON.stringify(command),
      CONEXUS_P4_RUNTIME: JSON.stringify(fixture.runtime),
      CONEXUS_P4_ADMIN_DATABASE: JSON.stringify(fixture.fresh),
    },
    encoding: 'utf8',
    timeout: 300_000,
  })
  return child
}

const readBindingIntent = async (fixture) => (await fixture.query(fixture.fresh, `
  SELECT intent_id, state, version, source_revision, declaration, prepared_result,
    declaration_digest, base_tree, previous_declaration_blob, apply_source_revision,
    cancel_base_source_revision, cancel_applied_source_revision, terminal_source_revision,
    terminal_result, refusal_code
  FROM project.binding_source_intent WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1
`, [fixture.projectId])).rows[0] ?? null

const readBindingRows = async (fixture, database = fixture.fresh) => (await fixture.query(database, `
  SELECT connection_id, connection_revision_id, qualification_id, environment, project_source_revision
  FROM project.connection_binding WHERE project_id = $1 ORDER BY connection_id
`, [fixture.projectId])).rows

const cloneDatabase = async (fixture, t, name) => {
  const database = `conexus_r2_p4_${name}_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  await fixture.query(fixture.admin, `CREATE DATABASE ${quoteIdentifier(database)} TEMPLATE ${quoteIdentifier(fixture.fresh.database)}`)
  const connection = { ...fixture.fresh, database }
  t.after(() => fixture.query(fixture.admin, `DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`))
  return connection
}

const cloneStorage = (sourceRoot, name) => {
  const cloneRoot = mkdtempSync(`/tmp/conexus-r2-p4-${name}-`)
  rmSync(cloneRoot, { recursive: true, force: true })
  cpSync(sourceRoot, cloneRoot, { recursive: true })
  return cloneRoot
}

const gitObjectPath = (storageRoot, projectId, objectId) => resolve(
  storageRoot, 'projects', projectId, 'objects', objectId.slice(0, 2), objectId.slice(2),
)

test('R2-P4 real Git and PostgreSQL prove settlement and eligibility preserve Project authority and source CAS', realComposedProofOptions(), async (t) => {
  const fixture = await createComposedFixture(t, 'settlement')
  const { fresh, gitHead, databaseSource, staged, subjects, projectId, foreignProjectId,
    command, expectedValue } = fixture
  const store = fixture.newStore()
  assert.deepEqual(await store.listConnectionBindings({ accountId: fixture.accountId, projectId }), { status: 'FOUND', value: [] })
  assert.deepEqual(await store.listConnectionBindings({ accountId: fixture.accountId, projectId: foreignProjectId }), { status: 'NOT_FOUND' })
  assert.deepEqual(await store.setConnectionBinding({ ...command(subjects[0]), projectId: foreignProjectId }), { status: 'NOT_FOUND' })
  assert.deepEqual(await store.setConnectionBinding(command(subjects[0])), { status: 'DENIED' })
  assert.equal(gitHead(), staged.sourceRevision)
  await fixture.query(fresh, 'UPDATE iam.account_project_grant SET can_use_connection = true WHERE account_id = $1 AND project_id = $2',
    [fixture.accountId, projectId])
  for (const subject of [subjects[5], subjects[6]]) {
    assert.notEqual((await store.setConnectionBinding(command(subject))).status, 'FOUND')
    assert.equal(gitHead(), staged.sourceRevision)
  }
  assert.deepEqual(await store.setConnectionBinding(command(subjects[0], {
    state: 'PRESENT', connectionRevisionId: subjects[0].connectionRevisionId, environment: 'SANDBOX',
  })), { status: 'STALE' })
  for (const subject of subjects.slice(0, 2)) {
    assert.deepEqual(await store.setConnectionBinding(command(subject)), { status: 'FOUND', value: expectedValue(subject) })
    assert.equal(await databaseSource(), gitHead())
  }
  assert.deepEqual(await store.setConnectionBinding(command(subjects[0])), { status: 'STALE' })
  const eligibilityHead = gitHead()
  await fixture.query(fresh, `UPDATE con.connection SET credential_generation = 2,
    credential_generation_high_watermark = 2 WHERE connection_id = $1`, [subjects[0].connectionId])
  assert.notEqual((await store.setConnectionBinding(command(subjects[0], {
    state: 'PRESENT', connectionRevisionId: subjects[0].connectionRevisionId, environment: 'SANDBOX',
  }))).status, 'FOUND')
  await fixture.query(fresh, `UPDATE con.connection SET credential_generation = 1,
    credential_generation_high_watermark = 1 WHERE connection_id = $1`, [subjects[0].connectionId])
  const failedQualificationId = randomUUID()
  await fixture.query(fresh, `INSERT INTO con.connection_qualification(qualification_id, connection_id, connection_revision_id,
    credential_generation, environment, qualification_state, outcome, diagnostic, evidence_refs, tested_at)
    VALUES ($1, $2, $3, 1, 'SANDBOX', 'FAILED', 'FAILED',
      '{"title":"Fixture","message":"Latest qualification failed"}', ARRAY['fixture:failed-basis'],
      clock_timestamp() + interval '1 second')`, [failedQualificationId, subjects[1].connectionId, subjects[1].connectionRevisionId])
  assert.notEqual((await store.setConnectionBinding(command(subjects[1], {
    state: 'PRESENT', connectionRevisionId: subjects[1].connectionRevisionId, environment: 'SANDBOX',
  }))).status, 'FOUND')
  await fixture.query(fresh, 'DELETE FROM con.connection_qualification WHERE qualification_id = $1', [failedQualificationId])
  assert.notEqual((await store.setConnectionBinding(command({ ...subjects[2], environment: 'PRODUCTION' }))).status, 'FOUND')
  assert.equal(gitHead(), eligibilityHead)
  // Synthetic inconsistent DB basis exercises the complete restricted-SQL →
  // coordinator → OCI refusal path; it is not a Brain adoption fixture.
  const repositoryBytes = (directory) => Object.fromEntries(readdirSync(directory, { withFileTypes: true })
    .map((entry) => [entry.name, entry.isDirectory() ? repositoryBytes(resolve(directory, entry.name)) :
      readFileSync(resolve(directory, entry.name)).toString('base64')]))
  const beforeConcordance = repositoryBytes(fixture.repository)
  await fixture.query(fresh, `INSERT INTO project.brain_binding(project_id, brain_revision_id, brain_digest,
    project_binding_digest, validation_state, project_source_revision)
    VALUES ($1,$2,$3,$4,'VALID',$5)`, [projectId, randomUUID(), 'a'.repeat(64), 'b'.repeat(64), eligibilityHead])
  assert.deepEqual(await store.setConnectionBinding(command(subjects[2])), { status: 'CONFLICT' })
  assert.deepEqual(repositoryBytes(fixture.repository), beforeConcordance)
  assert.equal(await databaseSource(), eligibilityHead)
  const refused = (await fixture.query(fresh, `SELECT state, refusal_code, apply_source_revision
    FROM project.binding_source_intent WHERE project_id=$1 AND connection_id=$2`,
  [projectId, subjects[2].connectionId])).rows
  assert.deepEqual(refused, [{ state: 'ABORTED', refusal_code: 'P0001', apply_source_revision: null }])
  await fixture.query(fresh, 'DELETE FROM project.brain_binding WHERE project_id=$1', [projectId])
  assert.deepEqual(await store.setConnectionBinding(command(subjects[2])), { status: 'FOUND', value: expectedValue(subjects[2]) })
  assert.equal(await databaseSource(), gitHead())
})

test('R2-P4 real Git and PostgreSQL prove Q1-to-Q2 process-crash recovery and R1 source-consumer preservation', realComposedProofOptions(), async (t) => {
  const fixture = await createComposedFixture(t, 'crash')
  const { fresh, runtime, query, pool, storageRoot, repository, projectId, accountId, subjects, built, gitHead,
    databaseSource, newCapability, command, sourceOwnership, createProjectBindingRecovery, createProjectSourceSnapshot,
    R1C14_GIT_IDENTITY } = fixture
  const store = fixture.newStore()
  await query(fresh, 'UPDATE iam.account_project_grant SET can_use_connection = true WHERE account_id = $1 AND project_id = $2',
    [accountId, projectId])
  for (const subject of subjects.slice(0, 2)) {
    assert.deepEqual(await store.setConnectionBinding(command(subject)), { status: 'FOUND', value: fixture.expectedValue(subject) })
    assert.equal(await databaseSource(), gitHead())
  }
  const beforeCrash = await databaseSource()
  const beforeCrashTree = inspectRepository(repository, R1C14_GIT_IDENTITY.ociIndexDigest, beforeCrash)
  const crash = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import pg from 'pg';
    const { createProjectConnectionBindingStore } = await import(${JSON.stringify(built('project/store.js'))});
    const { createOciProjectBindingGitCapability } = await import(${JSON.stringify(built('project/git-execution.js'))});
    const pool = new pg.Pool(JSON.parse(process.env.CONEXUS_P4_PROOF_DATABASE));
    const capability = createOciProjectBindingGitCapability({projectStorageRoot:${JSON.stringify(storageRoot)}});
    const store = createProjectConnectionBindingStore({pool,git:{...capability,applyProjectBindingIntent:async input=>{
      const result=await capability.applyProjectBindingIntent(input);
      if(result.status==='APPLIED') {
        const admin = new pg.Pool(JSON.parse(process.env.CONEXUS_P4_ADMIN_DATABASE));
        await admin.query("INSERT INTO con.connection_qualification(qualification_id, connection_id, connection_revision_id, credential_generation, environment, qualification_state, outcome, diagnostic, evidence_refs, tested_at) VALUES ($1, $2, $3, 1, 'SANDBOX', 'QUALIFIED', 'PASSED', $4::jsonb, ARRAY['fixture:q2-after-git'], clock_timestamp() + interval '10 seconds')",
          [process.env.CONEXUS_P4_Q2_ID, ${JSON.stringify(subjects[2].connectionId)},
            ${JSON.stringify(subjects[2].connectionRevisionId)},
            JSON.stringify({ title: 'Fixture Q2', message: 'Newer qualification inserted after Git' })]);
        await admin.end();
        process.exit(73);
      }
      return result;
    }}});
    await store.setConnectionBinding(${JSON.stringify(command(subjects[2]))});
    await pool.end(); process.exit(74);
  `], { cwd: repositoryRoot, env: { ...process.env,
    CONEXUS_P4_PROOF_DATABASE: JSON.stringify(runtime),
    CONEXUS_P4_ADMIN_DATABASE: JSON.stringify(fresh), CONEXUS_P4_Q2_ID: randomUUID(),
  },
    encoding: 'utf8', timeout: 300_000 })
  assert.equal(crash.status, 73, `crash exit=${crash.status}; ${crash.stderr}`)
  assert.equal(await databaseSource(), beforeCrash)
  const crashChild = gitHead()
  assert.notEqual(crashChild, beforeCrash)
  const crashTree = inspectRepository(repository, R1C14_GIT_IDENTITY.ociIndexDigest, crashChild)
  assert.notDeepEqual(crashTree.entries, beforeCrashTree.entries)
  const bindingRowsBeforeRecovery = (await query(fresh, `
    SELECT connection_id, connection_revision_id, qualification_id, environment,
      project_source_revision
    FROM project.connection_binding WHERE project_id = $1 ORDER BY connection_id
  `, [projectId])).rows
  const recovery = createProjectBindingRecovery({ pool, git: newCapability() })
  await recovery.reconcile(accountId, projectId)
  assert.equal(await databaseSource(), gitHead())
  const recoveredSource = await databaseSource()
  const recoveredTree = inspectRepository(repository, R1C14_GIT_IDENTITY.ociIndexDigest, recoveredSource)
  assert.deepEqual(recoveredTree.entries, beforeCrashTree.entries)
  assert.deepEqual(recoveredTree.files, beforeCrashTree.files)
  assert.deepEqual((await query(fresh, `
    SELECT connection_id, connection_revision_id, qualification_id, environment,
      project_source_revision
    FROM project.connection_binding WHERE project_id = $1 ORDER BY connection_id
  `, [projectId])).rows, bindingRowsBeforeRecovery)
  const recoverySnapshot = createProjectSourceSnapshot({
    storageRoot, projectId, sourceRevision: recoveredSource,
    ownership: sourceOwnership,
  })
  const recoveryPaths = await recoverySnapshot.listPaths()
  assert.equal(recoveryPaths.some((entry) => entry.path === '.conexus/project/connection-bindings.json' &&
    entry.ownershipClass === 'PLATFORM-CONTRACT'), true)
  assert.equal((await recoverySnapshot.readBatch(['.conexus/project/connection-bindings.json'])).length, 1)
  t.diagnostic(`real process restart settled exact child ${crashChild}; recovered source ${gitHead()}`)
})

test('R2-P4 §E real child crash at PREPARING before stage leaves a recoverable durable intent', realComposedProofOptions(), async (t) => {
  const fixture = await createComposedFixture(t, 'preparing-boundary')
  const { fresh, query, projectId, accountId, subjects, gitHead, databaseSource,
    createProjectBindingRecovery, newCapability } = fixture
  await query(fresh, 'UPDATE iam.account_project_grant SET can_use_connection = true WHERE account_id = $1 AND project_id = $2',
    [accountId, projectId])
  const before = gitHead()
  const child = spawnBindingCrashChild({ fixture, subject: subjects[3], fault: 'PREPARING_BEFORE_STAGE' })
  assert.equal(child.status, 71, `crash exit=${child.status}; ${child.stderr}`)
  const pending = await readBindingIntent(fixture)
  assert.ok(pending)
  assert.equal(pending.state, 'PREPARING')
  assert.equal(pending.version, '0')
  assert.equal(pending.source_revision, before)
  assert.equal(pending.apply_source_revision, null)
  assert.equal(gitHead(), before)
  assert.equal(await databaseSource(), before)
  assert.deepEqual(await readBindingRows(fixture), [])

  const recovery = createProjectBindingRecovery({ pool: fixture.pool, git: newCapability() })
  await recovery.reconcile(accountId, projectId)
  const recovered = await readBindingIntent(fixture)
  assert.equal(recovered.state, 'COMPLETED')
  assert.equal(recovered.terminal_source_revision, gitHead())
  assert.equal(await databaseSource(), gitHead())
  assert.equal((await readBindingRows(fixture)).length, 1)
  t.diagnostic(`PREPARING crash recovered source ${gitHead()}`)
})

test('R2-P4 §E real child crash after APPLYING freeze and before ref mutation replays the frozen tuple', realComposedProofOptions(), async (t) => {
  const fixture = await createComposedFixture(t, 'applying-boundary')
  const { fresh, query, projectId, accountId, subjects, gitHead, databaseSource,
    createProjectBindingRecovery, newCapability } = fixture
  await query(fresh, 'UPDATE iam.account_project_grant SET can_use_connection = true WHERE account_id = $1 AND project_id = $2',
    [accountId, projectId])
  const before = gitHead()
  const child = spawnBindingCrashChild({ fixture, subject: subjects[3], fault: 'APPLYING_BEFORE_REF' })
  assert.equal(child.status, 72, `crash exit=${child.status}; ${child.stderr}`)
  const pending = await readBindingIntent(fixture)
  assert.ok(pending)
  assert.equal(pending.state, 'APPLYING')
  assert.equal(pending.version, '1')
  assert.match(pending.apply_source_revision, /^[0-9a-f]{40}$/)
  assert.match(pending.cancel_base_source_revision, /^[0-9a-f]{40}$/)
  assert.match(pending.cancel_applied_source_revision, /^[0-9a-f]{40}$/)
  assert.equal(gitHead(), before)
  assert.equal(await databaseSource(), before)
  assert.deepEqual(await readBindingRows(fixture), [])

  const recovery = createProjectBindingRecovery({ pool: fixture.pool, git: newCapability() })
  await recovery.reconcile(accountId, projectId)
  const recovered = await readBindingIntent(fixture)
  assert.equal(recovered.state, 'COMPLETED')
  assert.equal(recovered.terminal_source_revision, pending.apply_source_revision)
  assert.equal(gitHead(), pending.apply_source_revision)
  assert.equal(await databaseSource(), gitHead())
  assert.equal((await readBindingRows(fixture)).length, 1)
  t.diagnostic(`APPLYING pre-ref crash replayed frozen child ${gitHead()}`)
})

test('R2-P4 §E real SQL refusal persists ABORTING before cancellation ref mutation', realComposedProofOptions(), async (t) => {
  const fixture = await createComposedFixture(t, 'aborting-boundary')
  const { fresh, query, projectId, accountId, subjects, gitHead, databaseSource,
    createProjectBindingRecovery, newCapability, R1C14_GIT_IDENTITY, repository } = fixture
  await query(fresh, 'UPDATE iam.account_project_grant SET can_use_connection = true WHERE account_id = $1 AND project_id = $2',
    [accountId, projectId])
  const before = gitHead()
  const beforeTree = inspectRepository(repository, R1C14_GIT_IDENTITY.ociIndexDigest, before)
  const child = spawnBindingCrashChild({ fixture, subject: subjects[3], fault: 'ABORTING_BEFORE_CANCEL' })
  assert.equal(child.status, 73, `crash exit=${child.status}; ${child.stderr}`)
  const pending = await readBindingIntent(fixture)
  assert.ok(pending)
  assert.equal(pending.state, 'ABORTING')
  assert.equal(pending.version, '2')
  assert.equal(gitHead(), pending.apply_source_revision)
  assert.equal(await databaseSource(), before)
  assert.deepEqual(await readBindingRows(fixture), [])

  const recovery = createProjectBindingRecovery({ pool: fixture.pool, git: newCapability() })
  await recovery.reconcile(accountId, projectId)
  const recovered = await readBindingIntent(fixture)
  assert.equal(recovered.state, 'ABORTED')
  assert.equal(recovered.terminal_source_revision, pending.cancel_applied_source_revision)
  assert.equal(gitHead(), pending.cancel_applied_source_revision)
  assert.equal(await databaseSource(), gitHead())
  const restored = inspectRepository(repository, R1C14_GIT_IDENTITY.ociIndexDigest, gitHead())
  assert.deepEqual(restored.entries, beforeTree.entries)
  assert.deepEqual(restored.files, beforeTree.files)
  assert.deepEqual(await readBindingRows(fixture), [])
  t.diagnostic(`ABORTING pre-cancel crash restored source ${gitHead()}`)
})

test('R2-P4 §E real child crash after cancellation ref CAS is idempotently finalized', realComposedProofOptions(), async (t) => {
  const fixture = await createComposedFixture(t, 'cancel-ref-boundary')
  const { fresh, query, projectId, accountId, subjects, gitHead, databaseSource,
    createProjectBindingRecovery, newCapability, R1C14_GIT_IDENTITY, repository } = fixture
  await query(fresh, 'UPDATE iam.account_project_grant SET can_use_connection = true WHERE account_id = $1 AND project_id = $2',
    [accountId, projectId])
  const before = gitHead()
  const beforeTree = inspectRepository(repository, R1C14_GIT_IDENTITY.ociIndexDigest, before)
  const child = spawnBindingCrashChild({ fixture, subject: subjects[3], fault: 'CANCEL_REF_COMMITTED' })
  assert.equal(child.status, 74, `crash exit=${child.status}; ${child.stderr}`)
  const pending = await readBindingIntent(fixture)
  assert.ok(pending)
  assert.equal(pending.state, 'ABORTING')
  assert.equal(gitHead(), pending.cancel_applied_source_revision)
  assert.equal(await databaseSource(), before)
  assert.deepEqual(await readBindingRows(fixture), [])
  const cancelledHead = gitHead()

  const recovery = createProjectBindingRecovery({ pool: fixture.pool, git: newCapability() })
  await recovery.reconcile(accountId, projectId)
  const recovered = await readBindingIntent(fixture)
  assert.equal(recovered.state, 'ABORTED')
  assert.equal(recovered.terminal_source_revision, cancelledHead)
  assert.equal(gitHead(), cancelledHead)
  assert.equal(await databaseSource(), cancelledHead)
  const restored = inspectRepository(repository, R1C14_GIT_IDENTITY.ociIndexDigest, cancelledHead)
  assert.deepEqual(restored.entries, beforeTree.entries)
  assert.deepEqual(restored.files, beforeTree.files)
  assert.deepEqual(await readBindingRows(fixture), [])
  t.diagnostic(`cancel ref response loss retained exact cancellation ${cancelledHead}`)
})

test('R2-P4 §E committed terminal SQL reply loss is recovered without a duplicate Git child', realComposedProofOptions(), async (t) => {
  const fixture = await createComposedFixture(t, 'terminal-reply-boundary')
  const { fresh, query, projectId, accountId, subjects, gitHead, databaseSource,
    createProjectBindingRecovery, newCapability } = fixture
  await query(fresh, 'UPDATE iam.account_project_grant SET can_use_connection = true WHERE account_id = $1 AND project_id = $2',
    [accountId, projectId])
  const child = spawnBindingCrashChild({ fixture, subject: subjects[3], fault: 'TERMINAL_COMMIT_LOST' })
  assert.equal(child.status, 75, `crash exit=${child.status}; ${child.stderr}`)
  const committed = await readBindingIntent(fixture)
  assert.ok(committed)
  assert.equal(committed.state, 'COMPLETED')
  assert.match(committed.terminal_source_revision, /^[0-9a-f]{40}$/)
  assert.equal(gitHead(), committed.terminal_source_revision)
  assert.equal(await databaseSource(), gitHead())
  assert.equal((await readBindingRows(fixture)).length, 1)
  const terminalVersion = committed.version
  const terminalHead = gitHead()

  const recovery = createProjectBindingRecovery({ pool: fixture.pool, git: newCapability() })
  await recovery.reconcile(accountId, projectId)
  const replayed = await readBindingIntent(fixture)
  assert.equal(replayed.state, 'COMPLETED')
  assert.equal(replayed.version, terminalVersion)
  assert.equal(gitHead(), terminalHead)
  assert.equal(await databaseSource(), terminalHead)
  assert.equal((await readBindingRows(fixture)).length, 1)
  t.diagnostic(`terminal commit survived lost response at ${terminalHead}`)
})

test('R2-P4 §E quiesced database/filesystem restore reconciles staged closure and refuses omitted objects', realComposedProofOptions(), async (t) => {
  const fixture = await createComposedFixture(t, 'coordinated-restore')
  const { fresh, query, projectId, accountId, subjects, gitHead, databaseSource,
    createProjectBindingRecovery, built, storageRoot } = fixture
  await query(fresh, 'UPDATE iam.account_project_grant SET can_use_connection = true WHERE account_id = $1 AND project_id = $2',
    [accountId, projectId])
  const originalHead = gitHead()
  const child = spawnBindingCrashChild({ fixture, subject: subjects[3], fault: 'APPLYING_BEFORE_REF' })
  assert.equal(child.status, 72, `crash exit=${child.status}; ${child.stderr}`)
  const pending = await readBindingIntent(fixture)
  assert.ok(pending)
  assert.equal(pending.state, 'APPLYING')
  assert.equal(gitHead(), originalHead)
  assert.equal(await databaseSource(), originalHead)
  assert.deepEqual(await readBindingRows(fixture), [])

  // The source DB has no live client and the filesystem has no active writer:
  // TEMPLATE copies PostgreSQL catalog/data and cpSync copies the entire Git
  // storage root, including the nonterminal row's staged object closure.
  await fixture.closePool()
  const restorePools = []
  // Node after hooks run in registration order: drain readers before the
  // cloneDatabase hooks drop their databases, avoiding forced idle disconnects.
  t.after(async () => {
    for (const restorePool of restorePools) await restorePool.end()
  })
  const completeDatabase = await cloneDatabase(fixture, t, 'restore_complete')
  const missingDatabase = await cloneDatabase(fixture, t, 'restore_missing')
  const completeStorage = cloneStorage(storageRoot, 'restore-complete')
  const missingStorage = cloneStorage(storageRoot, 'restore-missing')
  t.after(() => {
    rmSync(completeStorage, { recursive: true, force: true })
    rmSync(missingStorage, { recursive: true, force: true })
  })
  const stagedObjects = [pending.apply_source_revision, pending.cancel_base_source_revision,
    pending.cancel_applied_source_revision]
  for (const objectId of stagedObjects) {
    assert.equal(existsSync(gitObjectPath(completeStorage, projectId, objectId)), true, objectId)
    assert.equal(existsSync(gitObjectPath(missingStorage, projectId, objectId)), true, objectId)
  }

  // First clone is a complete coordinated restore: the durable intent and all
  // frozen Git objects travel together, then normal production recovery settles.
  const completePool = new pg.Pool({ ...fixture.runtime, database: completeDatabase.database })
  restorePools.push(completePool)
  const { createOciProjectBindingGitCapability } = await import(built('project/git-execution.js'))
  const completeRecovery = createProjectBindingRecovery({
    pool: completePool,
    git: createOciProjectBindingGitCapability({ projectStorageRoot: completeStorage }),
  })
  await completeRecovery.reconcile(accountId, projectId)
  const completeRows = (await query(completeDatabase, `
    SELECT state, terminal_source_revision FROM project.binding_source_intent WHERE project_id = $1
  `, [projectId])).rows
  assert.deepEqual(completeRows, [{ state: 'COMPLETED', terminal_source_revision: pending.apply_source_revision }])
  assert.equal((await query(completeDatabase, 'SELECT source_revision FROM project.project WHERE project_id = $1', [projectId])).rows[0].source_revision,
    pending.apply_source_revision)
  assert.equal((await readBindingRows(fixture, completeDatabase)).length, 1)
  const completeHead = readFileSync(resolve(completeStorage, 'projects', projectId, 'refs/heads/main'), 'utf8').trim()
  assert.equal(completeHead, pending.apply_source_revision)

  // Second clone intentionally omits the exact frozen apply commit. Recovery
  // must reject before update-ref and retain APPLYING/source/binding state.
  rmSync(gitObjectPath(missingStorage, projectId, pending.apply_source_revision), { force: true })
  const missingPool = new pg.Pool({ ...fixture.runtime, database: missingDatabase.database })
  restorePools.push(missingPool)
  const missingGit = createOciProjectBindingGitCapability({ projectStorageRoot: missingStorage })
  const missingRecovery = createProjectBindingRecovery({ pool: missingPool, git: missingGit })
  await assert.rejects(() => missingRecovery.reconcile(accountId, projectId), /PROJECT_BINDING_RECOVERY_UNAVAILABLE/)
  const missingHead = readFileSync(resolve(missingStorage, 'projects', projectId, 'refs/heads/main'), 'utf8').trim()
  assert.equal(missingHead, originalHead)
  assert.deepEqual((await query(missingDatabase, `
    SELECT state, version, source_revision, declaration_digest, base_tree,
      apply_source_revision, cancel_base_source_revision, cancel_applied_source_revision,
      terminal_source_revision
    FROM project.binding_source_intent WHERE project_id = $1
  `, [projectId])).rows, [{ state: 'APPLYING', version: '1', source_revision: originalHead,
    declaration_digest: pending.declaration_digest, base_tree: pending.base_tree,
    apply_source_revision: pending.apply_source_revision,
    cancel_base_source_revision: pending.cancel_base_source_revision,
    cancel_applied_source_revision: pending.cancel_applied_source_revision,
    terminal_source_revision: null }])
  assert.equal((await query(missingDatabase, 'SELECT source_revision FROM project.project WHERE project_id = $1', [projectId])).rows[0].source_revision,
    originalHead)
  assert.deepEqual(await readBindingRows(fixture, missingDatabase), [])
  t.diagnostic(`restore complete=${completeHead}; missing closure retained APPLYING at ${missingHead}`)
})

test('R2-P4 real Git and PostgreSQL prove concurrent binding authority, revocation and narrowing removal', realComposedProofOptions(), async (t) => {
  const fixture = await createComposedFixture(t, 'concurrent')
  const { fresh, query, pool, repository, projectId, accountId, workspaceId, subjects, gitHead, databaseSource,
    newCapability, newStore, command, sourceOwnership, createProjectSourceSnapshot, R1C14_GIT_IDENTITY } = fixture
  const store = newStore()
  await query(fresh, 'UPDATE iam.account_project_grant SET can_use_connection = true WHERE account_id = $1 AND project_id = $2',
    [accountId, projectId])
  for (const subject of subjects.slice(0, 2)) {
    assert.deepEqual(await store.setConnectionBinding(command(subject)), { status: 'FOUND', value: fixture.expectedValue(subject) })
    assert.equal(await databaseSource(), gitHead())
  }
  const concurrent = await Promise.all(subjects.slice(3, 5).map((subject) => store.setConnectionBinding(command(subject))))
  assert.equal(concurrent.filter((result) => result.status === 'FOUND').length, 1, JSON.stringify(concurrent))
  assert.equal(concurrent.filter((result) => result.status === 'CONFLICT').length, 1, JSON.stringify(concurrent))
  assert.equal(await databaseSource(), gitHead())

  // A permission revocation after Git is applied must cancel the child and
  // preserve the existing Project binding rather than reporting success.
  const beforePermission = await databaseSource()
  const permissionTree = inspectRepository(repository, R1C14_GIT_IDENTITY.ociIndexDigest, beforePermission)
  const permissionCapability = newCapability()
  const permissionStore = newStore({ ...permissionCapability,
    applyProjectBindingIntent: async (input) => {
      const result = await permissionCapability.applyProjectBindingIntent(input)
      if (result.status === 'APPLIED') await query(fresh,
        'UPDATE iam.account_project_grant SET can_use_connection = false WHERE account_id = $1 AND project_id = $2',
        [accountId, projectId])
      return result
    },
  })
  assert.equal((await permissionStore.setConnectionBinding(command(subjects[0], {
    state: 'PRESENT', connectionRevisionId: subjects[0].connectionRevisionId, environment: 'SANDBOX',
  }))).status, 'DENIED')
  assert.equal(await databaseSource(), gitHead())
  const permissionAfter = inspectRepository(repository, R1C14_GIT_IDENTITY.ociIndexDigest, await databaseSource())
  assert.deepEqual(permissionAfter.entries, permissionTree.entries)
  assert.deepEqual(permissionAfter.files, permissionTree.files)
  await query(fresh, 'UPDATE iam.account_project_grant SET can_use_connection = true WHERE account_id = $1 AND project_id = $2',
    [accountId, projectId])

  // Credential revocation has the same source rollback guarantee, with the
  // owner-side qualification refusal mapped to the private NOT_FOUND result.
  const beforeCredential = await databaseSource()
  const credentialTree = inspectRepository(repository, R1C14_GIT_IDENTITY.ociIndexDigest, beforeCredential)
  const credentialCapability = newCapability()
  const credentialStore = newStore({ ...credentialCapability,
    applyProjectBindingIntent: async (input) => {
      const result = await credentialCapability.applyProjectBindingIntent(input)
      if (result.status === 'APPLIED') await query(fresh,
        'UPDATE con.connection SET credential_generation = NULL WHERE connection_id = $1',
        [subjects[1].connectionId])
      return result
    },
  })
  assert.equal((await credentialStore.setConnectionBinding(command(subjects[1], {
    state: 'PRESENT', connectionRevisionId: subjects[1].connectionRevisionId, environment: 'SANDBOX',
  }))).status, 'NOT_FOUND')
  assert.equal(await databaseSource(), gitHead())
  const credentialAfter = inspectRepository(repository, R1C14_GIT_IDENTITY.ociIndexDigest, await databaseSource())
  assert.deepEqual(credentialAfter.entries, credentialTree.entries)
  assert.deepEqual(credentialAfter.files, credentialTree.files)
  await query(fresh, `UPDATE con.connection SET credential_generation = 1,
    credential_generation_high_watermark = 1 WHERE connection_id = $1`, [subjects[1].connectionId])

  await query(fresh, 'UPDATE iam.account_project_grant SET can_use_connection = false WHERE account_id = $1 AND project_id = $2',
    [accountId, projectId])
  await query(fresh, 'UPDATE con.connection SET credential_generation = NULL WHERE connection_id = $1', [subjects[0].connectionId])
  assert.equal((await store.listConnectionBindings({ accountId, projectId })).status, 'FOUND')
  assert.deepEqual(await store.removeConnectionBinding({ accountId, projectId, body: {
    connectionId: subjects[0].connectionId, expectedConnectionRevisionId: subjects[0].connectionRevisionId,
    expectedEnvironment: 'SANDBOX',
  } }), { status: 'FOUND', value: undefined })
  assert.equal(await databaseSource(), gitHead())
  const listing = await store.listConnectionBindings({ accountId, projectId })
  assert.equal(listing.status, 'FOUND')
  assert.equal(listing.value.length, 2)
  assert.equal(listing.value.some((binding) => binding.connectionId === subjects[0].connectionId), false)
  const snapshot = inspectRepository(repository, R1C14_GIT_IDENTITY.ociIndexDigest, gitHead())
  const bytes = Buffer.from(snapshot.files['.conexus/project/connection-bindings.json'], 'base64')
  const declarations = JSON.parse(bytes.toString()).bindings
  const rows = (await query(fresh, `SELECT connection_id, connection_revision_id, qualification_id, environment
    FROM project.connection_binding WHERE project_id = $1 ORDER BY connection_id`, [projectId])).rows
  assert.deepEqual(declarations, rows.map((row) => ({ connectionId: row.connection_id,
    connectionRevisionId: row.connection_revision_id, environment: row.environment, qualificationId: row.qualification_id })))
  const sourceSnapshot = createProjectSourceSnapshot({
    storageRoot: fixture.storageRoot, projectId, sourceRevision: gitHead(),
    ownership: sourceOwnership,
  })
  const sourceEntries = await sourceSnapshot.listPaths()
  const connectionEntry = sourceEntries.find((entry) => entry.path === '.conexus/project/connection-bindings.json')
  assert.ok(connectionEntry)
  assert.equal(connectionEntry.ownershipClass, 'PLATFORM-CONTRACT')
  assert.deepEqual((await sourceSnapshot.readBatch([connectionEntry.path]))[0].utf8Bytes,
    Buffer.from(snapshot.files['.conexus/project/connection-bindings.json'], 'base64').toString('utf8'))
  for (const sql of ['SELECT * FROM project.project', 'SELECT * FROM project.connection_binding',
    'SELECT * FROM con.connection', `SELECT con.get_project_binding_name('${projectId}', '${workspaceId}', '${subjects[0].connectionId}')`]) {
    await assert.rejects(pool.query(sql), (error) => error.code === '42501')
  }
  t.diagnostic(`concurrent authority/revocation proof final source ${gitHead()}`)
})

test('R2-P4 Project store contract proves source-first ordering and fail-closed settlement, not composed recovery', async (context) => {
  const { outputRoot, built } = compileGitCapability()
  const { createProjectConnectionBindingStore } = await import(built('project/store.js'))
  const accountId = '11111111-1111-4111-8111-111111111111'
  const projectId = '22222222-2222-4222-8222-222222222222'
  const workspaceId = '66666666-6666-4666-8666-666666666666'
  const connectionId = '33333333-3333-4333-8333-333333333333'
  const revisionId = '44444444-4444-4444-8444-444444444444'
  const qualificationId = '55555555-5555-4555-8555-555555555555'
  const oldSource = 'a'.repeat(40)
  const newSource = 'b'.repeat(40)
  const value = { connectionId, connectionRevisionId: revisionId, environment: 'SANDBOX', connectionName: 'Finance' }
  const declaration = { bindings: [{
    connectionId, connectionRevisionId: revisionId, environment: 'SANDBOX', qualificationId,
  }] }
  const input = { accountId, projectId, body: {
    connectionId, connectionRevisionId: revisionId, environment: 'SANDBOX', expectedCurrent: { state: 'ABSENT' },
  } }
  const fixture = (options = {}) => {
    const events = []
    const calls = []
    let intent = null
    const tuple = { oldSourceRevision: oldSource, applySourceRevision: newSource,
      cancelBaseSourceRevision: 'c'.repeat(40), cancelAppliedSourceRevision: 'd'.repeat(40),
      baseTree: 'e'.repeat(40), previousDeclarationBlob: null }
    const pool = { connect: async () => ({
      query: async (sql, args) => {
        if (sql.includes('project.get_binding_source_intent')) {
          events.push('read-intent')
          return { rows: [{ intent }] }
        }
        if (sql.includes('project.begin_connection_binding_intent')) {
          events.push('prepare')
          calls.push(args)
          if (options.prepareCode) throw Object.assign(new Error('private database detail'), { code: options.prepareCode })
          intent = { intent_id: args[7], project_id: projectId, account_id: accountId, workspace_id: workspaceId,
            operation_kind: 'CONNECTION', brain_revision_id: null, brain_digest: null,
            connection_id: connectionId, connection_revision_id: revisionId, environment: 'SANDBOX',
            state: 'PREPARING', version: 0, source_revision: oldSource, declaration: options.declaration ?? declaration,
            prepared_result: options.remove ? null : value, remove_binding: !!options.remove,
            declaration_digest: null, base_tree: null, previous_declaration_blob: null,
            apply_source_revision: null, cancel_base_source_revision: null, cancel_applied_source_revision: null }
          return { rows: [{ intent }] }
        }
        if (sql.includes('project.freeze_binding_source_intent')) {
          events.push('freeze')
          intent = { ...intent, state: 'APPLYING', version: 1, declaration_digest: args[4],
            base_tree: args[5], previous_declaration_blob: args[6], apply_source_revision: args[7],
            cancel_base_source_revision: args[8], cancel_applied_source_revision: args[9] }
          return { rows: [{ intent }] }
        }
        if (sql.includes('project.get_binding_source_basis')) {
          events.push('basis')
          assert.deepEqual(args, [accountId, projectId, intent.intent_id, intent.version])
          if (options.basisCode) throw Object.assign(new Error('basis unavailable'), { code: options.basisCode })
          return { rows: [{ basis: options.basis ?? {
            connectionDeclaration: { bindings: [] }, brainBindingDigest: null,
          } }] }
        }
        if (sql.includes('project.validate_binding_source_intent')) {
          events.push('validate')
          return { rows: [{ intent }] }
        }
        if (sql.includes('project.complete_binding_source_intent')) {
          events.push('settle')
          if (options.settleCode) throw Object.assign(new Error('private database detail'), { code: options.settleCode })
          intent = { ...intent, state: 'COMPLETED', version: 2, terminal_source_revision: newSource,
            terminal_result: options.remove ? null : (options.result ?? value) }
          return { rows: [{ intent }] }
        }
        if (sql.includes('project.abort_binding_source_intent')) {
          events.push('abort')
          if (intent.state === 'PREPARING') {
            if (options.competingFreeze) {
              intent = { ...intent, state: 'APPLYING', version: 1, declaration_digest: sha256(canonicalBytes(declaration)),
                base_tree: tuple.baseTree, previous_declaration_blob: null, apply_source_revision: newSource,
                cancel_base_source_revision: tuple.cancelBaseSourceRevision, cancel_applied_source_revision: tuple.cancelAppliedSourceRevision }
              throw Object.assign(new Error('competing freeze'), { code: 'P0001' })
            }
            if (options.abortUnknown && !options.abortCommitted) throw Object.assign(new Error('unknown abort'), { code: 'XX000' })
            intent = { ...intent, state: 'ABORTED', version: 1, refusal_code: args[4], terminal_source_revision: oldSource }
            if (options.abortUnknown) throw Object.assign(new Error('lost abort response'), { code: 'XX000' })
            return { rows: [{ intent }] }
          }
          intent = { ...intent, state: 'ABORTING', version: 2, refusal_code: args[4] }
          return { rows: [{ intent }] }
        }
        if (sql.includes('project.complete_binding_source_abort')) {
          events.push('aborted')
          intent = { ...intent, state: 'ABORTED', version: 3, terminal_source_revision: args[4] }
          return { rows: [{ intent }] }
        }
        events.push(sql)
        return { rows: [] }
      },
      release: () => {},
    }) }
    const git = {
      stageProjectBindingIntent: async (request) => {
        events.push('stage')
        calls.push(request)
        if (options.stageThrows) throw new Error('lost staging response')
        return options.stageResult ?? { status: 'STAGED', ...tuple }
      },
      applyProjectBindingIntent: async () => {
        events.push('git')
        return options.gitResult ?? { status: 'APPLIED', oldSourceRevision: oldSource, newSourceRevision: newSource }
      },
      cancelProjectBindingIntent: async () => {
        events.push('cancel')
        return { status: 'CANCELLED_APPLIED', newSourceRevision: tuple.cancelAppliedSourceRevision }
      },
    }
    return { store: createProjectConnectionBindingStore({ pool, git }), events, calls }
  }
  try {
    await context.test('success waits for the exact post-Git transaction commit', async () => {
      const subject = fixture()
      assert.deepEqual(await subject.store.setConnectionBinding(input), { status: 'FOUND', value })
      assert.deepEqual(subject.events, ['BEGIN', 'read-intent', 'COMMIT', 'BEGIN', 'prepare', 'COMMIT',
        'BEGIN', 'basis', 'COMMIT', 'stage', 'BEGIN', 'freeze', 'COMMIT', 'BEGIN', 'validate', 'COMMIT', 'git',
        'BEGIN', 'settle', 'COMMIT'])
      assert.equal(subject.calls[1].path, '.conexus/project/connection-bindings.json')
      assert.equal(subject.calls[1].expectedSourceRevision, oldSource)
      assert.deepEqual(JSON.parse(Buffer.from(subject.calls[1].declarationBytes).toString()), declaration)
      assert.deepEqual(subject.calls[1].expectedDeclarations, [
        { path: '.conexus/project/connection-bindings.json', digest: sha256(canonicalBytes({ bindings: [] })), allowAbsent: true },
        { path: '.conexus/project/brain-binding.json', digest: null, allowAbsent: true },
      ])
      assert.deepEqual(subject.calls[0].slice(0, 7), [accountId, projectId, connectionId, revisionId, 'SANDBOX', { state: 'ABSENT' }, false])
    })
    for (const [code, status] of [['42501', 'DENIED'], ['P0002', 'NOT_FOUND'], ['P0412', 'STALE'], ['22023', 'INVALID']]) {
      await context.test(`preparation ${code} cannot touch Git`, async () => {
        const subject = fixture({ prepareCode: code })
        assert.deepEqual(await subject.store.setConnectionBinding(input), { status })
        assert.deepEqual(subject.events, ['BEGIN', 'read-intent', 'COMMIT', 'BEGIN', 'prepare', 'ROLLBACK'])
      })
    }
    for (const [name, options, status] of [
      ['source/DB divergence', { stageResult: { status: 'REFUSED', code: 'SOURCE_DB_DIVERGENCE' } }, 'CONFLICT'],
      ['refusal', { stageResult: { status: 'REFUSED', code: 'UNSAFE_REPOSITORY' } }, 'UNAVAILABLE'],
      ['conflict', { stageResult: { status: 'CONFLICT' } }, 'CONFLICT'],
      ['lost stage response', { stageThrows: true }, 'UNAVAILABLE'],
      ['lost committed abandonment response', { stageThrows: true, abortUnknown: true, abortCommitted: true }, 'UNAVAILABLE'],
      ['unknown uncommitted abandonment', { stageThrows: true, abortUnknown: true }, 'UNAVAILABLE'],
      ['competing freeze wins', { stageThrows: true, competingFreeze: true }, 'CONFLICT'],
    ]) {
      await context.test(`PREPARING ${name} cannot gain ref-write authority`, async () => {
        const subject = fixture(options)
        assert.deepEqual(await subject.store.setConnectionBinding(input), { status })
        assert.equal(subject.events.includes('abort'), true)
        for (const event of ['freeze', 'git', 'cancel', 'settle']) assert.equal(subject.events.includes(event), false, event)
      })
    }
    await context.test('abandoned preparation permits a later command after staging recovers', async () => {
      const options = { stageThrows: true }
      const subject = fixture(options)
      assert.deepEqual(await subject.store.setConnectionBinding(input), { status: 'UNAVAILABLE' })
      options.stageThrows = false
      assert.deepEqual(await subject.store.setConnectionBinding(input), { status: 'FOUND', value })
    })
    await context.test('competing Git child cannot reach DB settlement', async () => {
      const subject = fixture({ gitResult: { status: 'CONFLICT', expectedSourceRevision: oldSource, actualSourceRevision: 'c'.repeat(40) } })
      assert.deepEqual(await subject.store.setConnectionBinding(input), { status: 'CONFLICT' })
      assert.equal(subject.events.at(-1), 'git')
      assert.equal(subject.events.includes('settle'), false)
    })
    for (const [code, status] of [['P0412', 'STALE'], ['42501', 'DENIED'], ['XX000', 'UNAVAILABLE']]) {
      await context.test(`post-Git ${code} rolls back and never returns success`, async () => {
        const subject = fixture({ settleCode: code })
        assert.deepEqual(await subject.store.setConnectionBinding(input), { status })
        assert.equal(subject.events.includes('ROLLBACK'), true)
        assert.equal(subject.events.includes('cancel'), code !== 'XX000')
      })
    }
    await context.test('malformed source declarations are refused before Git', async () => {
      const subject = fixture({ declaration: { bindings: [...declaration.bindings, ...declaration.bindings] } })
      assert.deepEqual(await subject.store.setConnectionBinding(input), { status: 'UNAVAILABLE' })
      assert.equal(subject.events.includes('git'), false)
    })
    await context.test('populated DB basis requires both exact declarations, never source-derived authority', async () => {
      const subject = fixture({ basis: { connectionDeclaration: declaration, brainBindingDigest: 'f'.repeat(64) } })
      assert.deepEqual(await subject.store.setConnectionBinding(input), { status: 'FOUND', value })
      assert.deepEqual(subject.calls[1].expectedDeclarations, [
        { path: '.conexus/project/connection-bindings.json', digest: sha256(canonicalBytes(declaration)), allowAbsent: false },
        { path: '.conexus/project/brain-binding.json', digest: 'f'.repeat(64), allowAbsent: false },
      ])
    })
    for (const options of [
      { basisCode: 'XX000' },
      { basis: {} },
      { basis: { connectionDeclaration: declaration, brainBindingDigest: 'bad' } },
      { basis: { connectionDeclaration: { bindings: [...declaration.bindings, ...declaration.bindings] }, brainBindingDigest: null } },
    ]) await context.test('unavailable or malformed basis cannot stage, freeze or apply', async () => {
      const subject = fixture(options)
      assert.deepEqual(await subject.store.setConnectionBinding(input), { status: 'UNAVAILABLE' })
      for (const event of ['stage', 'freeze', 'git', 'settle']) assert.equal(subject.events.includes(event), false, event)
    })
    await context.test('foreign settlement response rolls back rather than reporting another binding', async () => {
      const subject = fixture({ result: { ...value, connectionId: qualificationId } })
      assert.deepEqual(await subject.store.setConnectionBinding(input), { status: 'UNAVAILABLE' })
      assert.equal(subject.events.at(-1), 'ROLLBACK')
    })
    await context.test('removal forwards the exact narrowing subject and returns no body', async () => {
      const subject = fixture({ remove: true, declaration: { bindings: [] } })
      assert.deepEqual(await subject.store.removeConnectionBinding({ accountId, projectId, body: {
        connectionId, expectedConnectionRevisionId: revisionId, expectedEnvironment: 'SANDBOX',
      } }), { status: 'FOUND', value: undefined })
      assert.deepEqual(subject.calls[0].slice(5, 7), [{ state: 'PRESENT', connectionRevisionId: revisionId, environment: 'SANDBOX' }, true])
    })
  } finally {
    rmSync(outputRoot, { recursive: true, force: true })
  }
})

const runOciInspection = (repositoryRoot, image, program) => {
  const outcome = spawnSync('docker', [
    'run', '--rm', '--pull', 'never', '--network', 'none', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges', '--read-only',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
    '--user', `${process.getuid()}:${process.getgid()}`,
    '--mount', `type=bind,src=${repositoryRoot},dst=/repository.git,readonly`,
    '--entrypoint', '/usr/local/bin/node', image, '-e', program,
  ], { encoding: 'utf8' })
  if (outcome.status !== 0 || outcome.signal !== null) {
    throw new Error(`R2_P4_OCI_INSPECTION_FAILED\n${outcome.stdout}\n${outcome.stderr}`)
  }
  return JSON.parse(outcome.stdout)
}

const inspectRepository = (repositoryRoot, image, revision) => runOciInspection(repositoryRoot, image, `
const { spawnSync } = require('node:child_process')
const env = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/tmp', GIT_TERMINAL_PROMPT: '0' }
const git = (args, raw = false) => spawnSync('/usr/local/bin/git', ['--git-dir=/repository.git', ...args], { env, encoding: raw ? null : 'utf8' })
const ok = value => !value.error && value.status === 0 && value.signal === null
const revision = ${JSON.stringify(revision)}
const listed = git(['ls-tree', '-r', '-z', revision])
if (!ok(listed)) process.exit(2)
const entries = listed.stdout.toString().split('\\0').filter(Boolean).map(line => {
  const match = /^(\\d{6}) blob ([0-9a-f]{40})\\t([\\s\\S]*)$/.exec(line)
  if (!match) process.exit(3)
  return { mode: match[1], oid: match[2], path: match[3] }
})
const files = Object.fromEntries(entries.map(entry => [entry.path, git(['cat-file', 'blob', revision + ':' + entry.path], true).stdout.toString('base64')]))
const commit = git(['cat-file', 'commit', revision])
if (!ok(commit)) process.exit(4)
process.stdout.write(JSON.stringify({ entries, files, commit: commit.stdout }))
`)

test('R2-P4 real OCI Git binding CAS preserves the complete tree and deterministic replay', {
  skip: gitLive ? false : 'set CONEXUS_R2_P4_GIT_LIVE=true for deciding local proof',
  timeout: 600_000,
}, async (context) => {
  const { outputRoot, built } = compileGitCapability()
  const { createOciGitExecutionPort, createOciProjectBindingGitCapability } = await import(built('project/git-execution.js'))
  const { R1C14_GIT_IDENTITY } = await import(built('generated/r1c14-git-identity.js'))
  const storageRoot = mkdtempSync('/tmp/conexus-r2-p4-git-live-')
  const projectId = '11111111-1111-4111-8111-111111111111'
  const attemptId = '22222222-2222-4222-8222-222222222222'
  try {
    const source = createOciGitExecutionPort({ projectStorageRoot: storageRoot })
    const staged = await source.stageNewProjectSource({ projectId, attemptId })
    assert.equal(staged.status, 'STAGED', JSON.stringify(staged))
    assert.deepEqual(await source.promoteStagedProjectSource({
      projectId, attemptId, sourceRevision: staged.sourceRevision,
    }), { status: 'PROMOTED', sourceRevision: staged.sourceRevision })
    const repositoryRoot = resolve(storageRoot, 'projects', projectId)
    const before = inspectRepository(repositoryRoot, R1C14_GIT_IDENTITY.ociIndexDigest, staged.sourceRevision)
    const brainBytes = Buffer.from('{"brainRevisionId":"brain-1","validationState":"VALID"}')
    const capability = createOciProjectBindingGitCapability({ projectStorageRoot: storageRoot })
    const applied = await capability.applyProjectBinding({
      projectId, expectedSourceRevision: staged.sourceRevision,
      path: '.conexus/project/brain-binding.json', declarationBytes: brainBytes,
    })
    assert.equal(applied.status, 'APPLIED', JSON.stringify(applied))
    if (applied.status !== 'APPLIED') return
    assert.equal(applied.oldSourceRevision, staged.sourceRevision)
    assert.match(applied.newSourceRevision, /^[0-9a-f]{40}$/)
    const after = inspectRepository(repositoryRoot, R1C14_GIT_IDENTITY.ociIndexDigest, applied.newSourceRevision)
    assert.equal(after.entries.length, before.entries.length + 1)
    for (const entry of before.entries) {
      assert.deepEqual(after.entries.find(candidate => candidate.path === entry.path), entry)
      assert.equal(after.files[entry.path], before.files[entry.path])
    }
    assert.equal(after.files['.conexus/project/brain-binding.json'], brainBytes.toString('base64'))
    assert.match(after.commit, new RegExp(`^tree [0-9a-f]{40}\\nparent ${staged.sourceRevision}\\nauthor Conexus OS <source@conexus.invalid> 946684800 \\+0000\\ncommitter Conexus OS <source@conexus.invalid> 946684800 \\+0000\\n`))
    context.diagnostic(`brain binding child=${applied.newSourceRevision}`)

    // Simulates DB settlement failing after Git CAS: replay accepts only the
    // same deterministic child and does not create another commit.
    const resumedCapability = createOciProjectBindingGitCapability({ projectStorageRoot: storageRoot })
    assert.deepEqual(await resumedCapability.applyProjectBinding({
      projectId, expectedSourceRevision: staged.sourceRevision,
      path: '.conexus/project/brain-binding.json', declarationBytes: brainBytes,
    }), applied)

    const connectionBytes = Buffer.from('{"bindings":[]}')
    const connection = await capability.applyProjectBinding({
      projectId, expectedSourceRevision: applied.newSourceRevision,
      path: '.conexus/project/connection-bindings.json', declarationBytes: connectionBytes,
    })
    assert.equal(connection.status, 'APPLIED', JSON.stringify(connection))
    if (connection.status !== 'APPLIED') return
    const final = inspectRepository(repositoryRoot, R1C14_GIT_IDENTITY.ociIndexDigest, connection.newSourceRevision)
    assert.equal(final.files['.conexus/project/brain-binding.json'], brainBytes.toString('base64'))
    assert.equal(final.files['.conexus/project/connection-bindings.json'], connectionBytes.toString('base64'))
    assert.deepEqual(await capability.applyProjectBinding({
      projectId, expectedSourceRevision: connection.newSourceRevision,
      path: '.conexus/project/not-admitted.json', declarationBytes: connectionBytes,
    }), { status: 'REFUSED', code: 'IDENTITY_REFUSED' })
    assert.deepEqual(await capability.applyProjectBinding({
      projectId, expectedSourceRevision: connection.newSourceRevision,
      path: '.conexus/project/connection-bindings.json', declarationBytes: Buffer.from('{"bindings": []}'),
    }), { status: 'REFUSED', code: 'DECLARATION_REFUSED' })
    const rogueRef = resolve(repositoryRoot, 'refs/heads/rogue')
    writeFileSync(rogueRef, `${connection.newSourceRevision}\n`, { flag: 'wx', mode: 0o600 })
    try {
      assert.deepEqual(await capability.applyProjectBinding({
        projectId, expectedSourceRevision: connection.newSourceRevision,
        path: '.conexus/project/connection-bindings.json', declarationBytes: connectionBytes,
      }), { status: 'REFUSED', code: 'UNSAFE_REPOSITORY' })
    } finally {
      rmSync(rogueRef, { force: true })
    }
    assert.equal(readdirSync(resolve(storageRoot)).some(name => name.startsWith('.conexus-project-binding-')), false)
  } finally {
    rmSync(storageRoot, { recursive: true, force: true })
    rmSync(outputRoot, { recursive: true, force: true })
  }
})

test('R2-P4 real OCI Git binding CAS returns one winner for concurrent competing declarations', {
  skip: gitLive ? false : 'set CONEXUS_R2_P4_GIT_LIVE=true for deciding local proof',
  timeout: 600_000,
}, async (context) => {
  const { outputRoot, built } = compileGitCapability()
  const { createOciGitExecutionPort, createOciProjectBindingGitCapability } = await import(built('project/git-execution.js'))
  const { R1C14_GIT_IDENTITY } = await import(built('generated/r1c14-git-identity.js'))
  const storageRoot = mkdtempSync('/tmp/conexus-r2-p4-git-concurrent-')
  const projectId = '33333333-3333-4333-8333-333333333333'
  const attemptId = '44444444-4444-4444-8444-444444444444'
  try {
    const source = createOciGitExecutionPort({ projectStorageRoot: storageRoot })
    const staged = await source.stageNewProjectSource({ projectId, attemptId })
    assert.equal(staged.status, 'STAGED', JSON.stringify(staged))
    assert.deepEqual(await source.promoteStagedProjectSource({
      projectId, attemptId, sourceRevision: staged.sourceRevision,
    }), { status: 'PROMOTED', sourceRevision: staged.sourceRevision })
    const capability = createOciProjectBindingGitCapability({ projectStorageRoot: storageRoot })
    const [left, right] = await Promise.all([
      capability.applyProjectBinding({
        projectId, expectedSourceRevision: staged.sourceRevision,
        path: '.conexus/project/connection-bindings.json', declarationBytes: Buffer.from('{"bindings":[{"id":"left"}]}'),
      }),
      capability.applyProjectBinding({
        projectId, expectedSourceRevision: staged.sourceRevision,
        path: '.conexus/project/connection-bindings.json', declarationBytes: Buffer.from('{"bindings":[{"id":"right"}]}'),
      }),
    ])
    const outcomes = [left, right]
    assert.equal(outcomes.filter(outcome => outcome.status === 'APPLIED').length, 1, JSON.stringify(outcomes))
    assert.equal(outcomes.filter(outcome => outcome.status === 'CONFLICT').length, 1, JSON.stringify(outcomes))
    const winner = outcomes.find(outcome => outcome.status === 'APPLIED')
    assert.ok(winner)
    if (winner?.status !== 'APPLIED') return
    const current = inspectRepository(resolve(storageRoot, 'projects', projectId), R1C14_GIT_IDENTITY.ociIndexDigest, winner.newSourceRevision)
    assert.equal(current.files['.conexus/project/connection-bindings.json'],
      (left.status === 'APPLIED' ? Buffer.from('{"bindings":[{"id":"left"}]}') : Buffer.from('{"bindings":[{"id":"right"}]}')).toString('base64'))
    context.diagnostic(`winner=${winner.newSourceRevision}`)
  } finally {
    rmSync(storageRoot, { recursive: true, force: true })
    rmSync(outputRoot, { recursive: true, force: true })
  }
})

test('R2-P4 Project connection binding HTTP adapter enforces generated contract and custody', async () => {
  const { outputRoot, built } = compileGitCapability()
  const { createHttpApp } = await import(built('http/app.js'))
  const { registerProjectConnectionBindingRoutes } = await import(built('project/routes.js'))
  const origin = 'https://control.example.test'
  const csrf = 'csrf-token'
  const accountId = '11111111-1111-4111-8111-111111111111'
  const projectId = '22222222-2222-4222-8222-222222222222'
  const connectionId = '33333333-3333-4333-8333-333333333333'
  const connectionRevisionId = '44444444-4444-4444-8444-444444444444'
  const binding = {
    connectionId, connectionRevisionId, environment: 'SANDBOX', connectionName: 'Finance',
  }
  const setBody = {
    connectionId, connectionRevisionId, environment: 'SANDBOX', expectedCurrent: { state: 'ABSENT' },
  }
  const removeBody = {
    connectionId, expectedConnectionRevisionId: connectionRevisionId, expectedEnvironment: 'SANDBOX',
  }
  const state = {
    session: { account: { accountId } },
    listResult: { status: 'FOUND', value: [binding] },
    setResult: { status: 'FOUND', value: binding },
    removeResult: { status: 'FOUND', value: undefined },
    listError: null,
    setError: null,
    removeError: null,
    sessionCalls: [],
    listCalls: [],
    setCalls: [],
    removeCalls: [],
  }
  const store = {
    listConnectionBindings: async (input) => {
      state.listCalls.push(input)
      if (state.listError) throw state.listError
      return state.listResult
    },
    setConnectionBinding: async (input) => {
      state.setCalls.push(input)
      if (state.setError) throw state.setError
      return state.setResult
    },
    removeConnectionBinding: async (input) => {
      state.removeCalls.push(input)
      if (state.removeError) throw state.removeError
      return state.removeResult
    },
  }
  const resolveCurrentSession = async (_request, requireCsrf) => {
    state.sessionCalls.push(requireCsrf)
    return state.session
  }
  const commandHeaders = (extra = {}) => ({
    origin,
    cookie: `__Host-conexus_csrf=${csrf}`,
    'x-conexus-csrf': csrf,
    ...extra,
  })
  const injectSet = (app, body = setBody, extra = {}) => app.inject({
    method: 'POST',
    url: `/api/control/projects/${projectId}/commands/set-connection-binding`,
    headers: commandHeaders(extra),
    payload: body,
  })
  const injectRemove = (app, body = removeBody, extra = {}) => app.inject({
    method: 'POST',
    url: `/api/control/projects/${projectId}/commands/remove-connection-binding`,
    headers: commandHeaders(extra),
    payload: body,
  })
  const statusOf = (response) => {
    assert.equal(response.headers['content-type']?.includes('application/problem+json'), true)
    return JSON.parse(response.body).status
  }

  try {
    const app = await createHttpApp({
      registerRoutes: (server) => registerProjectConnectionBindingRoutes(server, {
        store, resolveCurrentSession, origin,
      }),
    })
    try {
      assert.deepEqual(app.routeCensus(), ['PRJ-13', 'PRJ-14', 'PRJ-15'])

      const listed = await app.inject({
        method: 'GET',
        url: `/api/control/projects/${projectId}/connection-bindings`,
      })
      assert.equal(listed.statusCode, 200)
      assert.deepEqual(JSON.parse(listed.body), [binding])
      assert.deepEqual(state.listCalls.at(-1), { accountId, projectId })
      assert.equal(state.sessionCalls.at(-1), undefined)

      for (const [result, expectedStatus] of [
        [{ status: 'DENIED' }, 403],
        [{ status: 'NOT_FOUND' }, 404],
        [{ status: 'UNAVAILABLE' }, 503],
      ]) {
        state.listResult = result
        const response = await app.inject({
          method: 'GET',
          url: `/api/control/projects/${projectId}/connection-bindings`,
        })
        assert.equal(response.statusCode, expectedStatus)
        assert.equal(statusOf(response), expectedStatus)
      }
      state.listResult = { status: 'FOUND', value: [binding] }
      state.listError = Object.assign(new Error('private list detail'), { code: '22P02' })
      const invalidProject = await app.inject({
        method: 'GET',
        url: `/api/control/projects/${projectId}/connection-bindings`,
      })
      assert.equal(invalidProject.statusCode, 404)
      assert.equal(statusOf(invalidProject), 404)
      state.listError = new Error('private list secret')
      const listFailure = await app.inject({
        method: 'GET',
        url: `/api/control/projects/${projectId}/connection-bindings`,
      })
      assert.equal(listFailure.statusCode, 503)
      assert.doesNotMatch(listFailure.body, /private list secret/)
      state.listError = null

      const callsBeforeMalformed = state.setCalls.length
      const malformed = await injectSet(app, { ...setBody, accountId: 'browser-forged-account' })
      assert.equal(malformed.statusCode, 400)
      assert.equal(state.setCalls.length, callsBeforeMalformed)
      assert.equal(state.sessionCalls.at(-1), undefined)

      state.sessionCalls.length = 0
      const absent = await injectSet(app, setBody, { 'x-account-id': 'browser-forged-account' })
      assert.equal(absent.statusCode, 200)
      assert.deepEqual(JSON.parse(absent.body), binding)
      assert.equal(state.sessionCalls.at(-1), true)
      assert.deepEqual(state.setCalls.at(-1), { accountId, projectId, body: setBody })

      const presentBody = {
        ...setBody,
        expectedCurrent: { state: 'PRESENT', connectionRevisionId, environment: 'SANDBOX' },
      }
      const present = await injectSet(app, presentBody)
      assert.equal(present.statusCode, 200)
      assert.deepEqual(state.setCalls.at(-1), { accountId, projectId, body: presentBody })

      for (const [result, expectedStatus] of [
        [{ status: 'DENIED' }, 403],
        [{ status: 'NOT_FOUND' }, 404],
        [{ status: 'CONFLICT' }, 409],
        [{ status: 'STALE' }, 412],
        [{ status: 'INVALID' }, 422],
        [{ status: 'UNAVAILABLE' }, 503],
      ]) {
        state.setResult = result
        const response = await injectSet(app)
        assert.equal(response.statusCode, expectedStatus)
        assert.equal(statusOf(response), expectedStatus)
      }
      state.setResult = { status: 'FOUND', value: binding }
      state.setError = Object.assign(new Error('private set detail'), { code: '22P02' })
      const setNotFound = await injectSet(app)
      assert.equal(setNotFound.statusCode, 404)
      assert.equal(statusOf(setNotFound), 404)
      state.setError = new Error('private set secret')
      const setFailure = await injectSet(app)
      assert.equal(setFailure.statusCode, 503)
      assert.doesNotMatch(setFailure.body, /private set secret/)
      state.setError = null

      state.removeResult = { status: 'FOUND', value: undefined }
      const removed = await injectRemove(app)
      assert.equal(removed.statusCode, 204)
      assert.equal(removed.body, '')
      assert.equal(state.sessionCalls.at(-1), true)
      assert.deepEqual(state.removeCalls.at(-1), { accountId, projectId, body: removeBody })
      for (const [result, expectedStatus] of [
        [{ status: 'DENIED' }, 403],
        [{ status: 'NOT_FOUND' }, 404],
        [{ status: 'CONFLICT' }, 409],
        [{ status: 'STALE' }, 412],
        [{ status: 'INVALID' }, 412],
        [{ status: 'UNAVAILABLE' }, 503],
      ]) {
        state.removeResult = result
        const response = await injectRemove(app)
        assert.equal(response.statusCode, expectedStatus)
        assert.equal(statusOf(response), expectedStatus)
      }
      state.removeResult = { status: 'FOUND', value: undefined }
      state.removeError = Object.assign(new Error('private remove detail'), { code: '22P02' })
      const removeNotFound = await injectRemove(app)
      assert.equal(removeNotFound.statusCode, 404)
      assert.equal(statusOf(removeNotFound), 404)
      state.removeError = null

      const callsBeforeAuth = {
        list: state.listCalls.length, set: state.setCalls.length, remove: state.removeCalls.length,
      }
      state.session = null
      const anonymous = await injectSet(app)
      assert.equal(anonymous.statusCode, 401)
      assert.equal(statusOf(anonymous), 401)
      assert.deepEqual({
        list: state.listCalls.length, set: state.setCalls.length, remove: state.removeCalls.length,
      }, callsBeforeAuth)
      state.session = { account: { accountId } }

      for (const headers of [
        { origin: 'https://other.example.test', cookie: `__Host-conexus_csrf=${csrf}`, 'x-conexus-csrf': csrf },
        { origin, cookie: `__Host-conexus_csrf=${csrf}` },
        { origin, cookie: `__Host-conexus_csrf=${csrf}`, 'x-conexus-csrf': 'wrong-token' },
      ]) {
        const callsBeforeRefusal = state.setCalls.length
        const response = await app.inject({
          method: 'POST',
          url: `/api/control/projects/${projectId}/commands/set-connection-binding`,
          headers,
          payload: setBody,
        })
        assert.equal(response.statusCode, 403)
        assert.equal(state.setCalls.length, callsBeforeRefusal)
      }
    } finally {
      await app.close()
    }
  } finally {
    rmSync(outputRoot, { recursive: true, force: true })
  }
})

test('R2-P4 project binding config is independently optional from R1 Project runtime', async () => {
  const { outputRoot, built } = compileGitCapability()
  const { readHubConfig } = await import(built('platform/config.js'))
  const base = {
    NODE_ENV: 'test',
    CONEXUS_ORIGIN: 'https://control.example.test',
    CONEXUS_BOOTSTRAP_SUBJECT: 'bootstrap-subject',
    CONEXUS_DB_HOST: '127.0.0.1',
    CONEXUS_DB_PORT: '5432',
    CONEXUS_DB_NAME: 'conexus',
    CONEXUS_DB_USER: 'conexus',
    CONEXUS_DB_PASSWORD_FILE: '/run/secrets/database',
    CONEXUS_OIDC_ISSUER: 'https://issuer.example.test',
    CONEXUS_OIDC_CLIENT_ID: 'conexus-client',
    CONEXUS_OIDC_CLIENT_SECRET_FILE: '/run/secrets/oidc',
  }
  try {
    const withoutBindings = readHubConfig(base)
    assert.equal(withoutBindings.project, undefined)
    assert.equal(withoutBindings.projectBindings, undefined)

    const missingStorageRoot = {
      ...base,
      CONEXUS_DB_R2_PROJECT_BINDING_PASSWORD_FILE: '/run/secrets/project-binding',
    }
    assert.throws(() => readHubConfig(missingStorageRoot), /MISSING_CONFIG_CONEXUS_PROJECT_STORAGE_ROOT/)

    const withBindings = {
      ...missingStorageRoot,
      CONEXUS_PROJECT_STORAGE_ROOT: '/var/lib/conexus/projects',
    }
    const configured = readHubConfig(withBindings)
    assert.deepEqual(configured.projectBindings, {
      passwordFile: '/run/secrets/project-binding',
      storageRoot: '/var/lib/conexus/projects',
    })
    assert.equal(configured.project, undefined)

    const withBrainContextSource = readHubConfig({
      ...withBindings,
      CONEXUS_PROJECT_SOURCE_OWNERSHIP_MANIFEST_FILE: '/etc/conexus/source-ownership.json',
    })
    assert.deepEqual(withBrainContextSource.projectBindings, {
      passwordFile: '/run/secrets/project-binding',
      storageRoot: '/var/lib/conexus/projects',
      sourceOwnershipManifestFile: '/etc/conexus/source-ownership.json',
    })
    assert.equal(withBrainContextSource.project, undefined)

    assert.throws(() => readHubConfig({
      ...withBindings,
      CONEXUS_DB_R2_BRAIN_ATTESTER_PASSWORD_FILE: '/run/secrets/brain-attester',
    }), /MISSING_CONFIG_CONEXUS_DB_R2_KEY_CONFORMANCE_SUBJECT_PASSWORD_FILE/)
    assert.throws(() => readHubConfig({
      ...withBindings,
      CONEXUS_PROJECT_SOURCE_OWNERSHIP_MANIFEST_FILE: '/etc/conexus/source-ownership.json',
      CONEXUS_DB_R2_BRAIN_ATTESTER_PASSWORD_FILE: '/run/secrets/brain-attester',
    }), /MISSING_CONFIG_CONEXUS_DB_R2_KEY_CONFORMANCE_SUBJECT_PASSWORD_FILE/)
    assert.throws(() => readHubConfig({
      ...base,
      CONEXUS_DB_R2_BRAIN_ATTESTER_PASSWORD_FILE: '/run/secrets/brain-attester',
    }), /MISSING_CONFIG_CONEXUS_DB_R2_KEY_CONFORMANCE_SUBJECT_PASSWORD_FILE/)

    assert.throws(() => readHubConfig({
      ...withBindings,
      CONEXUS_DB_PRJ03_COMMAND_PASSWORD_FILE: '/run/secrets/prj03',
    }), /MISSING_CONFIG_CONEXUS_DB_S3_READ_PASSWORD_FILE/)
  } finally {
    rmSync(outputRoot, { recursive: true, force: true })
  }
})
