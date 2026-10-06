import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { P, W, captureLines, digestOf, iamHub } from './iam-fixture.mjs'
import { ID, setupProjects } from './project-fixture.mjs'
import { query } from './hub-database.mjs'

const { reapExpired } = await import(hubModuleUrl('identity-access/expiry.js'))
const OWNER = '10000000-0000-4000-8000-000000000001'

test('two reaper passes in parallel take disjoint batches; a third takes the rest; each pass logs one line per rule', async (t) => {
  const hub = await iamHub(t, 'conexus_iam_reaper')
  await hub.seedAccount(OWNER)
  await hub.seedWorkspace(W, 'Operações', [[OWNER, 'owner']])
  await hub.seedProject(P, W, 'Estoque Parado')
  await hub.sql(`INSERT INTO iam.handoff (handoff_digest, kind, account_id, project_id, binding_digest, provider_refresh_token, minted_at, expires_at)
    SELECT sha256(convert_to(n::text, 'UTF8')), 'APPLICATION', $1, $2, sha256('binding'), 'mastra:factory-secret:v1:x', now() - interval '2 minutes', now() - interval '1 minute'
    FROM generate_series(1, 1200) AS n`, [OWNER, P])
  const lines = captureLines(t)
  const passes = await Promise.all([reapExpired(hub.database, 500), reapExpired(hub.database, 500)])
  const handoffs = passes.map((pass) => pass.find((rule) => rule.table === 'handoff').removed)
  assert.deepEqual(handoffs, [500, 500])
  assert.equal((await hub.sql('SELECT count(*)::int AS n FROM iam.handoff'))[0].n, 200)
  assert.equal((await reapExpired(hub.database, 500)).find((rule) => rule.table === 'handoff').removed, 200)
  assert.deepEqual(lines.of('IAM_REAPED').slice(0, 5).map((fields) => fields.table).sort(), ['application_invitation', 'handoff', 'host_session', 'oidc_transaction', 'workspace_invitation'])
  assert.equal(lines.of('IAM_REAPED').length, 15)
})

test('an invitation shows EXPIRED for 30 days after its expiry, then a pass deletes it; expired sessions and states go at their deadline', async (t) => {
  const hub = await iamHub(t, 'conexus_iam_reaper_rules')
  await hub.seedAccount(OWNER)
  await hub.seedWorkspace(W, 'Operações', [[OWNER, 'owner']])
  const invite = (email, days) => hub.sql(`INSERT INTO iam.workspace_invitation (invitation_id, workspace_id, email, role, invited_by, created_at, expires_at)
    VALUES (gen_random_uuid(), $1, $2, 'member', $3, now() - make_interval(days => $4 + 14), now() - make_interval(days => $4))`, [W, email, OWNER, days])
  await invite('recent@x.com', 29)
  await invite('old@x.com', 31)
  const live = await hub.openHubSession(OWNER)
  const idle = await hub.openHubSession(OWNER)
  await hub.sql("UPDATE iam.host_session SET idle_expires_at = now() - interval '1 second' WHERE token_digest = $1", [digestOf(idle)])
  await hub.sql("INSERT INTO iam.oidc_transaction (state_digest, pkce_verifier, nonce, expires_at) VALUES (sha256('late'), 'v', 'n', now() - interval '1 second'), (sha256('open'), 'v', 'n', now() + interval '1 minute')")
  const removed = Object.fromEntries((await reapExpired(hub.database)).map((rule) => [rule.table, rule.removed]))
  assert.deepEqual(removed, { handoff: 0, host_session: 1, oidc_transaction: 1, workspace_invitation: 1, application_invitation: 0 })
  assert.deepEqual(await hub.sql('SELECT email, expires_at > now() AS open FROM iam.workspace_invitation'), [{ email: 'recent@x.com', open: false }])
  assert.equal((await hub.sql('SELECT count(*)::int AS n FROM iam.host_session WHERE token_digest = $1', [digestOf(live)]))[0].n, 1)
})

test('the purge of a deleted Project leaves no identity row of it', async (t) => {
  const { connection, deletion, seedProject } = await setupProjects(t, 'conexus_iam_purge')
  const projectId = await seedProject('Estoque Parado')
  const hubToken = 'h'.repeat(43)
  await query(connection, "INSERT INTO iam.application (project_id, slug, created_by) VALUES ($1, 'estoque-parado', $2)", [projectId, ID.owner])
  await query(connection, 'INSERT INTO iam.application_grant (project_id, account_id, granted_by) VALUES ($1, $2, $3)', [projectId, ID.outsider, ID.owner])
  await query(connection, "INSERT INTO iam.application_invitation (invitation_id, project_id, email, invited_by, expires_at) VALUES (gen_random_uuid(), $1, 'ana@x.com', $2, now() + interval '1 day')", [projectId, ID.owner])
  await query(connection, "INSERT INTO iam.oidc_transaction (state_digest, pkce_verifier, nonce, expires_at, application_project_id, sign_in_binding_digest) VALUES (sha256('s'), 'v', 'n', now() + interval '1 minute', $1, sha256('b'))", [projectId])
  await query(connection, `INSERT INTO iam.host_session (token_digest, kind, account_id, started_at, absolute_expires_at, idle_expires_at, provider_refresh_token, provider_checked_at)
    VALUES ($1, 'HUB', $2, now(), now() + interval '8 hours', now() + interval '30 minutes', 'mastra:factory-secret:v1:x', now())`, [digestOf(hubToken), ID.owner])
  await query(connection, `INSERT INTO iam.host_session (token_digest, kind, account_id, started_at, absolute_expires_at, project_id, artifact_revision_id, parent_digest)
    VALUES (sha256('preview'), 'PREVIEW', $1, now(), now() + interval '15 minutes', $2, $3, $4)`, [ID.owner, projectId, randomUUID(), digestOf(hubToken)])
  await query(connection, `INSERT INTO iam.handoff (handoff_digest, kind, account_id, project_id, binding_digest, provider_refresh_token, minted_at, expires_at)
    VALUES (sha256('handoff'), 'APPLICATION', $1, $2, sha256('b'), 'mastra:factory-secret:v1:x', now(), now() + interval '1 minute')`, [ID.outsider, projectId])
  const counts = async () => Object.fromEntries(await Promise.all([
    ['application', 'project_id'], ['application_grant', 'project_id'], ['application_invitation', 'project_id'],
    ['oidc_transaction', 'application_project_id'], ['host_session', 'project_id'], ['handoff', 'project_id'],
  ].map(async ([table, column]) => [table, (await query(connection, `SELECT count(*)::int AS n FROM iam.${table} WHERE ${column} = $1`, [projectId])).rows[0].n])))
  assert.deepEqual(await counts(), { application: 1, application_grant: 1, application_invitation: 1, oidc_transaction: 1, host_session: 1, handoff: 1 })
  await deletion.deleteProject({ accountId: ID.administrator, projectId, confirmName: 'Estoque Parado' })
  assert.deepEqual(await counts(), { application: 0, application_grant: 0, application_invitation: 0, oidc_transaction: 0, host_session: 0, handoff: 0 })
  assert.equal((await query(connection, "SELECT count(*)::int AS n FROM iam.host_session WHERE kind = 'HUB'")).rows[0].n, 1)
})
