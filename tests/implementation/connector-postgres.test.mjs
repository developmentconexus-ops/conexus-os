import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { hubModuleUrl } from './hub-build.mjs'
import { buildHubDatabase } from './hub-database.mjs'

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

const connectorDatabase = async (t) => {
  const fixture = await buildHubDatabase(t, 'connector')
  const client = new pg.Client(fixture.connection)
  await client.connect()
  // buildHubDatabase drops the database WITH (FORCE) in its own t.after, which would otherwise race
  // this client's own teardown and surface as an unhandled termination error; onCleanup runs first.
  fixture.onCleanup(() => client.end())

  const account = async (label, { active = true } = {}) => {
    const accountId = randomUUID()
    await client.query('INSERT INTO iam.account(account_id, issuer, external_subject, display_name, email, active) VALUES ($1,$2,$3,$4,$5,$6)',
      [accountId, 'https://connector.test', accountId, label, `${label}@connector.test`, active])
    return accountId
  }
  const workspace = async (label, members = []) => {
    const workspaceId = randomUUID()
    await client.query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1,$2)', [workspaceId, label])
    for (const [accountId, role] of members) {
      await client.query('INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1,$2,$3)', [accountId, workspaceId, role])
    }
    return workspaceId
  }
  const project = async (workspaceId, name) => {
    const projectId = randomUUID()
    await client.query("INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1,$2,$3,'NEW',$4,$5)",
      [projectId, workspaceId, name, 'a'.repeat(40), name])
    return projectId
  }
  const administrator = async (accountId) => {
    await client.query("INSERT INTO iam.installation_administrator(account_id, granted_via) VALUES ($1, 'OPERATOR_BOOTSTRAP')", [accountId])
  }
  const createConnection = (actor, connectionId, workspaceId, connectorId, label, credentialSealed, credentialDigest = DIGEST) =>
    client.query('SELECT connection_id, connector_id, label, created_at, disabled_at, created FROM connector.create_connection($1,$2,$3,$4,$5,$6,$7)',
      [actor, connectionId, workspaceId, connectorId, label, credentialSealed, credentialDigest])
  const grant = (actor, projectId, connectionId, operationId) =>
    client.query('SELECT grant_id, connection_id, connector_id, capability_id, granted_at FROM connector.grant_capability($1,$2,$3,$4)',
      [actor, projectId, connectionId, operationId])
  const revoke = (actor, projectId, grantId) =>
    client.query('SELECT connector.revoke_grant($1,$2,$3) AS found', [actor, projectId, grantId])
  const disable = (actor, workspaceId, connectionId) =>
    client.query('SELECT connector.disable_connection($1,$2,$3) AS found', [actor, workspaceId, connectionId])
  const resolveGrant = (projectId, environment, kind, capabilityId) =>
    client.query('SELECT grant_id, connection_id FROM connector.resolve_grant($1,$2,$3,$4)', [projectId, environment, kind, capabilityId])

  return { fixture, client, account, workspace, project, administrator, createConnection, grant, revoke, disable, resolveGrant }
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

  await t.test('a second open Connection of the same Workspace and Connector is refused', async () => {
    assert.deepEqual(await refusal(() => createConnection(admin, randomUUID(), workspaceId, 'sankhya', 'Second', sealed)),
      { code: 'P0001', message: 'CONNECTOR_CONNECTION_CONFLICT' })
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
    assert.deepEqual(listed.rows, [{ connector_id: 'sankhya', label: 'ERP principal' }])
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

test('Project Grants: P7 cross-Workspace is unrepresentable and non-disclosing, Owner admission, idempotent grant and revoke', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { client, account, workspace, project, administrator, createConnection, grant, revoke, disable } = await connectorDatabase(t)
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
  const connectionId = randomUUID()
  await createConnection(admin, connectionId, workspaceId, 'sankhya', 'ERP principal', sealed)
  const projectId = await project(workspaceId, 'Pedidos')
  const secondProject = await project(workspaceId, 'Notas')
  const operationId = 'sankhya.purchase-order.read'

  await t.test('P7: a direct insert with mismatched Workspaces fails 23503, and it cannot be written at all', async () => {
    assert.equal((await refusal(() => client.query(
      'INSERT INTO connector.project_grant (workspace_id, project_id, environment, connection_id, capability_kind, capability_id, granted_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [foreignWorkspaceId, projectId, 'preview', connectionId, 'operation', operationId, foreignOwner]))).code, '23503')
  })

  await t.test('an Owner of another Workspace granting this Connection is refused without disclosure (P0002)', async () => {
    assert.deepEqual(await refusal(() => grant(foreignOwner, projectId, connectionId, operationId)), { code: 'P0002', message: 'CONNECTOR_PROJECT_NOT_FOUND' })
  })

  await t.test('a member who is not an Owner is refused, and a stranger or an app-only Account is told nothing', async () => {
    assert.deepEqual(await refusal(() => grant(plainMember, projectId, connectionId, operationId)), { code: '42501', message: 'NOT_ADMITTED' })
    for (const nonMember of [stranger, appOnly]) {
      assert.deepEqual(await refusal(() => grant(nonMember, projectId, connectionId, operationId)), { code: 'P0002', message: 'CONNECTOR_PROJECT_NOT_FOUND' })
    }
  })

  let grantId
  await t.test('an Owner grants the operation, idempotently', async () => {
    const first = (await grant(owner, projectId, connectionId, operationId)).rows[0]
    assert.deepEqual({ connection_id: first.connection_id, connector_id: first.connector_id, capability_id: first.capability_id },
      { connection_id: connectionId, connector_id: 'sankhya', capability_id: operationId })
    grantId = first.grant_id
    const repeat = (await grant(owner, projectId, connectionId, operationId)).rows[0]
    assert.equal(repeat.grant_id, grantId, 'the same open grant answers a repeated request')
  })

  await t.test('a Connection of another Workspace, or a disabled one, cannot be granted (P0002)', async () => {
    const foreignConnectionId = randomUUID()
    await createConnection(admin, foreignConnectionId, foreignWorkspaceId, 'sankhya', 'Foreign principal', sealed)
    assert.deepEqual(await refusal(() => grant(owner, projectId, foreignConnectionId, operationId)), { code: 'P0002', message: 'CONNECTOR_CONNECTION_NOT_AVAILABLE' })
    await disable(admin, workspaceId, connectionId)
    assert.deepEqual(await refusal(() => grant(owner, secondProject, connectionId, operationId)), { code: 'P0002', message: 'CONNECTOR_CONNECTION_NOT_AVAILABLE' })
    // Re-enable is disable-then-create per the immutable Connection design; restore a live one for the rest of this test by disabling nothing further and using a fresh Connection instead.
  })

  await t.test('revoke is scoped to the named Project and idempotent, and the row is kept as the record', async () => {
    const freshConnectionId = randomUUID()
    await createConnection(admin, freshConnectionId, workspaceId, 'sankhya', 'ERP principal 2', sealed)
    const opened = (await grant(owner, secondProject, freshConnectionId, operationId)).rows[0]
    assert.equal((await revoke(owner, projectId, opened.grant_id)).rows[0].found, false, 'a grant id of another Project is not found')
    assert.equal((await revoke(owner, secondProject, opened.grant_id)).rows[0].found, true)
    assert.equal((await revoke(owner, secondProject, opened.grant_id)).rows[0].found, false, 'idempotent')
    const record = (await client.query('SELECT revoked_by, revoked_at IS NOT NULL AS revoked FROM connector.project_grant WHERE grant_id = $1', [opened.grant_id])).rows[0]
    assert.deepEqual(record, { revoked_by: owner, revoked: true })
  })
})

test('P8: the broker sees a resolvable grant only while it is open, the Connection is enabled and the Project is not archived', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { client, account, workspace, project, administrator, createConnection, grant, revoke, disable, resolveGrant } = await connectorDatabase(t)
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
  const operationId = 'sankhya.purchase-order.read'
  const grantA = (await grant(owner, projectA, connectionId, operationId)).rows[0]
  const grantB = (await grant(owner, projectB, connectionId, operationId)).rows[0]

  await t.test('an open grant, an enabled Connection and a live Project resolve', async () => {
    for (const [projectId, expected] of [[projectA, grantA], [projectB, grantB]]) {
      const resolved = (await resolveGrant(projectId, 'preview', 'operation', operationId)).rows[0]
      assert.deepEqual(resolved, { grant_id: expected.grant_id, connection_id: connectionId })
    }
  })

  await t.test('an archived Project resolves nothing', async () => {
    await client.query('UPDATE project.project SET archived = true WHERE project_id = $1', [projectA])
    assert.deepEqual((await resolveGrant(projectA, 'preview', 'operation', operationId)).rows, [])
    await client.query('UPDATE project.project SET archived = false WHERE project_id = $1', [projectA])
  })

  await t.test('revoking one Project\'s grant empties only its own resolve_grant', async () => {
    await revoke(owner, projectA, grantA.grant_id)
    assert.deepEqual((await resolveGrant(projectA, 'preview', 'operation', operationId)).rows, [])
    assert.deepEqual((await resolveGrant(projectB, 'preview', 'operation', operationId)).rows[0], { grant_id: grantB.grant_id, connection_id: connectionId })
  })

  await t.test('disabling the Connection empties resolve_grant for every Project that held an open grant through it', async () => {
    await disable(admin, workspaceId, connectionId)
    assert.deepEqual((await resolveGrant(projectB, 'preview', 'operation', operationId)).rows, [])
  })
})

test('read_connection_credential and list_granted_capabilities: the broker surface no admission gates', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { client, account, workspace, project, administrator, createConnection, grant, disable } = await connectorDatabase(t)
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
  const operationId = 'sankhya.purchase-order.read'
  await grant(owner, projectId, connectionId, operationId)

  const read = async (id) => (await client.query('SELECT connector.read_connection_credential($1) AS sealed', [id])).rows[0].sealed
  assert.equal(JSON.parse(await envelope.open(await read(connectionId))).clientId, 'client-d')
  assert.deepEqual((await client.query('SELECT capability_kind, capability_id FROM connector.list_granted_capabilities($1, $2)', [projectId, 'preview'])).rows,
    [{ capability_kind: 'operation', capability_id: operationId }])

  await disable(admin, workspaceId, connectionId)
  assert.equal(await read(connectionId), null, 'a disabled Connection answers no credential')
  assert.deepEqual((await client.query('SELECT * FROM connector.list_granted_capabilities($1, $2)', [projectId, 'preview'])).rows, [])
})

test('the Hub store tells an identical retry from a changed credential without opening the stored one', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const { fixture, client, account, workspace, administrator } = await connectorDatabase(t)
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
  assert.equal(digest, envelope.fingerprint(canonical))
  assert.notEqual(digest, createSecretEnvelope('cd'.repeat(32)).fingerprint(canonical), 'the digest is keyed by the installation key')

  // A client that times out and retries while its first request is still in flight.
  const racedId = randomUUID()
  const other = await workspace('purchasing-race', [[admin, 'owner']])
  const raced = await Promise.all(Array.from({ length: 8 }, () => store.createConnection({ actor: admin, connectionId: racedId, workspaceId: other, connectorId: 'sankhya', label: 'ERP', credential })))
  assert.deepEqual(raced.map(summary).filter(({ created }) => created), [{ connectionId: racedId, created: true }])
  assert.equal(raced.every(({ connection }) => connection.connectionId === racedId), true)
})
