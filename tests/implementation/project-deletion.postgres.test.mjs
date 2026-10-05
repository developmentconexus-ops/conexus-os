import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { query } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { HEAD, ID, setupProjects } from './project-fixture.mjs'
import { waitUntilBlocked } from './race.mjs'

const { admitProject, isInstallationAdministrator } = await import(hubModuleUrl('identity-access/admission.js'))
const { createBuilderStore } = await import(hubModuleUrl('builder/store.js'))
const { purgeProjectBuilder } = await import(hubModuleUrl('builder/project-ports.js'))
const digest = (character) => character.repeat(64)
const remove = (store, accountId, projectId, confirmName = 'Atlas') => store.deleteProject({ accountId, projectId, confirmName })
const tombstones = async (connection) => (await query(connection, 'SELECT project_id, name, requested_by, purged_at IS NOT NULL AS purged, completed_at IS NOT NULL AS completed FROM project.project_deletion')).rows

const seedEverything = async (connection, projectId) => {
  await query(connection, `INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, idempotency_digest, base_source_revision, state, request_digest, conversation_id)
    VALUES ($1, $2, $3, $4, $5, 'SUCCEEDED', $6, $7)`, [randomUUID(), projectId, ID.owner, digest('1'), HEAD, digest('2'), projectId])
  await query(connection, "INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, 'atlas-app', $2)", [projectId, ID.owner])
  await query(connection, "INSERT INTO iam.application_invitation(invitation_id, project_id, email, invited_by, expires_at) VALUES ($1, $2, 'invitee@example.test', $3, clock_timestamp() + interval '1 day')", [randomUUID(), projectId, ID.owner])
  await query(connection, 'INSERT INTO iam.application_grant(project_id, account_id, granted_by) VALUES ($1, $2, $3)', [projectId, ID.outsider, ID.owner])
  const artifactId = randomUUID()
  const revisionId = randomUUID()
  await query(connection, "INSERT INTO reg.artifact(artifact_id, kind, semantic_name, project_id) VALUES ($1, 'application', 'atlas-app', $2)", [artifactId, projectId])
  await query(connection, "INSERT INTO reg.artifact_revision(artifact_revision_id, artifact_id, source_revision, digest, payload, availability) VALUES ($1, $2, $3, $4, '{}'::jsonb, 'AVAILABLE')", [revisionId, artifactId, HEAD, digest('3')])
  const previewId = randomUUID()
  const opened = new Date()
  await query(connection, `INSERT INTO iam.preview(preview_id, account_id, project_id, source_revision, artifact_revision_id, artifact_digest, exact_host, manifest, opened_at, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9::timestamptz + interval '15 minutes')`,
  [previewId, ID.owner, projectId, HEAD, revisionId, digest('3'), `preview-${revisionId}.example.test`, JSON.stringify({ entryPath: 'index.html', files: [] }), opened])
  const hub = randomBytes(32)
  await query(connection, `INSERT INTO iam.host_session(token_digest, kind, account_id, started_at, absolute_expires_at, provider_refresh_token, provider_checked_at, idle_expires_at)
    VALUES ($1, 'HUB', $2, $3, $3::timestamptz + interval '8 hours', 'mastra:factory-secret:v1:hub-token', $3, $3::timestamptz + interval '30 minutes')`, [hub, ID.owner, opened])
  await query(connection, "INSERT INTO iam.host_session(token_digest, kind, account_id, started_at, absolute_expires_at, preview_id, parent_digest) VALUES ($1, 'PREVIEW', $2, $3, $3::timestamptz + interval '10 minutes', $4, $5)", [randomBytes(32), ID.owner, opened, previewId, hub])
  await query(connection, `INSERT INTO iam.host_session(token_digest, kind, account_id, started_at, absolute_expires_at, project_id, provider_refresh_token, provider_checked_at)
    VALUES ($1, 'APPLICATION', $2, $3, $3::timestamptz + interval '8 hours', $4, 'mastra:factory-secret:v1:application-token', $3)`, [randomBytes(32), ID.outsider, opened, projectId])
  await query(connection, "INSERT INTO iam.handoff(handoff_digest, kind, account_id, preview_id, parent_digest, minted_at, expires_at) VALUES ($1, 'PREVIEW', $2, $3, $4, now(), now() + interval '30 seconds')", [randomBytes(32), ID.owner, previewId, hub])
  const connectionId = randomUUID()
  await query(connection, "INSERT INTO connector.connection(connection_id, workspace_id, connector_id, label, credential_sealed, credential_digest, created_by) VALUES ($1, $2, 'sankhya', 'ERP', 'mastra:factory-secret:v1:connection', $3, $4)", [connectionId, ID.workspace, digest('4'), ID.owner])
  await query(connection, "INSERT INTO connector.project_binding(workspace_id, project_id, environment, connection_id, name, bound_by) VALUES ($1, $2, 'preview', $3, 'erp', $4)", [ID.workspace, projectId, connectionId, ID.owner])
  for (const accountId of [ID.owner, ID.member]) {
    await query(connection, `INSERT INTO platform.operation_receipt(operation_id, authority, account_id, key_digest, request_digest, resource_id, state)
      VALUES ('PRJ-03', $1, $2, $3, $3, $4, 'reserved')`, [`workspace:${ID.workspace}:account:${accountId}`, accountId, randomBytes(32), projectId])
  }
  return { artifactId, previewId, hub, connectionId }
}

