import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { ID } from './project-fixture.mjs'
import { OTHER_OWNER, OWNER, setupBuilder } from './builder-fixture.mjs'
import { waitUntilBlocked } from './race.mjs'

const { admitProject, admitRun } = await import(hubModuleUrl('identity-access/admission.js'))

const asExecutor = (database, builderRunId, owner = OWNER) => database.system('builder-executor', (gate) => admitRun(gate, builderRunId, { ownerId: owner }))
const asAccount = (database, accountId, builderRunId, owner = OWNER) => database.transaction(accountId, (gate) => admitRun(gate, builderRunId, { ownerId: owner }))
const pending = (promise) => {
  const state = { settled: false }
  promise.then(() => { state.settled = true }, () => { state.settled = true })
  return state
}

test('admitRun admits the run through the executor and through its author, and records the path', async (t) => {
  const { database, seedBuilderProject, seedRun } = await setupBuilder(t, 'conexus_admit_run')
  const projectId = await seedBuilderProject()
  const builderRunId = await seedRun(projectId)
  const executor = await asExecutor(database, builderRunId)
  assert.deepEqual(executor.scope, { kind: 'run', builderRunId, accountId: ID.owner, projectId, owner: { ownerId: OWNER }, via: 'executor' })
  const author = await asAccount(database, ID.owner, builderRunId)
  assert.deepEqual(author.scope, { kind: 'run', builderRunId, accountId: ID.owner, projectId, owner: { ownerId: OWNER }, via: 'account' })
  const queued = await seedRun(await seedBuilderProject('Zeta'), { state: 'QUEUED' })
  await assert.rejects(asExecutor(database, queued), { id: 'BUILDER_RUN_NOT_ADMITTED' })
})

test('admitRun refuses a missing run, another owner, an ended run and another account', async (t) => {
  const { database, seedBuilderProject, seedRun } = await setupBuilder(t, 'conexus_admit_run_refused')
  const projectId = await seedBuilderProject()
  const builderRunId = await seedRun(projectId)
  const notAdmitted = { id: 'BUILDER_RUN_NOT_ADMITTED' }
  await assert.rejects(asExecutor(database, randomUUID()), notAdmitted)
  await assert.rejects(asExecutor(database, builderRunId, OTHER_OWNER), notAdmitted)
  await assert.rejects(asAccount(database, ID.owner, builderRunId, OTHER_OWNER), notAdmitted)
  await assert.rejects(asAccount(database, ID.member, builderRunId), notAdmitted)
  await assert.rejects(asAccount(database, ID.outsider, builderRunId), notAdmitted)
  const ended = await seedRun(await seedBuilderProject('Zeta'), { state: 'SUCCEEDED' })
  await assert.rejects(asExecutor(database, ended), notAdmitted)
  await assert.rejects(asAccount(database, ID.owner, ended), notAdmitted)
})

test('an author who lost the Project or became inactive is refused on the account path, and still admitted by the executor', async (t) => {
  const { connection, database, seedBuilderProject, seedRun } = await setupBuilder(t, 'conexus_admit_run_revoked')
  const projectId = await seedBuilderProject()
  const builderRunId = await seedRun(projectId, { accountId: ID.member })
  await query(connection, 'DELETE FROM iam.workspace_membership WHERE account_id = $1', [ID.member])
  await assert.rejects(asAccount(database, ID.member, builderRunId), { id: 'PROJECT_BUILD_DENIED' })
  assert.equal((await asExecutor(database, builderRunId)).scope.via, 'executor')
  await query(connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'member')", [ID.member, ID.workspace])
  await query(connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [ID.member])
  await assert.rejects(asAccount(database, ID.member, builderRunId), { id: 'ACCOUNT_INACTIVE' })
  assert.deepEqual((await asExecutor(database, builderRunId)).scope,
    { kind: 'run', builderRunId, accountId: ID.member, projectId, owner: { ownerId: OWNER }, via: 'executor' })
})

test('admitProject on a system gate and admitRun on another job gate are refused', async (t) => {
  const { database, seedBuilderProject, seedRun } = await setupBuilder(t, 'conexus_admit_run_gates')
  const projectId = await seedBuilderProject()
  const builderRunId = await seedRun(projectId)
  const refused = { id: 'INTERNAL_UNEXPECTED', details: { invariant: 'GATE_ACTOR_REFUSED' } }
  await assert.rejects(database.system('builder-executor', (gate) => admitProject(gate, projectId, 'project.build')), refused)
  await assert.rejects(database.system('project-purge', (gate) => admitRun(gate, builderRunId, { ownerId: OWNER })), refused)
})

test('a project in deletion is refused to both paths, and an admission that waited on the tombstone is refused', async (t) => {
  const { connection, database, seedBuilderProject, seedRun, onCleanup } = await setupBuilder(t, 'conexus_admit_run_tombstone')
  const projectId = await seedBuilderProject()
  const builderRunId = await seedRun(projectId)
  const holder = new pg.Client(connection)
  await holder.connect()
  onCleanup(() => holder.end().catch(() => undefined))
  await holder.query('BEGIN')
  await holder.query('SELECT 1 FROM project.project WHERE project_id = $1 FOR UPDATE', [projectId])
  await holder.query("INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Atlas', $3)", [projectId, ID.workspace, ID.administrator])
  const waiting = asExecutor(database, builderRunId)
  const state = pending(waiting)
  waiting.catch(() => undefined)
  await waitUntilBlocked(connection)
  assert.equal(state.settled, false)
  await holder.query('COMMIT')
  await assert.rejects(waiting, { id: 'BUILDER_RUN_NOT_ADMITTED' })
  await assert.rejects(asAccount(database, ID.owner, builderRunId), { id: 'BUILDER_RUN_NOT_ADMITTED' })
})

test('the wall admits a run row lock and refuses a column no grant covers', async (t) => {
  const { connection, seedBuilderProject, seedRun } = await setupBuilder(t, 'conexus_admit_run_grants')
  const projectId = await seedBuilderProject()
  const builderRunId = await seedRun(projectId)
  const refusedCode = async (statement, values) => {
    const client = new pg.Client(connection)
    await client.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL ROLE hub_command')
      await client.query(statement, values)
      return null
    } catch (error) { return error.code } finally { await client.query('ROLLBACK'); await client.end() }
  }
  assert.equal(await refusedCode('UPDATE builder.builder_run SET project_id = $1 WHERE builder_run_id = $2', [randomUUID(), builderRunId]), '42501')
  assert.equal(await refusedCode('UPDATE builder.builder_run SET account_id = $1 WHERE builder_run_id = $2', [ID.member, builderRunId]), '42501')
  assert.equal(await refusedCode('SELECT 1 FROM builder.builder_run WHERE builder_run_id = $1 FOR UPDATE', [builderRunId]), null)
  assert.equal(await refusedCode('SELECT 1 FROM builder.builder_run WHERE builder_run_id = $1 FOR SHARE', [builderRunId]), null)
  assert.equal(await refusedCode('UPDATE builder.project_working_state SET project_id = $1 WHERE project_id = $2', [randomUUID(), projectId]), '42501')
  assert.equal(await refusedCode("INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, idempotency_digest, request_digest, base_source_revision) VALUES ($1, $2, $3, gen_random_uuid(), $4, $5, $6)",
    [randomUUID(), await seedBuilderProject('Zeta'), randomUUID(), 'a'.repeat(64), 'b'.repeat(64), 'c'.repeat(40)]), '23503')
})
