import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { loadHubMigrationFiles, runHubMigrations, runMigrations } from '../../scripts/run-hub-migrations.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { buildHubDatabase, createEmptyDatabase } from './hub-database.mjs'

const DIGEST = 'd'.repeat(64)
const configured = ['CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME', 'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD'].every((name) => process.env[name])

const refusal = async (run) => {
  try {
    await run()
  } catch (error) {
    return { code: error.code, message: error.message }
  }
  return { code: null, message: null }
}

const seeding = (client) => ({
  account: async (label, { active = true } = {}) => {
    const accountId = randomUUID()
    await client.query('INSERT INTO iam.account(account_id, issuer, external_subject, display_name, email, active) VALUES ($1,$2,$3,$4,$5,$6)',
      [accountId, 'https://connector.test', accountId, label, `${label}@connector.test`, active])
    return accountId
  },
  workspace: async (label, members = []) => {
    const workspaceId = randomUUID()
    await client.query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1,$2)', [workspaceId, label])
    for (const [accountId, role] of members) {
      await client.query('INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1,$2,$3)', [accountId, workspaceId, role])
    }
    return workspaceId
  },
  project: async (workspaceId, name) => {
    const projectId = randomUUID()
    await client.query("INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1,$2,$3,'NEW',$4,$5)",
      [projectId, workspaceId, name, 'a'.repeat(40), name])
    return projectId
  },
})

const connectorDatabase = async (t) => {
  const fixture = await buildHubDatabase(t, 'connector')
  const client = new pg.Client(fixture.connection)
  await client.connect()
  fixture.onCleanup(() => client.end())

  const administrator = async (accountId) => {
    await client.query("INSERT INTO iam.installation_administrator(account_id, granted_via) VALUES ($1, 'OPERATOR_BOOTSTRAP')", [accountId])
  }
  const createConnection = (actor, connectionId, workspaceId, connectorId, label, credentialSealed, credentialDigest = DIGEST) =>
    client.query('SELECT connection_id, connector_id, label, created_at, disabled_at, created FROM connector.create_connection($1,$2,$3,$4,$5,$6,$7)',
      [actor, connectionId, workspaceId, connectorId, label, credentialSealed, [credentialDigest]])
  const bind = (actor, projectId, connectionId, name) =>
    client.query('SELECT binding_id, name, connection_id, connector_id, label, bound_at FROM connector.bind_connection($1,$2,$3,$4)',
      [actor, projectId, connectionId, name])
  const unbind = (actor, projectId, bindingId) =>
    client.query('SELECT connector.unbind_connection($1,$2,$3) AS found', [actor, projectId, bindingId])
  const disable = (actor, workspaceId, connectionId) =>
    client.query('SELECT connector.disable_connection($1,$2,$3) AS found', [actor, workspaceId, connectionId])
  const listProjectBindings = async (actor, projectId) =>
    (await client.query('SELECT kind, binding_id, name, connection_id, connector_id, label FROM connector.list_project_bindings($1,$2)', [actor, projectId])).rows
  const boundConnections = async (projectId) =>
    (await client.query('SELECT binding_id, name, connection_id, connector_id FROM connector.list_bound_connections($1, $2)', [projectId, 'preview'])).rows

  return { fixture, client, ...seeding(client), administrator, createConnection, bind, unbind, disable, listProjectBindings, boundConnections }
}