const counts = async (connection, projectId, { artifactId, previewId }) => (await query(connection, `SELECT
  (SELECT count(*)::integer FROM project.project WHERE project_id = $1) AS project,
  (SELECT count(*)::integer FROM builder.project_working_state WHERE project_id = $1) AS working_state,
  (SELECT count(*)::integer FROM builder.project_repository WHERE project_id = $1) AS repository,
  (SELECT count(*)::integer FROM builder.builder_run WHERE project_id = $1) AS run,
  (SELECT count(*)::integer FROM iam.application WHERE project_id = $1) AS application,
  (SELECT count(*)::integer FROM iam.application_invitation WHERE project_id = $1) AS invitation,
  (SELECT count(*)::integer FROM iam.application_grant WHERE project_id = $1) AS grant_row,
  (SELECT count(*)::integer FROM reg.artifact WHERE project_id = $1) AS artifact,
  (SELECT count(*)::integer FROM reg.artifact_revision WHERE artifact_id = $2) AS revision,
  (SELECT count(*)::integer FROM iam.preview WHERE project_id = $1) AS preview,
  (SELECT count(*)::integer FROM iam.host_session WHERE project_id = $1 OR preview_id = $3) AS host_session,
  (SELECT count(*)::integer FROM iam.handoff WHERE preview_id = $3) AS handoff,
  (SELECT count(*)::integer FROM connector.project_binding WHERE project_id = $1) AS binding,
  (SELECT count(*)::integer FROM platform.operation_receipt WHERE resource_id = $1) AS receipts`, [projectId, artifactId, previewId])).rows[0]

test('deleting a project clears every row that names it across the schemas and keeps what is not the project', async (t) => {
  const { connection, store, seedProject, events } = await setupProjects(t, 'conexus_prj_purge')
  const projectId = await seedProject('Atlas')
  const seeded = await seedEverything(connection, projectId)
  const full = { project: 1, working_state: 1, repository: 1, run: 1, application: 1, invitation: 1, grant_row: 1, artifact: 1, revision: 1, preview: 1, host_session: 2, handoff: 1, binding: 1, receipts: 2 }
  assert.deepEqual(await counts(connection, projectId, seeded), full)

  await remove(store, ID.administrator, projectId)

  assert.deepEqual(await counts(connection, projectId, seeded), Object.fromEntries(Object.keys(full).map((key) => [key, 0])))
  assert.deepEqual(events, ['release', 'kill', 'repository'])
  assert.deepEqual(await tombstones(connection), [{ project_id: projectId, name: 'Atlas', requested_by: ID.administrator, purged: true, completed: true }])
  assert.equal((await query(connection, 'SELECT count(*)::integer AS count FROM connector.connection WHERE connection_id = $1', [seeded.connectionId])).rows[0].count, 1)
  assert.equal((await query(connection, 'SELECT count(*)::integer AS count FROM iam.host_session WHERE token_digest = $1', [seeded.hub])).rows[0].count, 1)
})

