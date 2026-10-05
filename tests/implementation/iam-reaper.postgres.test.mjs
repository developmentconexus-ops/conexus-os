import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import test from 'node:test'
import { buildHubDatabase, query, testPool } from './hub-database.mjs'

const sha = (text) => createHash('sha256').update(text).digest()
// The database stamps `ended_at` with its own clock, so the pass's time is the real one: rows are seeded around it.
const NOW = new Date()
const ago = (ms) => new Date(NOW.getTime() - ms)
const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const SEALED = 'mastra:factory-secret:v1:token'

const RULES = [
  'iam.handoff:DELETED', 'iam.preview:DELETED', 'iam.host_session:ENDED', 'iam.host_session:DELETED',
  'iam.oidc_transaction:DELETED', 'iam.bootstrap_context:DELETED', 'iam.workspace_invitation:DELETED', 'iam.application_invitation:DELETED',
]
const NOTHING = Object.fromEntries(RULES.map((rule) => [rule, 0]))

const reap = async (connection, { now = NOW, limit = 500 } = {}) =>
  Object.fromEntries((await query(connection, "SELECT relation || ':' || action AS rule, removed FROM iam.reap_expired($1, $2)", [now, limit])).rows.map((row) => [row.rule, row.removed]))
const removing = (rule, removed) => ({ ...NOTHING, [rule]: removed })
const labels = async (connection, sql) => (await query(connection, sql)).rows.map((row) => row.label)

