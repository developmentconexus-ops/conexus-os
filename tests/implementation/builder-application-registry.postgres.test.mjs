import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import test from 'node:test'
import pg from 'pg'
import { loadHubMigrationFiles, runHubMigrations } from '../../scripts/run-hub-migrations.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

const required = (name) => process.env[name] || (() => { throw new Error(`MISSING_TEST_CONFIG_${name}`) })()
const admin = { host: required('CONEXUS_TEST_DB_HOST'), port: Number(required('CONEXUS_TEST_DB_PORT')), database: required('CONEXUS_TEST_DB_NAME'), user: required('CONEXUS_TEST_DB_USER'), password: required('CONEXUS_TEST_DB_PASSWORD') }
const connect = async (config) => { const client = new pg.Client(config); await client.connect(); return client }

test('C-020 Registry retains execution artifacts and serves authorized source reads', async (t) => {
  await refuseProtectedCluster()
  const database = `registry_c020_${randomUUID().replaceAll('-', '')}`
  const owner = await connect(admin)
  let setup
  let runtime
  await owner.query(`CREATE DATABASE "${database}"`)
  t.after(async () => { await runtime?.end(); await setup?.end(); await owner.query(`DROP DATABASE "${database}" WITH (FORCE)`); await owner.end() })
  const config = { ...admin, database }
  const url = new URL('postgresql://localhost'); url.hostname = config.host; url.port = String(config.port); url.pathname = `/${database}`; url.username = config.user; url.password = config.password
  const migrated = await runHubMigrations({ connectionString: url.toString() })
  assert.deepEqual(migrated.versions, loadHubMigrationFiles().map(({ version }) => version))
  const { createApplicationArtifactStore } = await import(hubModuleUrl('registry/application-artifact-store.js'))
  setup = await connect(config)
  const accountId = randomUUID(); const workspaceId = randomUUID(); const projectId = randomUUID(); const builderRunId = randomUUID()
  const sourceRevision = 'b'.repeat(40); const digest = 'd'.repeat(64)
  await setup.query("INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://registry.c020', $2, 'C020')", [accountId, accountId])
  await setup.query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, 'C020 Registry'])
  await setup.query("INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [accountId, workspaceId])
  await setup.query("INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, 'C020 app', 'NEW', $3, 'revision')", [projectId, workspaceId, sourceRevision])
  await setup.query('INSERT INTO builder.project_working_state(project_id) VALUES ($1)', [projectId])
  await setup.query(`INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, trigger_message_id, idempotency_digest, request_digest, base_source_revision, state, candidate_revision, result_source_revision, result_kind)
    VALUES ($1, $2, $3, $7, $4, $5, $5, $6, 'RUNNING', $6, $6, NULL)`, [builderRunId, projectId, accountId, builderRunId, digest, sourceRevision, `conversa-${projectId}`])
  await setup.query("ALTER ROLE hub_builder_executor PASSWORD 'registry-c020-test'")
  runtime = await connect({ ...config, user: 'hub_builder_executor', password: 'registry-c020-test' })
  const store = createApplicationArtifactStore()
  assert.equal((await setup.query('SELECT builder.admit_verified_application_source($1,$2,$3,$4) AS admitted', [accountId, projectId, builderRunId, sourceRevision])).rows[0].admitted, true)
  await setup.query("UPDATE builder.builder_run SET state = 'SUCCEEDED' WHERE builder_run_id = $1", [builderRunId])
  assert.equal((await setup.query('SELECT builder.admit_verified_application_source($1,$2,$3,$4) AS admitted', [accountId, projectId, builderRunId, sourceRevision])).rows[0].admitted, false)
  await setup.query("UPDATE builder.builder_run SET state = 'RUNNING' WHERE builder_run_id = $1", [builderRunId])
  assert.equal((await setup.query('SELECT builder.admit_verified_application_source($1,$2,$3,$4) AS admitted', [accountId, projectId, builderRunId, 'c'.repeat(40)])).rows[0].admitted, false)
  const bytes = Buffer.from('<!doctype html><title>C020</title>')
  const application = { projectId, executionId: builderRunId, sourceRevision, templateRef: '537fnzf4c16x9d7oz21k:3331a697-459d-44d8-bcdd-abade6ba1e81', recipeSha256: 'ce2a48f54c08ccdd7641fac8208560963cf43ecdc16bd459a3f333786d1ed4b5', files: [{ path: 'index.html', mediaType: 'text/html; charset=utf-8', bytes, sha256: createHash('sha256').update(bytes).digest('hex') }] }
  const retained = await store.retainApplication(runtime, { accountId, compiled: application })
  assert.equal(retained.projectId, projectId)
  assert.equal((await store.getApplicationBySource(runtime, { accountId, projectId, sourceRevision })).artifactRevisionId, retained.artifactRevisionId)
  const file = await store.readApplicationFileBySource(runtime, { accountId, projectId, sourceRevision, artifactRevisionId: retained.artifactRevisionId, path: 'index.html' })
  assert.equal(Buffer.from(file.bytes).toString(), bytes.toString())
  const oldPin = { templateRef: '537fnzf4c16x9d7oz21k:0f44de30-d856-40d1-b6b3-54a8bbf2f440', recipeSha256: 'df2e896284661a4402158d6e694493332df57de4b56f4c565e5b6ed19bfabde4' }
  const payloadWith = (pin) => JSON.stringify({ format: 'application-payload-v1', projectId, sourceRevision, entryPath: 'index.html', files: [], ...pin })
  for (const pin of [{ profile: 'REACT_VITE_V1', ...oldPin }, { profile: 'REACT_VITE_V2', ...oldPin }, { profile: 'REACT_VITE_V1', templateRef: retained.templateRef, recipeSha256: retained.recipeSha256 }]) {
    await assert.rejects(
      runtime.query('SELECT * FROM reg.retain_application_execution($1, $2, $3, $4, $5::jsonb)', [accountId, projectId, builderRunId, sourceRevision, payloadWith(pin)]),
      /APPLICATION_PAYLOAD_PIN_REFUSED/,
    )
  }
  assert.equal(retained.profile, 'REACT_VITE_V2')
  const catalog = (await setup.query(`SELECT to_regprocedure('reg.retain_application(uuid,uuid,uuid,text,jsonb)')::text AS legacy_retain,
    to_regprocedure('reg.get_application(uuid,uuid,uuid,text)')::text AS legacy_get,
    to_regprocedure('reg.read_application_file(uuid,uuid,uuid,text,uuid,text)')::text AS legacy_read,
    to_regprocedure('project.lock_application_baseline(uuid)')::text AS legacy_lock`)).rows[0]
  assert.deepEqual(catalog, { legacy_retain: null, legacy_get: null, legacy_read: null, legacy_lock: null })
})

