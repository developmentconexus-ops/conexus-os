import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { assertRoleInvariants } from '../../scripts/hub-catalog.mjs'
import { loadCurrentHubMigrationFiles, runSelectedHubMigrations } from '../../scripts/run-hub-migrations.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

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
const query = async (connection, sql, parameters = []) => {
  const client = new pg.Client(connection)
  await client.connect()
  try { return await client.query(sql, parameters) } finally { await client.end() }
}
const connectionStringFor = (connection) => {
  const url = new URL('postgresql://localhost')
  url.hostname = connection.host
  url.port = String(connection.port)
  url.pathname = `/${connection.database}`
  url.username = connection.user
  url.password = connection.password
  return url.toString()
}
const freshDatabase = async (t) => {
  await refuseProtectedCluster()
  const database = `conexus_excision_${randomUUID().replaceAll('-', '')}`
  await query(admin, `CREATE DATABASE "${database}"`)
  t.after(() => query(admin, `DROP DATABASE "${database}" WITH (FORCE)`))
  return { ...admin, database }
}
const migrationsUpTo = (version) => loadCurrentHubMigrationFiles().filter((migration) => migration.version <= version)
const migrationsAfter = (version) => loadCurrentHubMigrationFiles().filter((migration) => migration.version > version)

// Every refusal in the new surface is SQLSTATE 42501. Returning the code rather than asserting on
// a message keeps these tests honest about what a caller can actually branch on.
const refusal = async (connection, sql, parameters = []) => {
  try {
    await query(connection, sql, parameters)
    return { code: null, message: null }
  } catch (error) {
    return { code: error.code ?? null, message: error.message ?? null }
  }
}

const seedWorkspace = async (connection, { label }) => {
  const workspaceId = randomUUID()
  await query(connection, 'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1,$2)', [workspaceId, label])
  return workspaceId
}
const seedAccount = async (connection, { label, active = true }) => {
  const accountId = randomUUID()
  await query(connection,
    'INSERT INTO iam.account(account_id, issuer, external_subject, display_name, active) VALUES ($1,$2,$3,$4,$5)',
    [accountId, 'https://excision.test', accountId, label, active])
  return accountId
}
const seedMember = (connection, accountId, workspaceId, role) =>
  query(connection, 'INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1,$2,$3)',
    [accountId, workspaceId, role])
const seedProject = async (connection, workspaceId, label, sourceRevision) => {
  const projectId = randomUUID()
  await query(connection,
    `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
     VALUES ($1,$2,$3,'NEW',$4,$5)`, [projectId, workspaceId, label, sourceRevision, `${label}-revision`])
  await query(connection, 'INSERT INTO builder.project_working_state(project_id, working_source_revision) VALUES ($1,$2)',
    [projectId, sourceRevision])
  return projectId
}
const createRun = (connection, accountId, projectId, runId) =>
  query(connection, 'SELECT builder.create_builder_run($1,$2,$3,$4,$5,$6,$7,$8) AS value',
    [accountId, projectId, randomUUID().replaceAll('-', '').padEnd(64, '0').slice(0, 64),
      randomUUID().replaceAll('-', '').padEnd(64, '0').slice(0, 64), null, 'PLAN', runId, null])