test('installation administrators hold a Workspace Connection; idempotent create and a conflicting retry', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { client, account, workspace, administrator, createConnection, disable } = await connectorDatabase(t)
  const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))
  const envelope = createSecretEnvelope('ab'.repeat(32))

  const admin = await account('admin-a')
  await administrator(admin)
  const nonAdmin = await account('member-a')
  const workspaceId = await workspace('purchasing-a', [[admin, 'owner'], [nonAdmin, 'member']])
  const connectionId = randomUUID()
  const sealed = await envelope.seal(JSON.stringify({ clientId: 'client-a', clientSecret: 'super-secret-value', xToken: 'x-token-value' }))

  await t.test('a non-administrator is refused, disclosing nothing about the Workspace', async () => {
    assert.deepEqual(
      await refusal(() => createConnection(nonAdmin, connectionId, workspaceId, 'sankhya', 'ERP principal', sealed)),
      { code: '42501', message: 'NOT_ADMITTED' })
  })

  await t.test('P1: the stored row matches the sealed envelope prefix and holds no fragment of the credential', async () => {
    const created = (await createConnection(admin, connectionId, workspaceId, 'sankhya', 'ERP principal', sealed)).rows[0]
    assert.deepEqual({ connector_id: created.connector_id, label: created.label, disabled_at: created.disabled_at, created: created.created },
      { connector_id: 'sankhya', label: 'ERP principal', disabled_at: null, created: true })
    const stored = (await client.query('SELECT credential_sealed FROM connector.connection WHERE connection_id = $1', [connectionId])).rows[0]
    assert.ok(stored.credential_sealed.startsWith('mastra:factory-secret:v1:'))
    for (const secret of ['client-a', 'super-secret-value', 'x-token-value']) {
      assert.equal(stored.credential_sealed.includes(secret), false, `the stored envelope must not contain ${secret}`)
    }
    assert.equal(await envelope.open(stored.credential_sealed), JSON.stringify({ clientId: 'client-a', clientSecret: 'super-secret-value', xToken: 'x-token-value' }))
  })

  await t.test('a retry with the same id and fields is idempotent; a retry with a different field is a conflict', async () => {
    const reseal = await envelope.seal(JSON.stringify({ clientId: 'client-a', clientSecret: 'super-secret-value', xToken: 'x-token-value' }))
    assert.notEqual(reseal, sealed, 'a fresh seal of the same credential is different ciphertext')
    const repeat = (await createConnection(admin, connectionId, workspaceId, 'sankhya', 'ERP principal', reseal)).rows[0]
    assert.deepEqual({ connection_id: repeat.connection_id, created: repeat.created }, { connection_id: connectionId, created: false })
    const conflict = { code: 'P0001', message: 'CONNECTOR_CONNECTION_CONFLICT' }
    assert.deepEqual(await refusal(() => createConnection(admin, connectionId, workspaceId, 'sankhya', 'Different label', sealed)), conflict)
    assert.deepEqual(await refusal(() => createConnection(admin, connectionId, workspaceId, 'sankhya', 'ERP principal', sealed, 'e'.repeat(64))), conflict)
    const stored = (await client.query('SELECT credential_sealed, credential_digest FROM connector.connection WHERE connection_id = $1', [connectionId])).rows[0]
    assert.deepEqual(stored, { credential_sealed: sealed, credential_digest: DIGEST }, 'no retry replaced the stored credential')
  })

  await t.test('a Workspace holds several open Connections of one integrator', async () => {
    const second = (await createConnection(admin, randomUUID(), workspaceId, 'sankhya', 'ERP filial', sealed)).rows[0]
    assert.deepEqual({ connector_id: second.connector_id, label: second.label, disabled_at: second.disabled_at, created: second.created },
      { connector_id: 'sankhya', label: 'ERP filial', disabled_at: null, created: true })
  })

  await t.test('the table admits any integrator id of the right shape and refuses any other', async () => {
    const other = await workspace('shape-a')
    const shaped = (await createConnection(admin, randomUUID(), other, 'synthetic-rest', 'CRM', sealed)).rows[0]
    assert.deepEqual({ connector_id: shaped.connector_id, created: shaped.created }, { connector_id: 'synthetic-rest', created: true })
    assert.equal((await refusal(() => createConnection(admin, randomUUID(), other, 'Sankhya ERP', 'Bad', sealed))).code, '23514')
  })

  await t.test('a Connection of a Workspace that does not exist is refused by name', async () => {
    assert.deepEqual(await refusal(() => createConnection(admin, randomUUID(), randomUUID(), 'sankhya', 'Nowhere', sealed)),
      { code: 'P0002', message: 'CONNECTOR_WORKSPACE_NOT_FOUND' })
  })

  await t.test('a digest that is not 64 hex characters is refused by the column CHECK', async () => {
    const other = await workspace('digest-a')
    assert.equal((await refusal(() => createConnection(admin, randomUUID(), other, 'sankhya', 'Digest', sealed, 'not-a-digest'))).code, '23514')
  })

  await t.test('an unsealed credential is refused by the column CHECK', async () => {
    assert.equal((await refusal(() => createConnection(admin, randomUUID(), workspaceId, 'sankhya', 'Plain', 'plaintext-not-an-envelope'))).code, '23514')
  })

  await t.test('list_connections is scoped to the Workspace and refuses a non-administrator', async () => {
    const listed = await client.query('SELECT connector_id, label FROM connector.list_connections($1, $2)', [admin, workspaceId])
    assert.deepEqual(listed.rows, [{ connector_id: 'sankhya', label: 'ERP principal' }, { connector_id: 'sankhya', label: 'ERP filial' }])
    assert.equal((await refusal(() => client.query('SELECT * FROM connector.list_connections($1, $2)', [nonAdmin, workspaceId]))).code, '42501')
  })

  await t.test('disabling is idempotent, narrowing, and keeps the row as the record', async () => {
    const other = await workspace('other-a')
    assert.equal((await refusal(() => disable(nonAdmin, workspaceId, connectionId))).code, '42501')
    assert.equal((await disable(admin, other, connectionId)).rows[0].found, false, 'wrong Workspace, not found')
    assert.equal((await disable(admin, workspaceId, connectionId)).rows[0].found, true)
    assert.equal((await disable(admin, workspaceId, connectionId)).rows[0].found, true, 'idempotent')
    const record = (await client.query('SELECT disabled_by, disabled_at IS NOT NULL AS disabled FROM connector.connection WHERE connection_id = $1', [connectionId])).rows[0]
    assert.deepEqual(record, { disabled_by: admin, disabled: true })
  })
})

