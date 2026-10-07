import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { takeHubLogs } from './hub-log-capture.mjs'
import { query } from './hub-database.mjs'
import { ID, setupProjects } from './project-fixture.mjs'

const { sql } = await import(hubModuleUrl('platform/db.js'))
const { admitAccount, admitApplication, admitInstallationAdministrator, admitProject, admitWorkspace, checkApplication } = await import(hubModuleUrl('identity-access/admission.js'))
const { logFailure, toFailure } = await import(hubModuleUrl('platform/failure.js'))
const { logger } = await import(hubModuleUrl('platform/logger.js'))
const { failureProblem } = await import(hubModuleUrl('http/problem.js'))

const refusal = async (attempt) => {
  try { await attempt() } catch (error) { return { id: error.id, refusal: error.details?.refusal } }
  return 'admitted'
}

test('an admission refusal carries its reason in the log details only, never in the response', async (t) => {
  const { connection, database, seedProject } = await setupProjects(t, 'conexus_refusal_reason')
  const projectId = await seedProject('Atlas')
  await query(connection, 'INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, $2, $3)', [projectId, 'atlas', ID.owner])
  const tx = (accountId, fn) => database.transaction(accountId, fn)
  assert.deepEqual(await refusal(() => tx(ID.outsider, (gate) => admitWorkspace(gate, { workspaceId: ID.workspace, action: 'workspace.read' }))), { id: 'WORKSPACE_NOT_FOUND', refusal: 'OUTSIDER' })
  assert.deepEqual(await refusal(() => tx(ID.member, (gate) => admitWorkspace(gate, { workspaceId: ID.workspace, action: 'members.manage' }))), { id: 'MEMBERS_MANAGE_REQUIRED', refusal: 'FORBIDDEN' })
  assert.deepEqual(await refusal(() => tx(ID.outsider, (gate) => admitProject(gate, { projectId, action: 'project.read' }))), { id: 'PROJECT_NOT_FOUND', refusal: 'OUTSIDER' })
  assert.deepEqual(await refusal(() => tx(ID.member, (gate) => admitProject(gate, { projectId, action: 'project.delete' }))), { id: 'PROJECT_DELETE_DENIED', refusal: 'FORBIDDEN' })
  assert.deepEqual(await refusal(() => tx(ID.outsider, (gate) => admitInstallationAdministrator(gate, { action: 'connection.manage', workspaceId: ID.workspace }))), { id: 'INSTALLATION_ADMINISTRATOR_REQUIRED', refusal: 'OUTSIDER' })
  assert.deepEqual(await refusal(() => tx(ID.outsider, (gate) => admitApplication(gate, projectId))), { id: 'APPLICATION_NOT_FOUND', refusal: 'OUTSIDER' })
  assert.deepEqual(await refusal(() => tx(ID.outsider, (gate) => checkApplication(gate, projectId))), { id: 'APPLICATION_NOT_FOUND', refusal: 'OUTSIDER' })
  await query(connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [ID.administrator])
  assert.deepEqual(await refusal(() => tx(ID.administrator, (gate) => admitInstallationAdministrator(gate, { action: 'administrators.manage' }))), { id: 'INSTALLATION_ADMINISTRATOR_REQUIRED', refusal: 'INACTIVE' })
  await query(connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [ID.member])
  assert.deepEqual(await refusal(() => tx(ID.member, (gate) => admitApplication(gate, projectId))), { id: 'APPLICATION_NOT_FOUND', refusal: 'INACTIVE' })
  await query(connection, 'UPDATE iam.account SET active = true WHERE account_id = $1', [ID.member])
  await query(connection, "INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Atlas', $3)", [projectId, ID.workspace, ID.administrator])
  assert.deepEqual(await refusal(() => tx(ID.member, (gate) => admitProject(gate, { projectId, action: 'project.build' }))), { id: 'PROJECT_DELETING', refusal: 'TOMBSTONE' })
  assert.deepEqual(await refusal(() => tx(ID.member, (gate) => admitApplication(gate, projectId))), { id: 'APPLICATION_NOT_FOUND', refusal: 'TOMBSTONE' })

  const failure = await tx(ID.member, (gate) => checkApplication(gate, projectId)).catch(toFailure)
  takeHubLogs()
  logFailure(logger, failure)
  assert.deepEqual(takeHubLogs().map(({ level, message, fields }) => ({ level, message, refusal: fields['failure.details.refusal'] })), [{ level: 'info', message: 'APPLICATION_NOT_FOUND', refusal: 'TOMBSTONE' }])
  assert.deepEqual(failureProblem(failure), { type: 'urn:conexus:problem:APPLICATION_NOT_FOUND', title: 'APPLICATION_NOT_FOUND', status: 404, code: 'APPLICATION_NOT_FOUND' })
})

test('a database error logs its SQLSTATE, constraint and table, and a refused column logs 42501 in its stack', async (t) => {
  const { database } = await setupProjects(t, 'conexus_database_error_log')
  const refused = await database.transaction(ID.owner, async (gate) => (await admitAccount(gate)).tx.run(sql`UPDATE iam.account SET active = false WHERE account_id = ${ID.owner}`)).catch((error) => error)
  assert.equal(refused.id, 'INTERNAL_UNEXPECTED')
  assert.equal(refused.details.sqlstate, '42501')
  takeHubLogs()
  logFailure(logger, refused)
  const [record] = takeHubLogs()
  assert.equal(record.level, 'error')
  assert.equal(record.fields['failure.details.sqlstate'], '42501')
  assert.match(record.fields['exception.stacktrace'], /^error \(42501\)\n/)

  const orphan = await database.transaction(ID.owner, async (gate) => (await admitAccount(gate)).tx.run(sql`INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES (${ID.owner}, ${'20000000-0000-4000-8000-0000000000ff'}, 'owner')`)).catch((error) => error)
  assert.deepEqual({ id: orphan.id, ...orphan.details }, { id: 'WORKSPACE_NOT_FOUND', sqlstate: '23503', constraint: 'workspace_membership_workspace_id_fkey', table: 'workspace_membership' })
})

test('a SQL function that raises a failure row code is a fault nobody named: no RAISE names a row since spec 0015', async (t) => {
  const { connection, database } = await setupProjects(t, 'conexus_raised_row')
  await query(connection, `CREATE FUNCTION platform.raise_row(p_code text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '%', p_code; END $$;
    GRANT EXECUTE ON FUNCTION platform.raise_row(text) TO hub_command`)
  const raise = (code) => database.transaction(ID.owner, async (gate) => (await admitAccount(gate)).tx.run(sql`SELECT platform.raise_row(${code})`)).catch((error) => error)
  const named = await raise('PROJECT_NOT_FOUND')
  assert.deepEqual({ id: named.id, sqlstate: named.details.sqlstate }, { id: 'INTERNAL_UNEXPECTED', sqlstate: 'P0001' })
})