test('a member of the Workspace reads, creates and builds every Project in it', async (t) => {
  const connection = await freshDatabase(t)
  await runSelectedHubMigrations({
    connectionString: connectionStringFor(connection),
    migrations: loadCurrentHubMigrationFiles(),
    catalogSnapshot: null,
  })

  const workspaceId = await seedWorkspace(connection, { label: 'Shared' })
  const owner = await seedAccount(connection, { label: 'Owner' })
  const member = await seedAccount(connection, { label: 'Member' })
  const stranger = await seedAccount(connection, { label: 'Stranger' })
  await seedMember(connection, owner, workspaceId, 'owner')
  await seedMember(connection, member, workspaceId, 'member')
  const sourceRevision = 'a'.repeat(40)
  const projectId = await seedProject(connection, workspaceId, 'Owned', sourceRevision)

  // The member did not create this Project and holds no row naming it, yet reads it, because the
  // Workspace is the boundary.
  assert.deepEqual((await query(connection, 'SELECT project_id FROM project.list_project_summaries($1,$2)', [member, workspaceId])).rows,
    [{ project_id: projectId }])
  assert.deepEqual((await query(connection, 'SELECT project_id FROM project.get_project($1,$2)', [member, projectId])).rows,
    [{ project_id: projectId }])
  assert.deepEqual((await query(connection, 'SELECT project_id FROM project.list_project_summaries($1,$2)', [stranger, workspaceId])).rows, [])
  assert.deepEqual((await query(connection, 'SELECT project_id FROM project.get_project($1,$2)', [stranger, projectId])).rows, [])

  const runId = randomUUID()
  const created = await createRun(connection, member, projectId, runId)
  assert.equal(created.rows[0].value.builderRunId, runId)
  assert.equal(created.rows[0].value.state, 'QUEUED')
  assert.deepEqual((await query(connection, 'SELECT builder.list_builder_runs($1,$2,$3) AS value', [member, projectId, 20]))
    .rows[0].value.map((run) => run.builderRunId), [runId])
  assert.equal((await query(connection, 'SELECT builder.admit_source_revision($1,$2,$3) AS admitted', [member, projectId, sourceRevision]))
    .rows[0].admitted, true)
  assert.equal((await query(connection, 'SELECT builder.read_preview_subject($1,$2) AS value', [member, projectId]))
    .rows[0].value.sourceRevision, sourceRevision)

  // The member may create a Project of their own: project.create is a member right.
  const reserved = await query(connection, 'SELECT state FROM project.reserve_or_replay_create_project($1,$2,$3,$4,$5)',
    [member, workspaceId, 'b'.repeat(64), 'c'.repeat(64), randomUUID()])
  assert.deepEqual(reserved.rows, [{ state: 'RESERVED' }])

  // A non-member reads nothing and every effect refuses with the one error code.
  assert.deepEqual((await query(connection, 'SELECT builder.list_builder_runs($1,$2,$3) AS value', [stranger, projectId, 20])).rows[0].value, [])
  assert.equal((await query(connection, 'SELECT builder.admit_source_revision($1,$2,$3) AS admitted', [stranger, projectId, sourceRevision])).rows[0].admitted, false)
  assert.equal((await query(connection, 'SELECT builder.read_preview_subject($1,$2) AS value', [stranger, projectId])).rows[0].value, null)
  for (const [sql, parameters] of [
    ['SELECT builder.create_builder_run($1,$2,$3,$4,$5,$6,$7,$8)', [stranger, projectId, 'd'.repeat(64), 'e'.repeat(64), null, 'PLAN', randomUUID(), null]],
    ['SELECT builder.request_builder_run_cancellation($1,$2,$3)', [stranger, projectId, runId]],
    ['SELECT * FROM project.reserve_or_replay_create_project($1,$2,$3,$4,$5)', [stranger, workspaceId, 'f'.repeat(64), '0'.repeat(64), randomUUID()]],
  ]) {
    assert.deepEqual(await refusal(connection, sql, parameters), { code: '42501', message: 'NOT_ADMITTED' }, sql)
  }
})

