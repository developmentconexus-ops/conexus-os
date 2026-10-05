import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import pg from 'pg'
import { hubModuleUrl } from './hub-build.mjs'
import { buildHubDatabase, purgeAsSystem, query } from './hub-database.mjs'
import { ID, setupProjects } from './project-fixture.mjs'

const { createConexusGit } = await import(hubModuleUrl('builder/conexus-git.js'))
const { createProjectStore } = await import(hubModuleUrl('project/store.js'))

const STARTER = 'a'.repeat(40)
const CANDIDATE = 'b'.repeat(40)
const OTHER = 'c'.repeat(40)

// SET ROLE from the superuser test connection exercises each role's grants without writing a
// password, which is cluster-global and would reach any other database on the cluster.
const callAs = async (connectionString, role, sql, parameters = []) => {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    await client.query(`SET ROLE ${role}`)
    return (await client.query(sql, parameters)).rows
  } finally {
    await client.end()
  }
}
const refusalAs = async (connectionString, role, sql, parameters = []) => {
  try {
    await callAs(connectionString, role, sql, parameters)
    return null
  } catch (error) {
    return error.message
  }
}
const one = async (connectionString, role, sql, parameters) => Object.values((await callAs(connectionString, role, sql, parameters))[0])[0]

const CREATE_RUN = 'SELECT builder.create_builder_run($1,$2,$3,$4,$5,$6,$7,$8,$9) AS run'
const runArguments = (accountId, projectId, key, runId, base = STARTER) =>
  [accountId, projectId, `conversation-${projectId}`, key.repeat(64), 'f'.repeat(64), 'pedido', null, runId, base]

