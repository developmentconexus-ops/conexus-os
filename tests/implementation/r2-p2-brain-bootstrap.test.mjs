import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import test from 'node:test'
import { inflateSync } from 'node:zlib'
import canonicalize from 'canonicalize'
import pg from 'pg'
import {
  R2_BRAIN_GIT_IDENTITY,
  brainHealthSnapshotDigest,
  bootstrapR2Brain,
  nestedMountPoints,
  readDatabaseUrl,
  validateBrainAdmission,
  validateBrainHealth,
  validateBrainSource,
  verifyLocalBrainRepository,
} from '../../scripts/bootstrap-r2-brain.mjs'
import { runHubMigrations, runR2HubMigrations } from '../../scripts/run-hub-migrations.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const expectedVersions = Array.from({ length: 18 }, (_, index) => String(index + 1).padStart(3, '0'))
const databaseConfigured = [
  'CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME',
  'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD',
].every((name) => process.env[name])
const gitLive = process.env.CONEXUS_R2_P2_GIT_LIVE === 'true'

const source = Object.freeze({
  schemaVersion: 'conexus-brain/v1',
  reviewText: 'Synthetic, non-production Budget Analyzer Brain used only for R2-P2 proof.',
  knowledgeBrowse: Object.freeze({
    domains: [Object.freeze({
      domainRef: 'budget',
      label: 'Synthetic budget',
      concepts: [Object.freeze({
        conceptRef: 'budget.amount',
        label: 'Budget amount',
        summary: 'A synthetic planned spending amount.',
        contentClasses: ['SEMANTIC', 'KNOWLEDGE'],
        sections: [
          Object.freeze({ kind: 'DEFINITION', text: 'Synthetic planned amount for a synthetic cost center.' }),
          Object.freeze({ kind: 'VERIFICATION', text: 'Compare only generated enum-like proof values.' }),
        ],
        provenanceRefs: ['synthetic://r2-p2/budget-amount'],
      })],
    })],
  }),
})
const health = Object.freeze({
  schemaVersion: 'conexus-brain-health/v1',
  items: Object.freeze([
    Object.freeze({ semanticRef: 'proof.valid', state: 'VALID', critical: true }),
    Object.freeze({ semanticRef: 'proof.unverified', state: 'UNVERIFIED', critical: false }),
    Object.freeze({ semanticRef: 'proof.suspect', state: 'SUSPECT', critical: true }),
    Object.freeze({ semanticRef: 'proof.invalid', state: 'INVALID', critical: true }),
    Object.freeze({ semanticRef: 'proof.check-error', state: 'CHECK_ERROR', critical: false }),
  ]),
})
const canonicalSourceBytes = Buffer.from(`${canonicalize(source)}\n`)
const sourceDigest = createHash('sha256').update(canonicalSourceBytes).digest('hex')
const admission = Object.freeze({
  schemaVersion: 'conexus-brain-admission/v1',
  brainDigest: sourceDigest,
  contentSource: 'SYNTHETIC',
  piiLint: 'PASS',
  secretScan: 'PASS',
  humanReview: Object.freeze({
    decision: 'APPROVED',
    reviewerRef: 'operator://conexus/r2-p2-synthetic-proof',
    reviewedAt: '2026-09-04T00:00:00.000Z',
  }),
})

test('Brain health snapshot identity binds the immutable Brain revision', () => {
  const first = brainHealthSnapshotDigest({
    brainRevisionId: '00000000-0000-4000-8000-000000000001', brainDigest: sourceDigest, items: health.items,
  })
  const second = brainHealthSnapshotDigest({
    brainRevisionId: '00000000-0000-4000-8000-000000000002', brainDigest: sourceDigest, items: health.items,
  })
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.match(second, /^[a-f0-9]{64}$/)
  assert.notEqual(first, second)
})

test('Brain custody rejects nested repository and object bind mounts', () => {
  const mountInfo = [
    '36 25 0:32 / / rw,relatime - overlay overlay rw',
    '40 36 8:1 /brain /srv/brain rw,relatime - ext4 /dev/sda rw',
    '41 40 8:2 /project-repository /srv/brain/workspaces/one/repository.git rw,relatime - ext4 /dev/sdb rw',
    '42 41 8:3 /project-objects /srv/brain/workspaces/two/repository.git/objects rw,relatime - ext4 /dev/sdc rw',
  ].join('\n')
  assert.deepEqual(nestedMountPoints('/srv/brain', mountInfo), [
    '/srv/brain/workspaces/one/repository.git',
    '/srv/brain/workspaces/two/repository.git/objects',
  ])
  assert.deepEqual(nestedMountPoints('/srv/project', mountInfo), [])
})

test('Brain custody refuses a remote-daemon success claim without local Git bytes', () => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'conexus-r2-p2-remote-daemon-'))
  try {
    chmodSync(fixture, 0o700)
    assert.throws(() => verifyLocalBrainRepository(fixture, canonicalSourceBytes, {
      sourceRevision: '0'.repeat(40), tree: '0'.repeat(40),
    }), /BRAIN_GIT_LOCAL_CUSTODY_REFUSED/)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

const readLooseObject = (repository, objectId, expectedKind) => {
  const compressed = readFileSync(resolve(repository, 'objects', objectId.slice(0, 2), objectId.slice(2)))
  const bytes = inflateSync(compressed)
  assert.equal(createHash('sha1').update(bytes).digest('hex'), objectId)
  const separator = bytes.indexOf(0)
  assert.notEqual(separator, -1)
  const header = bytes.subarray(0, separator).toString('utf8')
  const body = bytes.subarray(separator + 1)
  assert.equal(header, `${expectedKind} ${body.length}`)
  return body
}

const quote = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('UNSAFE_TEST_IDENTIFIER')
  return `"${value}"`
}