test('removing the member stops the next claim and still records the work already done', async (t) => {
  const connection = await freshDatabase(t)
  await runSelectedHubMigrations({
    connectionString: connectionStringFor(connection),
    migrations: loadCurrentHubMigrationFiles(),
    catalogSnapshot: null,
  })

  const workspaceId = await seedWorkspace(connection, { label: 'Mid-run' })
  const owner = await seedAccount(connection, { label: 'Owner' })
  const member = await seedAccount(connection, { label: 'Member' })
  await seedMember(connection, owner, workspaceId, 'owner')
  await seedMember(connection, member, workspaceId, 'member')
  const running = await seedProject(connection, workspaceId, 'Running', 'a'.repeat(40))
  const queued = await seedProject(connection, workspaceId, 'Queued', 'b'.repeat(40))

  const runningRunId = randomUUID()
  const queuedRunId = randomUUID()
  await createRun(connection, member, running, runningRunId)
  await createRun(connection, member, queued, queuedRunId)
  assert.equal((await query(connection, 'SELECT builder.claim_builder_run($1,$2,$3,$4) AS value',
    [runningRunId, 'admission', 'anthropic', 'a-model'])).rows[0].value.state, 'RUNNING')

  await query(connection, 'SELECT iam.remove_workspace_member($1,$2,$3)', [owner, workspaceId, member])

  // A claim asks for new authority and is refused.
  assert.deepEqual(await refusal(connection, 'SELECT builder.claim_builder_run($1,$2,$3,$4)',
    [queuedRunId, 'admission', 'anthropic', 'a-model']), { code: '42501', message: 'NOT_ADMITTED' })

  // Settlement records what the run already performed, so it does not ask.
  assert.equal((await query(connection, 'SELECT builder.settle_builder_run($1,$2,$3,$4) AS settled',
    [runningRunId, null, 'RESPONSE_ONLY', null])).rows[0].settled, true)
  assert.deepEqual((await query(connection, 'SELECT state, result_kind FROM builder.builder_run WHERE builder_run_id = $1', [runningRunId])).rows,
    [{ state: 'SUCCEEDED', result_kind: 'RESPONSE_ONLY' }])

  // The same DELETE closed the reads.
  assert.deepEqual((await query(connection, 'SELECT project_id FROM project.list_project_summaries($1,$2)', [member, workspaceId])).rows, [])
})

test('an inactive account is refused everywhere, including Preview and source read', async (t) => {
  const connection = await freshDatabase(t)
  await runSelectedHubMigrations({
    connectionString: connectionStringFor(connection),
    migrations: loadCurrentHubMigrationFiles(),
    catalogSnapshot: null,
  })

  const workspaceId = await seedWorkspace(connection, { label: 'Deactivation' })
  const owner = await seedAccount(connection, { label: 'Owner' })
  const dormant = await seedAccount(connection, { label: 'Dormant' })
  await seedMember(connection, owner, workspaceId, 'owner')
  await seedMember(connection, dormant, workspaceId, 'member')
  const sourceRevision = 'c'.repeat(40)
  const projectId = await seedProject(connection, workspaceId, 'Dormant', sourceRevision)

  assert.equal((await query(connection, 'SELECT builder.admit_source_revision($1,$2,$3) AS admitted', [dormant, projectId, sourceRevision])).rows[0].admitted, true)
  await query(connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [dormant])

  // The two holes 052's grounding found were here: Preview and source read never checked active.
  assert.equal((await query(connection, 'SELECT builder.admit_source_revision($1,$2,$3) AS admitted', [dormant, projectId, sourceRevision])).rows[0].admitted, false)
  assert.equal((await query(connection, 'SELECT builder.read_preview_subject($1,$2) AS value', [dormant, projectId])).rows[0].value, null)
  assert.equal((await query(connection, 'SELECT builder.read_builder_run($1,$2) AS value', [dormant, projectId])).rows[0].value, null)
  assert.deepEqual((await query(connection, 'SELECT project_id FROM project.get_project($1,$2)', [dormant, projectId])).rows, [])
  assert.deepEqual(await refusal(connection, 'SELECT builder.create_builder_run($1,$2,$3,$4,$5,$6,$7,$8)',
    [dormant, projectId, '1'.repeat(64), '2'.repeat(64), null, 'PLAN', randomUUID(), null]), { code: '42501', message: 'NOT_ADMITTED' })
})