test('only an installation administrator deletes, a non member administrator included, with the exact name and an idle project', async (t) => {
  const { connection, store, seedProject, settleRun } = await setupProjects(t, 'conexus_prj_delete')
  const projectId = await seedProject('Atlas')
  await assert.rejects(remove(store, ID.owner, projectId), { id: 'PROJECT_DELETE_DENIED' })
  await assert.rejects(remove(store, ID.outsider, projectId), { id: 'PROJECT_DELETE_DENIED' })
  await assert.rejects(remove(store, ID.administrator, projectId, 'atlas'), { id: 'PROJECT_NAME_MISMATCH' })
  await assert.rejects(remove(store, ID.administrator, randomUUID()), { id: 'PROJECT_NOT_FOUND' })
  await settleRun(projectId, 'RUNNING')
  await assert.rejects(remove(store, ID.administrator, projectId), { id: 'PROJECT_BUSY' })
  assert.deepEqual(await tombstones(connection), [])
  await query(connection, "UPDATE builder.builder_run SET state = 'SUCCEEDED' WHERE project_id = $1", [projectId])
  await remove(store, ID.administrator, projectId)
  assert.deepEqual((await tombstones(connection)).map((row) => row.completed), [true])
  await remove(store, ID.administrator, projectId)
  await assert.rejects(remove(store, ID.administrator, projectId, 'Other'), { id: 'PROJECT_NAME_MISMATCH' })
})

test('a deletion that fails after the purge resumes on retry, and a crash inside the purge purges nothing', async (t) => {
  const failing = { repository: 0 }
  const fixture = await setupProjects(t, 'conexus_prj_resume')
  const { connection, database, seedProject } = fixture
  const { createProjectDeletion } = await import(hubModuleUrl('project/deletion.js'))
  const { purgeProjectBindings } = await import(hubModuleUrl('connectors/store.js'))
  const ports = { releaseApplicationData: async () => undefined, killSandboxes: async () => undefined, deleteRepository: async () => { if (failing.repository++ === 0) throw new Error('GITHUB_DOWN') }, purgeConnectorBindings: purgeProjectBindings, purgeBuilder: purgeProjectBuilder }
  const deletion = createProjectDeletion({ database, ports })
  const projectId = await seedProject('Atlas')
  const seeded = await seedEverything(connection, projectId)

  await query(connection, 'REVOKE EXECUTE ON FUNCTION reg.purge_project(uuid) FROM hub_command')
  await assert.rejects(deletion.deleteProject({ accountId: ID.administrator, projectId, confirmName: 'Atlas' }), { id: 'PROJECT_DELETION_INCOMPLETE' })
  assert.deepEqual((await counts(connection, projectId, seeded)).project, 1)
  assert.deepEqual((await counts(connection, projectId, seeded)).application, 1)
  assert.deepEqual((await tombstones(connection)).map((row) => [row.purged, row.completed]), [[false, false]])

  await query(connection, 'GRANT EXECUTE ON FUNCTION reg.purge_project(uuid) TO hub_command')
  await assert.rejects(deletion.deleteProject({ accountId: ID.administrator, projectId, confirmName: 'Atlas' }), { id: 'PROJECT_DELETION_INCOMPLETE' })
  assert.deepEqual((await tombstones(connection)).map((row) => [row.purged, row.completed]), [[true, false]])
  await deletion.deleteProject({ accountId: ID.administrator, projectId, confirmName: 'Atlas' })
  assert.deepEqual((await tombstones(connection)).map((row) => [row.purged, row.completed]), [[true, true]])
})

test('the purge refuses a project that has no tombstone', async (t) => {
  const { deletion, seedProject } = await setupProjects(t, 'conexus_prj_notstarted')
  const projectId = await seedProject('Atlas')
  await assert.rejects(deletion.purge(projectId), (error) => error.id === 'INTERNAL_UNEXPECTED' && error.details.invariant === 'PROJECT_DELETION_NOT_STARTED')
})

