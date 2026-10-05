import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { z } from 'zod'
import { EXPECTED_NATIVE_ORDER, NATIVE_ORDER_DATASET, startFakeGateway } from './connector-fake-gateway.mjs'
import { setupConnectors, skip } from './connector-fixture.mjs'
import { connectorRecord } from './connector-record.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { ID } from './project-fixture.mjs'
import { waitUntilBlocked } from './race.mjs'

const { createBroker, registryOf } = await import(hubModuleUrl('connectors/broker.js'))
const { createBrokerStore, purgeProjectBindings } = await import(hubModuleUrl('connectors/store.js'))
const { createSankhyaGateway } = await import(hubModuleUrl('connectors/sankhya/gateway.js'))
const { sankhyaDefinition } = await import(hubModuleUrl('connectors/sankhya/definition.js'))
const { scopeForBuilderRun, scopeFromArtifactSource } = await import(hubModuleUrl('connectors/scope.js'))
const { sql, DATABASE_FAILURES } = await import(hubModuleUrl('platform/db.js'))
const { admitSystem } = await import(hubModuleUrl('identity-access/admission.js'))

const DIGEST = 'd'.repeat(64)
const SEALED = 'mastra:factory-secret:v1:seed'
const SEEDED = '33333333-3333-4333-8333-333333333333'
const SEEDED_AT = '2026-10-04T12:00:00.000Z'
const CREDENTIAL = Object.freeze({ clientId: 'client-a', clientSecret: 'secret-a-4f1c', xToken: 'token-a-77d2' })
const OTHER_OWNER = '10000000-0000-4000-8000-0000000000b1'
const LOAD = 'CRUDServiceProvider.loadRecords'
const NATIVE_READ = Object.freeze({
  connection: 'erp', method: 'POST', path: '/gateway/v1/mge/service.sbr',
  query: { serviceName: LOAD, outputType: 'json' },
  body: { serviceName: LOAD, requestBody: { dataSet: NATIVE_ORDER_DATASET } },
})
const ORDER_READ = Object.freeze({ ok: true, status: 200, bytes: Buffer.byteLength(JSON.stringify(EXPECTED_NATIVE_ORDER)), body: EXPECTED_NATIVE_ORDER })
const NOT_GRANTED = Object.freeze({ ok: false, code: 'NOT_GRANTED' })

const pending = (promise) => {
  const state = { settled: false }
  promise.then(() => { state.settled = true }, () => { state.settled = true })
  return state
}

const hold = async (connection, onCleanup) => {
  const client = new pg.Client(connection)
  await client.connect()
  onCleanup(() => client.end().catch(() => undefined))
  await client.query('BEGIN')
  return client
}

const asRole = async (connection, role, accountId, text, values = []) => {
  const client = new pg.Client(connection)
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT set_config('role', $1, true)", [role])
    if (accountId) await client.query("SELECT set_config('conexus.account_id', $1, true)", [accountId])
    const result = await client.query(text, values)
    return { code: null, rows: result.rows }
  } catch (error) {
    return { code: error.code, rows: [] }
  } finally {
    await client.end()
  }
}

const Label = z.object({ label: z.string() })
const Binding = z.object({ binding_id: z.string() })
const labelsOf = async (database, accountId) => (await database.read(accountId, (tx) => tx.rows(Label, sql`SELECT label FROM connector.connection ORDER BY label`))).map((row) => row.label)
const bindingsOf = (database, accountId) => database.read(accountId, (tx) => tx.rows(Binding, sql`SELECT binding_id FROM connector.project_binding`))
const count = async (connection, text, values) => (await query(connection, text, values)).rows[0].n
const openBindings = (connection, projectId) => count(connection, 'SELECT count(*)::integer AS n FROM connector.project_binding WHERE project_id = $1 AND unbound_at IS NULL', [projectId])
const allBindings = (connection, projectId) => count(connection, 'SELECT count(*)::integer AS n FROM connector.project_binding WHERE project_id = $1', [projectId])