test('a connection is the owner\'s everywhere and a member\'s only where it is shared', async (t) => {
  const connection = await freshDatabase(t)
  await runSelectedHubMigrations({
    connectionString: connectionStringFor(connection),
    migrations: loadCurrentHubMigrationFiles(),
    catalogSnapshot: null,
  })

  const homeWorkspaceId = await seedWorkspace(connection, { label: 'Home' })
  const sharedWorkspaceId = await seedWorkspace(connection, { label: 'Shared' })
  const owner = await seedAccount(connection, { label: 'Owner' })
  const member = await seedAccount(connection, { label: 'Member' })
  await seedMember(connection, owner, homeWorkspaceId, 'owner')
  await seedMember(connection, owner, sharedWorkspaceId, 'member')
  await seedMember(connection, member, sharedWorkspaceId, 'owner')
  const homeProject = await seedProject(connection, homeWorkspaceId, 'Home', 'a'.repeat(40))
  const sharedProject = await seedProject(connection, sharedWorkspaceId, 'Shared', 'b'.repeat(40))

  const connectionId = randomUUID()
  assert.equal((await query(connection, 'SELECT model_connection.publish_connection($1,$2,$3,$4,$5,$6) AS value',
    [owner, connectionId, 'anthropic', 'OAUTH_TOKEN_SET', 'Owner key', 1])).rows[0].value, true)
  await query(connection, 'SELECT model_connection.select_connection($1,$2)', [owner, connectionId])

  // No row says the owner may use it here, or there. Owner use is implicit in every Workspace
  // they belong to.
  const admits = async (accountId, projectId) =>
    (await query(connection, 'SELECT connection_id FROM model_connection.admit_for_project($1,$2,NULL)', [accountId, projectId])).rows
  assert.deepEqual(await admits(owner, homeProject), [{ connection_id: connectionId }])
  assert.deepEqual(await admits(owner, sharedProject), [{ connection_id: connectionId }])

  // The member has selected it but no share exists yet.
  assert.equal((await query(connection, 'SELECT model_connection.select_connection($1,$2) AS value', [member, connectionId])).rows[0].value, false)
  assert.deepEqual(await admits(member, sharedProject), [])

  assert.equal((await query(connection, 'SELECT model_connection.share_connection($1,$2,$3) AS value',
    [owner, connectionId, sharedWorkspaceId])).rows[0].value, true)
  assert.equal((await query(connection, 'SELECT model_connection.select_connection($1,$2) AS value', [member, connectionId])).rows[0].value, true)
  assert.deepEqual(await admits(member, sharedProject), [{ connection_id: connectionId }])

  // A share into a Workspace the member belongs to says nothing about the owner's own Workspace:
  // there the member has no build right at all, so the gate refuses before any connection is
  // considered.
  assert.deepEqual(
    await refusal(connection, 'SELECT * FROM model_connection.admit_for_project($1,$2,NULL)', [member, homeProject]),
    { code: '42501', message: 'NOT_ADMITTED' })

  assert.equal((await query(connection, 'SELECT model_connection.unshare_connection($1,$2,$3) AS value',
    [owner, connectionId, sharedWorkspaceId])).rows[0].value, true)
  assert.deepEqual(await admits(member, sharedProject), [])

  // Re-share, then remove the sharer. The share row is untouched and the connection still stops
  // resolving, because the sharer's membership is checked at use time and never cascaded.
  await query(connection, 'SELECT model_connection.share_connection($1,$2,$3)', [owner, connectionId, sharedWorkspaceId])
  assert.deepEqual(await admits(member, sharedProject), [{ connection_id: connectionId }])
  await query(connection, 'SELECT iam.remove_workspace_member($1,$2,$3)', [member, sharedWorkspaceId, owner])
  assert.deepEqual(await admits(member, sharedProject), [])
  assert.deepEqual((await query(connection,
    'SELECT count(*)::int AS shares FROM model_connection.workspace_share WHERE connection_id = $1 AND workspace_id = $2',
    [connectionId, sharedWorkspaceId])).rows, [{ shares: 1 }])
})

