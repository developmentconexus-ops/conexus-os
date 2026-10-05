import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { buildHubDatabase, query } from './hub-database.mjs'
import { ID, setupProjects } from './project-fixture.mjs'

const { createConexusGit } = await import(hubModuleUrl('builder/conexus-git.js'))
const { createProjectStore } = await import(hubModuleUrl('project/store.js'))
const { builderProjectPorts } = await import(hubModuleUrl('builder/project-ports.js'))

test('no Builder or Project column or function names the Factory binding or a GitHub repository', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_git_functions')
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

test('creating a Project makes its Conexus Git repository with the starter on main, and a retry converges', async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'conexus-creation-'))
  const { connection, database, onCleanup } = await setupProjects(t, 'conexus_git_creation')
  onCleanup(() => rmSync(scratch, { recursive: true, force: true }))
  const git = createConexusGit({ root: join(scratch, 'git'), starter: [{ path: 'app/index.html', content: 'starter\n' }] })
  const prepared = []
  const storeWith = (prepare) => createProjectStore({ database, deletion: {}, builder: builderProjectPorts, repository: { prepare: async (projectId) => { prepared.push(projectId); return prepare(projectId) } } })
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