test('Project bindings: P7 cross-Workspace is unrepresentable and non-disclosing, Owner admission, idempotent bind, the two conflicts, scoped unbind', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { client, account, workspace, project, administrator, createConnection, bind, unbind, disable, listProjectBindings } = await connectorDatabase(t)
  const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))
  const envelope = createSecretEnvelope('cd'.repeat(32))
  const sealed = await envelope.seal(JSON.stringify({ clientId: 'client-b', clientSecret: 'secret-b', xToken: 'token-b' }))

  const admin = await account('admin-b')
  await administrator(admin)
  const owner = await account('owner-b')
  const plainMember = await account('member-b')
  const stranger = await account('stranger-b')
  const appOnly = await account('app-only-b')
  await client.query("UPDATE iam.account SET origin = 'APPLICATION_INVITATION' WHERE account_id = $1", [appOnly])
  const foreignOwner = await account('foreign-owner-b')

  const workspaceId = await workspace('purchasing-b', [[owner, 'owner'], [plainMember, 'member']])
  const foreignWorkspaceId = await workspace('foreign-b', [[foreignOwner, 'owner']])
  const principal = randomUUID()
  const branch = randomUUID()
  await createConnection(admin, principal, workspaceId, 'sankhya', 'ERP principal', sealed)
  await createConnection(admin, branch, workspaceId, 'sankhya', 'ERP filial', sealed)
  const projectId = await project(workspaceId, 'Pedidos')
  const secondProject = await project(workspaceId, 'Notas')

  await t.test('P7: a direct insert with mismatched Workspaces fails 23503, and it cannot be written at all', async () => {
    assert.equal((await refusal(() => client.query(
      'INSERT INTO connector.project_binding (workspace_id, project_id, environment, connection_id, name, bound_by) VALUES ($1,$2,$3,$4,$5,$6)',
      [foreignWorkspaceId, projectId, 'preview', principal, 'erp', foreignOwner]))).code, '23503')
  })

  await t.test('an Owner of another Workspace binding this Connection is refused without disclosure (P0002)', async () => {
    assert.deepEqual(await refusal(() => bind(foreignOwner, projectId, principal, 'erp')), { code: 'P0002', message: 'CONNECTOR_PROJECT_NOT_FOUND' })
  })

  await t.test('a member who is not an Owner is refused, and a stranger or an app-only Account is told nothing', async () => {
    assert.deepEqual(await refusal(() => bind(plainMember, projectId, principal, 'erp')), { code: '42501', message: 'NOT_ADMITTED' })
    for (const nonMember of [stranger, appOnly]) {
      assert.deepEqual(await refusal(() => bind(nonMember, projectId, principal, 'erp')), { code: 'P0002', message: 'CONNECTOR_PROJECT_NOT_FOUND' })
    }
    assert.deepEqual(await refusal(() => listProjectBindings(plainMember, projectId)), { code: '42501', message: 'NOT_ADMITTED' })
  })

  let erp
  await t.test('an Owner binds a Connection under a name, idempotently', async () => {
    const first = (await bind(owner, projectId, principal, 'erp')).rows[0]
    assert.deepEqual({ name: first.name, connection_id: first.connection_id, connector_id: first.connector_id, label: first.label },
      { name: 'erp', connection_id: principal, connector_id: 'sankhya', label: 'ERP principal' })
    erp = first.binding_id
    const repeat = (await bind(owner, projectId, principal, 'erp')).rows[0]
    assert.deepEqual({ binding_id: repeat.binding_id, bound_at: repeat.bound_at }, { binding_id: erp, bound_at: first.bound_at }, 'the same open binding answers a repeated request')
  })

  await t.test('the Connection under another name, or the name on another Connection, is a conflict; a second Connection of one integrator binds under its own name', async () => {
    const conflict = { code: 'P0001', message: 'CONNECTOR_BINDING_CONFLICT' }
    assert.deepEqual(await refusal(() => bind(owner, projectId, principal, 'erp-2')), conflict)
    assert.deepEqual(await refusal(() => bind(owner, projectId, branch, 'erp')), conflict)
    const filial = (await bind(owner, projectId, branch, 'filial')).rows[0]
    assert.deepEqual(await listProjectBindings(owner, projectId), [
      { kind: 'binding', binding_id: erp, name: 'erp', connection_id: principal, connector_id: 'sankhya', label: 'ERP principal' },
      { kind: 'binding', binding_id: filial.binding_id, name: 'filial', connection_id: branch, connector_id: 'sankhya', label: 'ERP filial' },
    ])
    assert.deepEqual(await listProjectBindings(owner, secondProject), [
      { kind: 'bindable', binding_id: null, name: null, connection_id: branch, connector_id: 'sankhya', label: 'ERP filial' },
      { kind: 'bindable', binding_id: null, name: null, connection_id: principal, connector_id: 'sankhya', label: 'ERP principal' },
    ])
  })

  await t.test('a name outside the pattern is refused by the column CHECK', async () => {
    for (const name of ['ERP', '1erp', 'erp_principal', `e${'r'.repeat(40)}`]) {
      assert.equal((await refusal(() => bind(owner, secondProject, principal, name))).code, '23514', name)
    }
  })

  await t.test('a Connection of another Workspace, a missing one or a disabled one cannot be bound (P0002)', async () => {
    const foreignConnectionId = randomUUID()
    await createConnection(admin, foreignConnectionId, foreignWorkspaceId, 'sankhya', 'Foreign principal', sealed)
    const unavailable = { code: 'P0002', message: 'CONNECTOR_CONNECTION_NOT_AVAILABLE' }
    assert.deepEqual(await refusal(() => bind(owner, secondProject, foreignConnectionId, 'erp')), unavailable)
    assert.deepEqual(await refusal(() => bind(owner, secondProject, randomUUID(), 'erp')), unavailable)
    const retired = randomUUID()
    await createConnection(admin, retired, workspaceId, 'sankhya', 'ERP antigo', sealed)
    await disable(admin, workspaceId, retired)
    assert.deepEqual(await refusal(() => bind(owner, secondProject, retired, 'erp')), unavailable)
  })

  await t.test('unbind is scoped to the named Project and idempotent, the row is kept as the record, and the name binds again', async () => {
    assert.equal((await unbind(owner, secondProject, erp)).rows[0].found, false, 'a binding id of another Project is not found')
    assert.equal((await unbind(owner, projectId, erp)).rows[0].found, true)
    assert.equal((await unbind(owner, projectId, erp)).rows[0].found, false, 'idempotent')
    const record = (await client.query('SELECT name, unbound_by, unbound_at IS NOT NULL AS unbound FROM connector.project_binding WHERE binding_id = $1', [erp])).rows[0]
    assert.deepEqual(record, { name: 'erp', unbound_by: owner, unbound: true })
    const again = (await bind(owner, projectId, principal, 'erp')).rows[0]
    assert.notEqual(again.binding_id, erp)
    assert.deepEqual({ name: again.name, connection_id: again.connection_id }, { name: 'erp', connection_id: principal })
  })
})

