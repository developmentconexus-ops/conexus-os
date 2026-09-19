import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import pg from 'pg'
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
  const database = `conexus_removed_${randomUUID().replaceAll('-', '')}`
  await query(admin, `CREATE DATABASE "${database}"`)
  t.after(() => query(admin, `DROP DATABASE "${database}" WITH (FORCE)`))
  return { ...admin, database }
}
const migrationsUpTo = (version) => loadCurrentHubMigrationFiles().filter((migration) => migration.version <= version)
const migrationsAfter = (version) => loadCurrentHubMigrationFiles().filter((migration) => migration.version > version)
const migrateTo = (connection, version) => runSelectedHubMigrations({
  connectionString: connectionStringFor(connection), migrations: migrationsUpTo(version),
  recognizedMigrations: loadCurrentHubMigrationFiles(), catalogSnapshot: null,
})

const hubSourceRoot = resolve(import.meta.dirname, '../../apps/hub/src')
const sourceFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = resolve(directory, entry.name)
  return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith('.ts') ? [path] : []
})

// The Hub reaches the database as `schema.function(...)` inside a SQL string, and a TypeScript
// method call such as `workspace.register(app)` shares that shape. What separates them is the SQL
// keyword in front, so a call counts only after SELECT, FROM or JOIN. Arguments are read by
// balancing parentheses rather than by pattern, because real call sites nest (ARRAY(SELECT ...))
// and carry casts ($5::jsonb).
const argumentsAt = (text, open) => {
  let depth = 0
  let start = open + 1
  const args = []
  for (let at = open; at < text.length; at += 1) {
    const character = text[at]
    if (character === '(') depth += 1
    else if (character === ')') {
      depth -= 1
      if (depth === 0) {
        const last = text.slice(start, at).trim()
        if (last !== '') args.push(last)
        return args
      }
    } else if (character === ',' && depth === 1) {
      args.push(text.slice(start, at).trim())
      start = at + 1
    }
  }
  return null
}