test('two concurrent deletions of one project leave one tombstone and no deadlock', async (t) => {
  const { connection, store, seedProject } = await setupProjects(t, 'conexus_prj_twice')
  const projectId = await seedProject('Atlas')
  const outcomes = await Promise.allSettled([ID.administrator, ID.memberAdministrator].map((accountId) => remove(store, accountId, projectId)))
  assert.deepEqual(outcomes.map((outcome) => outcome.status), ['fulfilled', 'fulfilled'])
  assert.equal((await tombstones(connection)).length, 1)
})

const hold = async (connection, onCleanup) => {
  const client = new pg.Client(connection)
  await client.connect()
  onCleanup(() => client.end().catch(() => undefined))
  return client
}
const pending = (promise) => {
  const state = { settled: false }
  promise.then(() => { state.settled = true }, () => { state.settled = true })
  return state
}

test('a deactivation waits for the tombstone, or commits first and the deletion is refused', async (t) => {
  const { connection, store, seedProject, onCleanup } = await setupProjects(t, 'conexus_prj_deactivate')
  const first = await seedProject('Atlas')
  const holder = await hold(connection, onCleanup)
  await holder.query('BEGIN')
  await holder.query('SELECT 1 FROM project.project WHERE project_id = $1 FOR UPDATE', [first])
  const deletion = remove(store, ID.administrator, first)
  const state = pending(deletion)
  await waitUntilBlocked(connection)
  const deactivation = query(connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [ID.administrator])
  const deactivated = pending(deactivation)
  await waitUntilBlocked(connection, { count: 2 })
  assert.equal(state.settled, false)
  assert.equal(deactivated.settled, false)
  await holder.query('COMMIT')
  await Promise.all([deletion, deactivation])
  assert.equal((await tombstones(connection)).length, 1)

  const second = await seedProject('Atlas')
  await assert.rejects(remove(store, ID.administrator, second), { id: 'PROJECT_DELETE_DENIED' })
})

test('admitProject admits a member, refuses an outsider and a tombstoned project, and refuses a system transaction', async (t) => {
  const { connection, database, seedProject } = await setupProjects(t, 'conexus_prj_admit')
  const projectId = await seedProject('Atlas')
  const admit = (accountId, action = 'project.build') => database.transaction(accountId, (gate) => admitProject(gate, projectId, action))
  assert.equal((await admit(ID.member)).scope.workspaceId, ID.workspace)
  assert.equal((await database.read(ID.member, (tx) => admitProject(tx, projectId, 'project.read'))).scope.kind, 'project')
  await assert.rejects(admit(ID.outsider), { id: 'PROJECT_BUILD_DENIED' })
  await assert.rejects(admit(ID.administrator), { id: 'PROJECT_BUILD_DENIED' })
  await assert.rejects(database.system('project-purge', (gate) => admitProject(gate, projectId, 'project.build')), { id: 'INTERNAL_UNEXPECTED', details: { invariant: 'GATE_ACTOR_REFUSED' } })
  await query(connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [ID.owner])
  await assert.rejects(admit(ID.owner), { id: 'ACCOUNT_INACTIVE' })
  await query(connection, `INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Atlas', $3)`, [projectId, ID.workspace, ID.administrator])
  await assert.rejects(admit(ID.member), { id: 'PROJECT_BUILD_DENIED' })
  await assert.rejects(admit(ID.memberAdministrator), { id: 'PROJECT_BUILD_DENIED' })
})