test('a pilot-shaped ledger at 050 runs 051 to 057 in one invocation', async (t) => {
  const connection = await freshDatabase(t)
  const connectionString = connectionStringFor(connection)
  const staged = await runSelectedHubMigrations({
    connectionString, migrations: migrationsUpTo('050'), catalogSnapshot: null,
  })
  assert.equal(staged.versions.at(-1), '050')

  const workspaceId = await seedWorkspace(connection, { label: 'Pilot' })
  const accountId = await seedAccount(connection, { label: 'Pilot' })
  await query(connection,
    'INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project) VALUES ($1,$2,true)',
    [accountId, workspaceId])

  const projectIds = []
  for (let index = 0; index < 22; index += 1) {
    const projectId = randomUUID()
    projectIds.push(projectId)
    const sourceRevision = index.toString(16).padStart(40, '0')
    await query(connection,
      `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
       VALUES ($1,$2,$3,'NEW',$4,$5)`, [projectId, workspaceId, `Pilot ${index}`, sourceRevision, `pilot-${index}`])
    await query(connection, 'INSERT INTO builder.project_working_state(project_id, working_source_revision) VALUES ($1,$2)',
      [projectId, sourceRevision])
    await query(connection, 'INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage) VALUES ($1,$2,true,true)',
      [accountId, projectId])
    await query(connection, 'INSERT INTO iam.project_builder_grant(account_id, project_id, can_build, can_read_source) VALUES ($1,$2,true,true)',
      [accountId, projectId])
  }

  // 23 runs against 22 Projects, as the pilot count of 2026-09-19 read them.
  for (let index = 0; index < 23; index += 1) {
    const projectId = projectIds[index % projectIds.length]
    await query(connection,
      `INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, trigger_message_id, idempotency_digest,
        request_digest, mode, base_source_revision, expected_working_version, base_working_version, state, result_kind)
       VALUES ($1,$2,$3,$4,$5,$5,'PLAN',$6,0,0,'SUCCEEDED','RESPONSE_ONLY')`,
      [randomUUID(), projectId, accountId, randomUUID(), index.toString(16).padStart(64, '0'),
        (index % projectIds.length).toString(16).padStart(40, '0')])
  }

  const connectionId = randomUUID()
  await query(connection,
    "INSERT INTO claude_connection.connection(connection_id, owner_account_id, label, state, current_generation) VALUES ($1,$2,'Pilot','ACTIVE',1)",
    [connectionId, accountId])
  await query(connection,
    "INSERT INTO claude_connection.binding(connection_id, account_id, workspace_id, role) VALUES ($1,$2,$3,'OWNER')",
    [connectionId, accountId, workspaceId])

  const finished = await runSelectedHubMigrations({
    connectionString, migrations: migrationsAfter('050'), recognizedMigrations: loadCurrentHubMigrationFiles(), catalogSnapshot: null,
  })
  assert.deepEqual(finished.appliedNow, ['051', '052', '053', '054', '055', '056', '057'])

  // The self binding carried nothing the new model stores, so no share was written, and the
  // owner's 22 Projects and 23 runs are still readable through the membership alone.
  assert.deepEqual((await query(connection, 'SELECT count(*)::int AS shares FROM model_connection.workspace_share')).rows, [{ shares: 0 }])
  assert.deepEqual((await query(connection, 'SELECT count(*)::int AS visible FROM project.list_project_summaries($1,$2)', [accountId, workspaceId])).rows,
    [{ visible: 22 }])
  assert.deepEqual((await query(connection, 'SELECT count(*)::int AS runs FROM builder.builder_run')).rows, [{ runs: 23 }])
  assert.deepEqual((await query(connection, 'SELECT role FROM iam.workspace_membership WHERE account_id = $1', [accountId])).rows,
    [{ role: 'owner' }])
  for (const projectId of projectIds) {
    assert.deepEqual((await query(connection, 'SELECT project_id FROM project.get_project($1,$2)', [accountId, projectId])).rows,
      [{ project_id: projectId }])
  }
})

