import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import pg from 'pg'
import { runCurrentHubMigrations } from '../../scripts/run-hub-migrations.mjs'

const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_TEST_CONFIG_${name}`)
  return value
}
const admin = {
  host: required('CONEXUS_TEST_DB_HOST'), port: Number(required('CONEXUS_TEST_DB_PORT')),
  database: required('CONEXUS_TEST_DB_NAME'), user: required('CONEXUS_TEST_DB_USER'),
  password: required('CONEXUS_TEST_DB_PASSWORD'),
}
const connect = async (config) => {
  const client = new pg.Client(config)
  await client.connect()
  return client
}
const sourceRevision = 'b'.repeat(40)
const baseRevision = 'a'.repeat(40)
const baselineDigest = 'd'.repeat(64)
const proofDigest = 'e'.repeat(64)

test('Registry production adapter retains immutable files through reconnect and enforces admission', async (t) => {
  const owner = await connect(admin)
  const database = `registry_adapter_${randomUUID().replaceAll('-', '')}`
  let setup
  let runtime
  await owner.query(`CREATE DATABASE "${database}"`)
  t.after(async () => {
    await runtime?.end()
    await setup?.end()
    await owner.query(`DROP DATABASE "${database}" WITH (FORCE)`)
    await owner.end()
  })
  const config = { ...admin, database }
  const url = new URL('postgresql://localhost')
  url.hostname = config.host
  url.port = String(config.port)
  url.pathname = `/${database}`
  url.username = config.user
  url.password = config.password
  const migrated = await runCurrentHubMigrations({ connectionString: url.toString() })
  assert.ok(migrated.versions.includes('026'), 'current loader must install Registry application storage')
  assert.ok(!migrated.versions.includes('024') && !migrated.versions.includes('025'))
  const root = resolve(import.meta.dirname, '../..')
  const buildRoot = mkdtempSync(resolve(root, 'apps/hub/registry-postgres-build-'))
  t.after(() => rmSync(buildRoot, { recursive: true, force: true }))
  const compiled = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'),
    '--project', resolve(root, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', buildRoot],
  { cwd: root, encoding: 'utf8' })
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr)
  const { createApplicationArtifactStore } = await import(pathToFileURL(resolve(buildRoot, 'registry/application-artifact-store.js')).href)
  const store = createApplicationArtifactStore()
  setup = await connect(config)
  const ids = Object.fromEntries(['account', 'workspace', 'project', 'change', 'plan', 'item', 'stranger'].map((name) => [name, randomUUID()]))
  await setup.query("INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://registry.test', 'owner', 'Synthetic owner'), ($2, 'https://registry.test', 'stranger', 'Synthetic stranger')", [ids.account, ids.stranger])
  await setup.query("INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'Synthetic Registry workspace')", [ids.workspace])
  await setup.query('INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project) VALUES ($1, $2, true)', [ids.account, ids.workspace])
  await setup.query("INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, 'Synthetic app', 'NEW', $3, 'registry-test')", [ids.project, ids.workspace, baseRevision])
  await setup.query("INSERT INTO project.baseline_candidate(project_id, candidate_digest, source_revision, source_text, application_runtime_profile) VALUES ($1, $2, $3, 'Synthetic baseline', 'MANAGED')", [ids.project, baselineDigest, baseRevision])
  await setup.query('INSERT INTO project.baseline_state(project_id, current_candidate_digest, approved_candidate_digest, approval_revision) VALUES ($1, $2, $2, $3)', [ids.project, baselineDigest, ids.plan])
  await setup.query('INSERT INTO iam.project_builder_grant(account_id, project_id, can_build, can_read_source, can_review) VALUES ($1, $2, true, true, true)', [ids.account, ids.project])
  await setup.query("INSERT INTO builder.change(change_id, project_id, created_by_account_id, intent, baseline_digest, base_source_revision, planning_depth, rigor_profile, state, candidate_source_revision, patch, result_summary) VALUES ($1, $2, $3, 'Synthetic retention', $4, $5, 'DIRECT', 'CONTROLLED', 'VERIFIED', $6, 'fixture', 'fixture')", [ids.change, ids.project, ids.account, baselineDigest, baseRevision, sourceRevision])
  await setup.query("INSERT INTO builder.contract_revision(contract_revision, change_id, intent_digest, assertion_ref, required_proof_kind) VALUES ($1, $2, $3, 'change-intent:' || $3, 'INDEPENDENT_COGNITIVE')", [ids.plan, ids.change, proofDigest])
  await setup.query("INSERT INTO builder.plan(change_id, plan_revision, item_id, summary, item_state, assertion_ref) VALUES ($1, $2, $3, 'Synthetic retention', 'COMPLETED', 'change-intent:' || $4)", [ids.change, ids.plan, ids.item, proofDigest])
  await setup.query('INSERT INTO builder.change_acceptance(change_id, candidate_source_revision, baseline_digest, plan_revision, contract_revision, evidence_set_digest) VALUES ($1, $2, $3, $4, $4, $5)', [ids.change, sourceRevision, baselineDigest, ids.plan, proofDigest])
  await setup.query("ALTER ROLE hub_rb_executor PASSWORD 'registry-adapter-test-only'")
  const runtimeConfig = { ...config, user: 'hub_rb_executor', password: 'registry-adapter-test-only' }
  runtime = await connect(runtimeConfig)
  const coordinates = { accountId: ids.account, projectId: ids.project, changeId: ids.change, sourceRevision }
  const html = '<!doctype html><title>Stored app</title><script src="/app.js"></script>'
  const js = 'document.body.dataset.loaded = "yes";'
  const files = [['index.html', 'text/html; charset=utf-8', html], ['app.js', 'text/javascript; charset=utf-8', js]].map(([path, mediaType, text]) => {
    const bytes = Buffer.from(text)
    return { path, mediaType, bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
  })
  const application = {
    projectId: ids.project, changeId: ids.change, sourceRevision,
    templateRef: 'xdli9puqp1nepk4ht6lw:8a1e3885-c6d7-4b06-aea6-860632f407e6',
    recipeSha256: '32230b4ba0b72625474b7f722e2294a256f9ab2f7c1c9b1eb107f38770edbe97', files,
  }
  assert.equal(await store.getApplication(runtime, coordinates), null)
  const invalidPayload = {
    format: 'application-payload-v1', profile: 'REACT_VITE_V1',
    projectId: ids.project, sourceRevision, templateRef: application.templateRef,
    recipeSha256: application.recipeSha256, entryPath: 'index.html',
    files: [{ path: 'index.html', mediaType: files[0].mediaType, byteLength: files[0].bytes.length,
      sha256: '0'.repeat(64), base64: files[0].bytes.toString('base64') }],
  }
  await assert.rejects(runtime.query('SELECT * FROM reg.retain_application($1,$2,$3,$4,$5)',
    [ids.account, ids.project, ids.change, sourceRevision, invalidPayload]), /APPLICATION_FILE_ENCODING_REFUSED/)
  await assert.rejects(store.retainApplication(runtime, { accountId: ids.account, compiled: { ...application, files: [{ ...files[0], sha256: '0'.repeat(64) }] } }), /REFUSED/)
  assert.equal((await setup.query("SELECT count(*)::int AS count FROM reg.artifact WHERE kind = 'application'")).rows[0].count, 0)
  const retained = await store.retainApplication(runtime, { accountId: ids.account, compiled: application })
  const rival = await connect(runtimeConfig)
  try {
    const repeats = await Promise.all([runtime, rival].map((client) => store.retainApplication(client, { accountId: ids.account, compiled: application })))
    for (const repeated of repeats) assert.deepEqual(repeated, retained)
  } finally { await rival.end() }
  await runtime.end()
  runtime = await connect(runtimeConfig)
  assert.deepEqual(await store.getApplication(runtime, coordinates), retained)
  for (const [path, expected] of [['index.html', html], ['app.js', js]]) {
    const file = await store.readApplicationFile(runtime, { ...coordinates, artifactRevisionId: retained.artifactRevisionId, path })
    assert.equal(Buffer.from(file.bytes).toString(), expected)
  }
  assert.equal(await store.readApplicationFile(runtime, { ...coordinates, artifactRevisionId: retained.artifactRevisionId, path: 'missing.js' }), null)
  const alteredBytes = Buffer.from('<html>different</html>')
  await assert.rejects(store.retainApplication(runtime, { accountId: ids.account, compiled: { ...application, files: [{ ...files[0], bytes: alteredBytes, sha256: createHash('sha256').update(alteredBytes).digest('hex') }] } }), /APPLICATION_IDENTITY_CONFLICT/)
  await assert.rejects(store.getApplication(runtime, { ...coordinates, accountId: ids.stranger }), /APPLICATION_SUBJECT_REFUSED/)
  await assert.rejects(store.getApplication(runtime, { ...coordinates, sourceRevision: 'c'.repeat(40) }), /APPLICATION_SUBJECT_REFUSED/)
  await assert.rejects(runtime.query('SELECT * FROM reg.artifact_revision'), { code: '42501' })
  await setup.query('REVOKE USAGE ON SCHEMA builder FROM registry_owner')
  await assert.rejects(store.getApplication(runtime, coordinates), { code: '42501' })
  await setup.query('GRANT USAGE ON SCHEMA builder TO registry_owner')
  assert.deepEqual(await store.getApplication(runtime, coordinates), retained)
  await setup.query('UPDATE project.baseline_state SET approved_candidate_digest = NULL, approval_revision = NULL WHERE project_id = $1', [ids.project])
  await assert.rejects(store.getApplication(runtime, coordinates), /APPLICATION_SUBJECT_REFUSED/)
  await setup.query('UPDATE project.baseline_state SET approved_candidate_digest = $2, approval_revision = $3 WHERE project_id = $1', [ids.project, baselineDigest, ids.plan])
  const revoker = await connect(config)
  await runtime.query('BEGIN')
  let revocation
  try {
    assert.deepEqual(await store.getApplication(runtime, coordinates), retained)
    revocation = revoker.query('UPDATE iam.project_builder_grant SET can_build = false WHERE project_id = $1', [ids.project])
    let blocked = false
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const locks = await setup.query('SELECT $1::integer = ANY(pg_blocking_pids($2::integer)) AS blocked', [runtime.processID, revoker.processID])
      if (locks.rows[0].blocked) { blocked = true; break }
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    assert.equal(blocked, true, 'admitted read must hold the grant until its transaction ends')
  } finally {
    await runtime.query('COMMIT')
    if (revocation) await revocation
    await revoker.end()
  }
  await assert.rejects(store.getApplication(runtime, coordinates), /APPLICATION_SUBJECT_REFUSED/)
  assert.equal(await store.readApplicationFile(runtime, { ...coordinates, artifactRevisionId: retained.artifactRevisionId, path: 'index.html' }), null)
  assert.equal((await setup.query('SELECT count(*)::int AS count FROM reg.artifact_revision')).rows[0].count, 1)
  await setup.query("ALTER ROLE hub_r2_brain_bootstrap PASSWORD 'registry-brain-test-only'")
  await setup.query("ALTER ROLE hub_r2_brain_read PASSWORD 'registry-brain-read-test-only'")
  const bootstrap = await connect({ ...config, user: 'hub_r2_brain_bootstrap', password: 'registry-brain-test-only' })
  const brainReader = await connect({ ...config, user: 'hub_r2_brain_read', password: 'registry-brain-read-test-only' })
  try {
    const brainArtifact = randomUUID()
    const brainRevision = randomUUID()
    const brainPayload = { knowledge: 'Synthetic store policy' }
    const bootstrapArgs = [brainArtifact, ids.workspace, brainRevision, 'f'.repeat(40), 'a'.repeat(64), brainPayload]
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await bootstrap.query('SELECT reg.bootstrap_workspace_brain($1,$2,$3,$4,$5,$6)', bootstrapArgs)
    }
    const read = await brainReader.query('SELECT * FROM reg.get_brain_revision($1,$2,$3)', [ids.workspace, brainRevision, [ids.workspace]])
    assert.equal(read.rows[0].brain_revision_id, brainRevision)
    assert.deepEqual(read.rows[0].payload, { knowledge: 'Synthetic store policy' })
    await assert.rejects(bootstrap.query('SELECT reg.bootstrap_workspace_brain($1,$2,$3,$4,$5,$6)', [randomUUID(), ...bootstrapArgs.slice(1)]), /BRAIN_ARTIFACT_IDENTITY_CONFLICT/)
    assert.equal((await brainReader.query('SELECT * FROM reg.get_brain_revision($1,$2,$3)', [ids.workspace, brainRevision, []])).rows.length, 0)
  } finally { await bootstrap.end(); await brainReader.end() }
})
