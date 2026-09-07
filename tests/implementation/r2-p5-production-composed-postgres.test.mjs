import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import pg from 'pg'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'
import { runR2HubMigrations } from '../../scripts/run-hub-migrations.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const admittedGit = process.env.CONEXUS_R2_P4_GIT_LIVE === 'true'
const databaseConfigured = [
  'CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME',
  'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD',
].every((name) => process.env[name])

const quoteIdentifier = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('UNSAFE_TEST_IDENTIFIER')
  return `"${value}"`
}
const digestOf = (value) => sha256(canonicalBytes(value))
const query = async (connection, statement, values = []) => {
  const client = new pg.Client(connection)
  await client.connect()
  try { return await client.query(statement, values) } finally { await client.end() }
}
const compileHub = () => {
  const outputRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-p5-composed-build-'))
  const result = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
    '--noEmit', 'false', '--outDir', outputRoot,
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  if (result.status !== 0) {
    rmSync(outputRoot, { recursive: true, force: true })
    throw new Error(`R2_P5_COMPOSED_HUB_COMPILE_FAILED\n${result.stdout}\n${result.stderr}`)
  }
  return { outputRoot, built: (path) => pathToFileURL(resolve(outputRoot, path)).href }
}

const createSourceRepository = ({ storageRoot, projectId, manifest, connectionDeclaration }) => {
  const repository = resolve(storageRoot, 'projects', projectId)
  mkdirSync(repository, { recursive: true })
  const git = (args, input) => {
    const result = spawnSync('git', ['--git-dir', repository, ...args], {
      cwd: repositoryRoot, input, encoding: Buffer.isBuffer(input) ? null : 'utf8', env: {
        ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_AUTHOR_NAME: 'Conexus P5 composed proof', GIT_AUTHOR_EMAIL: 'proof@conexus.invalid',
        GIT_COMMITTER_NAME: 'Conexus P5 composed proof', GIT_COMMITTER_EMAIL: 'proof@conexus.invalid',
      },
    })
    assert.equal(result.status, 0, result.stderr?.toString() ?? '')
    return result.stdout.toString().trim()
  }
  git(['init', '--bare'])
  git(['symbolic-ref', 'HEAD', 'refs/heads/main'])
  const manifestBlob = git(['hash-object', '-w', '--stdin'], canonicalBytes(manifest))
  const brainTree = git(['mktree'], `100644 blob ${manifestBlob}\trealization.json\n`)
  const connectionBlob = git(['hash-object', '-w', '--stdin'], canonicalBytes(connectionDeclaration))
  const projectTree = git(['mktree'], `100644 blob ${connectionBlob}\tconnection-bindings.json\n`)
  const conexusTree = git(['mktree'], `040000 tree ${brainTree}\tbrain\n040000 tree ${projectTree}\tproject\n`)
  const rootTree = git(['mktree'], `040000 tree ${conexusTree}\t.conexus\n`)
  const sourceRevision = git(['commit-tree', rootTree, '-m', 'Admitted P5 composed source'])
  git(['update-ref', 'refs/heads/main', sourceRevision])
  return { repository, sourceRevision, currentHead: () => readFileSync(resolve(repository, 'refs/heads/main'), 'utf8').trim() }
}

const brainSource = () => ({
  schemaVersion: 'conexus-brain/v2', reviewText: 'Reviewed budget key meaning.',
  knowledgeBrowse: { domains: [] },
  items: [{ itemId: 'brain.dataset.budget', kind: 'DATASET', grainId: 'budget-document', dependsOn: [] }],
  assertions: [{ assertionId: 'budget-keys', itemId: 'brain.dataset.budget', kind: 'KEY_CONFORMANCE', predicateVersion: '1', scope: 'SELECTED' }],
})

const responseBody = Object.freeze({
  burstLimit: false,
  fieldsMetadata: [
    { description: 'Total rows', name: 'TOTAL_ROWS', order: 1, userType: 'I' },
    { description: 'Null key rows', name: 'NULL_KEY_ROWS', order: 2, userType: 'I' },
    { description: 'Duplicate key groups', name: 'DUPLICATE_KEY_GROUPS', order: 3, userType: 'I' },
  ],
  rows: [[1, 0, 0]], timeQuery: '0.01', timeResultSet: '0.01',
})
const aggregateResponse = Object.freeze({
  pendingPrinting: 'false', responseBody, serviceName: 'DbExplorerSP.executeQuery',
  status: '1', transactionId: '0123456789abcdefghijklmnopqrstuv',
})