const databaseHarness = async (t, prefix) => {
  const admin = {
    host: process.env.CONEXUS_TEST_DB_HOST,
    port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME,
    user: process.env.CONEXUS_TEST_DB_USER,
    password: process.env.CONEXUS_TEST_DB_PASSWORD,
  }
  const database = `${prefix}_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  const query = async (connection, statement, values = []) => {
    const client = new pg.Client(connection)
    await client.connect()
    try { return await client.query(statement, values) } finally { await client.end() }
  }
  await query(admin, `CREATE DATABASE ${quote(database)}`)
  const fresh = { ...admin, database }
  t.after(() => query(admin, `DROP DATABASE ${quote(database)} WITH (FORCE)`))
  const url = new URL('postgresql://localhost')
  url.hostname = fresh.host
  url.port = String(fresh.port)
  url.pathname = `/${fresh.database}`
  url.username = fresh.user
  url.password = fresh.password
  return { admin, fresh, query, url: url.toString() }
}

const seedWorkspaceBeforeR2 = async ({ query, fresh }) => {
  const creatorId = randomUUID()
  const memberId = randomUUID()
  const workspaceId = randomUUID()
  await query(fresh, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', 'r2-p2-creator', 'R2 P2 Creator'),
      ($2, 'https://issuer.test', 'r2-p2-member', 'R2 P2 Member')`, [creatorId, memberId])
  await query(fresh, `INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'R2 P2 Workspace')`, [workspaceId])
  await query(fresh, `INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project)
    VALUES ($1, $3, true), ($2, $3, false)`, [creatorId, memberId, workspaceId])
  return { creatorId, memberId, workspaceId }
}