test('every function 0032 reshaped runs against a Project whose source is its Conexus Git repository', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_git_functions')
  const owner = randomUUID()
  const outsider = randomUUID()
  const workspaceId = randomUUID()
  const projectId = randomUUID()
  const unregistered = randomUUID()

  for (const [accountId, name] of [[owner, 'Owner'], [outsider, 'Outsider']]) {
    await query(connectionString, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://git.test', $3, $2)", [accountId, name, accountId])
  }
  await query(connectionString, "INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'Git')", [workspaceId])
  await query(connectionString, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [owner, workspaceId])
  await query(connectionString, 'SELECT iam.bootstrap_installation_administrator($1)', [owner])

  await t.test('register_project_repository registers a Project on its starter revision with its repository and working state', async () => {
    await query(connectionString, "INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, 'Git app', 'NEW', $3, 'revision-1')", [projectId, workspaceId, STARTER])
    await query(connectionString, 'SELECT builder.register_project_repository($1)', [projectId])
    assert.deepEqual((await query(connectionString, 'SELECT source_mode, source_revision FROM project.project WHERE project_id = $1', [projectId])).rows, [{ source_mode: 'NEW', source_revision: STARTER }])
    assert.deepEqual((await query(connectionString, 'SELECT count(*)::integer AS count FROM builder.project_repository WHERE project_id = $1', [projectId])).rows, [{ count: 1 }])
    assert.deepEqual((await query(connectionString, "SELECT current_state FROM builder.project_working_state WHERE project_id = $1", [projectId])).rows, [{ current_state: 'IDLE' }])
  })

  await t.test('register_project_repository converges and no old Hub role may call it', async () => {
    await query(connectionString, 'SELECT builder.register_project_repository($1)', [projectId])
    assert.deepEqual((await query(connectionString, 'SELECT count(*)::integer AS count FROM builder.project_repository WHERE project_id = $1', [projectId])).rows, [{ count: 1 }])
    for (const role of ['hub_builder_ingress', 'hub_builder_executor']) {
      assert.match(await refusalAs(connectionString, role, 'SELECT builder.register_project_repository($1)', [projectId]), /permission denied/, role)
    }
    await query(connectionString, "INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, 'Unregistered', 'NEW', $3, 'u')", [unregistered, workspaceId, STARTER])
  })

  await t.test('record_conversation_session keeps one row per conversation, in its own Project, for the executor only', async () => {
    const conversationId = randomUUID()
    const record = (parameters) => callAs(connectionString, 'hub_builder_executor', 'SELECT builder.record_conversation_session($1,$2,$3,$4,$5)', parameters)
    const row = async () => (await query(connectionString, 'SELECT project_id, mirror_head, synced_main, last_turn_ended_at IS NOT NULL AS ended FROM builder.conversation_session WHERE conversation_id = $1', [conversationId])).rows
    await record([projectId, conversationId, CANDIDATE, STARTER, false])
    assert.deepEqual(await row(), [{ project_id: projectId, mirror_head: CANDIDATE, synced_main: STARTER, ended: false }])
    await record([projectId, conversationId, OTHER, null, true])
    await record([projectId, conversationId, OTHER, null, true])
    assert.deepEqual(await row(), [{ project_id: projectId, mirror_head: OTHER, synced_main: STARTER, ended: true }])
    assert.match(await refusalAs(connectionString, 'hub_builder_executor', 'SELECT builder.record_conversation_session($1,$2,$3,$4,$5)', [unregistered, conversationId, OTHER, null, true]), /BUILDER_CONVERSATION_SESSION_REFUSED/)
    assert.match(await refusalAs(connectionString, 'hub_builder_executor', 'SELECT builder.record_conversation_session($1,$2,$3,$4,$5)', [projectId, conversationId, 'main', null, true]), /BUILDER_CONVERSATION_SESSION_REFUSED/)
    assert.match(await refusalAs(connectionString, 'hub_builder_ingress', 'SELECT builder.record_conversation_session($1,$2,$3,$4,$5)', [projectId, conversationId, OTHER, null, true]), /permission denied/)
    assert.deepEqual(await row(), [{ project_id: projectId, mirror_head: OTHER, synced_main: STARTER, ended: true }])
  })

  await t.test('record_conversation_sandbox keeps the VM a conversation resumes, read back only in its own Project, for the executor only', async () => {
    const conversationId = randomUUID()
    const recordSandbox = (parameters) => callAs(connectionString, 'hub_builder_executor', 'SELECT builder.record_conversation_sandbox($1,$2,$3)', parameters)
    const read = async (project) => one(connectionString, 'hub_builder_executor', 'SELECT builder.read_conversation_sandbox($1,$2)', [project, conversationId])
    assert.equal(await read(projectId), null)
    await recordSandbox([projectId, conversationId, 'ivm1first'])
    await recordSandbox([projectId, conversationId, 'ivm2second'])
    assert.equal(await read(projectId), 'ivm2second')
    await callAs(connectionString, 'hub_builder_executor', 'SELECT builder.record_conversation_session($1,$2,$3,$4,$5)', [projectId, conversationId, CANDIDATE, null, true])
    assert.deepEqual((await query(connectionString, 'SELECT provider_sandbox_id, mirror_head FROM builder.conversation_session WHERE conversation_id = $1', [conversationId])).rows, [{ provider_sandbox_id: 'ivm2second', mirror_head: CANDIDATE }])
    assert.equal(await read(unregistered), null)
    assert.match(await refusalAs(connectionString, 'hub_builder_executor', 'SELECT builder.record_conversation_sandbox($1,$2,$3)', [unregistered, conversationId, 'ivm3']), /BUILDER_CONVERSATION_SESSION_REFUSED/)
    assert.match(await refusalAs(connectionString, 'hub_builder_executor', 'SELECT builder.record_conversation_sandbox($1,$2,$3)', [projectId, conversationId, 'not an id']), /BUILDER_CONVERSATION_SESSION_REFUSED/)
    assert.match(await refusalAs(connectionString, 'hub_builder_ingress', 'SELECT builder.read_conversation_sandbox($1,$2)', [projectId, conversationId]), /permission denied/)
    assert.equal(await read(projectId), 'ivm2second')
  })

  await t.test('read_project_sandboxes names every VM the Project recorded and no other Project\'s, for the executor only', async () => {
    const readAll = async (project) => one(connectionString, 'hub_builder_executor', 'SELECT builder.read_project_sandboxes($1)', [project])
    const before = await readAll(projectId)
    const another = randomUUID()
    await callAs(connectionString, 'hub_builder_executor', 'SELECT builder.record_conversation_sandbox($1,$2,$3)', [projectId, another, 'ivm4another'])
    assert.deepEqual(await readAll(projectId), [...before, 'ivm4another'].sort())
    assert.ok(before.includes('ivm2second'))
    assert.deepEqual(await readAll(unregistered), [])
    assert.match(await refusalAs(connectionString, 'hub_builder_ingress', 'SELECT builder.read_project_sandboxes($1)', [projectId]), /permission denied/)
  })

  await t.test('lock_project_for_run admits a builder of a registered Project and refuses the rest', async () => {
    assert.equal(await one(connectionString, 'hub_builder_ingress', 'SELECT builder.lock_project_for_run($1,$2)', [owner, projectId]), true)
    assert.match(await refusalAs(connectionString, 'hub_builder_ingress', 'SELECT builder.lock_project_for_run($1,$2)', [owner, unregistered]), /BUILDER_SUBJECT_NOT_FOUND/)
    assert.match(await refusalAs(connectionString, 'hub_builder_ingress', 'SELECT builder.lock_project_for_run($1,$2)', [outsider, projectId]), /NOT_ADMITTED/)
  })

  const runId = randomUUID()
  await t.test('create_builder_run records the base the Hub read, replays by key and keeps one active run per Project', async () => {
    assert.match(await refusalAs(connectionString, 'hub_builder_ingress', CREATE_RUN, runArguments(owner, unregistered, '3', randomUUID())), /BUILDER_SUBJECT_NOT_FOUND/)
    assert.match(await refusalAs(connectionString, 'hub_builder_ingress', CREATE_RUN, runArguments(owner, projectId, '3', randomUUID(), null)), /BUILDER_RUN_INPUT_REFUSED/)
    const created = await one(connectionString, 'hub_builder_ingress', CREATE_RUN, runArguments(owner, projectId, '3', runId))
    assert.deepEqual({ builderRunId: created.builderRunId, state: created.state, baseSourceRevision: created.baseSourceRevision }, { builderRunId: runId, state: 'QUEUED', baseSourceRevision: STARTER })
    assert.equal((await one(connectionString, 'hub_builder_ingress', CREATE_RUN, runArguments(owner, projectId, '3', randomUUID()))).builderRunId, runId)
    assert.match(await refusalAs(connectionString, 'hub_builder_ingress', CREATE_RUN, runArguments(owner, projectId, '4', randomUUID())), /PROJECT_BUSY/)
  })

  await t.test('a run records one candidate, advances only to it, and settles its build', async () => {
    assert.equal((await one(connectionString, 'hub_builder_executor', 'SELECT builder.claim_builder_run($1, gen_random_uuid())', [runId])).state, 'RUNNING')
    assert.equal(await one(connectionString, 'hub_builder_executor', 'SELECT builder.advance_builder_run_source($1,$2)', [runId, CANDIDATE]), false)
    assert.equal(await one(connectionString, 'hub_builder_executor', 'SELECT builder.record_builder_run_candidate($1,$2)', [runId, 'main']), false)
    assert.equal(await one(connectionString, 'hub_builder_executor', 'SELECT builder.record_builder_run_candidate($1,$2)', [runId, CANDIDATE]), true)
    assert.equal(await one(connectionString, 'hub_builder_executor', 'SELECT builder.record_builder_run_candidate($1,$2)', [runId, CANDIDATE]), true)
    assert.equal(await one(connectionString, 'hub_builder_executor', 'SELECT builder.record_builder_run_candidate($1,$2)', [runId, OTHER]), false)
    assert.equal(await one(connectionString, 'hub_builder_executor', 'SELECT builder.settle_builder_run($1,$2,$3,$4)', [runId, null, 'RESPONSE_ONLY', null]), false)
    assert.equal(await one(connectionString, 'hub_builder_executor', 'SELECT builder.advance_builder_run_source($1,$2)', [runId, OTHER]), false)
    assert.equal(await one(connectionString, 'hub_builder_executor', 'SELECT builder.advance_builder_run_source($1,$2)', [runId, CANDIDATE]), true)
    assert.equal(await one(connectionString, 'hub_builder_executor', 'SELECT builder.advance_builder_run_source($1,$2)', [runId, CANDIDATE]), true)
    // The registry's own functions ask this; no login role calls it.
    const verified = async (revision) => (await query(connectionString, 'SELECT builder.admit_verified_application_source($1,$2,$3,$4) AS admitted', [owner, projectId, runId, revision])).rows[0].admitted
    assert.equal(await verified(CANDIDATE), true)
    assert.equal(await verified(STARTER), false)
    assert.equal(await one(connectionString, 'hub_builder_executor', 'SELECT builder.settle_builder_run_build($1,$2,$3,$4,$5)', [runId, STARTER, null, null, 'COMPILE_FAILED']), false)
    assert.equal(await one(connectionString, 'hub_builder_executor', 'SELECT builder.settle_builder_run_build($1,$2,$3,$4,$5)', [runId, CANDIDATE, null, null, 'COMPILE_FAILED']), true)
    assert.deepEqual((await query(connectionString, 'SELECT state, result_kind, candidate_revision, result_source_revision FROM builder.builder_run WHERE builder_run_id = $1', [runId])).rows, [
      { state: 'FAILED', result_kind: 'SOURCE_CHANGED_BUILD_FAILED', candidate_revision: CANDIDATE, result_source_revision: CANDIDATE },
    ])
  })

  await t.test('the source view admits main as the Hub read it, the last Preview and the latest changing run', async () => {
    const admit = (revision, main, accountId = owner) => one(connectionString, 'hub_builder_ingress', 'SELECT builder.admit_source_revision($1,$2,$3,$4)', [accountId, projectId, revision, main])
    assert.equal(await admit(OTHER, OTHER), true)
    assert.equal(await admit(OTHER, CANDIDATE), false)
    assert.equal(await admit(CANDIDATE, OTHER), true)
    assert.equal(await admit(STARTER, OTHER), true)
    assert.equal(await admit(CANDIDATE, CANDIDATE, outsider), false)
    assert.deepEqual(await one(connectionString, 'hub_builder_ingress', 'SELECT builder.read_preview_subject($1,$2)', [owner, projectId]), {
      lastPreviewSourceRevision: null, lastPreviewArtifactRevisionId: null, lastPreviewArtifactDigest: null,
    })
    assert.equal(await one(connectionString, 'hub_builder_ingress', 'SELECT builder.read_preview_subject($1,$2)', [outsider, projectId]), null)
  })

  await t.test('a stale run is taken over once with what its settling needs, and a fresh heartbeat or a listing keeps it from the lease', async () => {
    const gone = '0e000000-0000-4000-8000-000000000001'
    const sweeper = '0e000000-0000-4000-8000-000000000002'
    const withCandidate = randomUUID()
    await one(connectionString, 'hub_builder_ingress', CREATE_RUN, runArguments(owner, projectId, '6', withCandidate, CANDIDATE))
    await one(connectionString, 'hub_builder_executor', 'SELECT builder.claim_builder_run($1,$2)', [withCandidate, gone])
    await one(connectionString, 'hub_builder_executor', 'SELECT builder.record_builder_run_candidate($1,$2)', [withCandidate, OTHER])
    const takeOver = (staleAfterMs, live = []) => one(connectionString, 'hub_builder_executor', 'SELECT builder.renew_run_lease($1,$2,$3)', [sweeper, live, staleAfterMs])
    assert.deepEqual(await takeOver(60_000), [], 'a heartbeat younger than the limit keeps the run')
    assert.deepEqual(await takeOver(0), [{
      builderRunId: withCandidate, projectId, conversationId: `conversation-${projectId}`, candidateRevision: OTHER, resultSourceRevision: null, previousOwnerId: gone,
    }])
    assert.deepEqual(await takeOver(60_000), [], 'the takeover is a fresh heartbeat of its own')
    assert.deepEqual(await takeOver(0, [withCandidate]), [], 'a run the caller lists is never taken, however stale')
    await query(connectionString, "UPDATE builder.builder_run SET state = 'FAILED', failure_code = 'TEST' WHERE builder_run_id = $1", [withCandidate])
  })

  await t.test('read_open_run_conversations names the conversations with a queued or running run, for the executor only', async () => {
    const openRun = randomUUID()
    const read = () => one(connectionString, 'hub_builder_executor', 'SELECT builder.read_open_run_conversations()')
    assert.deepEqual(await read(), [])
    await one(connectionString, 'hub_builder_ingress', CREATE_RUN, runArguments(owner, projectId, '7', openRun, CANDIDATE))
    assert.deepEqual(await read(), [`conversation-${projectId}`], 'a queued run')
    await one(connectionString, 'hub_builder_executor', 'SELECT builder.claim_builder_run($1, gen_random_uuid())', [openRun])
    assert.deepEqual(await read(), [`conversation-${projectId}`], 'a running run')
    assert.match(await refusalAs(connectionString, 'hub_builder_ingress', 'SELECT builder.read_open_run_conversations()'), /permission denied/)
    await query(connectionString, "UPDATE builder.builder_run SET state = 'FAILED', failure_code = 'TEST' WHERE builder_run_id = $1", [openRun])
    assert.deepEqual(await read(), [], 'a settled run')
  })

  await t.test('builder.purge_project removes the repository record with the runs and the working state', async () => {
    await purgeAsSystem(connectionString, 'builder', projectId)
    const left = async (table) => (await query(connectionString, `SELECT count(*)::integer AS count FROM ${table} WHERE project_id = $1`, [projectId])).rows[0].count
    assert.deepEqual({ repository: await left('builder.project_repository'), working: await left('builder.project_working_state'), runs: await left('builder.builder_run') },
      { repository: 0, working: 0, runs: 0 })
  })

  await t.test('no Builder or Project column or function names the Factory binding or a GitHub repository', async () => {
    const columns = (await query(connectionString, `
      SELECT table_schema || '.' || table_name || '.' || column_name AS name FROM information_schema.columns
      WHERE table_schema IN ('builder', 'project') AND (column_name LIKE '%factory%' OR column_name LIKE '%repository_id%' OR column_name LIKE 'working\\_%' OR column_name LIKE '%working_version%')
      ORDER BY 1`)).rows
    assert.deepEqual(columns, [])
    const functions = (await query(connectionString, `
      SELECT n.nspname || '.' || p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('builder', 'project') AND (p.proname LIKE '%factory%' OR p.prosrc ~ 'factory_binding|working_source_revision|working_version|candidate_source_revision')
      ORDER BY 1`)).rows
    assert.deepEqual(functions, [])
  })

  await t.test('each unported function a Hub role could call remains callable by its old role and the Hub runtime', async () => {
    const { rows } = await query(connectionString, `
      SELECT n.nspname || '.' || p.proname AS name, array_agg(r.rolname::text ORDER BY r.rolname) AS roles
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN pg_roles r
      WHERE p.proname IN ('lock_project_for_run', 'create_builder_run', 'admit_source_revision', 'renew_run_lease')
        AND r.rolname LIKE 'hub\\_%' AND has_function_privilege(r.oid, p.oid, 'EXECUTE')
      GROUP BY 1 ORDER BY 1`)
    assert.deepEqual(rows, [
      { name: 'builder.admit_source_revision', roles: ['hub_builder_ingress', 'hub_runtime'] },
      { name: 'builder.create_builder_run', roles: ['hub_builder_ingress', 'hub_runtime'] },
      { name: 'builder.lock_project_for_run', roles: ['hub_builder_ingress', 'hub_runtime'] },
      { name: 'builder.renew_run_lease', roles: ['hub_builder_executor', 'hub_runtime'] },
    ])
  })
})

