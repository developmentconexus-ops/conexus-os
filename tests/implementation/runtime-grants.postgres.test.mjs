import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { setupConnectors } from './connector-fixture.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { ID } from './project-fixture.mjs'

const { sql } = await import(hubModuleUrl('platform/db.js'))
const { admitAccount } = await import(hubModuleUrl('identity-access/admission.js'))

const CREDENTIAL = Object.freeze({ clientId: 'client-a', clientSecret: 'secret-a', xToken: 'token-a' })
const sqlstate = (code) => (error) => error.id === 'INTERNAL_UNEXPECTED' && error.cause?.code === code

test('the runtime role can change only the columns its grants name on the Connector tables', async (t) => {
  const { database, addConnection, bind, seedProject } = await setupConnectors(t, 'conexus_runtime_grants_connector')
  const projectId = await seedProject('Atlas')
  const erp = await addConnection('sankhya', 'ERP A', CREDENTIAL)
  await bind(projectId, erp, 'erp')
  const run = (text) => database.transaction(ID.owner, async (gate) => (await admitAccount(gate)).tx.run(sql(Object.assign([text], { raw: [text] }))))
  for (const column of ['workspace_id', 'connection_id', 'connector_id', 'label', 'created_by', 'credential_sealed', 'credential_digest']) {
    await assert.rejects(run(`UPDATE connector.connection SET ${column} = ${column}`), sqlstate('42501'), `connection ${column}`)
  }
  for (const column of ['project_id', 'workspace_id', 'connection_id', 'bound_by', 'name']) {
    await assert.rejects(run(`UPDATE connector.project_binding SET ${column} = ${column}`), sqlstate('42501'), `binding ${column}`)
  }
  await assert.rejects(run('DELETE FROM connector.connection'), sqlstate('42501'), 'connection delete')
  assert.equal(await run('UPDATE connector.project_binding SET unbound_at = unbound_at'), 1)
})

test('a binding of a Connection that belongs to another Workspace is refused by the foreign key', async (t) => {
  const { database, connection, seedProject } = await setupConnectors(t, 'conexus_runtime_grants_binding')
  const projectId = await seedProject('Atlas')
  const otherConnection = randomUUID()
  await query(connection, `INSERT INTO connector.connection(connection_id, workspace_id, connector_id, label, credential_sealed, credential_digest, created_by)
    VALUES ($1, $2, 'sankhya', 'ERP B', 'conexus:secret:v1:seed', $3, $4)`, [otherConnection, ID.otherWorkspace, 'd'.repeat(64), ID.administrator])
  const crossed = sql`INSERT INTO connector.project_binding(workspace_id, project_id, environment, connection_id, name, bound_by) VALUES (${ID.workspace}, ${projectId}, 'preview', ${otherConnection}, 'crossed', ${ID.owner})`
  await assert.rejects(database.transaction(ID.owner, async (gate) => (await admitAccount(gate)).tx.run(crossed)), sqlstate('23503'))
  assert.deepEqual((await query(connection, 'SELECT count(*)::integer AS n FROM connector.project_binding WHERE connection_id = $1', [otherConnection])).rows, [{ n: 0 }])
})

test('the runtime role can only add and read registry revisions and thumbnails, never change them', async (t) => {
  const { database } = await setupConnectors(t, 'conexus_runtime_grants_registry')
  const run = (text) => database.transaction(ID.owner, async (gate) => (await admitAccount(gate)).tx.run(sql(Object.assign([text], { raw: [text] }))))
  await assert.rejects(run('UPDATE reg.artifact_revision SET digest = digest'), sqlstate('42501'), 'revision update')
  for (const statement of ['UPDATE reg.application_thumbnail SET media_type = media_type', 'DELETE FROM reg.application_thumbnail']) {
    await assert.rejects(run(statement), sqlstate('42501'), statement)
  }
  assert.equal(await run('DELETE FROM reg.artifact_revision'), 0)
})