test('R2-P2 source, health and database URL admission fail closed at their exact boundaries', () => {
  const pin = JSON.parse(readFileSync(resolve(
    repositoryRoot,
    'qualification/4d/r1-git-source-custody/native-readmission-pin.json',
  ), 'utf8'))
  assert.deepEqual(R2_BRAIN_GIT_IDENTITY, {
    ociIndexDigest: pin.image.ociIndexDigest,
    gitVersion: pin.git.version,
    gitExecutablePath: '/usr/local/bin/git',
    gitExecutableSha256: pin.git.executableSha256,
  })
  assert.equal(validateBrainSource(source), source)
  assert.equal(validateBrainHealth(health), health)
  assert.equal(validateBrainAdmission(admission, sourceDigest), admission)
  assert.throws(() => validateBrainAdmission({ ...admission, brainDigest: '0'.repeat(64) }, sourceDigest), /BRAIN_ADMISSION_RECEIPT_REFUSED/)
  assert.throws(() => validateBrainSource({
    ...source,
    knowledgeBrowse: { domains: [...source.knowledgeBrowse.domains, source.knowledgeBrowse.domains[0]] },
  }), /BRAIN_SOURCE_REFUSED/)
  assert.throws(() => validateBrainSource({
    ...source,
    knowledgeBrowse: { domains: [{
      ...source.knowledgeBrowse.domains[0],
      concepts: [source.knowledgeBrowse.domains[0].concepts[0], source.knowledgeBrowse.domains[0].concepts[0]],
    }] },
  }), /BRAIN_SOURCE_REFUSED/)
  assert.throws(() => validateBrainHealth({
    ...health,
    items: [health.items[0], { ...health.items[0], state: 'INVALID' }],
  }), /BRAIN_HEALTH_REFUSED/)

  const fixture = mkdtempSync(resolve(tmpdir(), 'conexus-r2-p2-url-'))
  try {
    const urlFile = resolve(fixture, 'database-url')
    writeFileSync(urlFile, 'postgresql://brain:proof@127.0.0.1/conexus\n', { mode: 0o400 })
    assert.equal(readDatabaseUrl(urlFile), 'postgresql://brain:proof@127.0.0.1/conexus')
    chmodSync(urlFile, 0o600)
    assert.equal(readDatabaseUrl(urlFile), 'postgresql://brain:proof@127.0.0.1/conexus')
    for (const invalid of ['', '   \n', 'http://127.0.0.1/conexus\n', 'postgresql://first\npostgresql://second\n']) {
      writeFileSync(urlFile, invalid, { mode: 0o600 })
      assert.throws(() => readDatabaseUrl(urlFile), /BRAIN_DATABASE_URL_FILE_REFUSED/)
    }
    writeFileSync(urlFile, 'postgresql://brain:proof@127.0.0.1/conexus\n', { mode: 0o644 })
    chmodSync(urlFile, 0o644)
    assert.throws(() => readDatabaseUrl(urlFile), /BRAIN_DATABASE_URL_FILE_REFUSED/)
    const linked = resolve(fixture, 'database-url-link')
    symlinkSync(urlFile, linked)
    assert.throws(() => readDatabaseUrl(linked), /BRAIN_DATABASE_URL_FILE_REFUSED/)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('R2-P2 bootstrap accepts authority inputs only from owner-only files', async () => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'conexus-r2-p2-input-mode-'))
  try {
    const brainRoot = resolve(fixture, 'brain')
    const projectRoot = resolve(fixture, 'projects')
    const sourceFile = resolve(fixture, 'source.json')
    const healthFile = resolve(fixture, 'health.json')
    const admissionFile = resolve(fixture, 'admission.json')
    mkdirSync(brainRoot, { mode: 0o700 })
    mkdirSync(projectRoot, { mode: 0o700 })
    writeFileSync(sourceFile, `${JSON.stringify(source)}\n`, { mode: 0o600 })
    writeFileSync(healthFile, `${JSON.stringify(health)}\n`, { mode: 0o600 })
    writeFileSync(admissionFile, `${JSON.stringify(admission)}\n`, { mode: 0o600 })
    const input = {
      sourceFile, healthFile, admissionFile, brainStorageRoot: brainRoot, projectStorageRoot: projectRoot,
      workspaceId: randomUUID(), artifactId: randomUUID(), brainRevisionId: randomUUID(),
      connectionString: 'postgresql://unused.invalid/refused-before-connect',
    }
    chmodSync(sourceFile, 0o644)
    await assert.rejects(bootstrapR2Brain(input), /BRAIN_SOURCE_FILE_REFUSED/)
    chmodSync(sourceFile, 0o600)
    chmodSync(healthFile, 0o644)
    await assert.rejects(bootstrapR2Brain(input), /BRAIN_HEALTH_FILE_REFUSED/)
    chmodSync(healthFile, 0o600)
    chmodSync(admissionFile, 0o644)
    await assert.rejects(bootstrapR2Brain(input), /BRAIN_ADMISSION_RECEIPT_REFUSED/)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('R2-P2 real PostgreSQL proves independent brain.read, immutable bootstrap and false-PASS resistance', {
  skip: databaseConfigured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  const harness = await databaseHarness(t, 'conexus_r2_p2_pg')
  assert.deepEqual((await runHubMigrations({ connectionString: harness.url })).versions, expectedVersions.slice(0, 10))
  const identities = await seedWorkspaceBeforeR2(harness)
  assert.deepEqual((await runR2HubMigrations({ connectionString: harness.url })).versions, expectedVersions)
  assert.deepEqual((await runR2HubMigrations({ connectionString: harness.url })).appliedNow, [])

  assert.deepEqual((await harness.query(harness.fresh, `
    SELECT account_id, can_create_project, can_read_brain
    FROM iam.workspace_membership WHERE workspace_id = $1 ORDER BY account_id
  `, [identities.workspaceId])).rows.map((row) => ({
    ...row,
    account_id: row.account_id === identities.creatorId ? 'creator' : 'member',
  })).sort((left, right) => left.account_id.localeCompare(right.account_id)), [
    { account_id: 'creator', can_create_project: true, can_read_brain: true },
    { account_id: 'member', can_create_project: false, can_read_brain: false },
  ].sort((left, right) => left.account_id.localeCompare(right.account_id)))

  const futureCreatorId = randomUUID()
  const futureWorkspaceId = randomUUID()
  await harness.query(harness.fresh, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', 'r2-p2-future', 'R2 P2 Future Creator')`, [futureCreatorId])
  await harness.query(harness.fresh, `INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'Future Workspace')`, [futureWorkspaceId])
  await harness.query(harness.fresh, 'SELECT iam.establish_workspace_creator_access($1, $2)', [futureCreatorId, futureWorkspaceId])
  assert.deepEqual((await harness.query(harness.fresh, `SELECT can_create_project, can_read_brain
    FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2`, [futureCreatorId, futureWorkspaceId])).rows[0], {
    can_create_project: true,
    can_read_brain: true,
  })
  await harness.query(harness.fresh, `UPDATE iam.workspace_membership SET can_read_brain = false
    WHERE account_id = $1 AND workspace_id = $2`, [futureCreatorId, futureWorkspaceId])
  assert.deepEqual((await harness.query(harness.fresh, `SELECT can_create_project, can_read_brain
    FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2`, [futureCreatorId, futureWorkspaceId])).rows[0], {
    can_create_project: true,
    can_read_brain: false,
  })
  await harness.query(harness.fresh, `UPDATE iam.workspace_membership SET can_create_project = false, can_read_brain = true
    WHERE account_id = $1 AND workspace_id = $2`, [identities.creatorId, identities.workspaceId])
  assert.deepEqual((await harness.query(harness.fresh, `SELECT can_create_project, can_read_brain
    FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2`, [identities.creatorId, identities.workspaceId])).rows[0], {
    can_create_project: false,
    can_read_brain: true,
  })

  await harness.query(harness.fresh, "ALTER ROLE hub_r2_brain_bootstrap PASSWORD 'r2-p2-bootstrap-proof'")
  await harness.query(harness.fresh, "ALTER ROLE hub_r2_brain_read PASSWORD 'r2-p2-read-proof'")
  const roleUrl = (role, password) => {
    const url = new URL(harness.url)
    url.username = role
    url.password = password
    return url.toString()
  }
  const bootstrapUrl = roleUrl('hub_r2_brain_bootstrap', 'r2-p2-bootstrap-proof')
  const readUrl = roleUrl('hub_r2_brain_read', 'r2-p2-read-proof')
  const artifactId = randomUUID()
  const brainRevisionId = randomUUID()
  const brainDigest = 'a'.repeat(64)
  const healthDigest = 'b'.repeat(64)
  const sourceRevision = 'c'.repeat(40)
  const bootstrapConnection = { connectionString: bootstrapUrl }
  await harness.query(bootstrapConnection, 'SELECT reg.bootstrap_workspace_brain($1, $2, $3, $4, $5, $6)', [
    artifactId, identities.workspaceId, brainRevisionId, sourceRevision, brainDigest, source,
  ])
  await harness.query(bootstrapConnection, 'SELECT brn.bootstrap_brain_health($1, $2, $3, $4)', [
    healthDigest, brainRevisionId, brainDigest, JSON.stringify(health.items),
  ])
  await assert.rejects(harness.query(bootstrapConnection,
    'SELECT brn.bootstrap_brain_health($1, $2, $3, $4)', [
      'f'.repeat(64), randomUUID(), brainDigest,
      JSON.stringify([{ semanticRef: 'null-state', state: null, critical: true }]),
    ]), /BRAIN_HEALTH_ITEMS_REFUSED/)
  const secondArtifactId = randomUUID()
  const secondBrainRevisionId = randomUUID()
  const secondHealthDigest = brainHealthSnapshotDigest({
    brainRevisionId: secondBrainRevisionId, brainDigest, items: health.items,
  })
  await harness.query(bootstrapConnection, 'SELECT reg.bootstrap_workspace_brain($1, $2, $3, $4, $5, $6)', [
    secondArtifactId, futureWorkspaceId, secondBrainRevisionId, sourceRevision, brainDigest, source,
  ])
  await harness.query(bootstrapConnection, 'SELECT brn.bootstrap_brain_health($1, $2, $3, $4)', [
    secondHealthDigest, secondBrainRevisionId, brainDigest, JSON.stringify(health.items),
  ])
  assert.notEqual(secondHealthDigest, healthDigest)
  await harness.query(bootstrapConnection, 'SELECT reg.bootstrap_workspace_brain($1, $2, $3, $4, $5, $6)', [
    artifactId, identities.workspaceId, brainRevisionId, sourceRevision, brainDigest, source,
  ])
  await harness.query(bootstrapConnection, 'SELECT brn.bootstrap_brain_health($1, $2, $3, $4)', [
    healthDigest, brainRevisionId, brainDigest, JSON.stringify(health.items),
  ])
  await assert.rejects(harness.query(bootstrapConnection,
    'SELECT reg.bootstrap_workspace_brain($1, $2, $3, $4, $5, $6)', [
      artifactId, identities.workspaceId, brainRevisionId, sourceRevision, brainDigest, { ...source, reviewText: 'mutated' },
    ]), /BRAIN_REVISION_IDENTITY_CONFLICT/)
  await assert.rejects(harness.query(bootstrapConnection,
    'SELECT brn.bootstrap_brain_health($1, $2, $3, $4)', [
      'd'.repeat(64), brainRevisionId, brainDigest,
      JSON.stringify([{ semanticRef: 'same', state: 'VALID', critical: true }, { semanticRef: 'same', state: 'INVALID', critical: true }]),
    ]), /BRAIN_HEALTH_ITEMS_REFUSED/)
  await assert.rejects(harness.query(bootstrapConnection,
    'SELECT brn.bootstrap_brain_health($1, $2, $3, $4)', [
      'e'.repeat(64), brainRevisionId, brainDigest, JSON.stringify([{ semanticRef: 'changed', state: 'VALID', critical: true }]),
    ]), /BRAIN_HEALTH_IDENTITY_CONFLICT/)
  assert.deepEqual((await harness.query({ connectionString: readUrl },
    'SELECT * FROM iam.admit_brain_read($1, $2)', [identities.creatorId, identities.workspaceId])).rows, [{
    workspace_id: identities.workspaceId,
    can_read_brain: true,
  }])
  assert.deepEqual((await harness.query({ connectionString: readUrl },
    'SELECT * FROM iam.admit_brain_read($1, $2)', [identities.memberId, identities.workspaceId])).rows, [{
    workspace_id: identities.workspaceId,
    can_read_brain: false,
  }])
  assert.deepEqual((await harness.query({ connectionString: readUrl },
    'SELECT * FROM iam.admit_brain_read($1, $2)', [randomUUID(), identities.workspaceId])).rows, [])
  await assert.rejects(harness.query({ connectionString: readUrl }, 'SELECT * FROM reg.artifact'), /permission denied/)
  await assert.rejects(harness.query(bootstrapConnection, 'SELECT * FROM brn.health'), /permission denied/)

  await harness.query(harness.fresh, `GRANT EXECUTE ON FUNCTION reg.bootstrap_workspace_brain(uuid, uuid, uuid, text, text, jsonb)
    TO hub_r2_brain_read`)
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_014_RUNTIME_FUNCTION_ACL_REFUSED/)
  await harness.query(harness.fresh, `REVOKE EXECUTE ON FUNCTION reg.bootstrap_workspace_brain(uuid, uuid, uuid, text, text, jsonb)
    FROM hub_r2_brain_read`)
  await harness.query(harness.fresh, 'GRANT EXECUTE ON FUNCTION brn.get_brain_health(uuid, text) TO hub_r2_brain_read WITH GRANT OPTION')
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_015_EXECUTE_GRANT_OPTION_REFUSED/)
  await harness.query(harness.fresh, 'REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION brn.get_brain_health(uuid, text) FROM hub_r2_brain_read')
  await harness.query(harness.fresh, 'GRANT EXECUTE ON FUNCTION iam.admit_brain_read(uuid, uuid) TO hub_s2_read')
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_015_EXECUTE_PRIVILEGE_REFUSED/)
  await harness.query(harness.fresh, 'REVOKE EXECUTE ON FUNCTION iam.admit_brain_read(uuid, uuid) FROM hub_s2_read')
  await harness.query(harness.fresh, 'GRANT EXECUTE ON FUNCTION workspace.list_workspace_summaries(uuid[]) TO hub_r2_brain_bootstrap')
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_014_RUNTIME_FUNCTION_ACL_REFUSED/)
  await harness.query(harness.fresh, 'REVOKE EXECUTE ON FUNCTION workspace.list_workspace_summaries(uuid[]) FROM hub_r2_brain_bootstrap')
  await harness.query(harness.fresh, 'GRANT SELECT ON TABLE workspace.workspace TO hub_r2_brain_read')
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_015_TABLE_PRIVILEGE_REFUSED/)
  await harness.query(harness.fresh, 'REVOKE SELECT ON TABLE workspace.workspace FROM hub_r2_brain_read')
  await harness.query(harness.fresh, 'GRANT USAGE ON SCHEMA project TO hub_s2_read')
  await harness.query(harness.fresh, 'GRANT SELECT ON TABLE project.project TO hub_s2_read')
  await harness.query(harness.fresh, 'GRANT EXECUTE ON FUNCTION project.get_project_representation(uuid, uuid[]) TO hub_s2_read')
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_015_EXECUTE_PRIVILEGE_REFUSED/)
  await harness.query(harness.fresh, 'REVOKE EXECUTE ON FUNCTION project.get_project_representation(uuid, uuid[]) FROM hub_s2_read')
  await harness.query(harness.fresh, 'REVOKE SELECT ON TABLE project.project FROM hub_s2_read')
  await harness.query(harness.fresh, 'REVOKE USAGE ON SCHEMA project FROM hub_s2_read')
  await harness.query(harness.fresh, 'GRANT SELECT(display_name) ON TABLE iam.account TO hub_r2_brain_read')
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_015_TABLE_PRIVILEGE_REFUSED/)
  await harness.query(harness.fresh, 'REVOKE SELECT(display_name) ON TABLE iam.account FROM hub_r2_brain_read')
  await harness.query(harness.fresh, `ALTER DEFAULT PRIVILEGES FOR ROLE iam_owner IN SCHEMA iam
    GRANT SELECT ON TABLES TO hub_r2_brain_read`)
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_015_DEFAULT_ACL_REFUSED/)
  await harness.query(harness.fresh, `ALTER DEFAULT PRIVILEGES FOR ROLE iam_owner IN SCHEMA iam
    REVOKE SELECT ON TABLES FROM hub_r2_brain_read`)
  await harness.query(harness.fresh, 'ALTER TABLE brn.health ENABLE ROW LEVEL SECURITY')
  await harness.query(harness.fresh, 'ALTER TABLE brn.health FORCE ROW LEVEL SECURITY')
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_011_RLS_REFUSED/)
  await harness.query(harness.fresh, 'ALTER TABLE brn.health NO FORCE ROW LEVEL SECURITY')
  await harness.query(harness.fresh, 'ALTER TABLE brn.health DISABLE ROW LEVEL SECURITY')
  await harness.query(harness.fresh, `CREATE FUNCTION public.r2_p2_block_health() RETURNS trigger LANGUAGE plpgsql AS $function$
    BEGIN RAISE EXCEPTION 'BLOCKED_BY_TRIGGER'; END
    $function$`)
  await harness.query(harness.fresh, `CREATE TRIGGER r2_p2_block_health BEFORE INSERT ON brn.health
    FOR EACH ROW EXECUTE FUNCTION public.r2_p2_block_health()`)
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_011_TRIGGER_RULE_REFUSED/)
  await harness.query(harness.fresh, 'DROP TRIGGER r2_p2_block_health ON brn.health')
  await harness.query(harness.fresh, 'DROP FUNCTION public.r2_p2_block_health()')
  await harness.query(harness.fresh, 'ALTER TABLE reg.artifact DISABLE TRIGGER ALL')
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_011_TRIGGER_RULE_REFUSED/)
  await harness.query(harness.fresh, 'ALTER TABLE reg.artifact ENABLE TRIGGER ALL')
  await harness.query(harness.fresh, 'CREATE ROLE r2_p2_rogue NOLOGIN')
  await harness.query(harness.fresh, 'GRANT USAGE ON SCHEMA workspace TO r2_p2_rogue')
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_015_EXTERNAL_PRINCIPAL_ACL_REFUSED/)
  await harness.query(harness.fresh, 'REVOKE USAGE ON SCHEMA workspace FROM r2_p2_rogue')
  await harness.query(harness.fresh, 'GRANT SELECT ON TABLE iam.account TO r2_p2_rogue')
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_015_TABLE_PRIVILEGE_REFUSED/)
  await harness.query(harness.fresh, 'REVOKE SELECT ON TABLE iam.account FROM r2_p2_rogue')
  await harness.query(harness.fresh, 'GRANT USAGE ON SCHEMA iam TO r2_p2_rogue')
  await harness.query(harness.fresh, 'GRANT EXECUTE ON FUNCTION iam.admit_brain_read(uuid, uuid) TO r2_p2_rogue')
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_015_EXECUTE_PRIVILEGE_REFUSED/)
  await harness.query(harness.fresh, 'REVOKE EXECUTE ON FUNCTION iam.admit_brain_read(uuid, uuid) FROM r2_p2_rogue')
  await harness.query(harness.fresh, 'REVOKE USAGE ON SCHEMA iam FROM r2_p2_rogue')
  await harness.query(harness.fresh, 'DROP ROLE r2_p2_rogue')
  await harness.query(harness.fresh, 'GRANT workspace_owner TO brain_owner')
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_015_ROLE_MEMBERSHIP_REFUSED/)
  await harness.query(harness.fresh, 'REVOKE workspace_owner FROM brain_owner')
  await harness.query(harness.fresh, 'ALTER TABLE brn.health DROP CONSTRAINT health_pkey')
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_011_CATALOG_REFUSED/)
  await harness.query(harness.fresh, 'ALTER TABLE brn.health ADD CONSTRAINT health_pkey PRIMARY KEY (health_snapshot_digest)')
  await harness.query(harness.fresh, 'ALTER FUNCTION reg.get_workspace_brain(uuid, uuid[]) VOLATILE')
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_011_CATALOG_REFUSED/)
  await harness.query(harness.fresh, 'ALTER FUNCTION reg.get_workspace_brain(uuid, uuid[]) STABLE')
  await harness.query(harness.fresh, "CREATE FUNCTION reg.rogue() RETURNS boolean LANGUAGE sql AS 'SELECT true'")
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_014_RUNTIME_FUNCTION_ACL_REFUSED/)
  await harness.query(harness.fresh, 'REVOKE EXECUTE ON FUNCTION reg.rogue() FROM PUBLIC')
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_015_CUMULATIVE_FUNCTION_CENSUS_REFUSED/)
  await harness.query(harness.fresh, 'DROP FUNCTION reg.rogue()')
  await harness.query(harness.fresh, 'GRANT EXECUTE ON FUNCTION reg.get_workspace_brain(uuid, uuid[]) TO hub_s2_read')
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_015_RUNTIME_ACL_CENSUS_REFUSED/)
  await harness.query(harness.fresh, 'REVOKE EXECUTE ON FUNCTION reg.get_workspace_brain(uuid, uuid[]) FROM hub_s2_read')
  await harness.query(harness.fresh, 'GRANT EXECUTE ON FUNCTION reg.get_workspace_brain(uuid, uuid[]) TO brain_owner')
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_015_RUNTIME_ACL_CENSUS_REFUSED/)
  await harness.query(harness.fresh, 'REVOKE EXECUTE ON FUNCTION reg.get_workspace_brain(uuid, uuid[]) FROM brain_owner')
  await harness.query(harness.fresh, `CREATE OR REPLACE FUNCTION reg.get_workspace_brain(p_workspace_id uuid, p_admitted_workspace_ids uuid[])
    RETURNS TABLE(workspace_id uuid, published_brain_revision_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
    AS 'SELECT NULL::uuid, NULL::uuid WHERE false'`)
  await assert.rejects(runR2HubMigrations({ connectionString: harness.url }), /MIGRATION_011_FUNCTION_SOURCE_REFUSED/)

  const partial = await databaseHarness(t, 'conexus_r2_p2_partial')
  await runHubMigrations({ connectionString: partial.url })
  await partial.query(partial.fresh, 'ALTER TABLE iam.workspace_membership ADD COLUMN can_read_brain boolean NOT NULL DEFAULT false')
  await assert.rejects(runR2HubMigrations({ connectionString: partial.url }), /MIGRATION_002_CATALOG_REFUSED/)
})