test('C-020 source-scoped settlement composes with the executor artifact lifecycle', async (t) => {
  await refuseProtectedCluster()
  const database = `registry_settlement_${randomUUID().replaceAll('-', '')}`
  const owner = await connect(admin)
  let setup
  let runtime
  await owner.query(`CREATE DATABASE "${database}"`)
  t.after(async () => { await runtime?.end(); await setup?.end(); await owner.query(`DROP DATABASE "${database}" WITH (FORCE)`); await owner.end() })
  const config = { ...admin, database }
  const url = new URL('postgresql://localhost'); url.hostname = config.host; url.port = String(config.port); url.pathname = `/${database}`; url.username = config.user; url.password = config.password
  const migrated = await runHubMigrations({ connectionString: url.toString() })
  assert.deepEqual(migrated.versions, loadHubMigrationFiles().map(({ version }) => version))
  const { createApplicationArtifactStore } = await import(hubModuleUrl('registry/application-artifact-store.js'))
  const { createServedApplicationReader } = await import(hubModuleUrl('registry/served-application.js'))
  setup = await connect(config)
  assert.deepEqual((await setup.query(`SELECT
    has_schema_privilege('builder_owner', 'reg', 'USAGE') AS builder_reg_usage,
    has_function_privilege('builder_owner', 'reg.matches_application_artifact(uuid,text,uuid,text)', 'EXECUTE') AS builder_artifact_match,
    has_function_privilege('builder_owner', 'reg.get_application_by_source(uuid,uuid,text)', 'EXECUTE') AS builder_source_get,
    has_function_privilege('builder_owner', 'reg.retain_application_execution(uuid,uuid,uuid,text,jsonb)', 'EXECUTE') AS builder_execution_retain,
    has_function_privilege('builder_owner', 'reg.read_application_file_by_source(uuid,uuid,text,uuid,text)', 'EXECUTE') AS builder_source_read,
    has_function_privilege('hub_builder_executor', 'reg.retain_application_execution(uuid,uuid,uuid,text,jsonb)', 'EXECUTE') AS executor_execution_retain,
    has_function_privilege('hub_builder_executor', 'reg.get_application_by_source(uuid,uuid,text)', 'EXECUTE') AS executor_source_get,
    has_function_privilege('hub_builder_executor', 'reg.read_application_file_by_source(uuid,uuid,text,uuid,text)', 'EXECUTE') AS executor_source_read,
    has_function_privilege('hub_builder_executor', 'reg.retain_application_thumbnail(uuid,uuid,uuid,text,uuid,text,bytea)', 'EXECUTE') AS executor_thumbnail_retain,
    has_function_privilege('hub_builder_executor', 'reg.get_application_thumbnail(uuid,uuid)', 'EXECUTE') AS executor_thumbnail_get,
    has_function_privilege('public', 'reg.get_application_by_source(uuid,uuid,text)', 'EXECUTE') AS public_source_get,
    has_function_privilege('public', 'reg.read_application_file_by_source(uuid,uuid,text,uuid,text)', 'EXECUTE') AS public_source_read,
    has_function_privilege('public', 'reg.retain_application_execution(uuid,uuid,uuid,text,jsonb)', 'EXECUTE') AS public_execution_retain,
    has_function_privilege('public', 'reg.retain_application_thumbnail(uuid,uuid,uuid,text,uuid,text,bytea)', 'EXECUTE') AS public_thumbnail_retain,
    has_function_privilege('public', 'reg.get_application_thumbnail(uuid,uuid)', 'EXECUTE') AS public_thumbnail_get,
    has_table_privilege('builder_owner', 'reg.artifact', 'SELECT') AS builder_artifact_select,
    has_table_privilege('builder_owner', 'reg.artifact_revision', 'SELECT') AS builder_revision_select,
    pg_has_role('builder_owner', 'registry_owner', 'member') AS builder_registry_member,
    to_regprocedure('reg.get_application_execution(uuid,uuid,uuid,text)')::text AS execution_get,
    to_regprocedure('reg.read_application_file_execution(uuid,uuid,uuid,text,uuid,text)')::text AS execution_read`)).rows, [{
    builder_reg_usage: true, builder_artifact_match: true, builder_source_get: false, builder_execution_retain: false, builder_source_read: false,
    executor_execution_retain: true, executor_source_get: true, executor_source_read: true, executor_thumbnail_retain: true, executor_thumbnail_get: true,
    public_source_get: false, public_source_read: false, public_execution_retain: false, public_thumbnail_retain: false, public_thumbnail_get: false,
    builder_artifact_select: false, builder_revision_select: false, builder_registry_member: false,
    execution_get: null, execution_read: null,
  }])
  const accountId = randomUUID(); const workspaceId = randomUUID(); const projectId = randomUUID(); const builderRunId = randomUUID()
  const sourceA = 'a'.repeat(40); const sourceB = 'b'.repeat(40)
  const digest = 'e'.repeat(64)
  await setup.query("INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://registry.settlement', $2, 'Settlement')", [accountId, accountId])
  await setup.query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, 'Settlement Registry'])
  await setup.query("INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [accountId, workspaceId])
  await setup.query("INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, 'Settlement app', 'NEW', $3, 'revision')", [projectId, workspaceId, sourceA])
  await setup.query('INSERT INTO builder.project_working_state(project_id) VALUES ($1)', [projectId])
  await setup.query(`INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, trigger_message_id, idempotency_digest, request_digest, base_source_revision, state, candidate_revision)
    VALUES ($1, $2, $3, $7, $4, $5, $5, $6, 'RUNNING', $8)`, [builderRunId, projectId, accountId, builderRunId, digest, sourceA, `conversa-${projectId}`, sourceB])
  await setup.query("ALTER ROLE hub_builder_executor PASSWORD 'registry-settlement-test'")
  runtime = await connect({ ...config, user: 'hub_builder_executor', password: 'registry-settlement-test' })
  const store = createApplicationArtifactStore()
  assert.equal((await runtime.query('SELECT builder.advance_builder_run_source($1,$2) AS advanced', [builderRunId, sourceB])).rows[0].advanced, true)
  const bytes = Buffer.from('<!doctype html><title>Settlement</title>')
  const application = { projectId, executionId: builderRunId, sourceRevision: sourceB, templateRef: '537fnzf4c16x9d7oz21k:3331a697-459d-44d8-bcdd-abade6ba1e81', recipeSha256: 'ce2a48f54c08ccdd7641fac8208560963cf43ecdc16bd459a3f333786d1ed4b5', files: [{ path: 'index.html', mediaType: 'text/html; charset=utf-8', bytes, sha256: createHash('sha256').update(bytes).digest('hex') }] }
  const retained = await store.retainApplication(runtime, { accountId, compiled: application })
  const thumbnailBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
  const retainedThumbnail = await store.retainApplicationThumbnail(runtime, {
    accountId, projectId, executionId: builderRunId, sourceRevision: sourceB,
    artifactRevisionId: retained.artifactRevisionId, mediaType: 'image/png', bytes: thumbnailBytes,
  })
  assert.deepEqual(retainedThumbnail, {
    projectId, artifactRevisionId: retained.artifactRevisionId, mediaType: 'image/png',
    byteLength: thumbnailBytes.length, sha256: createHash('sha256').update(thumbnailBytes).digest('hex'),
  })
  // Settlement records work the run already performed, so it does not ask for authority. A
  // refusal here would leave a run that ran and cannot say so.
  await setup.query('DELETE FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2', [accountId, workspaceId])
  assert.equal((await runtime.query('SELECT builder.settle_builder_run_build($1,$2,$3,$4,$5) AS settled', [builderRunId, sourceB, retained.artifactRevisionId, retained.artifactDigest, null])).rows[0].settled, true)
  assert.deepEqual((await setup.query(`SELECT state, result_kind, result_source_revision FROM builder.builder_run WHERE builder_run_id = $1`, [builderRunId])).rows, [
    { state: 'SUCCEEDED', result_kind: 'SOURCE_CHANGED', result_source_revision: sourceB },
  ])
  assert.deepEqual((await setup.query(`SELECT current_state, last_preview_source_revision, last_preview_artifact_revision_id, last_preview_artifact_digest FROM builder.project_working_state WHERE project_id = $1`, [projectId])).rows, [
    { current_state: 'PREVIEW_READY', last_preview_source_revision: sourceB, last_preview_artifact_revision_id: retained.artifactRevisionId, last_preview_artifact_digest: retained.artifactDigest },
  ])
  // While the membership is gone the artifact reads disclose nothing, and restoring it reopens
  // them, because both derive from that one row.
  assert.equal(await store.getApplicationBySource(runtime, { accountId, projectId, sourceRevision: sourceB }), null)
  assert.equal(await store.getApplicationThumbnail(runtime, { accountId, projectId }), null)
  await setup.query("INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [accountId, workspaceId])
  assert.deepEqual((await store.getApplicationBySource(runtime, { accountId, projectId, sourceRevision: sourceB })).artifactRevisionId, retained.artifactRevisionId)
  const file = await store.readApplicationFileBySource(runtime, { accountId, projectId, sourceRevision: sourceB, artifactRevisionId: retained.artifactRevisionId, path: 'index.html' })
  assert.equal(Buffer.from(file.bytes).toString(), bytes.toString())
  await setup.query("INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, 'settlement-app', $2)", [projectId, accountId])
  const thumbnail = await store.getApplicationThumbnail(runtime, { accountId, projectId })
  assert.equal(thumbnail?.artifactRevisionId, retained.artifactRevisionId)
  assert.equal(thumbnail?.mediaType, 'image/png')
  assert.equal(Buffer.from(thumbnail.bytes).toString('hex'), thumbnailBytes.toString('hex'))
  assert.equal(await store.getApplicationThumbnail(runtime, { accountId: randomUUID(), projectId }), null)

  const served = await createServedApplicationReader(runtime).readThumbnail({ accountId, projectId })
  assert.equal(served?.artifactRevisionId, retained.artifactRevisionId)
  assert.equal(served?.sha256, createHash('sha256').update(thumbnailBytes).digest('hex'))
  assert.equal(await createServedApplicationReader(runtime).readThumbnail({ accountId: randomUUID(), projectId }), null)
})

