import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import pg from 'pg'
import { runCurrentHubMigrations } from '../../scripts/run-hub-migrations.mjs'

const required = (name) => process.env[name] || (() => { throw new Error(`MISSING_TEST_CONFIG_${name}`) })()
const admin = { host: required('CONEXUS_TEST_DB_HOST'), port: Number(required('CONEXUS_TEST_DB_PORT')), database: required('CONEXUS_TEST_DB_NAME'), user: required('CONEXUS_TEST_DB_USER'), password: required('CONEXUS_TEST_DB_PASSWORD') }
const connect = async (config) => { const client = new pg.Client(config); await client.connect(); return client }

test('C-020 Registry retains execution artifacts and serves authorized source reads', async (t) => {
  const database = `registry_c020_${randomUUID().replaceAll('-', '')}`
  const owner = await connect(admin)
  let setup
  let runtime
  await owner.query(`CREATE DATABASE "${database}"`)
  t.after(async () => { await runtime?.end(); await setup?.end(); await owner.query(`DROP DATABASE "${database}" WITH (FORCE)`); await owner.end() })
  const config = { ...admin, database }
  const url = new URL('postgresql://localhost'); url.hostname = config.host; url.port = String(config.port); url.pathname = `/${database}`; url.username = config.user; url.password = config.password
  const migrated = await runCurrentHubMigrations({ connectionString: url.toString() })
  assert.ok(migrated.versions.includes('039'))
  const root = resolve(import.meta.dirname, '../..')
  const buildRoot = mkdtempSync(resolve(root, 'apps/hub/registry-postgres-build-'))
  t.after(() => rmSync(buildRoot, { recursive: true, force: true }))
  const compiled = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '--project', resolve(root, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', buildRoot], { cwd: root, encoding: 'utf8' })
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr)
  const { createApplicationArtifactStore } = await import(pathToFileURL(resolve(buildRoot, 'registry/application-artifact-store.js')).href)
  setup = await connect(config)
  const accountId = randomUUID(); const workspaceId = randomUUID(); const projectId = randomUUID(); const builderRunId = randomUUID()
  const sourceRevision = 'b'.repeat(40); const digest = 'd'.repeat(64)
  await setup.query("INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://registry.c020', $2, 'C020')", [accountId, accountId])
  await setup.query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, 'C020 Registry'])
  await setup.query('INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project) VALUES ($1, $2, true)', [accountId, workspaceId])
  await setup.query("INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, 'C020 app', 'NEW', $3, 'revision')", [projectId, workspaceId, sourceRevision])
  await setup.query('INSERT INTO iam.project_builder_grant(account_id, project_id, can_build, can_read_source) VALUES ($1, $2, true, true)', [accountId, projectId])
  await setup.query(`INSERT INTO builder.project_working_state(project_id, working_source_revision) VALUES ($1, $2)`, [projectId, sourceRevision])
  await setup.query(`INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, trigger_message_id, idempotency_digest, request_digest, mode, base_source_revision, expected_working_version, base_working_version, state, result_source_revision, result_kind)
    VALUES ($1, $2, $3, $4, $5, $5, 'BUILD', $6, 0, 0, 'RUNNING', $6, NULL)`, [builderRunId, projectId, accountId, builderRunId, digest, sourceRevision])
  await setup.query("ALTER ROLE hub_rb_executor PASSWORD 'registry-c020-test'")
  runtime = await connect({ ...config, user: 'hub_rb_executor', password: 'registry-c020-test' })
  const store = createApplicationArtifactStore()
  assert.equal((await setup.query('SELECT builder.admit_verified_application_source($1,$2,$3,$4) AS admitted', [accountId, projectId, builderRunId, sourceRevision])).rows[0].admitted, true)
  await setup.query("UPDATE builder.builder_run SET state = 'SUCCEEDED' WHERE builder_run_id = $1", [builderRunId])
  assert.equal((await setup.query('SELECT builder.admit_verified_application_source($1,$2,$3,$4) AS admitted', [accountId, projectId, builderRunId, sourceRevision])).rows[0].admitted, false)
  await setup.query("UPDATE builder.builder_run SET state = 'RUNNING' WHERE builder_run_id = $1", [builderRunId])
  await setup.query("UPDATE builder.project_working_state SET working_source_revision = $1 WHERE project_id = $2", ['c'.repeat(40), projectId])
  assert.equal((await setup.query('SELECT builder.admit_verified_application_source($1,$2,$3,$4) AS admitted', [accountId, projectId, builderRunId, sourceRevision])).rows[0].admitted, false)
  await setup.query('UPDATE builder.project_working_state SET working_source_revision = $1 WHERE project_id = $2', [sourceRevision, projectId])
  const bytes = Buffer.from('<!doctype html><title>C020</title>')
  const application = { projectId, executionId: builderRunId, sourceRevision, templateRef: 'xdli9puqp1nepk4ht6lw:8a1e3885-c6d7-4b06-aea6-860632f407e6', recipeSha256: '32230b4ba0b72625474b7f722e2294a256f9ab2f7c1c9b1eb107f38770edbe97', files: [{ path: 'index.html', mediaType: 'text/html; charset=utf-8', bytes, sha256: createHash('sha256').update(bytes).digest('hex') }] }
  const retained = await store.retainApplication(runtime, { accountId, compiled: application })
  assert.equal(retained.projectId, projectId)
  assert.equal((await store.getApplicationBySource(runtime, { accountId, projectId, sourceRevision })).artifactRevisionId, retained.artifactRevisionId)
  const file = await store.readApplicationFileBySource(runtime, { accountId, projectId, sourceRevision, artifactRevisionId: retained.artifactRevisionId, path: 'index.html' })
  assert.equal(Buffer.from(file.bytes).toString(), bytes.toString())
  const catalog = (await setup.query(`SELECT to_regprocedure('reg.retain_application(uuid,uuid,uuid,text,jsonb)')::text AS legacy_retain,
    to_regprocedure('reg.get_application(uuid,uuid,uuid,text)')::text AS legacy_get,
    to_regprocedure('reg.read_application_file(uuid,uuid,uuid,text,uuid,text)')::text AS legacy_read,
    to_regprocedure('project.lock_application_baseline(uuid)')::text AS legacy_lock`)).rows[0]
  assert.deepEqual(catalog, { legacy_retain: null, legacy_get: null, legacy_read: null, legacy_lock: null })
})