// A migrated database with a Workspace, its Owner and one Project that has an application.
const seeded = async (t, name) => {
  const database = await buildHubDatabase(t, name)
  const { connectionString } = database
  const owner = randomUUID()
  const workspaceId = randomUUID()
  const projectId = randomUUID()
  await query(connectionString, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://reaper.test', $2, 'Owner')", [owner, owner])
  await query(connectionString, "INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'Reaper')", [workspaceId])
  await query(connectionString, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [owner, workspaceId])
  await query(connectionString, "INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, 'p', 'NEW', $3, 'p')", [projectId, workspaceId, 'a'.repeat(40)])
  await query(connectionString, "INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, 'reaper-app', $2)", [projectId, owner])
  const hubSession = (label, { startedAgo = 0, idleAgo = null, endedAgo = null } = {}) => query(connectionString, `
    INSERT INTO iam.host_session(token_digest, kind, account_id, started_at, absolute_expires_at, provider_refresh_token, provider_checked_at, idle_expires_at, ended_at, ended_reason)
    VALUES ($1, 'HUB', $2, $3, $3::timestamptz + interval '8 hours', $4, $3, $5, $6, $7)`,
  [sha(label), owner, ago(startedAgo), endedAgo === null ? SEALED : null,
    idleAgo === null ? new Date(ago(startedAgo).getTime() + 7 * HOUR) : ago(idleAgo), endedAgo === null ? null : ago(endedAgo), endedAgo === null ? null : 'SIGNED_OUT'])
  const applicationSession = (label, { startedAgo = 0 } = {}) => query(connectionString, `
    INSERT INTO iam.host_session(token_digest, kind, account_id, started_at, absolute_expires_at, project_id, provider_refresh_token, provider_checked_at)
    VALUES ($1, 'APPLICATION', $2, $3, $3::timestamptz + interval '8 hours', $4, $5, $3)`, [sha(label), owner, ago(startedAgo), projectId, SEALED])
  const previewOf = async ({ openedAgo }) => {
    const previewId = randomUUID()
    const revision = randomUUID()
    await query(connectionString, `INSERT INTO iam.preview(preview_id, account_id, project_id, source_revision, artifact_revision_id, artifact_digest, exact_host, manifest, opened_at, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, '{"entryPath":"index.html","files":[]}', $8, $8::timestamptz + interval '15 minutes')`,
    [previewId, owner, projectId, 'b'.repeat(40), revision, 'f'.repeat(64), `preview-${revision}.conexus.localhost`, ago(openedAgo)])
    return previewId
  }
  const previewSession = (label, previewId, parent) => query(connectionString, `
    INSERT INTO iam.host_session(token_digest, kind, account_id, started_at, absolute_expires_at, preview_id, parent_digest)
    VALUES ($1, 'PREVIEW', $2, $3, $3::timestamptz + interval '5 minutes', $4, $5)`, [sha(label), owner, ago(HOUR), previewId, sha(parent)])
  const handoffOf = (label, previewId, parent, { expiresAgo }) => query(connectionString, `
    INSERT INTO iam.handoff(handoff_digest, kind, account_id, preview_id, parent_digest, minted_at, expires_at)
    VALUES ($1, 'PREVIEW', $2, $3, $4, $5, $6)`, [sha(label), owner, previewId, sha(parent), ago(expiresAgo + 10 * SECOND), ago(expiresAgo)])
  const transaction = (label, expiredAgo) => query(connectionString, "INSERT INTO iam.oidc_transaction(state_digest, pkce_verifier, nonce, expires_at) VALUES ($1, 'v', 'n', $2)", [sha(label), ago(expiredAgo)])
  const receipt = (subject) => query(connectionString,
    "INSERT INTO iam.operation_idempotency(operation_id, authority_scope, key_digest, request_digest, outcome, response_status, completed_at) VALUES ('IAM-03', $1, $2, $3, 'SUCCEEDED', 201, $4)",
    [`bootstrap:https://issuer.test:${subject}`, sha(`key-${subject}`), sha('request'), NOW])
  const context = async (subject, expiredAgo) => {
    await query(connectionString, "INSERT INTO iam.bootstrap_context(token_digest, issuer, external_subject, expires_at, verified_email) VALUES ($1, 'https://issuer.test', $2, $3, 'x@y.test')", [sha(`tok-${subject}`), subject, ago(expiredAgo)])
    await receipt(subject)
  }
  const workspaceInvitation = (label, expiredAgo) => query(connectionString,
    "INSERT INTO iam.workspace_invitation(invitation_id, workspace_id, email, role, invited_by, created_at, expires_at) VALUES ($1, $2, $3, 'member', $4, $5, $6)",
    [randomUUID(), workspaceId, `${label}@x.test`, owner, ago(60 * DAY), ago(expiredAgo)])
  const applicationInvitation = (label, expiredAgo) => query(connectionString,
    'INSERT INTO iam.application_invitation(invitation_id, project_id, email, invited_by, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [randomUUID(), projectId, `${label}@x.test`, owner, ago(60 * DAY), ago(expiredAgo)])
  return { ...database, owner, workspaceId, projectId, hubSession, applicationSession, previewOf, previewSession, handoffOf, transaction, receipt, context, workspaceInvitation, applicationInvitation }
}

test('purging a Project succeeds while a sign-in into its application is still on record', async (t) => {
  const { connectionString, projectId } = await seeded(t, 'conexus_reaper_purge')
  await query(connectionString, "INSERT INTO iam.oidc_transaction(state_digest, pkce_verifier, nonce, expires_at, application_project_id, sign_in_binding_digest) VALUES ($1, 'v', 'n', $2, $3, $4)", [sha('sign-in'), new Date(Date.now() + 10 * MINUTE), projectId, sha('binding')])
  await query(connectionString, 'SELECT iam.purge_project($1)', [projectId])
  assert.deepEqual((await query(connectionString, 'SELECT (SELECT count(*)::int FROM iam.application) AS applications, (SELECT count(*)::int FROM iam.oidc_transaction) AS transactions')).rows, [{ applications: 0, transactions: 0 }])
})

test('the reaper answers one row per rule, in order, with zero for a rule that found nothing', async (t) => {
  const { connectionString } = await seeded(t, 'conexus_reaper_shape')
  assert.deepEqual(Object.keys(await reap(connectionString)), RULES)
  assert.deepEqual(await reap(connectionString), NOTHING)
})

test('a handoff goes at its expiry, an expired open session ends EXPIRED with no sealed token, and a Preview goes with its handoff and session in one pass', async (t) => {
  const db = await seeded(t, 'conexus_reaper_handoff_preview_session')
  const { connectionString } = db
  await db.hubSession('hub-open', { startedAgo: HOUR })
  await db.hubSession('absolute-gone', { startedAgo: 8 * HOUR + SECOND })
  await db.hubSession('idle-gone', { startedAgo: HOUR, idleAgo: SECOND })
  await db.hubSession('inside', { startedAgo: 8 * HOUR - SECOND, idleAgo: -SECOND })
  await db.applicationSession('application-gone', { startedAgo: 8 * HOUR + SECOND })
  await db.applicationSession('application-inside', { startedAgo: 8 * HOUR - SECOND })
  const gone = await db.previewOf({ openedAgo: 15 * MINUTE + SECOND })
  await db.previewSession('session-gone', gone, 'hub-open')
  await db.handoffOf('handoff-gone', gone, 'hub-open', { expiresAgo: 14 * MINUTE })
  const kept = await db.previewOf({ openedAgo: 15 * MINUTE - SECOND })
  await db.previewSession('session-kept', kept, 'hub-open')
  await db.handoffOf('handoff-kept', kept, 'hub-open', { expiresAgo: -SECOND })
  assert.deepEqual(await reap(connectionString), { ...NOTHING, 'iam.handoff:DELETED': 1, 'iam.preview:DELETED': 1, 'iam.host_session:ENDED': 3 })

  assert.deepEqual((await query(connectionString, 'SELECT preview_id FROM iam.preview')).rows, [{ preview_id: kept }], 'the Preview inside its limit stays')
  assert.deepEqual((await query(connectionString, 'SELECT (SELECT count(*)::int FROM iam.handoff) AS handoffs, (SELECT count(*)::int FROM iam.host_session WHERE kind = \'PREVIEW\') AS preview_sessions')).rows, [{ handoffs: 1, preview_sessions: 1 }])
  const ended = await query(connectionString, "SELECT encode(token_digest, 'hex') AS digest, ended_reason, provider_refresh_token FROM iam.host_session WHERE kind <> 'PREVIEW' ORDER BY digest")
  const byLabel = (label) => ended.rows.find((row) => row.digest === sha(label).toString('hex'))
  assert.deepEqual(['absolute-gone', 'idle-gone', 'application-gone'].map((label) => [label, byLabel(label).ended_reason, byLabel(label).provider_refresh_token]),
    [['absolute-gone', 'EXPIRED', null], ['idle-gone', 'EXPIRED', null], ['application-gone', 'EXPIRED', null]])
  assert.deepEqual(['hub-open', 'inside', 'application-inside'].map((label) => [label, byLabel(label).ended_reason, byLabel(label).provider_refresh_token]),
    [['hub-open', null, SEALED], ['inside', null, SEALED], ['application-inside', null, SEALED]])
  assert.deepEqual(await reap(connectionString), NOTHING, 'a drained pass with the same time changes nothing')
})

test('an ended session is deleted 72 hours after it ended, and waits while a child session names it', async (t) => {
  const db = await seeded(t, 'conexus_reaper_ended_sessions')
  const { connectionString } = db
  await db.hubSession('gone', { startedAgo: 80 * HOUR, endedAgo: 72 * HOUR + SECOND })
  await db.hubSession('kept', { startedAgo: 80 * HOUR, endedAgo: 72 * HOUR - SECOND })
  await db.hubSession('parent', { startedAgo: 80 * HOUR, endedAgo: 73 * HOUR })
  const preview = await db.previewOf({ openedAgo: MINUTE })
  await db.previewSession('child', preview, 'parent')
  await query(connectionString, "UPDATE iam.host_session SET ended_at = $1, ended_reason = 'PARENT_ENDED' WHERE token_digest = $2", [ago(73 * HOUR), sha('child')])
  const rows = async () => (await query(connectionString, 'SELECT encode(token_digest, \'hex\') AS digest FROM iam.host_session')).rows.map((row) => row.digest)
  const named = async () => {
    const present = new Set(await rows())
    return ['gone', 'kept', 'parent', 'child'].filter((label) => present.has(sha(label).toString('hex')))
  }
  assert.deepEqual(await reap(connectionString), removing('iam.host_session:DELETED', 2), 'gone and the child go; the parent waits for it')
  assert.deepEqual(await named(), ['kept', 'parent'])
  assert.deepEqual(await reap(connectionString), removing('iam.host_session:DELETED', 1), 'the parent goes once nothing names it')
  assert.deepEqual(await named(), ['kept'])
})

test('a sign-in record and a bootstrap context go 24 hours after expiry, the context with its own receipt and nobody else\'s', async (t) => {
  const db = await seeded(t, 'conexus_reaper_sign_in')
  const { connectionString } = db
  await db.transaction('oidc-gone', 24 * HOUR + SECOND)
  await db.transaction('oidc-kept', 24 * HOUR - SECOND)
  await db.context('boot-gone', 24 * HOUR + SECOND)
  await db.context('boot-kept', 24 * HOUR - SECOND)
  await db.context('boot-live', -10 * MINUTE)
  await db.receipt('boot-orphan')

  assert.deepEqual(await reap(connectionString), { ...NOTHING, 'iam.oidc_transaction:DELETED': 1, 'iam.bootstrap_context:DELETED': 1 })
  assert.deepEqual((await query(connectionString, "SELECT replace(authority_scope, 'bootstrap:https://issuer.test:', '') AS label FROM iam.operation_idempotency ORDER BY 1")).rows.map((row) => row.label), ['boot-kept', 'boot-live', 'boot-orphan'])
  assert.deepEqual((await query(connectionString, 'SELECT external_subject AS label FROM iam.bootstrap_context ORDER BY 1')).rows.map((row) => row.label), ['boot-kept', 'boot-live'])
  assert.deepEqual(await reap(connectionString), NOTHING)
  assert.deepEqual(await reap(connectionString, { now: new Date(NOW.getTime() + 2 * HOUR) }), { ...NOTHING, 'iam.oidc_transaction:DELETED': 1, 'iam.bootstrap_context:DELETED': 1 }, 'two hours later the rows 24 hours short are past it')
  assert.deepEqual((await query(connectionString, "SELECT replace(authority_scope, 'bootstrap:https://issuer.test:', '') AS label FROM iam.operation_idempotency ORDER BY 1")).rows.map((row) => row.label), ['boot-live', 'boot-orphan'])
})

test('an invitation goes 30 days after it expired, in both lists', async (t) => {
  const db = await seeded(t, 'conexus_reaper_invitations')
  const { connectionString } = db
  for (const invite of [db.workspaceInvitation, db.applicationInvitation]) {
    await invite('gone', 30 * DAY + SECOND)
    await invite('kept', 30 * DAY - SECOND)
    await invite('pending', -DAY)
  }
  assert.deepEqual(await reap(connectionString), { ...NOTHING, 'iam.workspace_invitation:DELETED': 1, 'iam.application_invitation:DELETED': 1 })
  for (const table of ['workspace_invitation', 'application_invitation']) {
    assert.deepEqual((await query(connectionString, `SELECT split_part(email, '@', 1) AS label FROM iam.${table} ORDER BY 1`)).rows.map((row) => row.label), ['kept', 'pending'])
  }
})

test('a rule takes at most p_limit root rows in deadline order, and the next call takes the rest', async (t) => {
  const db = await seeded(t, 'conexus_reaper_limit')
  const { connectionString } = db
  for (let i = 0; i < 5; i += 1) await db.transaction(`oidc-${i}`, 25 * HOUR + i * HOUR)
  assert.deepEqual(await reap(connectionString, { limit: 2 }), removing('iam.oidc_transaction:DELETED', 2))
  assert.deepEqual(await reap(connectionString, { limit: 0 }), NOTHING)
  const labels = Object.fromEntries([0, 1, 2, 3, 4].map((i) => [sha(`oidc-${i}`).toString('hex'), `oidc-${i}`]))
  const surviving = async () => (await query(connectionString, 'SELECT state_digest FROM iam.oidc_transaction')).rows.map((row) => labels[row.state_digest.toString('hex')]).sort()
  assert.deepEqual(await surviving(), ['oidc-0', 'oidc-1', 'oidc-2'], 'the two with the oldest deadline went first')
  assert.deepEqual(await reap(connectionString, { limit: 2 }), removing('iam.oidc_transaction:DELETED', 2))
  assert.deepEqual(await reap(connectionString, { limit: 2 }), removing('iam.oidc_transaction:DELETED', 1))
  assert.deepEqual(await reap(connectionString, { limit: 2 }), NOTHING)
})

test('a row another transaction holds is skipped and taken by the next call', async (t) => {
  const db = await seeded(t, 'conexus_reaper_locked')
  const { connectionString, connection, onCleanup } = db
  await db.transaction('held', 25 * HOUR)
  await db.transaction('free', 26 * HOUR)
  const holder = testPool({ ...connection, max: 1 })
  onCleanup(() => holder.end())
  const client = await holder.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT 1 FROM iam.oidc_transaction WHERE state_digest = $1 FOR UPDATE', [sha('held')])
    assert.deepEqual(await reap(connectionString), removing('iam.oidc_transaction:DELETED', 1), 'the free row goes, the held one is passed over')
    await client.query('COMMIT')
  } finally {
    client.release()
  }
  assert.deepEqual(await reap(connectionString), removing('iam.oidc_transaction:DELETED', 1))
})

test('a locked expired session is skipped by the pass and ended by the next, with its sealed token cleared', async (t) => {
  const db = await seeded(t, 'conexus_reaper_locked_session')
  const { connectionString, connection, onCleanup } = db
  await db.hubSession('locked', { startedAgo: 9 * HOUR })
  const holder = testPool({ ...connection, max: 1 })
  onCleanup(() => holder.end())
  const client = await holder.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT 1 FROM iam.host_session WHERE token_digest = $1 FOR UPDATE', [sha('locked')])
    assert.deepEqual(await reap(connectionString), NOTHING)
    await client.query('COMMIT')
  } finally {
    client.release()
  }
  assert.deepEqual(await reap(connectionString), removing('iam.host_session:ENDED', 1))
  assert.deepEqual((await query(connectionString, 'SELECT ended_reason, provider_refresh_token FROM iam.host_session')).rows, [{ ended_reason: 'EXPIRED', provider_refresh_token: null }])
})

