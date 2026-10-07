import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
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
const { admitSystem } = await import(hubModuleUrl('identity-access/admission.js'))

const DIGEST = 'd'.repeat(64)
const SEALED = 'mastra:factory-secret:v1:seed'
const SEEDED = '33333333-3333-4333-8333-333333333333'
const SEEDED_AT = '2026-10-04T12:00:00.000Z'
const CREDENTIAL = Object.freeze({ clientId: 'client-a', clientSecret: 'secret-a-4f1c', xToken: 'token-a-77d2' })
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

const labelsOf = async (store, accountId) => (await store.listConnections({ accountId, workspaceId: ID.workspace })).map((row) => row.label)
const count = async (connection, text, values) => (await query(connection, text, values)).rows[0].n
const openBindings = (connection, projectId) => count(connection, 'SELECT count(*)::integer AS n FROM connector.project_binding WHERE project_id = $1 AND unbound_at IS NULL', [projectId])
const allBindings = (connection, projectId) => count(connection, 'SELECT count(*)::integer AS n FROM connector.project_binding WHERE project_id = $1', [projectId])

const seedConnection = async (connection, { connectionId = randomUUID(), workspaceId = ID.workspace, connectorId = 'sankhya', label, disabled = false }) => {
  await query(connection, `INSERT INTO connector.connection(connection_id, workspace_id, connector_id, label, credential_sealed, credential_digest, created_by, created_at, disabled_at, disabled_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [connectionId, workspaceId, connectorId, label, SEALED, DIGEST, ID.administrator, SEEDED_AT, disabled ? SEEDED_AT : null, disabled ? ID.administrator : null])
  return connectionId
}

test('listWorkspaceConnections and createWorkspaceConnection: administrator only, idempotent create, conflicts, missing Workspace, sealed at rest', { skip }, async (t) => {
  const { connection, store } = await setupConnectors(t, 'connector_admin')
  await seedConnection(connection, { connectionId: SEEDED, label: 'ERP' })
  assert.deepEqual(await store.listConnections({ accountId: ID.administrator, workspaceId: ID.workspace }), [{ connectionId: SEEDED, connectorId: 'sankhya', label: 'ERP', createdAt: SEEDED_AT }])
  await assert.rejects(store.listConnections({ accountId: ID.owner, workspaceId: ID.workspace }), { id: 'INSTALLATION_ADMINISTRATOR_REQUIRED' })
  await assert.rejects(store.listConnections({ accountId: ID.administrator, workspaceId: randomUUID() }), { id: 'WORKSPACE_NOT_FOUND' })

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

  await assert.rejects(create({ ...body, connectionId: randomUUID() }, randomUUID()), { id: 'WORKSPACE_NOT_FOUND' })

  const stored = (await query(connection, 'SELECT credential_sealed, credential_digest FROM connector.connection WHERE connection_id = $1', [connectionId])).rows[0]
  assert.match(stored.credential_sealed, /^mastra:factory-secret:v1:/)
  assert.equal(stored.credential_sealed.includes(CREDENTIAL.clientSecret), false)
  assert.match(stored.credential_digest, /^[0-9a-f]{64}$/)
  assert.deepEqual(await labelsOf(store, ID.administrator), ['ERP', 'ERP filial'])
})

test('checkWorkspaceConnection and disableWorkspaceConnection: the credential read and the disable are administrator commands that end every open binding', { skip }, async (t) => {
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

test('checkWorkspaceConnection over the real routes: the administrator transaction is committed while the provider call runs', { skip }, async (t) => {
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

test('listProjectConnectionBindings, bindProjectConnection and unbindProjectConnection: owner only, ordered entries, conflicts, a foreign or disabled Connection, a tombstoned or archived Project', { skip }, async (t) => {
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

  const gone = async (id, refusal) => {
    for (const accountId of [ID.owner, ID.administrator]) {
      await assert.rejects(list(accountId, id), { id: refusal })
      await assert.rejects(bind(id, filial, 'filial', accountId), { id: refusal })
      await assert.rejects(unbind(id, binding.bindingId, accountId), { id: refusal })
    }
  }
  await archive(projectId, true)
  await gone(projectId, 'PROJECT_NOT_FOUND')
  const doomed = await seedProject('Doomed')
  await query(connection, "INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Doomed', $3)", [doomed, ID.workspace, ID.administrator])
  await gone(doomed, 'PROJECT_DELETING')
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
  const { connection, database, store, addConnection, bind, archive, seedProject } = fixture
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
  await assert.rejects(store.listConnections({ accountId: ID.outsider, workspaceId: ID.workspace }), { id: 'INSTALLATION_ADMINISTRATOR_REQUIRED' })
  await assert.rejects(store.listProjectBindings({ accountId: ID.outsider, projectId }), { id: 'PROJECT_NOT_FOUND' })

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

test('bindProjectConnection against disableWorkspaceConnection, unbindProjectConnection and the Project purge in both lock orders, with no deadlock', { skip }, async (t) => {
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
  await assert.rejects(late, { id: 'PROJECT_DELETING' })

  const purged = await seedProject('Purged')
  await bind(purged, kept, 'erp')
  const purge = (projectId) => database.system('project-purge', async (gate) => purgeProjectBindings(await admitSystem(gate, 'project-purge'), projectId))
  await purge(purged)
  assert.equal(await allBindings(connection, purged), 0)
  await purge(purged)
  assert.equal(await allBindings(connection, purged), 0, 'a purge retry deletes zero')
  assert.equal(await openBindings(connection, dryad), 1, 'and no other Project loses a binding')
})

test('administrator revocation against createWorkspaceConnection and disableWorkspaceConnection: a revocation that commits first is refused, one that starts later waits', { skip }, async (t) => {
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