test('P8: the broker sees a bound Connection only while the binding is open, the Connection is enabled and the Project is not archived', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { client, account, workspace, project, administrator, createConnection, bind, unbind, disable, listProjectBindings, boundConnections } = await connectorDatabase(t)
  const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))
  const envelope = createSecretEnvelope('ef'.repeat(32))
  const sealed = await envelope.seal(JSON.stringify({ clientId: 'client-c', clientSecret: 'secret-c', xToken: 'token-c' }))

  const admin = await account('admin-c')
  await administrator(admin)
  const owner = await account('owner-c')
  const workspaceId = await workspace('purchasing-c', [[owner, 'owner']])
  const connectionId = randomUUID()
  await createConnection(admin, connectionId, workspaceId, 'sankhya', 'ERP principal', sealed)
  const projectA = await project(workspaceId, 'Pedidos A')
  const projectB = await project(workspaceId, 'Pedidos B')
  const bindingA = (await bind(owner, projectA, connectionId, 'erp')).rows[0].binding_id
  const bindingB = (await bind(owner, projectB, connectionId, 'erp')).rows[0].binding_id

  await t.test('an open binding, an enabled Connection and a live Project are listed', async () => {
    assert.deepEqual(await boundConnections(projectA), [{ binding_id: bindingA, name: 'erp', connection_id: connectionId, connector_id: 'sankhya' }])
    assert.deepEqual(await boundConnections(projectB), [{ binding_id: bindingB, name: 'erp', connection_id: connectionId, connector_id: 'sankhya' }])
  })

  await t.test('an archived Project lists nothing', async () => {
    await client.query('UPDATE project.project SET archived = true WHERE project_id = $1', [projectA])
    assert.deepEqual(await boundConnections(projectA), [])
    await client.query('UPDATE project.project SET archived = false WHERE project_id = $1', [projectA])
    assert.deepEqual(await boundConnections(projectA), [{ binding_id: bindingA, name: 'erp', connection_id: connectionId, connector_id: 'sankhya' }])
  })

  await t.test("unbinding one Project's binding empties only its own list", async () => {
    await unbind(owner, projectA, bindingA)
    assert.deepEqual(await boundConnections(projectA), [])
    assert.deepEqual(await boundConnections(projectB), [{ binding_id: bindingB, name: 'erp', connection_id: connectionId, connector_id: 'sankhya' }])
  })

  await t.test('disabling the Connection ends every open binding of it, and the rows stay as the record', async () => {
    await disable(admin, workspaceId, connectionId)
    assert.deepEqual(await boundConnections(projectB), [])
    const record = (await client.query('SELECT unbound_by, unbound_at IS NOT NULL AS unbound FROM connector.project_binding WHERE binding_id = $1', [bindingB])).rows[0]
    assert.deepEqual(record, { unbound_by: admin, unbound: true })
  })

  await t.test('after disable-then-create, binding the new Connection opens a new binding that is listed', async () => {
    const replacement = randomUUID()
    await createConnection(admin, replacement, workspaceId, 'sankhya', 'ERP principal novo', sealed)
    assert.deepEqual(await listProjectBindings(owner, projectB), [
      { kind: 'bindable', binding_id: null, name: null, connection_id: replacement, connector_id: 'sankhya', label: 'ERP principal novo' },
    ], 'no binding is left open on the disabled Connection')
    const bound = (await bind(owner, projectB, replacement, 'erp')).rows[0]
    assert.notEqual(bound.binding_id, bindingB)
    assert.deepEqual(await boundConnections(projectB), [{ binding_id: bound.binding_id, name: 'erp', connection_id: replacement, connector_id: 'sankhya' }])
  })
})