test('creating a Project makes its Conexus Git repository with the starter on main, and a retry converges', async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'conexus-creation-'))
  const { connection, database, onCleanup } = await setupProjects(t, 'conexus_git_creation')
  onCleanup(() => rmSync(scratch, { recursive: true, force: true }))
  const git = createConexusGit({ root: join(scratch, 'git'), starter: [{ path: 'app/index.html', content: 'starter\n' }] })
  const prepared = []
  const storeWith = (prepare) => createProjectStore({ database, deletion: {}, repository: { prepare: async (projectId) => { prepared.push(projectId); return prepare(projectId) } } })
  const create = (store, idempotencyKey, body = { name: 'Contador', sourceBootstrap: { mode: 'NEW' } }) =>
    store.createProject({ accountId: ID.owner, workspaceId: ID.workspace, idempotencyKey, body })

  const { reply: created } = await create(storeWith(git.ensureRepository), 'first')
  const main = await git.readMain(created.projectId)
  assert.deepEqual((await query(connection, 'SELECT source_revision FROM project.project WHERE project_id = $1', [created.projectId])).rows, [{ source_revision: main }])
  assert.deepEqual((await query(connection, 'SELECT count(*)::integer AS count FROM builder.project_repository WHERE project_id = $1', [created.projectId])).rows, [{ count: 1 }])
  const replayed = await create(storeWith(git.ensureRepository), 'first')
  assert.deepEqual({ projectId: replayed.reply.projectId, replayed: replayed.replayed }, { projectId: created.projectId, replayed: true })
  assert.equal(await git.readMain(created.projectId), main)

  const refused = await create(storeWith(async () => { throw new Error('CONEXUS_GIT_FAILED') }), 'second').catch((error) => error)
  assert.deepEqual({ id: refused.id, reason: refused.details.reason }, { id: 'PROJECT_REPOSITORY_UNAVAILABLE', reason: 'CONEXUS_GIT_FAILED' })
  // The receipt stays reserved, so the same key later reaches the same Project id and its repository.
  const recovered = (await create(storeWith(git.ensureRepository), 'second')).reply
  assert.equal(recovered.projectId, prepared.at(-2))
  assert.equal((await query(connection, 'SELECT source_revision FROM project.project WHERE project_id = $1', [recovered.projectId])).rows[0].source_revision, await git.readMain(recovered.projectId))

  const before = prepared.length
  await assert.rejects(create(storeWith(git.ensureRepository), 'import', { name: 'Imported', sourceBootstrap: { mode: 'EXISTING_GIT', repositoryLocator: 'https://example.test/app.git' } }), { id: 'PROJECT_SOURCE_REFUSED' })
  assert.equal(prepared.length, before)
})

