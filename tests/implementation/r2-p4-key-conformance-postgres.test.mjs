import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import pg from 'pg'

const configured = ['HOST', 'PORT', 'NAME', 'USER', 'PASSWORD']
  .every((key) => process.env[`CONEXUS_TEST_DB_${key}`])

// Fixed controlled-data executor, not an admitted Sankhya adapter or IAM resolver.
const aggregate = `WITH population AS (
  SELECT document_key FROM conformance_fixture.budget_document WHERE company_id = $1
), key_groups AS (
  SELECT document_key, count(*) AS n FROM population
  WHERE document_key IS NOT NULL GROUP BY document_key
)
SELECT (SELECT count(*) FROM population)::text AS total_rows,
  (SELECT count(*) FROM population WHERE document_key IS NULL)::text AS null_key_rows,
  (SELECT count(*) FROM key_groups WHERE n > 1)::text AS duplicate_key_groups,
  pg_current_snapshot()::text AS observation_snapshot`

test('registered conformance controlled PostgreSQL aggregate proves keys, scope, read-only and drift refusal', {
  skip: configured ? false : 'controlled PostgreSQL configuration not supplied',
  timeout: 120_000,
}, async (t) => {
  const root = resolve(import.meta.dirname, '../..')
  const build = mkdtempSync(resolve(root, 'apps/hub/r2-p4-key-pg-build-'))
  t.after(() => rmSync(build, { recursive: true, force: true }))
  const compiled = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'),
    '--project', resolve(root, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', build], { encoding: 'utf8' })
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
  const { createRegisteredKeyConformance } = await import(pathToFileURL(resolve(build, 'gateway/module.js')).href)
  const config = {
    host: process.env.CONEXUS_TEST_DB_HOST, port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME, user: process.env.CONEXUS_TEST_DB_USER,
    password: process.env.CONEXUS_TEST_DB_PASSWORD,
  }
  const suffix = randomUUID().replaceAll('-', '')
  const database = `key_proof_${suffix}`
  const role = `key_reader_${suffix}`
  const admin = new pg.Client(config)
  await admin.connect()
  await admin.query(`CREATE DATABASE "${database}"`)
  const owner = new pg.Client({ ...config, database })
  const reader = new pg.Client({ ...config, database })
  let roleCreated = false
  t.after(async () => {
    await reader.end()
    await owner.end()
    await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`)
    if (roleCreated) await admin.query(`DROP ROLE "${role}"`)
    await admin.end()
  })
  await owner.connect()
  await reader.connect()
  await owner.query(`CREATE SCHEMA conformance_fixture;
    CREATE TABLE conformance_fixture.budget_document(company_id text, document_key text)`)
  await admin.query(`CREATE ROLE "${role}" NOLOGIN`)
  roleCreated = true
  await owner.query(`GRANT USAGE ON SCHEMA conformance_fixture TO "${role}";
    GRANT SELECT ON conformance_fixture.budget_document TO "${role}"`)
  await reader.query(`SET ROLE "${role}"`)
  await assert.rejects(reader.query("INSERT INTO conformance_fixture.budget_document VALUES ('1', 'forbidden')"),
    { code: '42501' })

  const accountId = randomUUID()
  const projectId = randomUUID()
  const sourceScopeId = '9'.repeat(64)
  const current = {
    workspaceId: randomUUID(), projectId, connectionId: randomUUID(),
    connectionRevisionId: randomUUID(), qualificationId: randomUUID(), credentialGeneration: '1',
    environment: 'SANDBOX', sourceScopeId, sourceRevision: 'b'.repeat(40), inputDigest: 'a'.repeat(64),
  }
  const request = { accountId, projectId, queryId: 'fixture.document-keys',
    expectedSourceRevision: current.sourceRevision, expectedInputDigest: current.inputDigest }
  const expectedMapping = { datasetId: 'fixture.documents', grainId: 'fixture.document', mappingDigest: 'c'.repeat(64) }
  let drift = false
  let reads = 0
  const module = createRegisteredKeyConformance({
    resolveSubject: async (input) => input.accountId === accountId && input.registration.projectId === projectId ? current : null,
    registrations: [{ queryId: request.queryId, queryVersion: '1', workspaceId: current.workspaceId,
      projectId, connectionId: current.connectionId, environment: 'SANDBOX', datasetId: 'fixture.documents',
      grainId: 'fixture.document', mappingDigest: 'c'.repeat(64),
      observe: async ({ subject, registrationDigest, subjectDigest }) => {
        assert.equal(subject.sourceScopeId, sourceScopeId)
        reads++
        await reader.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
        try {
          const mode = await reader.query('SHOW transaction_read_only')
          assert.equal(mode.rows[0].transaction_read_only, 'on')
          const { rows: [row] } = await reader.query(aggregate, ['1'])
          await reader.query('COMMIT')
          if (drift) current.credentialGeneration = '2'
          return { registrationDigest, subjectDigest, observationId: `${database}:${row.observation_snapshot}`,
            complete: true, coherence: 'SINGLE_STATEMENT', totalRows: row.total_rows,
            nullKeyRows: row.null_key_rows, duplicateKeyGroups: row.duplicate_key_groups }
        } catch (error) {
          await reader.query('ROLLBACK')
          throw error
        }
      } }],
  })
  const check = async (rows, outcome, counts, empty = false) => {
    await owner.query('TRUNCATE conformance_fixture.budget_document')
    for (const row of rows) await owner.query('INSERT INTO conformance_fixture.budget_document VALUES ($1, $2)', row)
    const result = await module.execute(request, expectedMapping)
    assert.equal(result.status, 'PROVEN')
    assert.equal(result.outcome, outcome)
    assert.equal(result.empty, empty)
    assert.deepEqual(result.counts, counts)
    assert.match(result.proofDigest, /^[a-f0-9]{64}$/)
  }
  await check([['1', 'A'], ['1', 'B'], ['2', 'A'], ['2', 'A']], 'PASS',
    { totalRows: '2', nullKeyRows: '0', duplicateKeyGroups: '0' })
  await check([['1', 'A'], ['1', 'A']], 'ASSERTION_FAILED',
    { totalRows: '2', nullKeyRows: '0', duplicateKeyGroups: '1' })
  await check([['1', null]], 'ASSERTION_FAILED',
    { totalRows: '1', nullKeyRows: '1', duplicateKeyGroups: '0' })
  await check([['2', 'A']], 'PASS', { totalRows: '0', nullKeyRows: '0', duplicateKeyGroups: '0' }, true)
  const before = reads
  assert.deepEqual(await module.execute({ ...request, accountId: randomUUID() }, expectedMapping), { status: 'REFUSED' })
  assert.equal(reads, before)
  drift = true
  assert.deepEqual(await module.execute(request, expectedMapping), { status: 'INDETERMINATE' })
  assert.equal(reads, before + 1)
})