test('R2-P2 real Git and PostgreSQL bootstrap reaches all four production Brain routes', {
  skip: databaseConfigured && gitLive ? false : 'real PostgreSQL and exact admitted Git image not enabled',
}, async (t) => {
  const harness = await databaseHarness(t, 'conexus_r2_p2_live')
  await runHubMigrations({ connectionString: harness.url })
  const identities = await seedWorkspaceBeforeR2(harness)
  await runR2HubMigrations({ connectionString: harness.url })
  await harness.query(harness.fresh, "ALTER ROLE hub_r2_brain_bootstrap PASSWORD 'r2-p2-live-bootstrap'")
  await harness.query(harness.fresh, "ALTER ROLE hub_r2_brain_read PASSWORD 'r2-p2-live-read'")
  const bootstrapUrl = new URL(harness.url)
  bootstrapUrl.username = 'hub_r2_brain_bootstrap'
  bootstrapUrl.password = 'r2-p2-live-bootstrap'
  const readUrl = new URL(harness.url)
  readUrl.username = 'hub_r2_brain_read'
  readUrl.password = 'r2-p2-live-read'

  const fixture = mkdtempSync(resolve(tmpdir(), 'conexus-r2-p2-live-'))
  t.after(() => rmSync(fixture, { recursive: true, force: true }))
  const brainRoot = resolve(fixture, 'brain')
  const projectRoot = resolve(fixture, 'projects')
  const sourceFile = resolve(fixture, 'source.json')
  const healthFile = resolve(fixture, 'health.json')
  const admissionFile = resolve(fixture, 'admission.json')
  mkdirSync(brainRoot, { mode: 0o700 })
  mkdirSync(projectRoot, { mode: 0o700 })
  writeFileSync(resolve(projectRoot, 'sentinel'), 'project-owned\n', { mode: 0o600 })
  writeFileSync(sourceFile, `${JSON.stringify(source, null, 2)}\n`, { mode: 0o600 })
  writeFileSync(healthFile, `${JSON.stringify(health)}\n`, { mode: 0o600 })
  writeFileSync(admissionFile, `${JSON.stringify(admission)}\n`, { mode: 0o600 })
  const artifactId = randomUUID()
  const brainRevisionId = randomUUID()
  const input = {
    sourceFile,
    healthFile,
    admissionFile,
    brainStorageRoot: brainRoot,
    projectStorageRoot: projectRoot,
    workspaceId: identities.workspaceId,
    artifactId,
    brainRevisionId,
    connectionString: bootstrapUrl.toString(),
  }
  const databaseUrlFile = resolve(fixture, 'bootstrap-database-url')
  writeFileSync(databaseUrlFile, `${bootstrapUrl.toString()}\n`, { mode: 0o400 })
  const inheritedEnvironment = Object.fromEntries(['PATH', 'HOME', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG']
    .flatMap((name) => process.env[name] ? [[name, process.env[name]]] : []))
  const entrypointEnvironment = {
      ...inheritedEnvironment,
      CONEXUS_R2_BRAIN_SOURCE_FILE: sourceFile,
      CONEXUS_R2_BRAIN_HEALTH_FILE: healthFile,
      CONEXUS_R2_BRAIN_ADMISSION_FILE: admissionFile,
      CONEXUS_R2_BRAIN_STORAGE_ROOT: brainRoot,
      CONEXUS_PROJECT_STORAGE_ROOT: projectRoot,
      CONEXUS_R2_BRAIN_WORKSPACE_ID: identities.workspaceId,
      CONEXUS_R2_BRAIN_ARTIFACT_ID: artifactId,
      CONEXUS_R2_BRAIN_REVISION_ID: brainRevisionId,
      CONEXUS_R2_BRAIN_BOOTSTRAP_DATABASE_URL_FILE: databaseUrlFile,
  }
  const runEntrypoint = () => new Promise((resolveEntrypoint, rejectEntrypoint) => {
    const child = spawn(process.execPath, [resolve(repositoryRoot, 'scripts/bootstrap-r2-brain.mjs')], {
      env: entrypointEnvironment,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (bytes) => { stdout += bytes })
    child.stderr.on('data', (bytes) => { stderr += bytes })
    const timeout = setTimeout(() => child.kill('SIGKILL'), 180_000)
    child.once('error', rejectEntrypoint)
    child.once('close', (code, signal) => {
      clearTimeout(timeout)
      if (code !== 0 || signal !== null) rejectEntrypoint(new Error(`BRAIN_ENTRYPOINT_FAILED:${code}:${signal}:${stdout}:${stderr}`))
      else {
        try { resolveEntrypoint(JSON.parse(stdout)) } catch { rejectEntrypoint(new Error(`BRAIN_ENTRYPOINT_OUTPUT_REFUSED:${stdout}:${stderr}`)) }
      }
    })
  })
  const [first, second] = await Promise.all([runEntrypoint(), runEntrypoint()])
  assert.deepEqual(second, first)
  assert.equal(first.verdict, 'PASS')
  assert.equal(first.brainDigest, sourceDigest)
  assert.equal(readFileSync(resolve(projectRoot, 'sentinel'), 'utf8'), 'project-owned\n')
  const repository = resolve(brainRoot, 'workspaces', identities.workspaceId, 'repository.git')
  const pendingRepository = resolve(brainRoot, 'workspaces', identities.workspaceId, 'repository.git.pending')
  renameSync(repository, pendingRepository)
  const recovered = await bootstrapR2Brain(input)
  assert.deepEqual(recovered, first)
  assert.equal(existsSync(pendingRepository), false)
  const rogueRef = resolve(repository, 'refs/heads/rogue')
  writeFileSync(rogueRef, `${first.sourceRevision}\n`, { mode: 0o600 })
  await assert.rejects(bootstrapR2Brain(input), /BRAIN_GIT_CONFLICT/)
  rmSync(rogueRef)
  const alternates = resolve(repository, 'objects/info/alternates')
  mkdirSync(resolve(repository, 'objects/info'), { recursive: true, mode: 0o700 })
  writeFileSync(alternates, '/tmp/forbidden-object-store\n', { mode: 0o600 })
  await assert.rejects(bootstrapR2Brain(input), /BRAIN_GIT_RESULT_REFUSED/)
  rmSync(alternates)
  assert.equal(statSync(repository).mode & 0o777, 0o700)
  assert.equal(readFileSync(resolve(repository, 'HEAD'), 'utf8'), 'ref: refs/heads/main\n')
  assert.equal(readFileSync(resolve(repository, 'refs/heads/main'), 'utf8'), `${first.sourceRevision}\n`)
  const commit = readLooseObject(repository, first.sourceRevision, 'commit')
  assert.equal(commit.toString('utf8'), `tree ${first.tree}\nauthor Conexus OS <brain@conexus.invalid> 946684800 +0000\ncommitter Conexus OS <brain@conexus.invalid> 946684800 +0000\n\nConexus OS canonical Workspace Brain\n`)
  const rootTree = readLooseObject(repository, first.tree, 'tree')
  const rootPrefix = Buffer.from('40000 .conexus\0')
  assert.equal(rootTree.subarray(0, rootPrefix.length).equals(rootPrefix), true)
  assert.equal(rootTree.length, rootPrefix.length + 20)
  const brainTreeId = rootTree.subarray(rootPrefix.length).toString('hex')
  const brainTree = readLooseObject(repository, brainTreeId, 'tree')
  const brainPrefix = Buffer.from('100644 brain.json\0')
  assert.equal(brainTree.subarray(0, brainPrefix.length).equals(brainPrefix), true)
  assert.equal(brainTree.length, brainPrefix.length + 20)
  const blobId = brainTree.subarray(brainPrefix.length).toString('hex')
  assert.equal(readLooseObject(repository, blobId, 'blob').equals(canonicalSourceBytes), true)
  const hardlinkAlias = resolve(fixture, 'project-visible-blob-alias')
  linkSync(resolve(repository, 'objects', blobId.slice(0, 2), blobId.slice(2)), hardlinkAlias)
  await assert.rejects(bootstrapR2Brain(input), /BRAIN_GIT_LOCAL_CUSTODY_REFUSED/)
  rmSync(hardlinkAlias)
  const objectIds = readdirSync(resolve(repository, 'objects'), { withFileTypes: true })
    .filter((entry) => /^[0-9a-f]{2}$/.test(entry.name) && entry.isDirectory())
    .flatMap((entry) => readdirSync(resolve(repository, 'objects', entry.name))
      .map((name) => `${entry.name}${name}`)).sort()
  assert.deepEqual(objectIds, [blobId, brainTreeId, first.sourceRevision, first.tree].sort())
  assert.equal((await harness.query(harness.fresh,
    'SELECT count(*)::integer AS count FROM reg.artifact_revision WHERE artifact_id = $1', [artifactId])).rows[0].count, 1)
  assert.equal((await harness.query(harness.fresh,
    'SELECT count(*)::integer AS count FROM brn.health WHERE brain_revision_id = $1', [brainRevisionId])).rows[0].count, 1)
  assert.deepEqual((await harness.query(harness.fresh, `
    SELECT artifact.workspace_id, artifact.published_revision_id, revision.artifact_revision_id,
      revision.source_revision, revision.digest, revision.payload, revision.availability
    FROM reg.artifact AS artifact JOIN reg.artifact_revision AS revision
      ON revision.artifact_id = artifact.artifact_id
    WHERE artifact.artifact_id = $1
  `, [artifactId])).rows[0], {
    workspace_id: identities.workspaceId,
    published_revision_id: brainRevisionId,
    artifact_revision_id: brainRevisionId,
    source_revision: first.sourceRevision,
    digest: first.brainDigest,
    payload: source,
    availability: 'AVAILABLE',
  })
  assert.deepEqual((await harness.query(harness.fresh, `
    SELECT health_snapshot_digest, brain_revision_id, brain_digest, items
    FROM brn.health WHERE brain_revision_id = $1
  `, [brainRevisionId])).rows[0], {
    health_snapshot_digest: first.healthSnapshotDigest,
    brain_revision_id: brainRevisionId,
    brain_digest: first.brainDigest,
    items: health.items,
  })

  const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-p2-live-build-'))
  t.after(() => rmSync(buildRoot, { recursive: true, force: true }))
  const compiled = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
    '--noEmit', 'false', '--outDir', buildRoot,
  ], { encoding: 'utf8' })
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
  const built = (path) => pathToFileURL(resolve(buildRoot, path)).href
  const { createBrainModule } = await import(built('brain/module.js'))
  const { createHttpApp } = await import(built('http/app.js'))
  const { createRegistryStore } = await import(built('registry/module.js'))
  const pool = new pg.Pool({ connectionString: readUrl.toString(), max: 2 })
  const brain = createBrainModule({
    pool,
    registry: createRegistryStore(),
    resolveCurrentSession: async (request) => {
      const accountId = request.headers['x-proof-account-id']
      return typeof accountId === 'string' ? { account: { accountId } } : null
    },
  })
  const app = await createHttpApp({ staticRoot: null, registerRoutes: (server) => brain.registerBrainRoutes(server) })
  try {
    const headers = { 'x-proof-account-id': identities.creatorId }
    const urls = [
      `/api/control/workspaces/${identities.workspaceId}/brain`,
      `/api/control/workspaces/${identities.workspaceId}/brain/revisions`,
      `/api/control/workspaces/${identities.workspaceId}/brain/revisions/${brainRevisionId}`,
      `/api/control/workspaces/${identities.workspaceId}/brain/health`,
    ]
    const responses = []
    for (const url of urls) {
      const response = await app.inject({ method: 'GET', url, headers })
      assert.equal(response.statusCode, 200)
      responses.push(response.json())
    }
    assert.deepEqual(responses, [
      { workspaceId: identities.workspaceId, publishedBrainRevisionId: brainRevisionId },
      [{
        brainRevisionId,
        brainDigest: first.brainDigest,
        sourceRevision: first.sourceRevision,
        availability: 'AVAILABLE',
        reviewText: source.reviewText,
      }],
      {
        brainRevisionId,
        brainDigest: first.brainDigest,
        sourceRevision: first.sourceRevision,
        availability: 'AVAILABLE',
        reviewText: source.reviewText,
        knowledgeBrowse: source.knowledgeBrowse,
      },
      {
        brainRevisionId,
        brainDigest: first.brainDigest,
        healthSnapshotDigest: first.healthSnapshotDigest,
        items: health.items,
      },
    ])
    for (const body of responses) {
      assert.equal(JSON.stringify(body).includes('"payload"'), false)
      assert.equal(JSON.stringify(body).includes('"schemaVersion"'), false)
    }
    assert.equal((await app.inject({
      method: 'GET', url: urls[0], headers: { 'x-proof-account-id': identities.memberId },
    })).statusCode, 403)
    await assert.rejects(bootstrapR2Brain({ ...input, projectStorageRoot: '/' }), /BRAIN_PROJECT_STORAGE_NOT_INDEPENDENT/)
  } finally {
    await app.close()
    await brain.close()
  }
})
