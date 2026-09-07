import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import pg from 'pg'
import {
  loadMigrationFiles,
  loadR2MigrationFiles,
  runHubMigrations,
  runR2HubMigrations,
} from '../../scripts/run-hub-migrations.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const migrationsRoot = resolve(repositoryRoot, 'apps/hub/migrations')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-p1-build-'))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false',
  '--outDir', buildRoot,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`R2_P1_HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
process.once('exit', () => rmSync(buildRoot, { recursive: true, force: true }))

const secrets = await import(pathToFileURL(resolve(buildRoot, 'platform/credential-backend.js')).href)
const sankhya = await import(pathToFileURL(resolve(buildRoot, 'connections/sankhya-om.js')).href)
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const expectedVersions = Array.from({ length: 18 }, (_, index) => String(index + 1).padStart(3, '0'))

const createCredentialFixture = () => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'conexus-r2-p1-credentials-'))
  const root = resolve(fixture, 'ciphertext')
  const keyFile = resolve(fixture, 'root-key')
  mkdirSync(root, { mode: 0o700 })
  writeFileSync(keyFile, `${randomBytes(32).toString('base64')}\n`, { mode: 0o600 })
  return { fixture, root, keyFile }
}
const credentialPath = (root, coordinate) => resolve(
  root,
  sha256(coordinate.connectionId),
  `${sha256(coordinate.generation)}.json`,
)

test('R2-P1 exact sankhya-om pack is declarative, closed and rejects invalid configuration or credentials', () => {
  const definition = sankhya.sankhyaOmConnectorDefinition
  assert.equal(definition.connectorDefinitionId, 'sankhya-om')
  assert.equal(definition.connectorVersion, '1.0.0')
  assert.deepEqual(definition.origins, {
    SANDBOX: 'https://api.sandbox.sankhya.com.br',
    PRODUCTION: 'https://api.sankhya.com.br',
  })
  assert.deepEqual(definition.authentication, {
    method: 'POST', path: '/authenticate', contentType: 'application/x-www-form-urlencoded',
    grantType: 'client_credentials', xTokenHeader: 'X-Token', redirect: 'error',
  })
  assert.deepEqual(definition.capabilities, [{
    capabilityId: 'sankhya.company.read.v1', method: 'GET',
    pathTemplate: '/v1/empresas/{serverResolvedCompanyCode}', effect: 'READ_ONLY', redirect: 'error',
  }])
  assert.equal(Object.isFrozen(definition.configurationSchema), true)
  assert.equal(Object.isFrozen(definition.configurationSchema.required), true)
  assert.equal(Object.isFrozen(definition.credentialInputSchema), true)
  assert.equal(Object.isFrozen(definition.credentialInputSchema.required), true)
  assert.equal(sankhya.resolveSankhyaOrigin('SANDBOX'), definition.origins.SANDBOX)
  assert.throws(() => sankhya.resolveSankhyaOrigin('toString'), /SANKHYA_ENVIRONMENT_REFUSED/)
  assert.equal(sankhya.isSankhyaConfiguration({ environment: 'SANDBOX', companyCode: 1 }), true)
  assert.equal(sankhya.isSankhyaConfiguration({ environment: 'PRODUCTION', companyCode: 2_147_483_647 }), true)
  for (const invalid of [
    {},
    { environment: 'SANDBOX', companyCode: 0 },
    { environment: 'OTHER', companyCode: 1 },
    { environment: 'SANDBOX', companyCode: 1.5 },
    { environment: 'SANDBOX', companyCode: 1, origin: 'https://attacker.invalid' },
  ]) assert.equal(sankhya.isSankhyaConfiguration(invalid), false)
  assert.equal(sankhya.isSankhyaCredentialInput({ clientId: 'id', clientSecret: 'secret', xToken: 'token' }), true)
  for (const invalid of [
    { clientId: '', clientSecret: 'secret', xToken: 'token' },
    { clientId: 'id', clientSecret: 'secret' },
    { clientId: 'id', clientSecret: 'secret', xToken: 'token', refreshToken: 'not-admitted' },
  ]) assert.equal(sankhya.isSankhyaCredentialInput(invalid), false)

  const source = readFileSync(resolve(repositoryRoot, 'apps/hub/src/connections/sankhya-om.ts'), 'utf8')
  assert.doesNotMatch(source, /\bfetch\s*\(|axios|undici|http:\/\//)
  assert.doesNotMatch(readFileSync(resolve(repositoryRoot, 'apps/hub/src/server.ts'), 'utf8'), /r2-routes|sankhya-om/)
})

test('R2-P1 production credential backend encrypts real files and fires immutability, AAD, tamper and custody controls', async (t) => {
  const { fixture, root, keyFile } = createCredentialFixture()
  t.after(() => rmSync(fixture, { recursive: true, force: true }))
  const backend = secrets.createEncryptedFileCredentialBackend({ root, keyFile, keyGeneration: 'key-1' })
  const first = { connectionId: randomUUID(), generation: '1' }
  const second = { connectionId: first.connectionId, generation: '2' }
  const plaintext = Buffer.from(JSON.stringify({ clientId: 'actual-id', clientSecret: 'actual-secret', xToken: 'actual-token' }))

  await backend.write(first, plaintext)
  await backend.write(second, plaintext)
  assert.deepEqual(await backend.materialize(first), plaintext)
  assert.deepEqual(await backend.materialize(second), plaintext)
  await assert.rejects(backend.write(first, plaintext), /CREDENTIAL_GENERATION_EXISTS/)

  const firstPath = credentialPath(root, first)
  const secondPath = credentialPath(root, second)
  const firstEnvelope = JSON.parse(readFileSync(firstPath, 'utf8'))
  const secondEnvelope = JSON.parse(readFileSync(secondPath, 'utf8'))
  assert.notEqual(firstEnvelope.nonce, secondEnvelope.nonce)
  assert.equal(Buffer.from(firstEnvelope.nonce, 'base64').length, 12)
  assert.equal(Buffer.from(firstEnvelope.authenticationTag, 'base64').length, 16)
  assert.equal(statSync(firstPath).mode & 0o777, 0o600)
  assert.doesNotMatch(readFileSync(firstPath, 'utf8'), /actual-id|actual-secret|actual-token/)
  assert.equal(readdirSync(dirname(firstPath)).some((name) => name.endsWith('.tmp')), false)

  const substituted = { connectionId: first.connectionId, generation: '3' }
  copyFileSync(firstPath, credentialPath(root, substituted))
  chmodSync(credentialPath(root, substituted), 0o600)
  await assert.rejects(backend.materialize(substituted), /CREDENTIAL_AUTHENTICATION_FAILED/)

  firstEnvelope.ciphertext = `${firstEnvelope.ciphertext.slice(0, -2)}AA`
  writeFileSync(firstPath, `${JSON.stringify(firstEnvelope)}\n`, { mode: 0o600 })
  await assert.rejects(backend.materialize(first), /CREDENTIAL_AUTHENTICATION_FAILED|CREDENTIAL_ENVELOPE_REFUSED/)

  const wrongGeneration = secrets.createEncryptedFileCredentialBackend({ root, keyFile, keyGeneration: 'key-2' })
  await assert.rejects(wrongGeneration.materialize(second), /CREDENTIAL_KEY_GENERATION_MISMATCH/)
  chmodSync(secondPath, 0o644)
  await assert.rejects(backend.materialize(second), /CREDENTIAL_FILE_REFUSED/)
  chmodSync(secondPath, 0o600)
  unlinkSync(secondPath)
  symlinkSync(firstPath, secondPath)
  await assert.rejects(backend.materialize(second), /CREDENTIAL_FILE_REFUSED/)
  await assert.rejects(backend.write({ connectionId: '../escape', generation: '4' }, plaintext), /CREDENTIAL_COORDINATE_REFUSED/)
})

test('R2-P1 credential root key accepts owner-read-only custody without admitting broader permissions', () => {
  const fixtures = []
  try {
    for (const mode of [0o400, 0o600]) {
      const fixture = createCredentialFixture()
      fixtures.push(fixture)
      chmodSync(fixture.keyFile, mode)
      assert.doesNotThrow(() => secrets.createEncryptedFileCredentialBackend({
        root: fixture.root, keyFile: fixture.keyFile, keyGeneration: 'key-1',
      }))
    }
    for (const mode of [0o000, 0o200, 0o500, 0o700, 0o440, 0o640, 0o604, 0o644]) {
      const fixture = createCredentialFixture()
      fixtures.push(fixture)
      chmodSync(fixture.keyFile, mode)
      assert.throws(() => secrets.createEncryptedFileCredentialBackend({
        root: fixture.root, keyFile: fixture.keyFile, keyGeneration: 'key-1',
      }), /EACCES|CREDENTIAL_KEY_FILE_REFUSED/)
    }
  } finally {
    for (const { fixture } of fixtures) rmSync(fixture, { recursive: true, force: true })
  }
})

test('R2-P1 credential backend refuses permissive, symlink and co-custodied roots or keys', () => {
  const cases = []
  const permissiveRoot = createCredentialFixture()
  chmodSync(permissiveRoot.root, 0o755)
  cases.push([permissiveRoot, () => secrets.createEncryptedFileCredentialBackend({
    root: permissiveRoot.root, keyFile: permissiveRoot.keyFile, keyGeneration: 'key-1',
  }), /CREDENTIAL_ROOT_REFUSED/])

  const permissiveKey = createCredentialFixture()
  chmodSync(permissiveKey.keyFile, 0o644)
  cases.push([permissiveKey, () => secrets.createEncryptedFileCredentialBackend({
    root: permissiveKey.root, keyFile: permissiveKey.keyFile, keyGeneration: 'key-1',
  }), /CREDENTIAL_KEY_FILE_REFUSED/])

  const symlinkKey = createCredentialFixture()
  const linkedKey = resolve(symlinkKey.fixture, 'linked-key')
  symlinkSync(symlinkKey.keyFile, linkedKey)
  cases.push([symlinkKey, () => secrets.createEncryptedFileCredentialBackend({
    root: symlinkKey.root, keyFile: linkedKey, keyGeneration: 'key-1',
  }), /ELOOP|CREDENTIAL_KEY_FILE_REFUSED/])

  const coCustodied = createCredentialFixture()
  const innerKey = resolve(coCustodied.root, 'inner-key')
  copyFileSync(coCustodied.keyFile, innerKey)
  chmodSync(innerKey, 0o600)
  cases.push([coCustodied, () => secrets.createEncryptedFileCredentialBackend({
    root: coCustodied.root, keyFile: innerKey, keyGeneration: 'key-1',
  }), /CREDENTIAL_KEY_CUSTODY_REFUSED/])

  const symlinkRoot = createCredentialFixture()
  const linkedRoot = resolve(symlinkRoot.fixture, 'linked-root')
  symlinkSync(symlinkRoot.root, linkedRoot)
  cases.push([symlinkRoot, () => secrets.createEncryptedFileCredentialBackend({
    root: linkedRoot, keyFile: symlinkRoot.keyFile, keyGeneration: 'key-1',
  }), /CREDENTIAL_ROOT_REFUSED/])

  const ancestorAlias = createCredentialFixture()
  const aliasedInnerKey = resolve(ancestorAlias.root, 'inner-key')
  copyFileSync(ancestorAlias.keyFile, aliasedInnerKey)
  chmodSync(aliasedInnerKey, 0o600)
  const rootAlias = resolve(ancestorAlias.fixture, 'root-alias')
  symlinkSync(ancestorAlias.root, rootAlias)
  cases.push([ancestorAlias, () => secrets.createEncryptedFileCredentialBackend({
    root: ancestorAlias.root, keyFile: resolve(rootAlias, 'inner-key'), keyGeneration: 'key-1',
  }), /CREDENTIAL_KEY_CUSTODY_REFUSED/])

  try {
    for (const [, action, expected] of cases) assert.throws(action, expected)
  } finally {
    for (const [{ fixture }] of cases) rmSync(fixture, { recursive: true, force: true })
  }
})

test('R2-P1 migration custody preserves the R1 loader and refuses 011 byte drift', () => {
  assert.deepEqual(loadMigrationFiles().map(({ version }) => version), expectedVersions.slice(0, 10))
  assert.deepEqual(loadR2MigrationFiles().map(({ version }) => version), expectedVersions)
  const fixture = mkdtempSync(resolve(tmpdir(), 'conexus-r2-p1-migrations-'))
  try {
    for (const name of readdirSync(migrationsRoot).filter((entry) => entry.endsWith('.sql'))) {
      copyFileSync(resolve(migrationsRoot, name), resolve(fixture, name))
    }
    writeFileSync(resolve(fixture, '011_r2_brain_connections.sql'), '\n-- drift\n', { flag: 'a' })
    assert.throws(() => loadR2MigrationFiles(fixture), /MIGRATION_011_DIGEST_REFUSED/)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

const databaseConfigured = [
  'CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME',
  'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD',
].every((name) => process.env[name])

test('R2-P1 real PostgreSQL proves exact record census, Tier-2 boundary and owner isolation', {
  skip: databaseConfigured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  const { Client } = pg
  const adminConnection = {
    host: process.env.CONEXUS_TEST_DB_HOST,
    port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME,
    user: process.env.CONEXUS_TEST_DB_USER,
    password: process.env.CONEXUS_TEST_DB_PASSWORD,
  }
  const database = `conexus_r2_p1_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  const quote = (value) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('UNSAFE_TEST_IDENTIFIER')
    return `"${value}"`
  }
  const query = async (connection, statement, values = []) => {
    const client = new Client(connection)
    await client.connect()
    try { return await client.query(statement, values) } finally { await client.end() }
  }
  await query(adminConnection, `CREATE DATABASE ${quote(database)}`)
  const fresh = { ...adminConnection, database }
  t.after(() => query(adminConnection, `DROP DATABASE ${quote(database)} WITH (FORCE)`))
  const url = new URL('postgresql://localhost')
  url.hostname = fresh.host
  url.port = String(fresh.port)
  url.pathname = `/${fresh.database}`
  url.username = fresh.user
  url.password = fresh.password

  const migration = await runR2HubMigrations({ connectionString: url.toString() })
  assert.deepEqual(migration.appliedNow, expectedVersions)
  assert.deepEqual(migration.versions, expectedVersions)
  assert.deepEqual((await runR2HubMigrations({ connectionString: url.toString() })).appliedNow, [])
  const historicalLoader = await runHubMigrations({ connectionString: url.toString() })
  assert.deepEqual(historicalLoader.appliedNow, [])
  assert.deepEqual(historicalLoader.versions, expectedVersions)

  await query(fresh, 'GRANT USAGE ON SCHEMA reg TO hub_iam_runtime')
  await assert.rejects(
    runR2HubMigrations({ connectionString: url.toString() }),
    /MIGRATION_014_SCHEMA_PRIVILEGE_REFUSED/,
  )
  await query(fresh, 'REVOKE USAGE ON SCHEMA reg FROM hub_iam_runtime')
  await query(fresh, 'GRANT SELECT ON project.brain_binding TO hub_iam_runtime')
  await assert.rejects(
    runR2HubMigrations({ connectionString: url.toString() }),
    /MIGRATION_014_TABLE_PRIVILEGE_REFUSED/,
  )
  await query(fresh, 'REVOKE SELECT ON project.brain_binding FROM hub_iam_runtime')

  assert.deepEqual((await query(fresh, `
    SELECT schemaname || '.' || tablename || ':' || tableowner AS signature
    FROM pg_tables WHERE schemaname IN ('reg', 'brn', 'con')
      OR (schemaname = 'project' AND tablename IN ('brain_binding', 'connection_binding'))
    ORDER BY schemaname, tablename
  `)).rows.map(({ signature }) => signature), [
    'brn.binding_validation:brain_owner', 'brn.health:brain_owner',
    'con.connection:connections_owner', 'con.connection_qualification:connections_owner',
    'con.connection_revision:connections_owner', 'con.operation_receipt:connections_owner',
    'project.brain_binding:project_owner',
    'project.connection_binding:project_owner', 'reg.artifact:registry_owner',
    'reg.artifact_revision:registry_owner',
  ])
  const crossOwnerFks = await query(fresh, `
    SELECT source_namespace.nspname || '.' || source_relation.relname AS source,
      target_namespace.nspname || '.' || target_relation.relname AS target
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS source_relation ON source_relation.oid = constraint_row.conrelid
    JOIN pg_namespace AS source_namespace ON source_namespace.oid = source_relation.relnamespace
    JOIN pg_class AS target_relation ON target_relation.oid = constraint_row.confrelid
    JOIN pg_namespace AS target_namespace ON target_namespace.oid = target_relation.relnamespace
    WHERE constraint_row.contype = 'f' AND source_namespace.nspname <> target_namespace.nspname
      AND source_namespace.nspname IN ('reg', 'brn', 'con')
    ORDER BY source, target
  `)
  assert.deepEqual(crossOwnerFks.rows, [
    { source: 'con.connection', target: 'project.project' },
    { source: 'con.connection', target: 'workspace.workspace' },
    { source: 'reg.artifact', target: 'workspace.workspace' },
  ])
  assert.equal((await query(fresh, `
    SELECT count(*)::integer AS count FROM pg_constraint AS constraint_row
    JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE constraint_row.contype = 'f' AND namespace.nspname IN ('brn', 'project')
      AND relation.relname IN ('health', 'binding_validation', 'brain_binding', 'connection_binding')
      AND constraint_row.confrelid <> relation.oid
  `)).rows[0].count, 2)
  assert.deepEqual((await query(fresh, `
    WITH runtime_roles(role_name) AS (
      SELECT rolname FROM pg_roles WHERE rolcanlogin AND rolname LIKE 'hub\\_%' ESCAPE '\\'
    )
    SELECT role_name, schema_name FROM runtime_roles
    CROSS JOIN unnest(ARRAY['brn', 'con', 'reg']::text[]) AS schema_name
    WHERE has_schema_privilege(role_name, schema_name, 'USAGE')
    ORDER BY role_name, schema_name
  `)).rows, [
    { role_name: 'hub_r2_brain_attester', schema_name: 'brn' },
    { role_name: 'hub_r2_brain_attester', schema_name: 'reg' },
    { role_name: 'hub_r2_brain_bootstrap', schema_name: 'brn' },
    { role_name: 'hub_r2_brain_bootstrap', schema_name: 'reg' },
    { role_name: 'hub_r2_brain_read', schema_name: 'brn' },
    { role_name: 'hub_r2_brain_read', schema_name: 'reg' },
    { role_name: 'hub_r2_connections', schema_name: 'con' },
  ])
  assert.deepEqual((await query(fresh, `
    WITH runtime_roles(role_name) AS (
      SELECT rolname FROM pg_roles WHERE rolcanlogin AND rolname LIKE 'hub\\_%' ESCAPE '\\'
    )
    SELECT role_name, tables.table_schema, tables.table_name FROM runtime_roles
    CROSS JOIN information_schema.tables
    WHERE (tables.table_schema IN ('brn', 'con', 'reg')
      OR (tables.table_schema = 'project' AND tables.table_name IN ('brain_binding', 'connection_binding')))
      AND has_table_privilege(role_name,
        quote_ident(tables.table_schema) || '.' || quote_ident(tables.table_name),
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    ORDER BY role_name, tables.table_schema, tables.table_name
  `)).rows, [])

  const accountId = randomUUID()
  const workspaceId = randomUUID()
  const projectId = randomUUID()
  await query(fresh, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', 'r2-p1', 'R2 P1')`, [accountId])
  await query(fresh, `INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'R2 Workspace')`, [workspaceId])
  await query(fresh, `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'R2 Project', 'NEW', 'source-1', 'project-1')`, [projectId, workspaceId])
  const artifactId = randomUUID()
  const brainRevisionId = randomUUID()
  await query(fresh, `INSERT INTO reg.artifact(artifact_id, workspace_id, kind, semantic_name)
    VALUES ($1, $2, 'brain', 'Canonical Brain')`, [artifactId, workspaceId])
  await query(fresh, `INSERT INTO reg.artifact_revision(artifact_revision_id, artifact_id, source_revision, digest, payload, availability)
    VALUES ($1, $2, 'brain-source-1', $3, '{}', 'AVAILABLE')`, [brainRevisionId, artifactId, 'a'.repeat(64)])
  await query(fresh, `INSERT INTO brn.health(health_snapshot_digest, brain_revision_id, brain_digest, items)
    VALUES ($1, $2, $3, '[]')`, ['b'.repeat(64), brainRevisionId, 'a'.repeat(64)])
  await query(fresh, `INSERT INTO project.brain_binding(project_id, brain_revision_id, brain_digest,
    project_binding_digest, validation_state, project_source_revision)
    VALUES ($1, $2, $3, $4, 'VALID', 'project-1')`, [projectId, brainRevisionId, 'a'.repeat(64), 'c'.repeat(64)])

  const connectionId = randomUUID()
  const revisionId = randomUUID()
  const qualificationId = randomUUID()
  await query(fresh, `INSERT INTO con.connection(connection_id, owner_scope_kind, workspace_id, name)
    VALUES ($1, 'WORKSPACE', $2, 'Sankhya')`, [connectionId, workspaceId])
  await query(fresh, `INSERT INTO con.connection_revision(connection_revision_id, connection_id,
    connector_definition_id, connector_version, configuration, configuration_digest)
    VALUES ($1, $2, 'sankhya-om', '1.0.0', $3, $4)`, [
    revisionId, connectionId, JSON.stringify({ environment: 'SANDBOX', companyCode: 1 }), 'd'.repeat(64),
  ])
  const historicalReturnRevisionId = randomUUID()
  await query(fresh, `INSERT INTO con.connection_revision(connection_revision_id, connection_id,
    connector_definition_id, connector_version, configuration, configuration_digest)
    VALUES ($1, $2, 'sankhya-om', '1.0.0', $3, $4)`, [
    historicalReturnRevisionId, connectionId,
    JSON.stringify({ environment: 'SANDBOX', companyCode: 1 }), 'd'.repeat(64),
  ])
  assert.equal((await query(fresh, `SELECT count(*)::integer AS count
    FROM con.connection_revision WHERE connection_id = $1 AND configuration_digest = $2`, [
    connectionId, 'd'.repeat(64),
  ])).rows[0].count, 2)
  await query(fresh, `UPDATE con.connection SET current_revision_id = $2,
    credential_generation = 1, credential_generation_high_watermark = 1
    WHERE connection_id = $1`, [connectionId, revisionId])
  await query(fresh, `INSERT INTO con.connection_qualification(qualification_id, connection_id,
    connection_revision_id, credential_generation, environment, qualification_state, outcome,
    diagnostic, evidence_refs, tested_at)
    VALUES ($1, $2, $3, 1, 'SANDBOX', 'QUALIFIED', 'PASSED', $4, ARRAY['evidence:r2-p1'], clock_timestamp())`, [
    qualificationId, connectionId, revisionId, JSON.stringify({ title: 'Passed', message: 'Exact result' }),
  ])
  await query(fresh, `INSERT INTO project.connection_binding(project_id, connection_id,
    connection_revision_id, qualification_id, environment, binding_digest, project_source_revision)
    VALUES ($1, $2, $3, $4, 'SANDBOX', $5, 'project-1')`, [
    projectId, connectionId, revisionId, qualificationId, 'e'.repeat(64),
  ])

  await assert.rejects(query(fresh, `INSERT INTO con.connection(connection_id, owner_scope_kind, workspace_id, project_id, name)
    VALUES ($1, 'WORKSPACE', $2, $3, 'Invalid scope')`, [randomUUID(), workspaceId, projectId]), /check constraint/)
  await assert.rejects(query(fresh, `INSERT INTO con.connection(connection_id, owner_scope_kind, workspace_id, name)
    VALUES ($1, 'WORKSPACE', $2, 'Dangling')`, [randomUUID(), randomUUID()]), /foreign key constraint/)

  const client = new Client(fresh)
  await client.connect()
  try {
    await client.query('SET ROLE registry_owner')
    await assert.rejects(client.query('SELECT * FROM con.connection'), /permission denied/)
    await client.query('RESET ROLE')
    await client.query('SET ROLE connections_owner')
    await assert.rejects(client.query('SELECT * FROM project.project'), /permission denied/)
    await client.query('RESET ROLE')
    await client.query('SET ROLE brain_owner')
    await assert.rejects(client.query('SELECT * FROM reg.artifact'), /permission denied/)
    await client.query('RESET ROLE')
  } finally {
    await client.end()
  }
})