test('R2-P5 configured P4/P5 composition settles PRJ-11 through local Sankhya stand-in', {
  skip: admittedGit && databaseConfigured ? false :
    'requires CONEXUS_R2_P4_GIT_LIVE=true and CONEXUS_TEST_DB_*',
  timeout: 900_000,
}, async (t) => {
  const admin = {
    host: process.env.CONEXUS_TEST_DB_HOST, port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME, user: process.env.CONEXUS_TEST_DB_USER,
    password: process.env.CONEXUS_TEST_DB_PASSWORD,
  }
  const database = `conexus_r2_p5_composed_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  await query(admin, `CREATE DATABASE ${quoteIdentifier(database)}`)
  const fresh = { ...admin, database }
  const connectionString = new URL('postgresql://localhost')
  connectionString.hostname = fresh.host; connectionString.port = String(fresh.port)
  connectionString.pathname = `/${database}`; connectionString.username = fresh.user; connectionString.password = fresh.password
  const { outputRoot, built } = compileHub()
  const storageRoot = mkdtempSync('/tmp/conexus-r2-p5-composed-')
  const credentialRoot = resolve(storageRoot, 'credentials')
  mkdirSync(credentialRoot, { mode: 0o700 })
  const passwords = new Map()
  const pools = []
  let app
  let configured
  let configuredConnection
  let keyPool
  let standIn
  t.after(async () => {
    await app?.close().catch(() => {})
    await configured?.close().catch(() => {})
    await configuredConnection?.close().catch(() => {})
    await keyPool?.end().catch(() => {})
    await standIn?.close().catch(() => {})
    for (const pool of pools) await pool.end().catch(() => {})
    for (const role of passwords.keys()) await query(admin, `ALTER ROLE ${role} PASSWORD NULL`).catch(() => {})
    await query(admin, `DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`).catch(() => {})
    rmSync(storageRoot, { recursive: true, force: true })
    rmSync(outputRoot, { recursive: true, force: true })
  })
  await runR2HubMigrations({ connectionString: connectionString.toString() })

  const [gateway, connections, platformCredential, platformPostgres, project] = await Promise.all([
    import(built('gateway/module.js')),
    import(built('connections/module.js')),
    import(built('platform/credential-backend.js')),
    import(built('platform/postgres.js')),
    import(built('project/module.js')),
  ])
  const accountId = randomUUID(); const workspaceId = randomUUID(); const projectId = randomUUID()
  const artifactId = randomUUID(); const connectionId = randomUUID(); const connectionRevisionId = randomUUID()
  const filialConnectionId = randomUUID(); const filialConnectionRevisionId = randomUUID()
  const queryId = 'budget.keys'; const mappingDigest = gateway.SANKHYA_TGFCAB_KEY_MAPPING_DIGEST
  const manifest = {
    schemaVersion: 'conexus-project-brain-realization/v1', selectedRoots: ['brain.dataset.budget'],
    mappings: [{ itemId: 'brain.dataset.budget', queryId, mappingDigest }], sourceInputs: [],
  }
  const brainRevisionId = randomUUID(); const brainPayload = brainSource(); const brainDigest = digestOf(brainPayload)
  const connectionConfiguration = { environment: 'PRODUCTION', companyCode: 1 }
  const sourceOwnershipPath = resolve(storageRoot, 'ownership.json')
  writeFileSync(sourceOwnershipPath, JSON.stringify({
    '.conexus/brain/realization.json': 'APP-OWNED',
    '.conexus/project/connection-bindings.json': 'PLATFORM-CONTRACT',
  }), { mode: 0o600 })
  const catalogPath = resolve(storageRoot, 'catalog.json')
  const descriptor = {
    queryId, queryVersion: '1', workspaceId, projectId, connectionId, environment: 'PRODUCTION',
    datasetId: 'brain.dataset.budget', grainId: 'budget-document', mappingDigest,
  }
  const writeCatalog = (companyCode) => writeFileSync(catalogPath, JSON.stringify({
    schemaVersion: 'conexus-key-conformance-registration-catalog/v1', entries: [{
      descriptor, producer: { producerId: 'sankhya-budget-header-key-conformance/v1', companyCode },
    }],
  }), { mode: 0o600 })
  writeCatalog(1)

  await query(fresh, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', $2, 'P5 composed actor')`, [accountId, `p5-${accountId}`])
  await query(fresh, 'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, 'P5 composed workspace'])
  await query(fresh, `INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project, can_read_brain,
    can_qualify_connection) VALUES ($1, $2, false, true, true)`, [accountId, workspaceId])
  await query(fresh, `INSERT INTO con.connection(connection_id, owner_scope_kind, workspace_id, name,
    credential_generation, credential_generation_high_watermark) VALUES ($1, 'WORKSPACE', $2, 'P5 Sankhya', 1, 1)`, [connectionId, workspaceId])
  await query(fresh, `INSERT INTO con.connection_revision(connection_revision_id, connection_id,
    connector_definition_id, connector_version, configuration, configuration_digest)
    VALUES ($1, $2, 'sankhya-om', '1.0.0', $3::jsonb, $4)`, [connectionRevisionId, connectionId,
    JSON.stringify(connectionConfiguration), digestOf(connectionConfiguration)])
  await query(fresh, 'UPDATE con.connection SET current_revision_id = $2 WHERE connection_id = $1', [connectionId, connectionRevisionId])
  const filialConfiguration = { environment: 'PRODUCTION', companyCode: 2 }
  await query(fresh, `INSERT INTO con.connection(connection_id, owner_scope_kind, workspace_id, name,
    credential_generation, credential_generation_high_watermark) VALUES ($1, 'WORKSPACE', $2, 'P5 Sankhya Filial', 1, 1)`, [filialConnectionId, workspaceId])
  await query(fresh, `INSERT INTO con.connection_revision(connection_revision_id, connection_id,
    connector_definition_id, connector_version, configuration, configuration_digest)
    VALUES ($1, $2, 'sankhya-om', '1.0.0', $3::jsonb, $4)`, [filialConnectionRevisionId, filialConnectionId,
    JSON.stringify(filialConfiguration), digestOf(filialConfiguration)])
  await query(fresh, 'UPDATE con.connection SET current_revision_id = $2 WHERE connection_id = $1', [filialConnectionId, filialConnectionRevisionId])
  for (const role of ['hub_r2_connections', 'hub_r2_project_binding', 'hub_r2_brain_attester', 'hub_r2_key_conformance_subject']) {
    const password = `${role}-${randomUUID()}`
    passwords.set(role, password)
    await query(admin, `ALTER ROLE ${role} PASSWORD '${password}'`)
  }
  const secretDir = mkdtempSync(resolve(storageRoot, 'secrets-'))
  const secretPath = (name, value) => {
    const path = resolve(secretDir, name)
    writeFileSync(path, `${value}\n`, { mode: 0o600 })
    return path
  }
  const bindingPasswordFile = secretPath('binding', passwords.get('hub_r2_project_binding'))
  const attesterPasswordFile = secretPath('attester', passwords.get('hub_r2_brain_attester'))
  const connectionPasswordFile = secretPath('connections', passwords.get('hub_r2_connections'))
  const ownership = project.createConfiguredProjectSourceSnapshotFactory({ storageRoot, sourceOwnershipManifestFile: sourceOwnershipPath })
  keyPool = platformPostgres.createPostgresPool({ ...fresh, user: 'hub_r2_key_conformance_subject', password: passwords.get('hub_r2_key_conformance_subject') })
  const resolveBasis = project.createProjectKeyConformanceBasisResolver({ pool: keyPool, sourceSnapshot: ownership })
  const resolveSubject = gateway.createSankhyaKeyConformanceSubjectResolver({ resolveBasis })

  const credentialKeyPath = secretPath('credential-key', Buffer.from('k'.repeat(32)).toString('base64'))
  const credentialBackend = platformCredential.createEncryptedFileCredentialBackend({ root: credentialRoot, keyFile: credentialKeyPath, keyGeneration: '1' })
  await credentialBackend.write({ connectionId, generation: '1' }, Buffer.from(JSON.stringify({ clientId: 'client-id', clientSecret: 'client-secret', xToken: 'x-token' })))
  await credentialBackend.write({ connectionId: filialConnectionId, generation: '1' }, Buffer.from(JSON.stringify({ clientId: 'filial-client-id', clientSecret: 'filial-client-secret', xToken: 'filial-x-token' })))
  const requests = []
  standIn = await new Promise((resolveServer, reject) => {
    const server = createServer(async (incoming, outgoing) => {
      const chunks = []
      for await (const chunk of incoming) chunks.push(chunk)
      requests.push({ method: incoming.method, url: incoming.url, body: Buffer.concat(chunks).toString('utf8') })
      outgoing.setHeader('content-type', 'application/json; charset=utf-8')
      if (incoming.url === '/authenticate') return outgoing.end(JSON.stringify({
        access_token: 'stand-in-bearer', expires_in: 1800, 'not-before-policy': 0,
        refresh_expires_in: 0, token_type: 'Bearer', scope: 'gateway',
      }))
      if (incoming.url === '/v1/empresas/1') return outgoing.end(JSON.stringify({ empresas: { codigoEmpresa: 1 } }))
      if (incoming.url === '/v1/empresas/2') return outgoing.end(JSON.stringify({ empresas: { codigoEmpresa: 2 } }))
      return outgoing.end(JSON.stringify(aggregateResponse))
    })
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolveServer({
      server, origin: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise((resolveClose) => server.close(resolveClose)),
    }))
  })
  const fetchImpl = async (input, init) => {
    const requested = new URL(String(input))
    assert.equal(requested.origin, 'https://api.sankhya.com.br')
    return fetch(`${standIn.origin}${requested.pathname}${requested.search}`, init)
  }
  const admission = connections.sankhyaProductionResponseAdmission
  const registrations = gateway.readSankhyaKeyConformanceRegistrationCatalog(catalogPath).map(({ descriptor: item, producer }) => ({
    ...item,
    observe: gateway.createSankhyaKeyConformanceObserver({
      origin: 'https://api.sankhya.com.br', environment: item.environment, companyCode: producer.companyCode,
      fetchImpl,
      authenticate: (coordinate) => connections.authenticateSankhya({
        configuration: { environment: item.environment, companyCode: producer.companyCode }, credentialCoordinate: coordinate,
        credentialBackend, responseAdmission: admission, fetchImpl,
      }),
    }),
  }))
  const conformance = gateway.createRegisteredKeyConformance({ registrations, resolveSubject })
  const validator = (await import(built('brain/module.js'))).createBrainBindingValidator({ conformance })
  configuredConnection = connections.createConfiguredConnectionModule({
    database: fresh,
    connections: {
      passwordFile: connectionPasswordFile,
      credentialRoot,
      credentialKeyFile: credentialKeyPath,
      credentialKeyGeneration: '1',
    },
    credentialBackend,
    fetchImpl,
    origin: 'https://control.example.test',
    resolveCurrentSession: async () => ({ account: { accountId } }),
  })
  configured = project.createConfiguredProjectBindingModule({
    database: fresh,
    bindings: { passwordFile: bindingPasswordFile, attesterPasswordFile, storageRoot, sourceOwnershipManifestFile: sourceOwnershipPath },
    sourceSnapshot: ownership, validator, origin: 'https://control.example.test',
    resolveCurrentSession: async () => ({ account: { accountId } }),
  })
  app = await (await import(built('http/app.js'))).createHttpApp({
    registerRoutes: async (server) => [
      ...await configuredConnection.registerConnectionRoutes(server),
      ...await configured.registerProjectConnectionBindingRoutes(server),
      ...await configured.registerProjectBrainBindingRoutes(server),
    ],
  })
  assert.deepEqual(app.routeCensus(), [
    'CON-01', 'CON-02', 'CON-03', 'CON-04', 'CON-05', 'CON-06', 'CON-07', 'CON-08', 'CON-09',
    'PRJ-10', 'PRJ-11', 'PRJ-12', 'PRJ-13', 'PRJ-14', 'PRJ-15',
  ])
  const csrf = 'csrf-p5'; const headers = {
    origin: 'https://control.example.test', cookie: `__Host-conexus_csrf=${csrf}`, 'x-conexus-csrf': csrf, 'if-none-match': '*',
  }
  const refusedEnvironment = await app.inject({
    method: 'POST', url: `/api/control/connections/${connectionId}/qualifications`,
    headers: { ...headers, 'idempotency-key': 'p5-wrong-environment' },
    payload: { connectionRevisionId, environment: 'SANDBOX' },
  })
  assert.equal(refusedEnvironment.statusCode, 422, refusedEnvironment.body)
  assert.equal(requests.length, 0)
  const qualificationResponse = await app.inject({
    method: 'POST', url: `/api/control/connections/${connectionId}/qualifications`,
    headers: { ...headers, 'idempotency-key': 'p5-normal-qualification' },
    payload: { connectionRevisionId, environment: 'PRODUCTION' },
  })
  assert.equal(qualificationResponse.statusCode, 201, qualificationResponse.body)
  const qualification = JSON.parse(qualificationResponse.body)
  assert.equal(qualification.outcome, 'PASSED')
  assert.equal(qualification.qualificationState, 'PROVIDER_CONFIRMED')
  const qualificationId = qualification.qualificationId
  assert.doesNotMatch(qualificationResponse.body, /client-secret|x-token|stand-in-bearer/i)
  assert.deepEqual(requests.map(({ method, url }) => ({ method, url })), [
    { method: 'POST', url: '/authenticate' },
    { method: 'GET', url: '/v1/empresas/1' },
  ])
  const qualificationReplay = await app.inject({
    method: 'POST', url: `/api/control/connections/${connectionId}/qualifications`,
    headers: { ...headers, 'idempotency-key': 'p5-normal-qualification' },
    payload: { connectionRevisionId, environment: 'PRODUCTION' },
  })
  assert.equal(qualificationReplay.statusCode, 201, qualificationReplay.body)
  assert.equal(requests.length, 2)
  const filialQualificationResponse = await app.inject({
    method: 'POST', url: `/api/control/connections/${filialConnectionId}/qualifications`,
    headers: { ...headers, 'idempotency-key': 'p5-filial-qualification' },
    payload: { connectionRevisionId: filialConnectionRevisionId, environment: 'PRODUCTION' },
  })
  assert.equal(filialQualificationResponse.statusCode, 201, filialQualificationResponse.body)
  const filialQualification = JSON.parse(filialQualificationResponse.body)
  assert.equal(filialQualification.outcome, 'PASSED')
  assert.equal(filialQualification.qualificationState, 'PROVIDER_CONFIRMED')
  assert.doesNotMatch(filialQualificationResponse.body, /filial-client-secret|filial-x-token|stand-in-bearer/i)
  assert.deepEqual(requests.map(({ method, url }) => ({ method, url })), [
    { method: 'POST', url: '/authenticate' },
    { method: 'GET', url: '/v1/empresas/1' },
    { method: 'POST', url: '/authenticate' },
    { method: 'GET', url: '/v1/empresas/2' },
  ])

  const connectionDeclaration = { bindings: [{ connectionId, connectionRevisionId, environment: 'PRODUCTION', qualificationId }] }
  const source = createSourceRepository({ storageRoot, projectId, manifest, connectionDeclaration })
  await query(fresh, `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'P5 composed project', 'EXISTING_GIT', $3, 'p5-project')`, [projectId, workspaceId, source.sourceRevision])
  await query(fresh, `INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage,
    can_bind_brain, can_use_connection) VALUES ($1, $2, true, true, true, true)`, [accountId, projectId])
  await query(fresh, `INSERT INTO project.connection_binding(project_id, connection_id, connection_revision_id,
    qualification_id, environment, binding_digest, project_source_revision) VALUES ($1, $2, $3, $4, 'PRODUCTION', $5, $6)`,
  [projectId, connectionId, connectionRevisionId, qualificationId, digestOf(connectionDeclaration.bindings[0]), source.sourceRevision])
  await query(fresh, `INSERT INTO reg.artifact(artifact_id, workspace_id, kind, semantic_name)
    VALUES ($1, $2, 'brain', 'P5 Brain')`, [artifactId, workspaceId])
  await query(fresh, `INSERT INTO reg.artifact_revision(artifact_revision_id, artifact_id, source_revision, digest, payload, availability)
    VALUES ($1, $2, $3, $4, $5::jsonb, 'AVAILABLE')`, [brainRevisionId, artifactId, 'a'.repeat(40), brainDigest, JSON.stringify(brainPayload)])
  await query(fresh, 'UPDATE reg.artifact SET published_revision_id = $2 WHERE artifact_id = $1', [artifactId, brainRevisionId])
  await query(fresh, `SELECT brn.bootstrap_brain_health($1,$2,$3,$4::jsonb)`, [
    digestOf({ revision: brainRevisionId, state: 'VALID' }), brainRevisionId, brainDigest,
    JSON.stringify([{ semanticRef: 'brain.dataset.budget', state: 'VALID', critical: true }]),
  ])

  const response = await app.inject({ method: 'PUT', url: `/api/control/projects/${projectId}/brain-binding`, headers, payload: { brainRevisionId } })
  assert.equal(response.statusCode, 201, response.body)
  assert.doesNotMatch(response.body, /client-secret|x-token|stand-in-bearer|DbExplorerSP|SELECT /i)
  assert.deepEqual(requests.map(({ method, url }) => ({ method, url })), [
    { method: 'POST', url: '/authenticate' },
    { method: 'GET', url: '/v1/empresas/1' },
    { method: 'POST', url: '/authenticate' },
    { method: 'GET', url: '/v1/empresas/2' },
    { method: 'POST', url: '/authenticate' },
    { method: 'POST', url: '/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json' },
  ])
  assert.match(JSON.parse(requests[5].body).requestBody.sql, /FROM TGFCAB/)
  assert.match(JSON.parse(requests[5].body).requestBody.sql, /CODEMP = 1/)
  const present = await app.inject({ method: 'GET', url: `/api/control/projects/${projectId}/brain-binding` })
  assert.equal(present.statusCode, 200)
  const binding = JSON.parse(present.body)
  assert.equal(binding.brainRevisionId, brainRevisionId)
  const settled = (await query(fresh, 'SELECT brain_revision_id, project_source_revision, project_binding_digest FROM project.brain_binding WHERE project_id = $1', [projectId])).rows[0]
  assert.equal(settled.brain_revision_id, brainRevisionId)
  assert.equal(settled.project_source_revision, source.currentHead())
  assert.notEqual(settled.project_source_revision, source.sourceRevision)
  const bindingBlob = spawnSync('git', ['--git-dir', source.repository, 'cat-file', 'blob', `${source.currentHead()}:.conexus/project/brain-binding.json`])
  assert.equal(bindingBlob.status, 0)
  assert.equal(sha256(bindingBlob.stdout), settled.project_binding_digest)
  assert.doesNotMatch(bindingBlob.stdout.toString(), /client-secret|x-token|stand-in-bearer/i)

  writeCatalog(2)
  const mismatch = gateway.readSankhyaKeyConformanceRegistrationCatalog(catalogPath)[0]
  const mismatchObserver = gateway.createSankhyaKeyConformanceObserver({
    origin: 'https://api.sankhya.com.br', environment: mismatch.descriptor.environment, companyCode: mismatch.producer.companyCode,
    fetchImpl,
    authenticate: async () => { throw new Error('MUST_NOT_AUTHENTICATE') },
  })
  const mismatchConformance = gateway.createRegisteredKeyConformance({ registrations: [{ ...mismatch.descriptor, observe: mismatchObserver }], resolveSubject })
  const mismatchResult = await mismatchConformance.execute({ accountId, projectId, queryId, expectedSourceRevision: source.currentHead(), expectedInputDigest: digestOf(manifest) }, {
    datasetId: descriptor.datasetId, grainId: descriptor.grainId, mappingDigest,
  })
  assert.equal(mismatchResult.status, 'INDETERMINATE')
  assert.equal(requests.length, 6)
  t.diagnostic('normal CON-08 persisted both admitted companies before configured PRJ-11 used one separate fixed aggregate')
})