test('no function in the Hub schemas is executable by PUBLIC', async (t) => {
  const connection = await freshDatabase(t)
  await runSelectedHubMigrations({
    connectionString: connectionStringFor(connection),
    migrations: loadCurrentHubMigrationFiles(),
    catalogSnapshot: null,
  })

  // EXECUTE is the second fence: nothing below the Hub route binds the account id these
  // SECURITY DEFINER bodies admit. CREATE FUNCTION grants EXECUTE to PUBLIC by default, so this
  // enumerates the whole surface rather than the functions 053 happened to touch.
  assert.deepEqual((await query(connection, `
    SELECT n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS signature
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS entry
    WHERE n.nspname IN ('iam', 'workspace', 'project', 'builder', 'reg', 'claude_connection', 'model_connection')
      AND entry.grantee = 0 AND entry.privilege_type = 'EXECUTE'
    ORDER BY 1
  `)).rows, [])
})

test('each function 053 creates is reachable only by the login role its predecessor had', async (t) => {
  const connection = await freshDatabase(t)
  await runSelectedHubMigrations({
    connectionString: connectionStringFor(connection),
    migrations: loadCurrentHubMigrationFiles(),
    catalogSnapshot: null,
  })

  const reachableBy = async (signature) => (await query(connection, `
    SELECT r.rolname
    FROM pg_roles AS r
    WHERE r.rolname LIKE 'hub\\_%'
      AND has_function_privilege(r.rolname, $1, 'EXECUTE')
      AND has_schema_privilege(r.rolname, split_part($1, '.', 1), 'USAGE')
    ORDER BY 1
  `, [signature])).rows.map((row) => row.rolname)

  assert.deepEqual(await reachableBy('project.list_project_summaries(uuid,uuid)'), ['hub_s3_read'])
  assert.deepEqual(await reachableBy('project.get_project(uuid,uuid)'), ['hub_s3_read'])
  assert.deepEqual(await reachableBy('workspace.create_workspace(uuid,text,uuid)'), ['hub_ws01_command'])
  assert.deepEqual(await reachableBy('workspace.get_workspace_summary(uuid,uuid)'), ['hub_s2_read'])
  assert.deepEqual(await reachableBy('model_connection.share_connection(uuid,uuid,uuid)'),
    ['hub_r2_connections', 'hub_rb_executor', 'hub_rb_ingress'])
  assert.deepEqual(await reachableBy('model_connection.unshare_connection(uuid,uuid,uuid)'),
    ['hub_r2_connections', 'hub_rb_executor', 'hub_rb_ingress'])
  assert.deepEqual(await reachableBy('builder.admit_source_revision(uuid,uuid,text)'), ['hub_rb_ingress'])
  assert.deepEqual(await reachableBy('builder.read_preview_subject(uuid,uuid)'), ['hub_rb_ingress'])
  assert.deepEqual(await reachableBy('iam.account_is_active(uuid)'), [])

  // The two the verifier executed: the Workspace read role could create a Workspace and hand
  // owner to any account id it named, and the Project command role could enumerate any account's
  // Projects.
  const workspaceId = await seedWorkspace(connection, { label: 'Fence' })
  const accountId = await seedAccount(connection, { label: 'Fence' })
  await seedMember(connection, accountId, workspaceId, 'owner')
  const asRole = async (role, sql, parameters) => {
    const client = new pg.Client(connection)
    await client.connect()
    try {
      await client.query(`SET ROLE ${role}`)
      await client.query(sql, parameters)
      return { code: null, message: null }
    } catch (error) {
      return { code: error.code ?? null, message: error.message ?? null }
    } finally {
      await client.end()
    }
  }
  for (const [role, sql, parameters] of [
    ['hub_s2_read', 'SELECT workspace.create_workspace($1,$2,$3)', [randomUUID(), 'pwned-by-s2read', accountId]],
    ['hub_prj03_command', 'SELECT * FROM project.list_project_summaries($1,$2)', [accountId, workspaceId]],
  ]) {
    const denied = await asRole(role, sql, parameters)
    assert.equal(denied.code, '42501', `${role} reached ${sql}`)
    assert.match(denied.message, /permission denied for function/)
  }
})