test('a bind that races a disable of its Connection is ended by it, never left open on a disabled Connection', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { fixture, client, account, workspace, project, administrator, createConnection, boundConnections } = await connectorDatabase(t)
  const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))
  const sealed = await createSecretEnvelope('34'.repeat(32)).seal(JSON.stringify({ clientId: 'client-e', clientSecret: 'secret-e', xToken: 'token-e' }))
  const admin = await account('admin-e')
  await administrator(admin)
  const owner = await account('owner-e')
  const workspaceId = await workspace('purchasing-e', [[owner, 'owner']])
  const connectionId = randomUUID()
  await createConnection(admin, connectionId, workspaceId, 'sankhya', 'ERP principal', sealed)
  const projectId = await project(workspaceId, 'Pedidos')

  const binding = new pg.Client(fixture.connection)
  await binding.connect()
  fixture.onCleanup(() => binding.end())
  await binding.query('BEGIN')
  const opened = (await binding.query('SELECT binding_id FROM connector.bind_connection($1,$2,$3,$4)', [owner, projectId, connectionId, 'erp'])).rows[0]
  const disabling = client.query('SELECT connector.disable_connection($1,$2,$3) AS found', [admin, workspaceId, connectionId])
  const settled = await Promise.race([disabling.then(() => 'DISABLED'), new Promise((wake) => { setTimeout(() => wake('WAITING'), 300) })])
  assert.equal(settled, 'WAITING', 'the disable waits for the open bind transaction')
  await binding.query('COMMIT')
  assert.equal((await disabling).rows[0].found, true)
  const record = (await client.query('SELECT unbound_by FROM connector.project_binding WHERE binding_id = $1', [opened.binding_id])).rows[0]
  assert.deepEqual(record, { unbound_by: admin })
  assert.deepEqual(await boundConnections(projectId), [])
})