test('hub_factory owns the factory schema and holds nothing anywhere else', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_factory_role')

  await t.test('hub_factory is a login role with the attributes of every other Hub role', async () => {
    const { rows } = await query(connectionString, `
      SELECT rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
      FROM pg_roles WHERE rolname = 'hub_factory'`)
    assert.deepEqual(rows, [{ rolcanlogin: true, rolinherit: false, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false }])
  })

  await t.test('hub_factory has CREATE and USAGE on factory, which it owns', async () => {
    const { rows } = await query(connectionString, `
      SELECT pg_get_userbyid(nspowner) AS owner,
        has_schema_privilege('hub_factory', 'factory', 'CREATE') AS can_create,
        has_schema_privilege('hub_factory', 'factory', 'USAGE') AS can_use
      FROM pg_namespace WHERE nspname = 'factory'`)
    assert.deepEqual(rows, [{ owner: 'hub_factory', can_create: true, can_use: true }])
  })

  await t.test('hub_factory holds no privilege on any other schema, table or Hub function', async () => {
    const userSchemas = "n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg\\_%'"
    const creatable = (await query(connectionString, `SELECT n.nspname FROM pg_namespace n WHERE ${userSchemas} AND has_schema_privilege('hub_factory', n.oid, 'CREATE') ORDER BY 1`)).rows
    assert.deepEqual(creatable, [{ nspname: 'factory' }])
    // public keeps PostgreSQL's default USAGE for PUBLIC and holds nothing, so that is the one
    // schema other than factory any role can name.
    const usable = (await query(connectionString, `SELECT n.nspname FROM pg_namespace n WHERE ${userSchemas} AND has_schema_privilege('hub_factory', n.oid, 'USAGE') ORDER BY 1`)).rows
    assert.deepEqual(usable, [{ nspname: 'factory' }, { nspname: 'public' }])
    const granted = (await query(connectionString, `
      SELECT 'schema ' || n.nspname AS object FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
      WHERE pg_get_userbyid(a.grantee) = 'hub_factory' AND n.nspname <> 'factory'
      UNION ALL
      SELECT 'relation ' || n.nspname || '.' || c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE ${userSchemas} AND n.nspname <> 'factory' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
        AND (has_table_privilege('hub_factory', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          OR (c.relkind = 'S' AND has_sequence_privilege('hub_factory', c.oid, 'USAGE,SELECT,UPDATE')))
      UNION ALL
      SELECT 'function ' || n.nspname || '.' || p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('iam', 'workspace', 'project', 'builder', 'reg', 'model') AND has_function_privilege('hub_factory', p.oid, 'EXECUTE')`)).rows
    assert.deepEqual(granted, [])
  })

  await t.test('no Hub role other than hub_factory holds any privilege on factory', async () => {
    const { rows } = await query(connectionString, `
      SELECT r.rolname FROM pg_roles r
      WHERE r.rolname LIKE 'hub\\_%' AND r.rolname <> 'hub_factory'
        AND (has_schema_privilege(r.oid, 'factory', 'USAGE') OR has_schema_privilege(r.oid, 'factory', 'CREATE'))
      ORDER BY 1`)
    assert.deepEqual(rows, [])
    const acl = (await query(connectionString, "SELECT array_agg(DISTINCT pg_get_userbyid(a.grantee)::text) AS grantees FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a WHERE n.nspname = 'factory'")).rows
    assert.deepEqual(acl, [{ grantees: ['hub_factory'] }])
  })
})