test('the runner refuses a database where PUBLIC may execute a Hub function', async (t) => {
  const connection = await freshDatabase(t)
  await runSelectedHubMigrations({
    connectionString: connectionStringFor(connection),
    migrations: loadCurrentHubMigrationFiles(),
    catalogSnapshot: null,
  })

  // Held open only for this body: the fixture's DROP DATABASE WITH (FORCE) would otherwise
  // terminate it first and report a connection failure instead of the assertion.
  const client = new pg.Client(connection)
  await client.connect()
  try {
    await assertRoleInvariants(client, '053')
    await client.query('GRANT EXECUTE ON FUNCTION project.get_project(uuid, uuid) TO PUBLIC')
    await assert.rejects(assertRoleInvariants(client, '053'),
      /MIGRATION_FUNCTION_PUBLIC_EXECUTE_REFUSED:project\.get_project\(p_account_id uuid, p_project_id uuid\)/)

    // History still replays: the invariant belongs to the version that establishes it.
    await assertRoleInvariants(client, '052')
  } finally {
    await client.end()
  }
})

test('a connection needs no Workspace, but a deactivated account cannot mint one', async (t) => {
  const connection = await freshDatabase(t)
  await runSelectedHubMigrations({
    connectionString: connectionStringFor(connection),
    migrations: loadCurrentHubMigrationFiles(),
    catalogSnapshot: null,
  })

  // Deliberate: the membership half of the guard publish_connection used to carry is gone,
  // because a connection belongs to an account and needs no Workspace to exist. The orphan
  // resolves nowhere, since resolution runs through the owner's visible Workspaces.
  const unaffiliated = await seedAccount(connection, { label: 'Unaffiliated' })
  const unaffiliatedConnection = randomUUID()
  assert.equal((await query(connection, 'SELECT model_connection.publish_connection($1,$2,$3,$4,$5,$6) AS value',
    [unaffiliated, unaffiliatedConnection, 'anthropic', 'OAUTH_TOKEN_SET', 'No workspace', 1])).rows[0].value, true)
  assert.deepEqual((await query(connection, 'SELECT connection_id FROM model_connection.list_connections($1)', [unaffiliated])).rows, [])

  // The account half is kept, so deactivation closes creation too.
  const dormant = await seedAccount(connection, { label: 'Dormant', active: false })
  assert.equal((await query(connection, 'SELECT model_connection.publish_connection($1,$2,$3,$4,$5,$6) AS value',
    [dormant, randomUUID(), 'anthropic', 'OAUTH_TOKEN_SET', 'Dormant key', 1])).rows[0].value, false)
  assert.deepEqual((await query(connection, 'SELECT count(*)::int AS rows FROM model_connection.connection WHERE owner_account_id = $1', [dormant])).rows,
    [{ rows: 0 }])
})

test('the migration refuses a grant whose account holds no membership', async (t) => {
  const connection = await freshDatabase(t)
  const connectionString = connectionStringFor(connection)
  await runSelectedHubMigrations({ connectionString, migrations: migrationsUpTo('050'), catalogSnapshot: null })

  const workspaceId = await seedWorkspace(connection, { label: 'Orphan' })
  const accountId = await seedAccount(connection, { label: 'Orphan' })
  const projectId = randomUUID()
  await query(connection,
    `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
     VALUES ($1,$2,'Orphan','NEW',$3,'orphan')`, [projectId, workspaceId, 'a'.repeat(40)])
  await query(connection, 'INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage) VALUES ($1,$2,true,true)',
    [accountId, projectId])

  // 052 aborts first, and names the pair rather than dropping access nobody looked at.
  await assert.rejects(
    runSelectedHubMigrations({ connectionString, migrations: migrationsAfter('050'), recognizedMigrations: loadCurrentHubMigrationFiles(), catalogSnapshot: null }),
    new RegExp(`MIGRATION_052_GRANT_WITHOUT_MEMBERSHIP_REFUSED: ${accountId}/${projectId}`))
})