test('read_connection_credential and list_bound_connections: the broker surface no admission gates', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { client, account, workspace, project, administrator, createConnection, bind, disable, boundConnections } = await connectorDatabase(t)
  const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))
  const envelope = createSecretEnvelope('12'.repeat(32))
  const credential = { clientId: 'client-d', clientSecret: 'secret-d', xToken: 'token-d' }
  const sealed = await envelope.seal(JSON.stringify(credential))

  const admin = await account('admin-d')
  await administrator(admin)
  const owner = await account('owner-d')
  const workspaceId = await workspace('purchasing-d', [[owner, 'owner']])
  const connectionId = randomUUID()
  await createConnection(admin, connectionId, workspaceId, 'sankhya', 'ERP principal', sealed)
  const projectId = await project(workspaceId, 'Pedidos')
  const bindingId = (await bind(owner, projectId, connectionId, 'erp')).rows[0].binding_id

  const read = async (id) => (await client.query('SELECT connector.read_connection_credential($1) AS sealed', [id])).rows[0].sealed
  assert.equal(JSON.parse(await envelope.open(await read(connectionId))).clientId, 'client-d')
  assert.deepEqual(await boundConnections(projectId), [{ binding_id: bindingId, name: 'erp', connection_id: connectionId, connector_id: 'sankhya' }])

  await disable(admin, workspaceId, connectionId)
  assert.equal(await read(connectionId), null, 'a disabled Connection answers no credential')
  assert.deepEqual(await boundConnections(projectId), [])
})