test('no rule touches history: runs, receipts of other operations and the rows of live entities stay', async (t) => {
  const db = await seeded(t, 'conexus_reaper_history')
  const { connectionString, owner, projectId } = db
  const old = ago(400 * DAY)
  await query(connectionString, `
    INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, idempotency_digest, request_digest, base_source_revision, state, started_at, finished_at, created_at, failure_code)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'FAILED', $8, $8, $8, 'INTERNAL_UNEXPECTED')`, [randomUUID(), projectId, owner, randomUUID(), 'a'.repeat(64), 'f'.repeat(64), 'a'.repeat(40), old])
  await db.receipt('orphan')
  const history = () => query(connectionString, "SELECT (SELECT count(*)::int FROM builder.builder_run) AS runs, (SELECT count(*)::int FROM iam.operation_idempotency) AS receipts, (SELECT count(*)::int FROM project.project) AS projects, (SELECT count(*)::int FROM iam.application) AS applications")
  const before = (await history()).rows
  assert.deepEqual(await reap(connectionString, { now: new Date(NOW.getTime() + 400 * DAY) }), NOTHING)
  assert.deepEqual((await history()).rows, before)
  assert.deepEqual(before, [{ runs: 1, receipts: 1, projects: 1, applications: 1 }])
})

test('the reaper runs as the identity-access login role, which no other Hub role may call, and no Hub role gained DELETE', async (t) => {
  const db = await seeded(t, 'conexus_reaper_role')
  const { connectionString, connection, onCleanup } = db
  await db.transaction('gone', 25 * HOUR)
  const pool = testPool({ ...connection, max: 1, options: '-c role=hub_iam_runtime' })
  onCleanup(() => pool.end())
  assert.deepEqual((await pool.query('SELECT relation, removed FROM iam.reap_expired($1, 500) WHERE removed > 0', [NOW])).rows, [{ relation: 'iam.oidc_transaction', removed: 1 }])
  const privileges = await query(connectionString, `
    SELECT role.rolname AS label FROM pg_roles AS role
    WHERE role.rolname LIKE 'hub\\_%' AND has_function_privilege(role.oid, 'iam.reap_expired(timestamptz, integer)', 'EXECUTE') ORDER BY 1`)
  assert.deepEqual(privileges.rows.map((row) => row.label), ['hub_iam_runtime'])
  const deletes = await query(connectionString, `
    SELECT count(*)::int AS n FROM pg_roles AS role CROSS JOIN pg_class AS cls JOIN pg_namespace AS ns ON ns.oid = cls.relnamespace
    WHERE role.rolname LIKE 'hub\\_%' AND ns.nspname IN ('iam', 'project', 'workspace', 'builder') AND cls.relkind = 'r' AND has_table_privilege(role.oid, cls.oid, 'DELETE')`)
  assert.deepEqual(deletes.rows, [{ n: 0 }])
})