const hubCallSites = () => {
  const pattern = /\b(SELECT|FROM|JOIN)\s+(iam|workspace|project|builder|reg|claude_connection)\.([a-z_][a-z0-9_]*)\s*\(/g
  const found = new Map()
  for (const path of sourceFiles(hubSourceRoot)) {
    const text = readFileSync(path, 'utf8').replace(/\s+/g, ' ')
    for (const match of text.matchAll(pattern)) {
      const args = argumentsAt(text, match.index + match[0].length - 1)
      if (args === null) continue
      const name = `${match[2]}.${match[3]}`
      found.set(`${name}/${args.length}`, { name, arity: args.length })
    }
  }
  return [...found.values()].sort((left, right) => `${left.name}/${left.arity}`.localeCompare(`${right.name}/${right.arity}`))
}

test('055 drops the removed surfaces and leaves the product path standing', async (t) => {
  const connection = await freshDatabase(t)
  const finished = await runSelectedHubMigrations({
    connectionString: connectionStringFor(connection),
    migrations: loadCurrentHubMigrationFiles(), catalogSnapshot: null,
  })
  assert.equal(finished.versions.at(-1), '055')

  assert.deepEqual((await query(connection, `
    SELECT nspname FROM pg_namespace
    WHERE nspname NOT IN ('pg_catalog','information_schema','public') AND nspname NOT LIKE 'pg\\_%'
    ORDER BY 1`)).rows.map((row) => row.nspname),
    ['builder', 'claude_connection', 'iam', 'project', 'reg', 'workspace'])

  // Every table 055 drops, named so a reader sees the list rather than a count.
  assert.deepEqual((await query(connection,
    'SELECT unnest($1::text[]) AS name, to_regclass(unnest($1::text[]))::text AS resolved',
    [['brn.binding_validation', 'brn.health', 'con.connection', 'con.connection_qualification',
      'con.connection_revision', 'con.operation_receipt', 'project.baseline_approval',
      'project.baseline_candidate', 'project.baseline_state', 'project.binding_source_intent',
      'project.brain_binding', 'project.connection_binding', 'project.inception_idempotency']]))
    .rows.filter((row) => row.resolved !== null), [])

  assert.deepEqual((await query(connection,
    'SELECT unnest($1::text[]) AS name, to_regprocedure(unnest($1::text[]))::text AS resolved',
    [['project.approve_baseline_revision(uuid,uuid,text,uuid,uuid[])',
      'project.abandon_inception(uuid,uuid,text,uuid)',
      'project.settle_brain_binding_removal(uuid,uuid,jsonb,text,text,jsonb,text)',
      'project.guard_inception_binding_source()',
      'reg.get_workspace_brain(uuid,uuid[])',
      'reg.bootstrap_workspace_brain(uuid,uuid,uuid,text,text,jsonb)']]))
    .rows.filter((row) => row.resolved !== null), [])

  // The application registry lives in the same schema the Brain did, and stays.
  assert.deepEqual((await query(connection,
    `SELECT to_regclass('reg.artifact')::text AS artifact, to_regclass('reg.artifact_revision')::text AS revision,
      to_regprocedure('reg.get_application_by_source(uuid,uuid,text)')::text AS get_application`)).rows,
    [{ artifact: 'reg.artifact', revision: 'reg.artifact_revision', get_application: 'reg.get_application_by_source(uuid,uuid,text)' }])

  // The login roles of the removed surfaces survive, because a role is cluster-global, and hold
  // nothing here.
  assert.deepEqual((await query(connection, `
    SELECT r.rolname, n.nspname FROM pg_roles r CROSS JOIN pg_namespace n
    WHERE r.rolname = ANY($1) AND n.nspname IN ('iam','workspace','project','builder','reg','claude_connection')
      AND has_schema_privilege(r.rolname, n.nspname, 'USAGE') ORDER BY 1,2`,
    [['hub_r2_brain_attester', 'hub_r2_brain_bootstrap', 'hub_r2_brain_read', 'hub_r2_key_conformance_subject',
      'hub_r2_project_binding', 'hub_s4_baseline_command', 'hub_s4_baseline_read', 'hub_s6_inception_command']]))
    .rows, [])
})

test('every function the Hub calls still resolves after 055', async (t) => {
  const connection = await freshDatabase(t)
  await runSelectedHubMigrations({
    connectionString: connectionStringFor(connection),
    migrations: loadCurrentHubMigrationFiles(), catalogSnapshot: null,
  })

  const callSites = hubCallSites()
  assert.equal(callSites.length, 54)

  const unresolved = []
  for (const site of callSites) {
    const [schema, name] = site.name.split('.')
    const { rows } = await query(connection, `
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = $1 AND p.proname = $2
        AND $3::int BETWEEN p.pronargs - p.pronargdefaults AND p.pronargs`,
      [schema, name, site.arity])
    if (rows.length === 0) unresolved.push(`${site.name}/${site.arity}`)
  }
  assert.deepEqual(unresolved, [])
})

test('a row in a table 055 drops refuses the migration and leaves the database at 054', async (t) => {
  const connection = await freshDatabase(t)
  const staged = await migrateTo(connection, '054')
  assert.equal(staged.versions.at(-1), '054')

  await query(connection,
    `INSERT INTO brn.health(health_snapshot_digest, brain_revision_id, brain_digest, items)
     VALUES ($1, $2, $3, '[]'::jsonb)`,
    ['a'.repeat(64), randomUUID(), 'b'.repeat(64)])

  const refused = await runSelectedHubMigrations({
    connectionString: connectionStringFor(connection), migrations: migrationsAfter('054'),
    recognizedMigrations: loadCurrentHubMigrationFiles(), catalogSnapshot: null,
  }).then(() => null, (error) => error)

  assert.match(refused.message, /MIGRATION_055_TABLE_NOT_EMPTY_REFUSED/)
  assert.match(refused.message, /brn\.health has 1 rows/)

  assert.deepEqual((await query(connection, 'SELECT max(version) AS head FROM iam.schema_migration')).rows, [{ head: '054' }])
  assert.deepEqual((await query(connection,
    `SELECT to_regclass('brn.health')::text AS health, to_regclass('con.connection')::text AS connection`)).rows,
    [{ health: 'brn.health', connection: 'con.connection' }])
})

test('a pilot-shaped ledger at 050 runs 051 to 055 in one invocation', async (t) => {
  const connection = await freshDatabase(t)
  const staged = await migrateTo(connection, '050')
  assert.equal(staged.versions.at(-1), '050')

  const workspaceId = randomUUID()
  const accountId = randomUUID()
  await query(connection, 'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1,$2)', [workspaceId, 'Pilot'])
  await query(connection,
    'INSERT INTO iam.account(account_id, issuer, external_subject, display_name, active) VALUES ($1,$2,$3,$4,true)',
    [accountId, 'https://pilot.test', accountId, 'Pilot'])
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

  for (let index = 0; index < 23; index += 1) {
    const projectId = projectIds[index % projectIds.length]
    await query(connection,
      `INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, trigger_message_id, idempotency_digest,
        request_digest, mode, base_source_revision, expected_working_version, base_working_version, state, result_kind)
       VALUES ($1,$2,$3,$4,$5,$5,'PLAN',$6,0,0,'SUCCEEDED','RESPONSE_ONLY')`,
      [randomUUID(), projectId, accountId, randomUUID(), index.toString(16).padStart(64, '0'),
        (index % projectIds.length).toString(16).padStart(40, '0')])
  }

  // 4 application artifacts over 6 revisions, the registry rows the pilot held on 2026-09-19.
  const artifactIds = []
  for (let index = 0; index < 4; index += 1) {
    const artifactId = randomUUID()
    artifactIds.push(artifactId)
    await query(connection,
      "INSERT INTO reg.artifact(artifact_id, kind, semantic_name, project_id) VALUES ($1,'application',$2,$3)",
      [artifactId, `pilot-application-${index}`, projectIds[index]])
  }
  for (let index = 0; index < 6; index += 1) {
    const artifactId = artifactIds[index % artifactIds.length]
    await query(connection,
      `INSERT INTO reg.artifact_revision(artifact_revision_id, artifact_id, source_revision, digest, payload, availability)
       VALUES ($1,$2,$3,$4,$5,'AVAILABLE')`,
      [randomUUID(), artifactId, `r${index}`, index.toString(16).padStart(64, '0'),
        JSON.stringify({ profile: 'MANAGED', entryPath: 'index.html', files: [] })])
  }

  const connectionId = randomUUID()
  await query(connection,
    "INSERT INTO claude_connection.connection(connection_id, owner_account_id, label, state, current_generation) VALUES ($1,$2,'Pilot','ACTIVE',1)",
    [connectionId, accountId])
  await query(connection,
    "INSERT INTO claude_connection.binding(connection_id, account_id, workspace_id, role) VALUES ($1,$2,$3,'OWNER')",
    [connectionId, accountId, workspaceId])

  const finished = await runSelectedHubMigrations({
    connectionString: connectionStringFor(connection), migrations: migrationsAfter('050'),
    recognizedMigrations: loadCurrentHubMigrationFiles(), catalogSnapshot: null,
  })
  assert.deepEqual(finished.appliedNow, ['051', '052', '053', '054', '055'])

  assert.deepEqual((await query(connection, 'SELECT count(*)::int AS visible FROM project.list_project_summaries($1,$2)', [accountId, workspaceId])).rows,
    [{ visible: 22 }])
  assert.deepEqual((await query(connection, 'SELECT count(*)::int AS runs FROM builder.builder_run')).rows, [{ runs: 23 }])
  assert.deepEqual((await query(connection, 'SELECT count(*)::int AS artifacts FROM reg.artifact')).rows, [{ artifacts: 4 }])
  assert.deepEqual((await query(connection, 'SELECT count(*)::int AS revisions FROM reg.artifact_revision')).rows, [{ revisions: 6 }])
  assert.deepEqual((await query(connection, 'SELECT count(*)::int AS connections FROM claude_connection.list_connections($1)', [accountId])).rows,
    [{ connections: 1 }])

  for (const projectId of projectIds) {
    assert.deepEqual((await query(connection, 'SELECT project_id FROM project.get_project($1,$2)', [accountId, projectId])).rows,
      [{ project_id: projectId }])
  }
  const revision = (await query(connection, 'SELECT source_revision FROM reg.artifact_revision ORDER BY source_revision LIMIT 1')).rows[0]
  assert.equal(revision.source_revision, 'r0')
})