test('0031 moves every grant to a binding: open grants of one Connection collapse into one erp binding, revoked grants stay as unbound rows, and the grant table and its functions are gone', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const fixture = await createEmptyDatabase(t, 'connector_move')
  const migrations = loadHubMigrationFiles()
  await runMigrations({ connectionString: fixture.connectionString, migrations: migrations.filter(({ version }) => version <= '0030'), catalogSnapshot: null })
  const client = new pg.Client(fixture.connection)
  await client.connect()
  fixture.onCleanup(() => client.end())
  const { account, workspace, project } = seeding(client)

  const owner = await account('owner-move')
  const successor = await account('successor-move')
  const workspaceId = await workspace('purchasing-move', [[owner, 'owner'], [successor, 'owner']])
  const orders = await project(workspaceId, 'Pedidos')
  const notes = await project(workspaceId, 'Notas')
  const retired = randomUUID()
  const principal = randomUUID()
  await client.query(`INSERT INTO connector.connection(connection_id, workspace_id, connector_id, label, credential_sealed, credential_digest, created_by, created_at, disabled_by, disabled_at)
    VALUES ($1, $2, 'sankhya', 'ERP antigo', 'mastra:factory-secret:v1:retired', $3, $4, '2026-09-20T09:00:00Z', $4, '2026-09-22T09:00:00Z')`, [retired, workspaceId, DIGEST, owner])
  await client.query(`INSERT INTO connector.connection(connection_id, workspace_id, connector_id, label, credential_sealed, credential_digest, created_by, created_at)
    VALUES ($1, $2, 'sankhya', 'ERP principal', 'mastra:factory-secret:v1:principal', $3, $4, '2026-09-22T10:00:00Z')`, [principal, workspaceId, DIGEST, owner])

  const ORDER = '0000000a-0000-4000-8000-000000000001'
  const SPIKE = '0000000a-0000-4000-8000-000000000002'
  const WITHDRAWN = '0000000a-0000-4000-8000-000000000003'
  const BEFORE_DISABLE = '0000000a-0000-4000-8000-000000000004'
  const NOTES = '0000000a-0000-4000-8000-000000000005'
  const grant = (grantId, projectId, connectionId, capabilityId, grantedBy, grantedAt, revokedBy = null, revokedAt = null) => client.query(
    `INSERT INTO connector.project_grant(grant_id, workspace_id, project_id, environment, connection_id, capability_kind, capability_id, granted_by, granted_at, revoked_by, revoked_at)
     VALUES ($1, $2, $3, 'preview', $4, 'operation', $5, $6, $7, $8, $9)`,
    [grantId, workspaceId, projectId, connectionId, capabilityId, grantedBy, grantedAt, revokedBy, revokedAt])
  await grant(BEFORE_DISABLE, orders, retired, 'sankhya.purchase-order.read', owner, '2026-09-21T09:00:00Z', owner, '2026-09-22T09:00:00Z')
  await grant(ORDER, orders, principal, 'sankhya.purchase-order.read', successor, '2026-09-24T11:00:00Z')
  await grant(SPIKE, orders, principal, 'sankhya.read', owner, '2026-09-23T10:00:00Z')
  await grant(WITHDRAWN, orders, principal, 'sankhya.order-item.read', owner, '2026-09-23T12:00:00Z', successor, '2026-09-25T08:00:00Z')
  await grant(NOTES, notes, principal, 'sankhya.purchase-order.read', successor, '2026-09-24T12:00:00Z')

  const result = await runMigrations({ connectionString: fixture.connectionString, migrations: migrations.filter(({ version }) => version <= '0031'), catalogSnapshot: null })
  assert.deepEqual(result.appliedNow, ['0031'])

  const rows = (await client.query(`SELECT binding_id, project_id, environment, connection_id, name, bound_by, bound_at, unbound_by, unbound_at
    FROM connector.project_binding ORDER BY binding_id`)).rows
  assert.deepEqual(rows, [
    { binding_id: SPIKE, project_id: orders, environment: 'preview', connection_id: principal, name: 'erp', bound_by: owner, bound_at: new Date('2026-09-23T10:00:00Z'), unbound_by: null, unbound_at: null },
    { binding_id: WITHDRAWN, project_id: orders, environment: 'preview', connection_id: principal, name: 'erp', bound_by: owner, bound_at: new Date('2026-09-23T12:00:00Z'), unbound_by: successor, unbound_at: new Date('2026-09-25T08:00:00Z') },
    { binding_id: BEFORE_DISABLE, project_id: orders, environment: 'preview', connection_id: retired, name: 'erp', bound_by: owner, bound_at: new Date('2026-09-21T09:00:00Z'), unbound_by: owner, unbound_at: new Date('2026-09-22T09:00:00Z') },
    { binding_id: NOTES, project_id: notes, environment: 'preview', connection_id: principal, name: 'erp', bound_by: successor, bound_at: new Date('2026-09-24T12:00:00Z'), unbound_by: null, unbound_at: null },
  ])
  assert.deepEqual((await client.query('SELECT binding_id, name, connection_id, connector_id FROM connector.list_bound_connections($1, $2)', [orders, 'preview'])).rows,
    [{ binding_id: SPIKE, name: 'erp', connection_id: principal, connector_id: 'sankhya' }])

  const gone = (await client.query(`SELECT to_regclass('connector.project_grant') AS grant_table,
    (SELECT array_agg(p.proname::text ORDER BY p.proname) FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'connector') AS functions`)).rows[0]
  assert.deepEqual(gone, {
    grant_table: null,
    functions: [
      'admit_installation_administrator', 'admit_project_owner', 'bind_connection', 'create_connection', 'disable_connection',
      'list_bound_connections', 'list_connections', 'list_project_bindings', 'purge_project', 'read_connection_credential', 'unbind_connection',
    ],
  })
})

