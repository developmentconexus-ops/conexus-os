import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import pg from 'pg'
import { buildHubDatabase, query } from './hub-database.mjs'

const HEAD = 'b'.repeat(40)
const STARTER = 'a'.repeat(40)

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

const bindingFor = (projectId, suffix) => ({
  projectId,
  factoryProjectId: `factory-project-${suffix}`,
  projectRepositoryId: `project-repository-${suffix}`,
  repositoryId: `repository-${suffix}`,
  repositoryExternalId: 900000 + suffix,
  repositorySlug: `acme-org/app-${suffix}`,
  defaultBranch: 'main',
})

const BIND = 'SELECT builder.bind_factory_project($1,$2,$3,$4,$5,$6,$7,$8) AS bound'
const bindArguments = (binding, head = HEAD) => [
  binding.projectId, binding.factoryProjectId, binding.projectRepositoryId, binding.repositoryId,
  binding.repositoryExternalId, binding.repositorySlug, binding.defaultBranch, head,
]
const bind = (connectionString, binding, head) => callAs(connectionString, 'hub_builder_executor', BIND, bindArguments(binding, head))
const bindRefusal = (connectionString, binding, head) => refusalAs(connectionString, 'hub_builder_executor', BIND, bindArguments(binding, head))

test('a Project binds to its Factory repository once, and only while it has never run', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_factory_binding')
  const owner = randomUUID()
  const outsider = randomUUID()
  const workspaceId = randomUUID()
  const projects = Object.fromEntries(['fresh', 'ran', 'advanced', 'rival', 'agent', 'settled', 'unbound'].map((name) => [name, randomUUID()]))

  for (const [accountId, name] of [[owner, 'Owner'], [outsider, 'Outsider']]) {
    await query(connectionString, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://factory.test', $3, $2)", [accountId, name, accountId])
  }
  await query(connectionString, "INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'Factory')", [workspaceId])
  await query(connectionString, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [owner, workspaceId])
  for (const [name, projectId] of Object.entries(projects)) {
    await query(connectionString, "INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, $3, 'NEW', $4, $3)", [projectId, workspaceId, name, STARTER])
    await query(connectionString, 'INSERT INTO builder.project_working_state(project_id, working_source_revision, working_version) VALUES ($1, $2, $3)', [projectId, STARTER, name === 'advanced' ? 1 : 0])
  }
  let runCount = 0
  const insertRun = async (projectId, state, phase = null) => {
    runCount += 1
    const runId = randomUUID()
    await query(connectionString, `
      INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, idempotency_digest, request_digest, mode, base_source_revision, expected_working_version, base_working_version, state, phase)
      VALUES ($1, $2, $3, $4, $5, $6, 'BUILD', $7, 0, 0, $8, $9)`,
    [runId, projectId, owner, `conversation-${runCount}`, runCount.toString(16).padStart(64, '0'), 'f'.repeat(64), STARTER, state, phase])
    return runId
  }
  const workingState = async (projectId) => (await query(connectionString,
    'SELECT working_source_revision, working_version, updated_at FROM builder.project_working_state WHERE project_id = $1', [projectId])).rows[0]
  const storedBinding = async (projectId) => (await query(connectionString,
    'SELECT * FROM builder.factory_binding WHERE project_id = $1', [projectId])).rows[0]

  const fresh = bindingFor(projects.fresh, 1)

  await t.test('a Project that already has a BuilderRun is refused by name', async () => {
    await insertRun(projects.ran, 'SUCCEEDED')
    assert.match(await bindRefusal(connectionString, bindingFor(projects.ran, 2)), /^FACTORY_BINDING_PROJECT_HAS_RUNS$/)
    assert.equal(await storedBinding(projects.ran), undefined)
  })

  await t.test('a Project whose working version moved past 0 is refused by name', async () => {
    assert.match(await bindRefusal(connectionString, bindingFor(projects.advanced, 3)), /^FACTORY_BINDING_WORKING_VERSION_ADVANCED$/)
    assert.equal(await storedBinding(projects.advanced), undefined)
  })

  await t.test('a successful bind records the binding and moves the working revision to the repository head', async () => {
    assert.deepEqual(await bind(connectionString, fresh), [{ bound: true }])
    const { bound_at: boundAt, ...stored } = await storedBinding(projects.fresh)
    assert.deepEqual(stored, {
      project_id: projects.fresh,
      factory_project_id: 'factory-project-1',
      project_repository_id: 'project-repository-1',
      repository_id: 'repository-1',
      repository_external_id: '900001',
      repository_slug: 'acme-org/app-1',
      default_branch: 'main',
    })
    assert.ok(boundAt instanceof Date)
    const working = await workingState(projects.fresh)
    assert.equal(working.working_source_revision, HEAD)
    assert.equal(working.working_version, '0')
  })

  await t.test('binding again with identical values answers true and changes nothing, even after the Project has run', async () => {
    const bindingBefore = await storedBinding(projects.fresh)
    const workingBefore = await workingState(projects.fresh)
    assert.deepEqual(await bind(connectionString, fresh), [{ bound: true }])
    assert.deepEqual(await storedBinding(projects.fresh), bindingBefore)
    assert.deepEqual(await workingState(projects.fresh), workingBefore)

    await insertRun(projects.fresh, 'SUCCEEDED')
    await query(connectionString, 'UPDATE builder.project_working_state SET working_source_revision = $2 WHERE project_id = $1', [projects.fresh, 'c'.repeat(40)])
    assert.deepEqual(await bind(connectionString, fresh), [{ bound: true }])
    assert.deepEqual(await storedBinding(projects.fresh), bindingBefore)
    assert.equal((await workingState(projects.fresh)).working_source_revision, 'c'.repeat(40))
  })

  await t.test('binding a bound Project to anything different is refused by name', async () => {
    assert.match(await bindRefusal(connectionString, { ...fresh, defaultBranch: 'trunk' }), /^FACTORY_BINDING_CONFLICT$/)
    assert.match(await bindRefusal(connectionString, { ...fresh, repositoryExternalId: 123 }), /^FACTORY_BINDING_CONFLICT$/)
    assert.equal((await storedBinding(projects.fresh)).default_branch, 'main')
  })

  await t.test('a repository already bound to another Project is refused by name', async () => {
    assert.match(await bindRefusal(connectionString, { ...bindingFor(projects.rival, 4), repositoryExternalId: fresh.repositoryExternalId }), /^FACTORY_BINDING_REPOSITORY_BOUND$/)
    assert.match(await bindRefusal(connectionString, { ...bindingFor(projects.rival, 4), projectRepositoryId: fresh.projectRepositoryId }), /^FACTORY_BINDING_REPOSITORY_BOUND$/)
    assert.equal(await storedBinding(projects.rival), undefined)
  })

  const expectedDocument = {
    projectId: projects.fresh,
    factoryProjectId: 'factory-project-1',
    projectRepositoryId: 'project-repository-1',
    repositoryId: 'repository-1',
    repositoryExternalId: 900001,
    repositorySlug: 'acme-org/app-1',
    defaultBranch: 'main',
  }
  const withoutBoundAt = (document) => {
    if (document === null) return null
    const { boundAt, ...rest } = document
    assert.match(boundAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    return rest
  }

  await t.test('read_factory_binding answers an Account admitted to build and refuses one that is not', async () => {
    const READ = 'SELECT builder.read_factory_binding($1,$2) AS binding'
    assert.match(await refusalAs(connectionString, 'hub_builder_ingress', READ, [outsider, projects.fresh]), /^NOT_ADMITTED$/)
    const [{ binding }] = await callAs(connectionString, 'hub_builder_ingress', READ, [owner, projects.fresh])
    assert.deepEqual(withoutBoundAt(binding), expectedDocument)
    assert.deepEqual(await callAs(connectionString, 'hub_builder_ingress', READ, [owner, projects.unbound]), [{ binding: null }])
  })

  await t.test('resolve_factory_project maps a project repository to its Project only for an Account admitted to build it', async () => {
    const RESOLVE = 'SELECT builder.resolve_factory_project($1,$2) AS project_id'
    assert.deepEqual(await callAs(connectionString, 'hub_builder_ingress', RESOLVE, [owner, 'project-repository-1']), [{ project_id: projects.fresh }])
    assert.deepEqual(await callAs(connectionString, 'hub_builder_ingress', RESOLVE, [outsider, 'project-repository-1']), [{ project_id: null }])
    assert.deepEqual(await callAs(connectionString, 'hub_builder_ingress', RESOLVE, [owner, 'project-repository-unknown']), [{ project_id: null }])
  })

  await t.test('list_factory_admission_runs names only RUNNING runs in SOURCE_ADMISSION on bound Projects', async () => {
    const agent = bindingFor(projects.agent, 5)
    const settled = bindingFor(projects.settled, 6)
    assert.deepEqual(await bind(connectionString, agent), [{ bound: true }])
    assert.deepEqual(await bind(connectionString, settled), [{ bound: true }])
    const admitting = await insertRun(projects.fresh, 'RUNNING', 'SOURCE_ADMISSION')
    await insertRun(projects.agent, 'RUNNING', 'AGENT')
    await insertRun(projects.settled, 'FAILED')
    await insertRun(projects.unbound, 'RUNNING', 'SOURCE_ADMISSION')
    const conversationId = (await query(connectionString, 'SELECT conversation_id FROM builder.builder_run WHERE builder_run_id = $1', [admitting])).rows[0].conversation_id

    const [{ runs }] = await callAs(connectionString, 'hub_builder_executor', 'SELECT builder.list_factory_admission_runs() AS runs')
    assert.deepEqual(runs.map(({ binding, ...run }) => ({ ...run, binding: withoutBoundAt(binding) })), [{
      builderRunId: admitting,
      projectId: projects.fresh,
      conversationId,
      baseSourceRevision: STARTER,
      binding: expectedDocument,
    }])
  })

  await t.test('read_factory_binding_for_run answers the binding of a run on a bound Project and null otherwise', async () => {
    const READ = 'SELECT builder.read_factory_binding_for_run($1) AS binding'
    const [admitting] = (await query(connectionString, "SELECT builder_run_id FROM builder.builder_run WHERE project_id = $1 AND state = 'RUNNING'", [projects.fresh])).rows
    const [unboundRun] = (await query(connectionString, 'SELECT builder_run_id FROM builder.builder_run WHERE project_id = $1', [projects.unbound])).rows
    const [{ binding }] = await callAs(connectionString, 'hub_builder_executor', READ, [admitting.builder_run_id])
    assert.deepEqual(withoutBoundAt(binding), expectedDocument)
    assert.deepEqual(await callAs(connectionString, 'hub_builder_executor', READ, [unboundRun.builder_run_id]), [{ binding: null }])
    assert.deepEqual(await callAs(connectionString, 'hub_builder_executor', READ, [randomUUID()]), [{ binding: null }])
  })

  await t.test('each function is executable by exactly the one login role that calls it', async () => {
    const { rows } = await query(connectionString, `
      SELECT p.proname AS name, array_agg(r.rolname::text ORDER BY r.rolname) AS roles
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN pg_roles r
      WHERE n.nspname = 'builder' AND p.proname LIKE '%factory%' AND r.rolname LIKE 'hub\\_%'
        AND has_function_privilege(r.oid, p.oid, 'EXECUTE')
      GROUP BY p.proname ORDER BY p.proname`)
    assert.deepEqual(rows, [
      { name: 'bind_factory_project', roles: ['hub_builder_executor'] },
      { name: 'list_factory_admission_runs', roles: ['hub_builder_executor'] },
      { name: 'read_factory_binding', roles: ['hub_builder_ingress'] },
      { name: 'read_factory_binding_for_run', roles: ['hub_builder_executor'] },
      { name: 'resolve_factory_project', roles: ['hub_builder_ingress'] },
    ])
  })
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
      WHERE n.nspname IN ('iam', 'workspace', 'project', 'builder', 'reg') AND has_function_privilege('hub_factory', p.oid, 'EXECUTE')`)).rows
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