// A user table whose column name ends in expires_at, in any schema but Mastra's storage and the system ones.
const EXPIRING_COLUMNS = `
  SELECT ns.nspname || '.' || cls.relname AS label
  FROM pg_attribute AS attribute JOIN pg_class AS cls ON cls.oid = attribute.attrelid JOIN pg_namespace AS ns ON ns.oid = cls.relnamespace
  WHERE attribute.attname LIKE '%expires\\_at' AND NOT attribute.attisdropped AND cls.relkind IN ('r', 'p')
    AND ns.nspname <> 'factory' AND ns.nspname <> 'information_schema' AND ns.nspname NOT LIKE 'pg\\_%'
  GROUP BY 1 ORDER BY 1`
// A table that holds an expiry column and is not removed from by iam.reap_expired, with the reason it does not need to be.
const DOES_NOT_EXPIRE = new Map()

const unanswered = async (connectionString) => {
  const answered = new Set((await query(connectionString, 'SELECT relation FROM iam.reap_expired($1, 0)', [NOW])).rows.map((row) => row.relation))
  return (await labels(connectionString, EXPIRING_COLUMNS)).filter((table) => !answered.has(table) && !DOES_NOT_EXPIRE.has(table))
}

test('every table with an expires_at column is answered for by the reaper, and a new one with no rule fails', async (t) => {
  const { connectionString } = await buildHubDatabase(t, 'conexus_reaper_coverage')
  assert.deepEqual(await unanswered(connectionString), [])
  await query(connectionString, 'CREATE TABLE iam.new_expiring_thing (id uuid PRIMARY KEY, session_expires_at timestamptz NOT NULL)')
  assert.deepEqual(await unanswered(connectionString), ['iam.new_expiring_thing'], 'a user table with an expiry and no rule')
  await query(connectionString, 'CREATE TABLE factory.mastra_storage_thing (id uuid PRIMARY KEY, expires_at timestamptz NOT NULL)')
  assert.deepEqual(await unanswered(connectionString), ['iam.new_expiring_thing'], "Mastra's own storage is not ours to expire")
})