test('a BUILT result that carries a thumbnail settles through the real registry: the build is stored and the thumbnail is retained', async (t) => {
  await refuseProtectedCluster()
  const database = `registry_thumbnail_${randomUUID().replaceAll('-', '')}`
  const owner = await connect(admin)
  let setup
  let runtime
  await owner.query(`CREATE DATABASE "${database}"`)
  t.after(async () => { await runtime?.end(); await setup?.end(); await owner.query(`DROP DATABASE "${database}" WITH (FORCE)`); await owner.end() })
  const config = { ...admin, database }
  const url = new URL('postgresql://localhost'); url.hostname = config.host; url.port = String(config.port); url.pathname = `/${database}`; url.username = config.user; url.password = config.password
  await runHubMigrations({ connectionString: url.toString() })
  const { createApplicationArtifactStore } = await import(hubModuleUrl('registry/application-artifact-store.js'))
  const { createBuilderService } = await import(hubModuleUrl('builder/service.js'))
  setup = await connect(config)
  const accountId = randomUUID(); const workspaceId = randomUUID(); const projectId = randomUUID(); const builderRunId = randomUUID()
  const sourceA = 'a'.repeat(40); const sourceB = 'b'.repeat(40); const digest = 'f'.repeat(64)
  await setup.query("INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://registry.thumbnail', $2, 'Thumbnail')", [accountId, accountId])
  await setup.query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, 'Thumbnail Registry'])
  await setup.query("INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [accountId, workspaceId])
  await setup.query("INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, 'Thumbnail app', 'NEW', $3, 'revision')", [projectId, workspaceId, sourceA])
  await setup.query('INSERT INTO builder.project_working_state(project_id) VALUES ($1)', [projectId])
  await setup.query(`INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, trigger_message_id, idempotency_digest, request_digest, base_source_revision, state, candidate_revision)
    VALUES ($1, $2, $3, $7, $4, $5, $5, $6, 'RUNNING', $8)`, [builderRunId, projectId, accountId, builderRunId, digest, sourceA, `conversa-${projectId}`, sourceB])
  await setup.query("INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, 'thumbnail-app', $2)", [projectId, accountId])
  await setup.query("ALTER ROLE hub_builder_executor PASSWORD 'registry-thumbnail-test'")
  runtime = await connect({ ...config, user: 'hub_builder_executor', password: 'registry-thumbnail-test' })
  assert.equal((await runtime.query('SELECT builder.advance_builder_run_source($1,$2) AS advanced', [builderRunId, sourceB])).rows[0].advanced, true)

  const store = createApplicationArtifactStore()
  const bytes = Buffer.from('<!doctype html><title>Thumbnail</title>')
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
  const compiledApplication = { projectId, executionId: builderRunId, sourceRevision: sourceB, templateRef: '537fnzf4c16x9d7oz21k:3331a697-459d-44d8-bcdd-abade6ba1e81', recipeSha256: 'ce2a48f54c08ccdd7641fac8208560963cf43ecdc16bd459a3f333786d1ed4b5', files: [{ path: 'index.html', mediaType: 'text/html; charset=utf-8', bytes, sha256: createHash('sha256').update(bytes).digest('hex') }] }
  const settled = []
  const run = { builderRunId, projectId, state: 'QUEUED', baseSourceRevision: sourceA, resultSourceRevision: null, resultKind: null, failureCode: null }
  const service = createBuilderService({
    store: {
      createBuilderRun: async () => run,
      claimBuilderRun: async () => ({ ...run, state: 'RUNNING' }),
      setBuilderRunPhase: async () => {},
      bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {}, readConversationSandbox: async () => null, recordConversationSandbox: async () => {},
      failBuilderRun: async (_id, code) => settled.push(['fail', code]), close: async () => {},
      advanceBuilderRunSource: async () => {},
      settleBuilderRunBuild: async (input) => {
        settled.push(['build-settle', input.failureCode ?? null, Boolean(input.artifactRevisionId)])
        assert.equal((await runtime.query('SELECT builder.settle_builder_run_build($1,$2,$3,$4,$5) AS settled', [input.builderRunId, input.sourceRevision, input.artifactRevisionId ?? null, input.artifactDigest ?? null, input.failureCode ?? null])).rows[0].settled, true)
      },
    },
    runs: {
      runtime: {
        execute: async () => ({
          projectId, executionId: builderRunId, sandboxId: 'sandbox', baseSourceRevision: sourceA, summary: 'alterado', kind: 'SOURCE_ADMITTED', resultSourceRevision: sourceB,
          applicationBuild: { kind: 'BUILT', compiledApplication, thumbnail: { mediaType: 'image/png', bytes: png } },
        }),
        discardParked: async () => {},
      },
      publishRun: async () => {},
      conversations: { ownerOf: async () => 'PROJECT' },
      git: { readMain: async () => sourceA, mainContains: async () => false },
      appendDiagnostic: async (note) => settled.push(['note', note.code]),
      source: { listSourceTree: async () => { throw new Error('not reached') }, readSourceFile: async () => { throw new Error('not reached') } },
    },
    applicationArtifacts: {
      retainApplication: (input) => store.retainApplication(runtime, input),
      retainApplicationThumbnail: (input) => store.retainApplicationThumbnail(runtime, input),
    },
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'key', content: 'altere', conversationId: 'conv-build' })
  await service.close()

  assert.deepEqual(settled, [['build-settle', null, true]])
  const stored = await store.getApplicationBySource(runtime, { accountId, projectId, sourceRevision: sourceB })
  assert.equal(stored.projectId, projectId)
  const thumbnail = await store.getApplicationThumbnail(runtime, { accountId, projectId })
  assert.equal(thumbnail.artifactRevisionId, stored.artifactRevisionId)
  assert.equal(Buffer.from(thumbnail.bytes).toString('hex'), png.toString('hex'))
})