const seedConnection = async (connection, { connectionId = randomUUID(), workspaceId = ID.workspace, connectorId = 'sankhya', label, disabled = false }) => {
  await query(connection, `INSERT INTO connector.connection(connection_id, workspace_id, connector_id, label, credential_sealed, credential_digest, created_by, created_at, disabled_at, disabled_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [connectionId, workspaceId, connectorId, label, SEALED, DIGEST, ID.administrator, SEEDED_AT, disabled ? SEEDED_AT : null, disabled ? ID.administrator : null])
  return connectionId
}

test('CON-01 and CON-02: administrator only, idempotent create, conflicts, absent Workspace, sealed at rest', { skip }, async (t) => {
  const { connection, store, database } = await setupConnectors(t, 'connector_admin')
  await seedConnection(connection, { connectionId: SEEDED, label: 'ERP' })
  assert.deepEqual(await store.listConnections({ accountId: ID.administrator, workspaceId: ID.workspace }), [{ connectionId: SEEDED, connectorId: 'sankhya', label: 'ERP', createdAt: SEEDED_AT }])
  await assert.rejects(store.listConnections({ accountId: ID.owner, workspaceId: ID.workspace }), { id: 'INSTALLATION_ADMINISTRATOR_REQUIRED' })
  assert.deepEqual(await store.listConnections({ accountId: ID.administrator, workspaceId: randomUUID() }), [])

  const connectionId = randomUUID()
  const body = { connectionId, connectorId: 'sankhya', label: 'ERP filial', credential: CREDENTIAL }
  const create = (input = body, workspaceId = ID.workspace) => store.createConnection({ accountId: ID.administrator, workspaceId, body: input })
  const first = await create()
  assert.deepEqual({ ...first, connection: { ...first.connection, createdAt: typeof first.connection.createdAt } }, {
    connection: { connectionId, connectorId: 'sankhya', label: 'ERP filial', createdAt: 'string' }, created: true,
  })
  const retry = await create({ ...body, credential: { xToken: CREDENTIAL.xToken, clientSecret: CREDENTIAL.clientSecret, clientId: CREDENTIAL.clientId } })
  assert.deepEqual(retry, { connection: first.connection, created: false })
  await assert.rejects(create({ ...body, label: 'Changed' }), { id: 'CONNECTOR_CONNECTION_CONFLICT' })
  await assert.rejects(create({ ...body, credential: { ...CREDENTIAL, clientSecret: 'another' } }), { id: 'CONNECTOR_CONNECTION_CONFLICT' })
  await assert.rejects(create(body, ID.otherWorkspace), { id: 'CONNECTOR_CONNECTION_CONFLICT' })
  assert.deepEqual((await query(connection, 'SELECT workspace_id, label FROM connector.connection WHERE connection_id = $1', [connectionId])).rows, [{ workspace_id: ID.workspace, label: 'ERP filial' }])

  await assert.rejects(create({ ...body, connectionId: randomUUID() }, randomUUID()), (error) => error.id === 'CONNECTOR_WORKSPACE_NOT_FOUND' && error.cause?.code === '23503')
  const rule = DATABASE_FAILURES.find((entry) => entry.failure === 'CONNECTOR_WORKSPACE_NOT_FOUND')
  assert.deepEqual(rule, { sqlstate: '23503', constraint: 'connection_workspace_id_fkey', failure: 'CONNECTOR_WORKSPACE_NOT_FOUND' })
  assert.equal((await query(connection, 'SELECT 1 FROM pg_constraint WHERE conname = $1', [rule.constraint])).rowCount, 1)

  const stored = (await query(connection, 'SELECT credential_sealed, credential_digest FROM connector.connection WHERE connection_id = $1', [connectionId])).rows[0]
  assert.match(stored.credential_sealed, /^mastra:factory-secret:v1:/)
  assert.equal(stored.credential_sealed.includes(CREDENTIAL.clientSecret), false)
  assert.match(stored.credential_digest, /^[0-9a-f]{64}$/)
  assert.deepEqual(await labelsOf(database, ID.administrator), ['ERP', 'ERP filial'])
})

test('CON-03 and CON-04: the credential read and the disable are administrator commands that end every open binding', { skip }, async (t) => {
  const { connection, store, addConnection, bind, disable, seedProject, brokerStore, scopeOf } = await setupConnectors(t, 'connector_check')
  const projectId = await seedProject('Atlas')
  const erp = await addConnection('sankhya', 'ERP', CREDENTIAL)
  await bind(projectId, erp, 'erp')
  const read = (accountId, workspaceId = ID.workspace, connectionId = erp) => store.readCredentialForCheck({ accountId, workspaceId, connectionId })
  const found = await read(ID.administrator)
  assert.equal(found.connectorId, 'sankhya')
  assert.match(found.sealed, /^mastra:factory-secret:v1:/)
  await assert.rejects(read(ID.owner), { id: 'INSTALLATION_ADMINISTRATOR_REQUIRED' })
  await assert.rejects(read(ID.administrator, ID.otherWorkspace), { id: 'CONNECTOR_CONNECTION_NOT_FOUND' })
  await assert.rejects(disable(erp, ID.workspace, ID.owner), { id: 'INSTALLATION_ADMINISTRATOR_REQUIRED' })

  await disable(erp)
  await disable(erp)
  assert.deepEqual([await allBindings(connection, projectId), await openBindings(connection, projectId)], [1, 0])
  assert.deepEqual(await brokerStore.listBindings(scopeOf(projectId)), [])
  assert.equal(await brokerStore.readConnectionCredential(scopeOf(projectId), erp), null)
  await assert.rejects(read(ID.administrator), { id: 'CONNECTOR_CONNECTION_NOT_FOUND' })
  await assert.rejects(disable(randomUUID()), { id: 'CONNECTOR_CONNECTION_NOT_FOUND' })
  await assert.rejects(disable(erp, ID.otherWorkspace), { id: 'CONNECTOR_CONNECTION_NOT_FOUND' })
})

test('CON-03 over the real routes: the administrator transaction is committed while the provider call runs', { skip }, async (t) => {
  const fixture = await setupConnectors(t, 'connector_check_route')
  const { connection, store, addConnection, onCleanup } = fixture
  const { createConnectionCheck } = await import(hubModuleUrl('connectors/module.js'))
  const { registerConnectorRoutes } = await import(hubModuleUrl('connectors/routes.js'))
  const { testListener, hubJsonWrite, opaque } = await import('./access/test-listener.mjs')
  const fake = await startFakeGateway()
  t.after(() => fake.close())
  const erp = await addConnection('sankhya', 'ERP', { clientId: 'c', clientSecret: 's', xToken: 'x' })
  const { broker } = await connectorBroker(t, fixture, fixture.brokerStore, fake)
  const token = opaque('administrator')
  const { app } = await testListener({
    sessions: { [token]: { account: { accountId: ID.administrator, displayName: 'Administrator' }, issuer: 'https://issuer.test', subject: 'administrator' } },
    registerRoutes: (instance) => registerConnectorRoutes(instance, { store, checkConnection: createConnectionCheck({ store, broker, configured: true }) }),
  })
  onCleanup(() => app.close())
  const check = () => app.inject({ method: 'POST', url: `/api/control/workspaces/${ID.workspace}/connections/${erp}/authentication-check`, headers: hubJsonWrite, cookies: { '__Host-conexus_session': token }, payload: {} })

  assert.deepEqual((await check()).json(), { outcome: 'OK' })

  fake.mode.authenticate = 'stall'
  fake.requests.length = 0
  broker.forget(erp)
  const answer = check()
  const started = Date.now()
  while (fake.requests.length === 0 && Date.now() - started < 3000) await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(fake.requests.length, 1, 'the provider call is in flight')
  const revoked = query(connection, 'UPDATE iam.installation_administrator SET revoked_at = now(), revoked_by = $2 WHERE account_id = $1', [ID.administrator, ID.memberAdministrator])
  assert.equal(await Promise.race([revoked.then(() => 'committed'), new Promise((resolve) => setTimeout(() => resolve('waiting'), 1500))]), 'committed')
  const settled = await answer
  assert.deepEqual({ status: settled.statusCode, body: settled.json() }, { status: 200, body: { outcome: 'PROVIDER_TIMEOUT' } })
  assert.equal((await check()).statusCode, 403)
})

test('CON-08, CON-09 and CON-10: owner only, ordered entries, conflicts, a foreign or disabled Connection, a tombstoned or archived Project', { skip }, async (t) => {
  const { connection, store, addConnection, bind, unbind, archive, seedProject } = await setupConnectors(t, 'connector_bindings')
  const projectId = await seedProject('Atlas')
  const erp = await addConnection('sankhya', 'ERP', CREDENTIAL)
  const filial = await addConnection('sankhya', 'Filial', CREDENTIAL)
  const disabled = await seedConnection(connection, { label: 'Old', disabled: true })
  const foreign = await seedConnection(connection, { label: 'Elsewhere', workspaceId: ID.otherWorkspace })
  await query(connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [ID.owner, ID.otherWorkspace])
  await query(connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [ID.administrator, ID.workspace])
  const list = (accountId = ID.owner, id = projectId) => store.listProjectBindings({ accountId, projectId: id })

  const binding = await bind(projectId, erp, 'erp')
  assert.deepEqual({ ...binding, boundAt: typeof binding.boundAt }, { kind: 'binding', bindingId: binding.bindingId, name: 'erp', connectionId: erp, connectorId: 'sankhya', label: 'ERP', boundAt: 'string' })
  assert.deepEqual((await list()).map((entry) => [entry.kind, entry.name ?? null, entry.label]), [['binding', 'erp', 'ERP'], ['bindable', null, 'Filial']])
  const retried = await store.bindConnection({ accountId: ID.owner, projectId, body: { connectionId: erp, name: 'erp' } })
  assert.deepEqual([retried.created, retried.binding.bindingId], [false, binding.bindingId], 'an exact retry returns the same binding and creates none')
  await assert.rejects(bind(projectId, filial, 'erp'), { id: 'CONNECTOR_BINDING_CONFLICT' })
  await assert.rejects(bind(projectId, erp, 'other'), { id: 'CONNECTOR_BINDING_CONFLICT' })
  await assert.rejects(bind(projectId, foreign, 'foreign'), { id: 'CONNECTOR_CONNECTION_NOT_AVAILABLE' })
  await assert.rejects(bind(projectId, disabled, 'old'), { id: 'CONNECTOR_CONNECTION_NOT_AVAILABLE' })

  const otherErp = await seedConnection(connection, { label: 'Other ERP', connectorId: 'other-erp' })
  const other = await bind(projectId, otherErp, 'other')
  assert.deepEqual([other.connectorId, (await list()).find((entry) => entry.connectionId === otherErp).connectorId], ['other-erp', 'other-erp'])

  for (const [accountId, id] of [[ID.member, 'CONNECTOR_BINDING_MANAGE_REQUIRED'], [ID.outsider, 'PROJECT_NOT_FOUND']]) {
    await assert.rejects(list(accountId), { id })
    await assert.rejects(bind(projectId, filial, 'filial', accountId), { id })
    await assert.rejects(unbind(projectId, binding.bindingId, accountId), { id })
  }

  await unbind(projectId, other.bindingId)
  await assert.rejects(unbind(projectId, other.bindingId), { id: 'CONNECTOR_BINDING_NOT_FOUND' })

  const gone = async (id) => {
    for (const accountId of [ID.owner, ID.administrator]) {
      await assert.rejects(list(accountId, id), { id: 'PROJECT_NOT_FOUND' })
      await assert.rejects(bind(id, filial, 'filial', accountId), { id: 'PROJECT_NOT_FOUND' })
      await assert.rejects(unbind(id, binding.bindingId, accountId), { id: 'PROJECT_NOT_FOUND' })
    }
  }
  await archive(projectId, true)
  await gone(projectId)
  const doomed = await seedProject('Doomed')
  await query(connection, "INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Doomed', $3)", [doomed, ID.workspace, ID.administrator])
  await gone(doomed)
})

test('reader and command walls on both Connector tables', { skip }, async (t) => {
  const { connection, database, addConnection, bind, disable, seedProject } = await setupConnectors(t, 'connector_walls')
  await query(connection, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://issuer.test', 'other-owner', 'Other owner')", [OTHER_OWNER])
  await query(connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [OTHER_OWNER, ID.otherWorkspace])
  const projectId = await seedProject('Atlas')
  const erp = await addConnection('sankhya', 'ERP A', CREDENTIAL)
  await seedConnection(connection, { label: 'Old A', disabled: true })
  const erpB = await seedConnection(connection, { label: 'ERP B', workspaceId: ID.otherWorkspace })
  await bind(projectId, erp, 'erp')

  assert.deepEqual(await labelsOf(database, ID.owner), ['ERP A'])
  assert.deepEqual(await labelsOf(database, OTHER_OWNER), ['ERP B'])
  assert.equal((await bindingsOf(database, ID.owner)).length, 1)
  assert.deepEqual(await bindingsOf(database, OTHER_OWNER), [])
  assert.deepEqual(await labelsOf(database, ID.member), [])
  assert.deepEqual(await bindingsOf(database, ID.member), [])
  assert.deepEqual((await asRole(connection, 'hub_reader', null, 'SELECT count(*)::integer AS n FROM connector.connection')).rows, [{ n: 0 }])
  assert.deepEqual((await asRole(connection, 'hub_reader', null, 'SELECT count(*)::integer AS n FROM connector.project_binding')).rows, [{ n: 0 }])

  for (const accountId of [ID.owner, ID.administrator]) {
    for (const column of ['credential_sealed', 'credential_digest']) {
      await assert.rejects(database.read(accountId, (tx) => tx.rows(z.object({ value: z.string() }), sql`SELECT ${sql.identifier(column)} AS value FROM connector.connection`)), (error) => error.cause?.code === '42501', `${accountId} ${column}`)
    }
  }
  assert.deepEqual(await labelsOf(database, ID.administrator), ['ERP A', 'ERP B', 'Old A'])
  assert.deepEqual(await bindingsOf(database, ID.administrator), [])

  const reader = (text, values) => asRole(connection, 'hub_reader', ID.owner, text, values)
  for (const table of ['connection', 'project_binding']) {
    assert.equal((await reader(`SELECT 1 FROM connector.${table} FOR SHARE`)).code, '42501', `${table} FOR SHARE`)
    assert.equal((await reader(`DELETE FROM connector.${table}`)).code, '42501', `${table} DELETE`)
  }
  assert.equal((await reader('UPDATE connector.connection SET label = label')).code, '42501')
  assert.equal((await reader('UPDATE connector.project_binding SET unbound_at = now()')).code, '42501')
  assert.equal((await reader("INSERT INTO connector.project_binding(workspace_id, project_id, environment, connection_id, name, bound_by) VALUES ($1, $2, 'preview', $3, 'x', $4)", [ID.workspace, projectId, erp, ID.owner])).code, '42501')

  const command = (text, values) => asRole(connection, 'hub_command', null, text, values)
  for (const column of ['workspace_id', 'connection_id', 'created_by', 'credential_sealed', 'credential_digest']) {
    assert.equal((await command(`UPDATE connector.connection SET ${column} = ${column}`)).code, '42501', `connection ${column}`)
  }
  for (const column of ['project_id', 'workspace_id', 'connection_id', 'bound_by']) {
    assert.equal((await command(`UPDATE connector.project_binding SET ${column} = ${column}`)).code, '42501', `binding ${column}`)
  }
  assert.equal((await command('SELECT 1 FROM connector.connection FOR SHARE')).code, null)
  assert.equal((await command('SELECT 1 FROM connector.connection FOR UPDATE')).code, null)
  assert.equal((await command('SELECT 1 FROM connector.project_binding FOR UPDATE')).code, null)
  assert.equal((await command("INSERT INTO connector.project_binding(workspace_id, project_id, environment, connection_id, name, bound_by) VALUES ($1, $2, 'preview', $3, 'crossed', $4)", [ID.workspace, projectId, erpB, ID.owner])).code, '23503', 'a binding of a Connection of another Workspace')

  for (const table of ['connection', 'project_binding']) {
    assert.equal((await asRole(connection, 'hub_runtime', null, `SELECT 1 FROM connector.${table}`)).code, '42501', `hub_runtime ${table}`)
  }
  assert.equal((await reader('SELECT count(*)::integer FROM connector.connection')).code, null, 'the connection reader policy does not recurse')
  assert.equal((await reader('SELECT count(*)::integer FROM connector.project_binding')).code, null, 'the binding reader policy does not recurse')

  await disable(erp)
  assert.equal(await count(connection, 'SELECT count(*)::integer AS n FROM connector.project_binding AS bound JOIN connector.connection AS stored USING (connection_id) WHERE bound.unbound_at IS NULL AND stored.disabled_at IS NOT NULL'), 0, 'no open binding stays on a disabled Connection')
})

const connectorBroker = async (t, fixture, store = fixture.brokerStore, gateway) => {
  const fake = gateway ?? await startFakeGateway()
  if (!gateway) t.after(() => fake.close())
  const broker = createBroker({
    connectors: registryOf([{ definition: sankhyaDefinition, adapter: createSankhyaGateway({ origin: fake.origin }) }]),
    store, envelope: fixture.envelope, observability: connectorRecord().observability,
  })
  const fetchAs = (scope) => broker.fetch({ kind: 'handler', invocationId: randomUUID(), scope }, NATIVE_READ)
  return { fake, fetchAs, broker }
}

test('broker refusals are NOT_GRANTED and a store fault is CONNECTOR_PLATFORM_FAILED, for a Builder run, a Preview and an application grantee', { skip }, async (t) => {
  const fixture = await setupConnectors(t, 'connector_broker_refusals')
  const { connection, database, addConnection, bind, archive, seedProject } = fixture
  const { fetchAs } = await connectorBroker(t, fixture)
  const projectId = await seedProject('Atlas')
  const erp = await addConnection('sankhya', 'ERP', { clientId: 'c', clientSecret: 's', xToken: 'x' })
  await bind(projectId, erp, 'erp')
  const run = (accountId) => scopeForBuilderRun({ projectId, accountId }, { ttlMs: 60_000, calls: 20 })
  const preview = (accountId) => scopeFromArtifactSource({ via: 'PREVIEW', accountId, projectId })
  const application = (accountId) => scopeFromArtifactSource({ via: 'APPLICATION', accountId, projectId })

  assert.deepEqual(await fetchAs(run(ID.member)), ORDER_READ)
  assert.deepEqual(await fetchAs(preview(ID.member)), ORDER_READ)
  await query(connection, 'INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, $2, $3)', [projectId, 'atlas-app', ID.owner])
  await query(connection, 'INSERT INTO iam.application_grant(project_id, account_id, granted_by) VALUES ($1, $2, $3)', [projectId, ID.outsider, ID.owner])
  assert.deepEqual(await fetchAs(run(ID.member)), ORDER_READ, 'a plain member keeps its Builder after the first application grant')
  assert.deepEqual(await fetchAs(preview(ID.member)), ORDER_READ, 'and its Preview')
  assert.deepEqual(await fetchAs(application(ID.outsider)), ORDER_READ, 'a grantee with no Workspace membership reads the bound Connection')
  assert.deepEqual(await fetchAs(preview(ID.outsider)), NOT_GRANTED, 'a grantee is no member of the Project')
  assert.deepEqual(await labelsOf(database, ID.outsider), [])
  assert.deepEqual(await bindingsOf(database, ID.outsider), [])

  const unbound = await addConnection('sankhya', 'Unbound', CREDENTIAL)
  assert.equal(await fixture.brokerStore.readConnectionCredential(preview(ID.member), unbound), null)
  assert.equal(await fixture.brokerStore.readConnectionCredential(application(ID.outsider), unbound), null)

  await query(connection, 'UPDATE iam.application_grant SET revoked_at = now(), revoked_by = $2 WHERE account_id = $1', [ID.outsider, ID.owner])
  assert.deepEqual(await fetchAs(application(ID.outsider)), NOT_GRANTED, 'a revoked grant')
  await query(connection, 'UPDATE iam.application_grant SET revoked_at = NULL, revoked_by = NULL WHERE account_id = $1', [ID.outsider])
  await archive(projectId, true)
  for (const scope of [run(ID.member), preview(ID.member), application(ID.outsider)]) assert.deepEqual(await fetchAs(scope), NOT_GRANTED, 'an archived Project')
  await archive(projectId, false)

  await query(connection, 'DELETE FROM iam.workspace_membership WHERE account_id = $1', [ID.member])
  assert.deepEqual(await fetchAs(run(ID.member)), NOT_GRANTED, 'a run account that lost its membership')
  await query(connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'member')", [ID.member, ID.workspace])
  await query(connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [ID.member])
  assert.deepEqual(await fetchAs(run(ID.member)), NOT_GRANTED, 'a deactivated account')
  await query(connection, 'UPDATE iam.account SET active = true WHERE account_id = $1', [ID.member])

  await query(connection, "INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Atlas', $3)", [projectId, ID.workspace, ID.administrator])
  for (const scope of [run(ID.member), preview(ID.member), application(ID.outsider)]) assert.deepEqual(await fetchAs(scope), NOT_GRANTED, 'a Project in deletion')

  const faulty = createBrokerStore({ ...database, transaction: () => Promise.reject(new Error('DATABASE_DOWN')) })
  const failing = await connectorBroker(t, fixture, faulty)
  assert.deepEqual(await failing.fetchAs(preview(ID.member)), { ok: false, code: 'CONNECTOR_PLATFORM_FAILED' })
  assert.equal(failing.fake.requests.length, 0, 'a store fault reaches no provider')
})

test('CON-09 against CON-04, CON-10 and the Project purge in both lock orders, with no deadlock', { skip }, async (t) => {
  const { connection, database, store, addConnection, bind, disable, seedProject, onCleanup } = await setupConnectors(t, 'connector_locks')
  const bindIn = async (projectId, connectionId, name) => (await store.bindConnection({ accountId: ID.owner, projectId, body: { connectionId, name } })).binding

  const atlas = await seedProject('Atlas')
  const erp = await addConnection('sankhya', 'ERP', CREDENTIAL)
  const disabling = await hold(connection, onCleanup)
  await disabling.query('UPDATE connector.connection SET disabled_at = clock_timestamp(), disabled_by = $2 WHERE connection_id = $1', [erp, ID.administrator])
  const racing = bindIn(atlas, erp, 'erp')
  racing.catch(() => undefined)
  await waitUntilBlocked(connection)
  await disabling.query('COMMIT')
  await assert.rejects(racing, { id: 'CONNECTOR_CONNECTION_NOT_AVAILABLE' })
  assert.equal(await openBindings(connection, atlas), 0, 'a bind that waited on a disable leaves no open binding')

  const borealis = await seedProject('Borealis')
  const second = await addConnection('sankhya', 'ERP 2', CREDENTIAL)
  const binding = await hold(connection, onCleanup)
  await binding.query('SELECT 1 FROM connector.connection WHERE connection_id = $1 FOR SHARE', [second])
  await binding.query("INSERT INTO connector.project_binding(workspace_id, project_id, environment, connection_id, name, bound_by) VALUES ($1, $2, 'preview', $3, 'erp', $4)", [ID.workspace, borealis, second, ID.owner])
  const disabled = disable(second)
  const disabledState = pending(disabled)
  disabled.catch(() => undefined)
  await waitUntilBlocked(connection)
  assert.equal(disabledState.settled, false, 'a disable waits for the bind that holds the Connection')
  await binding.query('COMMIT')
  await disabled
  assert.equal(await openBindings(connection, borealis), 0, 'and ends the binding that committed first')

  const cirrus = await seedProject('Cirrus')
  const kept = await addConnection('sankhya', 'ERP 3', CREDENTIAL)
  const first = await bind(cirrus, kept, 'erp')
  const unbinding = await hold(connection, onCleanup)
  await unbinding.query('UPDATE connector.project_binding SET unbound_at = clock_timestamp(), unbound_by = $2 WHERE binding_id = $1', [first.bindingId, ID.owner])
  const rebind = bindIn(cirrus, kept, 'erp')
  const rebound = pending(rebind)
  rebind.catch(() => undefined)
  await waitUntilBlocked(connection)
  assert.equal(rebound.settled, false)
  await unbinding.query('COMMIT')
  assert.notEqual((await rebind).bindingId, first.bindingId)
  assert.deepEqual([await openBindings(connection, cirrus), await allBindings(connection, cirrus)], [1, 2], 'one unbind and one new binding')

  const dryad = await seedProject('Dryad')
  const racers = await Promise.allSettled([bindIn(dryad, kept, 'erp'), bindIn(dryad, kept, 'erp'), bindIn(dryad, kept, 'erp')])
  assert.deepEqual(racers.map((racer) => racer.status), ['fulfilled', 'fulfilled', 'fulfilled'])
  assert.equal(new Set(racers.map((racer) => racer.value.bindingId)).size, 1)
  assert.equal(await openBindings(connection, dryad), 1)

  const doomed = await seedProject('Doomed')
  const tombstone = await hold(connection, onCleanup)
  await tombstone.query('SELECT 1 FROM project.project WHERE project_id = $1 FOR UPDATE', [doomed])
  await tombstone.query("INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Doomed', $3)", [doomed, ID.workspace, ID.administrator])
  const late = bindIn(doomed, kept, 'late')
  const lateState = pending(late)
  late.catch(() => undefined)
  await waitUntilBlocked(connection)
  assert.equal(lateState.settled, false)
  await tombstone.query('COMMIT')
  await assert.rejects(late, { id: 'PROJECT_NOT_FOUND' })

  const purged = await seedProject('Purged')
  await bind(purged, kept, 'erp')
  const purge = (projectId) => database.system('project-purge', async (gate) => purgeProjectBindings(await admitSystem(gate, 'project-purge'), projectId))
  await purge(purged)
  assert.equal(await allBindings(connection, purged), 0)
  await purge(purged)
  assert.equal(await allBindings(connection, purged), 0, 'a purge retry deletes zero')
  assert.equal(await openBindings(connection, dryad), 1, 'and no other Project loses a binding')
})

test('administrator revocation against CON-02 and CON-04: a revocation that commits first is refused, one that starts later waits', { skip }, async (t) => {
  const { connection, store, addConnection, disable, onCleanup } = await setupConnectors(t, 'connector_revocation')
  const erp = await addConnection('sankhya', 'ERP', CREDENTIAL)
  const revoke = (accountId) => query(connection, 'UPDATE iam.installation_administrator SET revoked_at = now(), revoked_by = $2 WHERE account_id = $1', [accountId, ID.administrator])

  const blocker = await hold(connection, onCleanup)
  await blocker.query('SELECT 1 FROM connector.connection WHERE connection_id = $1 FOR UPDATE', [erp])
  const disabling = disable(erp, ID.workspace, ID.memberAdministrator)
  disabling.catch(() => undefined)
  await waitUntilBlocked(connection)
  const revoking = revoke(ID.memberAdministrator)
  const revoked = pending(revoking)
  await waitUntilBlocked(connection, { count: 2 })
  assert.equal(revoked.settled, false, 'the revocation waits for the tenure the command holds')
  await blocker.query('COMMIT')
  await disabling
  await revoking
  await assert.rejects(disable(erp, ID.workspace, ID.memberAdministrator), { id: 'INSTALLATION_ADMINISTRATOR_REQUIRED' })
  await assert.rejects(store.createConnection({ accountId: ID.memberAdministrator, workspaceId: ID.workspace, body: { connectionId: randomUUID(), connectorId: 'sankhya', label: 'New', credential: CREDENTIAL } }), { id: 'INSTALLATION_ADMINISTRATOR_REQUIRED' })

  const held = randomUUID()
  const creator = await hold(connection, onCleanup)
  await creator.query("INSERT INTO connector.connection(connection_id, workspace_id, connector_id, label, credential_sealed, credential_digest, created_by) VALUES ($1, $2, 'sankhya', 'Held', $3, $4, $5)", [held, ID.workspace, SEALED, DIGEST, ID.administrator])
  const creating = store.createConnection({ accountId: ID.administrator, workspaceId: ID.workspace, body: { connectionId: held, connectorId: 'sankhya', label: 'Held', credential: CREDENTIAL } })
  creating.catch(() => undefined)
  await waitUntilBlocked(connection)
  const revokingAdministrator = revoke(ID.administrator)
  await waitUntilBlocked(connection, { count: 2 })
  await creator.query('ROLLBACK')
  assert.equal((await creating).created, true)
  await revokingAdministrator
  await assert.rejects(store.listConnections({ accountId: ID.administrator, workspaceId: ID.workspace }), { id: 'INSTALLATION_ADMINISTRATOR_REQUIRED' })
})