test('the Hub store tells an identical retry from a changed credential without opening the stored one, and settles concurrent binds on one binding', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { fixture, client, account, workspace, project, administrator } = await connectorDatabase(t)
  const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))
  const { createConnectorStore } = await import(hubModuleUrl('connectors/store.js'))
  const { isConnectorConnectionConflict } = await import(hubModuleUrl('connectors/model.js'))
  const pool = new pg.Pool({ connectionString: fixture.connectionString, options: '-c role=hub_iam_runtime', max: 10 })
  pool.on('error', () => {})
  fixture.onCleanup(() => pool.end())
  const envelope = createSecretEnvelope('ab'.repeat(32))
  const store = createConnectorStore({ pool, envelope })

  const admin = await account('admin-store')
  await administrator(admin)
  const workspaceId = await workspace('purchasing-store', [[admin, 'owner']])
  const credential = { clientId: 'client-a', clientSecret: 'super-secret-value', xToken: 'x-token-value' }
  const create = (connectionId, fields = {}) => store.createConnection({ actor: admin, connectionId, workspaceId, connectorId: 'sankhya', label: 'ERP principal', credential, ...fields })
  const summary = ({ connection, created }) => ({ connectionId: connection.connectionId, created })

  const connectionId = randomUUID()
  assert.deepEqual(summary(await create(connectionId)), { connectionId, created: true })
  assert.deepEqual(summary(await create(connectionId, { credential: { xToken: 'x-token-value', clientSecret: 'super-secret-value', clientId: 'client-a' } })),
    { connectionId, created: false }, 'the same credential in another key order is the same retry')
  const changed = await create(connectionId, { credential: { ...credential, xToken: 'another-x-token' } }).then(() => null, (error) => error)
  assert.equal(isConnectorConnectionConflict(changed), true, 'a retry that changes the credential is a conflict')

  assert.equal((await refusal(() => pool.query('SELECT credential_digest FROM connector.connection'))).code, '42501', 'hub_iam_runtime only calls the functions')
  const digest = (await client.query('SELECT credential_digest FROM connector.connection WHERE connection_id = $1', [connectionId])).rows[0].credential_digest
  const canonical = JSON.stringify({ clientId: 'client-a', clientSecret: 'super-secret-value', xToken: 'x-token-value' })
  assert.equal(digest, envelope.fingerprints(canonical)[0])
  assert.notEqual(digest, createSecretEnvelope('cd'.repeat(32)).fingerprints(canonical)[0], 'the digest is keyed by the installation key')

  // The installation key rotates, and the old one stays configured to open what it sealed.
  const rotated = createConnectorStore({ pool, envelope: createSecretEnvelope('cd'.repeat(32), ['ab'.repeat(32)]) })
  const createRotated = (fields = {}) => rotated.createConnection({ actor: admin, connectionId, workspaceId, connectorId: 'sankhya', label: 'ERP principal', credential, ...fields })
  assert.deepEqual(summary(await createRotated()), { connectionId, created: false }, 'an identical retry after the rotation still replays')
  const changedAfterRotation = await createRotated({ credential: { ...credential, xToken: 'another-x-token' } }).then(() => null, (error) => error)
  assert.equal(isConnectorConnectionConflict(changedAfterRotation), true, 'a changed credential is still a conflict after the rotation')
  const forgotten = createConnectorStore({ pool, envelope: createSecretEnvelope('cd'.repeat(32)) })
  const afterRetirement = await forgotten.createConnection({ actor: admin, connectionId, workspaceId, connectorId: 'sankhya', label: 'ERP principal', credential }).then(() => null, (error) => error)
  assert.equal(isConnectorConnectionConflict(afterRetirement), true, 'once the old key is no longer configured, the stored digest cannot be matched')

  // A client that times out and retries while its first request is still in flight.
  const racedId = randomUUID()
  const other = await workspace('purchasing-race', [[admin, 'owner']])
  const raced = await Promise.all(Array.from({ length: 8 }, () => store.createConnection({ actor: admin, connectionId: racedId, workspaceId: other, connectorId: 'sankhya', label: 'ERP', credential })))
  assert.deepEqual(raced.map(summary).filter(({ created }) => created), [{ connectionId: racedId, created: true }])
  assert.equal(raced.every(({ connection }) => connection.connectionId === racedId), true)

  const projectId = await project(other, 'race')
  const bindings = await Promise.all(Array.from({ length: 8 }, () => store.bindConnection({ actor: admin, projectId, connectionId: racedId, name: 'erp' })))
  assert.equal(new Set(bindings.map((binding) => binding.bindingId)).size, 1)
  const { bindingId: _settled, boundAt: _at, ...settled } = bindings[0]
  assert.deepEqual(settled, { kind: 'binding', name: 'erp', connectionId: racedId, connectorId: 'sankhya', label: 'ERP' })
  const open = await client.query('SELECT count(*)::int AS open FROM connector.project_binding WHERE project_id = $1 AND unbound_at IS NULL', [projectId])
  assert.deepEqual(open.rows, [{ open: 1 }])
  const listed = await store.listProjectBindings({ actor: admin, projectId })
  assert.deepEqual(listed, [bindings[0]])
})
