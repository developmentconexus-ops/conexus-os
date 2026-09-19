import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import pg from 'pg'
import { runHubMigrations } from '../../scripts/run-hub-migrations.mjs'
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
  const database = `conexus_privilege_${randomUUID().replaceAll('-', '')}`
  await query(admin, `CREATE DATABASE "${database}"`)
  t.after(() => query(admin, `DROP DATABASE "${database}" WITH (FORCE)`))
  return { ...admin, database }
}

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubSourceRoot = resolve(repositoryRoot, 'apps/hub/src')
const roleRegister = JSON.parse(readFileSync(resolve(repositoryRoot, 'contracts/technical/hub-database-roles.json'), 'utf8'))
const registeredRoles = new Set(roleRegister.roles.map(({ role }) => role))

// A pool is a local variable, so no parse of the Hub's TypeScript tells a reader which login role
// reaches a given function. This table declares it. A call site missing from it fails, which is
// what stops a new call being added without saying who runs it, and a row here with no call site
// fails too, so the table cannot outlive the code it describes.
const ROLE_BY_CALL_SITE = Object.freeze({
  'builder/store.ts': Object.freeze({
    'builder.create_builder_run_with_model': 'hub_builder_ingress',
    'builder.create_builder_run': 'hub_builder_ingress',
    'builder.read_builder_run': 'hub_builder_ingress',
    'builder.list_builder_runs': 'hub_builder_ingress',
    'builder.read_latest_code_changing_builder_run': 'hub_builder_ingress',
    'builder.request_builder_run_cancellation': 'hub_builder_ingress',
    'builder.read_preview_subject': 'hub_builder_ingress',
    'builder.admit_source_revision': 'hub_builder_ingress',
    'builder.claim_builder_run': 'hub_builder_executor',
    'builder.set_builder_run_phase': 'hub_builder_executor',
    'builder.bind_builder_run_message': 'hub_builder_executor',
    'builder.bind_builder_run_sandbox': 'hub_builder_executor',
    'builder.settle_builder_run': 'hub_builder_executor',
    'builder.advance_builder_run_source': 'hub_builder_executor',
    'builder.settle_builder_run_build': 'hub_builder_executor',
    'builder.fail_builder_run': 'hub_builder_executor',
    'builder.interrupt_builder_run': 'hub_builder_executor',
    'builder.recover_builder_runs': 'hub_builder_executor',
  }),
  'identity-access/membership.ts': Object.freeze({
    'iam.invite_workspace_member': 'hub_iam_runtime',
    'iam.list_workspace_roster': 'hub_iam_runtime',
    'iam.cancel_workspace_invitation': 'hub_iam_runtime',
    'iam.set_workspace_member_role': 'hub_iam_runtime',
    'iam.remove_workspace_member': 'hub_iam_runtime',
  }),
  'identity-access/store.ts': Object.freeze({
    'iam.email_has_open_invitation': 'hub_iam_runtime',
    'iam.claim_invitations': 'hub_iam_runtime',
    'workspace.list_visible_workspace_summaries': 'hub_workspace_read',
  }),
  'model-connection-account/module.ts': Object.freeze({
    'model_connection.read_connection_credential': 'hub_model_connection',
    'model_connection.read_current_generation': 'hub_model_connection',
    'model_connection.advance_generation': 'hub_model_connection',
  }),
  'model-connection-account/store.ts': Object.freeze({
    'model_connection.start_authorization': 'hub_model_connection',
    'model_connection.consume_authorization': 'hub_model_connection',
    'model_connection.publish_connection': 'hub_model_connection',
    'model_connection.complete_authorization': 'hub_model_connection',
    'model_connection.list_connections': 'hub_model_connection',
    'model_connection.fail_authorization': 'hub_model_connection',
    'model_connection.select_connection': 'hub_model_connection',
    'model_connection.share_connection': 'hub_model_connection',
    'model_connection.unshare_connection': 'hub_model_connection',
    'model_connection.revoke_connection': 'hub_model_connection',
    'model_connection.admit_for_project': 'hub_model_connection',
  }),
  'project/store.ts': Object.freeze({
    'project.list_project_summaries': 'hub_project_read',
    'project.get_project': 'hub_project_read',
    'project.claim_abandoned_create_project_attempt': 'hub_project_command',
    'project.reserve_or_replay_create_project': 'hub_project_command',
    'project.lock_create_project_receipt': 'hub_project_command',
    'project.create_project_with_source': 'hub_project_command',
    'project.complete_create_project_receipt': 'hub_project_command',
  }),
  'registry/application-artifact-store.ts': Object.freeze({
    'reg.retain_application_execution': 'hub_builder_executor',
    'reg.get_application_by_source': 'hub_builder_executor',
    'reg.read_application_file_by_source': 'hub_builder_executor',
  }),
  'workspace/store.ts': Object.freeze({
    'workspace.reserve_or_replay_create_workspace': 'hub_workspace_command',
    'workspace.create_workspace': 'hub_workspace_command',
    'workspace.complete_create_workspace_receipt': 'hub_workspace_command',
    'workspace.get_workspace_summary': 'hub_workspace_read',
  }),
})

const sourceFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = resolve(directory, entry.name)
  return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith('.ts') ? [path] : []
})

// A database call is `schema.function(` behind a SQL keyword. A TypeScript method call such as
// `workspace.register(app)` has the same shape, so the keyword is what separates them. Arguments
// are counted by balancing parentheses because real call sites nest and carry casts.
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

const CALL_PATTERN = /\b(SELECT|FROM|JOIN)\s+(iam|workspace|project|builder|reg|claude_connection|model_connection)\.([a-z_][a-z0-9_]*)\s*\(/g

const hubCallSites = () => {
  const found = []
  for (const path of sourceFiles(hubSourceRoot)) {
    const file = path.slice(hubSourceRoot.length + 1).replaceAll('\\', '/')
    const raw = readFileSync(path, 'utf8')
    const lineStarts = [0]
    for (let at = 0; at < raw.length; at += 1) if (raw[at] === '\n') lineStarts.push(at + 1)
    const lineOf = (offset) => {
      let line = 0
      while (line + 1 < lineStarts.length && lineStarts[line + 1] <= offset) line += 1
      return line + 1
    }
    // Offsets stay usable across a statement broken over several lines by collapsing runs of
    // whitespace to a single space in place rather than removing them.
    const flat = raw.replace(/\s/g, ' ')
    for (const match of flat.matchAll(CALL_PATTERN)) {
      const args = argumentsAt(flat, match.index + match[0].length - 1)
      if (args === null) continue
      found.push({ file, line: lineOf(match.index), name: `${match[2]}.${match[3]}`, arity: args.length })
    }
  }
  return found.sort((left, right) => `${left.file}:${left.line}`.localeCompare(`${right.file}:${right.line}`))
}

test('every declared Hub call site names a registered login role and every declared role is called', () => {
  const callSites = hubCallSites()
  assert.ok(callSites.length > 0, 'the enumeration found no call sites, so the pattern stopped matching')

  const undeclared = callSites
    .filter((site) => ROLE_BY_CALL_SITE[site.file]?.[site.name] === undefined)
    .map((site) => `${site.file}:${site.line} ${site.name}`)
  assert.deepEqual(undeclared, [], 'add these call sites to ROLE_BY_CALL_SITE with the login role that runs them')

  const called = new Set(callSites.map((site) => `${site.file} ${site.name}`))
  const stale = Object.entries(ROLE_BY_CALL_SITE).flatMap(([file, byName]) =>
    Object.keys(byName).filter((name) => !called.has(`${file} ${name}`)).map((name) => `${file} ${name}`))
  assert.deepEqual(stale, [], 'these ROLE_BY_CALL_SITE rows have no call site left')

  const unregistered = [...new Set(Object.values(ROLE_BY_CALL_SITE).flatMap((byName) => Object.values(byName)))]
    .filter((role) => !registeredRoles.has(role))
  assert.deepEqual(unregistered, [], 'these roles are absent from contracts/technical/hub-database-roles.json')
})

test('every function the Hub calls is EXECUTE-granted to the login role that calls it', async (t) => {
  const connection = await freshDatabase(t)
  const finished = await runHubMigrations({ connectionString: connectionStringFor(connection), catalogSnapshot: null })
  assert.deepEqual(finished.versions, ['0001', '0002'])

  const denied = []
  const unresolved = []
  for (const site of hubCallSites()) {
    const role = ROLE_BY_CALL_SITE[site.file]?.[site.name]
    if (role === undefined) continue
    const [schema, name] = site.name.split('.')
    const { rows } = await query(connection, `
      SELECT p.oid::regprocedure::text AS signature,
        has_function_privilege($4, p.oid, 'EXECUTE') AS granted
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = $1 AND p.proname = $2
        AND $3::int BETWEEN p.pronargs - p.pronargdefaults AND p.pronargs`,
      [schema, name, site.arity, role])
    if (rows.length === 0) {
      unresolved.push(`${site.file}:${site.line} ${site.name}/${site.arity}`)
      continue
    }
    for (const row of rows.filter((candidate) => candidate.granted !== true)) {
      denied.push(`${site.file}:${site.line} ${row.signature} not EXECUTE-granted to ${role}`)
    }
  }
  assert.deepEqual(unresolved, [], 'these call sites name a function the migrated database does not have')
  assert.deepEqual(denied, [])
})