test('a tombstone waits for an admitted writer in either order, with no deadlock', async (t) => {
  const { connection, database, store, seedProject, onCleanup } = await setupProjects(t, 'conexus_prj_orders')
  const projectId = await seedProject('Atlas')
  let release
  const held = new Promise((resolve) => { release = resolve })
  let admitted
  const entered = new Promise((resolve) => { admitted = resolve })
  const writer = database.transaction(ID.member, async (gate) => {
    await admitProject(gate, projectId, 'project.build')
    admitted()
    await held
  })
  await entered
  const deletion = remove(store, ID.administrator, projectId)
  const state = pending(deletion)
  await waitUntilBlocked(connection)
  assert.equal(state.settled, false)
  release()
  await Promise.all([writer, deletion])
  assert.equal((await tombstones(connection)).length, 1)

  const other = await seedProject('Atlas')
  const holder = await hold(connection, onCleanup)
  await holder.query('BEGIN')
  await holder.query('SELECT 1 FROM project.project WHERE project_id = $1 FOR UPDATE', [other])
  await holder.query(`INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Atlas', $3)`, [other, ID.workspace, ID.administrator])
  const admission = database.transaction(ID.member, (gate) => admitProject(gate, other, 'project.build'))
  const admissionState = pending(admission)
  admission.catch(() => undefined)
  await waitUntilBlocked(connection)
  assert.equal(admissionState.settled, false)
  await holder.query('COMMIT')
  await assert.rejects(admission, { id: 'PROJECT_BUILD_DENIED' })
})

test('a deletion and a run start serialize in both orders without a deadlock', { timeout: 30_000 }, async (t) => {
  const { connection, database, store, seedProject, onCleanup } = await setupProjects(t, 'conexus_prj_runstart')
  const builder = createBuilderStore({ database, ownerId: randomUUID() })
  const start = (projectId, readBase = async () => HEAD) => builder.createBuilderRun({ accountId: ID.member, projectId, conversationId: '33333333-3333-4333-8333-333333333333', idempotencyKey: randomUUID(), content: 'pedido', readBase })
  const first = await seedProject('Atlas')
  let release
  const held = new Promise((resolve) => { release = resolve })
  let entered
  const reading = new Promise((resolve) => { entered = resolve })
  const starting = start(first, async () => { entered(); await held; return HEAD })
  await reading
  const racing = remove(store, ID.administrator, first)
  const racingState = pending(racing)
  racing.catch(() => undefined)
  await waitUntilBlocked(connection)
  assert.equal(racingState.settled, false, 'the deletion waits for the run start that holds the Project')
  release()
  assert.equal((await starting).state, 'QUEUED')
  await assert.rejects(racing, { id: 'PROJECT_BUSY' })
  assert.deepEqual(await tombstones(connection), [], 'the refused deletion leaves no tombstone')

  const second = await seedProject('Atlas')
  const tombstoning = await hold(connection, onCleanup)
  await tombstoning.query('BEGIN')
  await tombstoning.query('SELECT 1 FROM project.project WHERE project_id = $1 FOR UPDATE', [second])
  await tombstoning.query(`INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Atlas', $3)`, [second, ID.workspace, ID.administrator])
  const refused = start(second)
  const refusedState = pending(refused)
  refused.catch(() => undefined)
  await waitUntilBlocked(connection)
  assert.equal(refusedState.settled, false, 'the run start waits for the uncommitted tombstone')
  await tombstoning.query('COMMIT')
  await assert.rejects(refused, { id: 'PROJECT_BUILD_DENIED' })
})

test('isInstallationAdministrator is true for an active account with an open tenure and for nobody else', async (t) => {
  const { connection, database } = await setupProjects(t, 'conexus_is_administrator')
  const answers = async () => Object.fromEntries(await Promise.all([['administrator', ID.administrator], ['memberAdministrator', ID.memberAdministrator], ['member', ID.member], ['outsider', ID.outsider]]
    .map(async ([name, accountId]) => [name, await database.read(accountId, (tx) => isInstallationAdministrator(tx))])))
  assert.deepEqual(await answers(), { administrator: true, memberAdministrator: true, member: false, outsider: false })
  await query(connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [ID.administrator])
  await query(connection, 'UPDATE iam.installation_administrator SET revoked_at = now(), revoked_by = $2 WHERE account_id = $1', [ID.memberAdministrator, ID.administrator])
  assert.deepEqual(await answers(), { administrator: false, memberAdministrator: false, member: false, outsider: false })
})