test('one pass on a seeded database leaves no sign-in record past 24 hours and no open session past its limits, and the counts before and after are these', async (t) => {
  const db = await seeded(t, 'conexus_reaper_seeded')
  const { connectionString } = db
  const size = 120
  for (let i = 0; i < size; i += 1) {
    await db.transaction(`old-${i}`, 24 * HOUR + (i + 1) * MINUTE)
    await db.transaction(`recent-${i}`, 24 * HOUR - (i + 1) * MINUTE)
    await db.hubSession(`hub-expired-${i}`, { startedAgo: 8 * HOUR + (i + 1) * MINUTE })
    await db.hubSession(`hub-open-${i}`, { startedAgo: HOUR + i * MINUTE })
  }
  const measure = async () => (await query(connectionString, `
    SELECT (SELECT count(*)::int FROM iam.oidc_transaction) AS transactions,
           (SELECT count(*)::int FROM iam.oidc_transaction WHERE expires_at <= $1::timestamptz - interval '24 hours') AS transactions_past_24h,
           (SELECT count(*)::int FROM iam.host_session WHERE kind <> 'PREVIEW' AND ended_at IS NULL) AS open_sessions,
           (SELECT count(*)::int FROM iam.host_session WHERE kind <> 'PREVIEW' AND ended_at IS NULL AND (absolute_expires_at <= $1 OR idle_expires_at <= $1)) AS open_sessions_past_limit`, [NOW])).rows[0]
  const before = await measure()
  const pass = await reap(connectionString)
  const after = await measure()
  assert.deepEqual({ before, pass: { oidc: pass['iam.oidc_transaction:DELETED'], ended: pass['iam.host_session:ENDED'] }, after }, {
    before: { transactions: 240, transactions_past_24h: 120, open_sessions: 240, open_sessions_past_limit: 120 },
    pass: { oidc: 120, ended: 120 },
    after: { transactions: 120, transactions_past_24h: 0, open_sessions: 120, open_sessions_past_limit: 0 },
  })
})
