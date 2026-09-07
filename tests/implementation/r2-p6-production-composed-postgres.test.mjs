import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import pg from 'pg'
import { chromium } from '@playwright/test'
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
const reservePort = () => new Promise((resolvePort, reject) => {
  const server = createNetServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (!address || typeof address === 'string') return reject(new Error('TEST_PORT_RESERVATION_FAILED'))
    server.close((error) => error ? reject(error) : resolvePort(address.port))
  })
})
const compileProduction = () => {
  // Keep interrupted proof builds in the ignored dependency cache so they
  // cannot dirty the repository and compiled ESM still resolves dependencies.
  const cacheRoot = resolve(repositoryRoot, 'node_modules/.cache')
  mkdirSync(cacheRoot, { recursive: true })
  const hubRoot = mkdtempSync(resolve(cacheRoot, 'conexus-r2-p6-hub-build-'))
  const webRoot = mkdtempSync(resolve(cacheRoot, 'conexus-r2-p6-web-build-'))
  const hub = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
    '--noEmit', 'false', '--outDir', hubRoot,
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  if (hub.status !== 0) {
    rmSync(hubRoot, { recursive: true, force: true }); rmSync(webRoot, { recursive: true, force: true })
    throw new Error(`R2_P6_COMPOSED_HUB_COMPILE_FAILED\n${hub.stdout}\n${hub.stderr}`)
  }
  const web = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/vite/bin/vite.js'), 'build',
    '--config', resolve(repositoryRoot, 'apps/web/vite.config.mjs'), '--outDir', webRoot, '--emptyOutDir',
  ], { cwd: resolve(repositoryRoot, 'apps/web'), encoding: 'utf8' })
  if (web.status !== 0) {
    rmSync(hubRoot, { recursive: true, force: true }); rmSync(webRoot, { recursive: true, force: true })
    throw new Error(`R2_P6_COMPOSED_WEB_COMPILE_FAILED\n${web.stdout}\n${web.stderr}`)
  }
  return { hubRoot, webRoot, built: (path) => pathToFileURL(resolve(hubRoot, path)).href }
}

const createSourceRepository = ({ storageRoot, projectId, manifest }) => {
  const repository = resolve(storageRoot, 'projects', projectId)
  mkdirSync(repository, { recursive: true })
  const git = (args, input) => {
    const result = spawnSync('git', ['--git-dir', repository, ...args], {
      cwd: repositoryRoot, input, encoding: Buffer.isBuffer(input) ? null : 'utf8', env: {
        ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_AUTHOR_NAME: 'Conexus P6 composed proof', GIT_AUTHOR_EMAIL: 'proof@conexus.invalid',
        GIT_COMMITTER_NAME: 'Conexus P6 composed proof', GIT_COMMITTER_EMAIL: 'proof@conexus.invalid',
      },
    })
    assert.equal(result.status, 0, result.stderr?.toString() ?? '')
    return result.stdout.toString().trim()
  }
  git(['init', '--bare'])
  git(['symbolic-ref', 'HEAD', 'refs/heads/main'])
  const manifestBlob = git(['hash-object', '-w', '--stdin'], canonicalBytes(manifest))
  const brainTree = git(['mktree'], `100644 blob ${manifestBlob}\trealization.json\n`)
  const connectionsBlob = git(['hash-object', '-w', '--stdin'], canonicalBytes({ bindings: [] }))
  const projectTree = git(['mktree'], `100644 blob ${connectionsBlob}\tconnection-bindings.json\n`)
  const conexusTree = git(['mktree'], `040000 tree ${brainTree}\tbrain\n040000 tree ${projectTree}\tproject\n`)
  const rootTree = git(['mktree'], `040000 tree ${conexusTree}\t.conexus\n`)
  const sourceRevision = git(['commit-tree', rootTree, '-m', 'Admitted P6 composed source'])
  git(['update-ref', 'refs/heads/main', sourceRevision])
  const currentHead = () => git(['rev-parse', 'refs/heads/main'])
  const readJson = (path) => JSON.parse(git(['cat-file', 'blob', `${currentHead()}:${path}`]))
  const hasPath = (path) => spawnSync('git', [
    '--git-dir', repository, 'cat-file', '-e', `${currentHead()}:${path}`,
  ], { cwd: repositoryRoot }).status === 0
  return { repository, sourceRevision, currentHead, readJson, hasPath }
}

const brainSource = (label) => ({
  schemaVersion: 'conexus-brain/v2',
  reviewText: `Reviewed ${label} meaning.`,
  knowledgeBrowse: { domains: [{
    domainRef: 'finance', label: 'Finance', concepts: [{
      conceptRef: 'budget.amount', label, summary: `${label} for one budget line.`,
      contentClasses: ['SEMANTIC'], sections: [{ kind: 'DEFINITION', text: `${label} definition.` }],
      provenanceRefs: [`brain://proof/${label.toLowerCase().replaceAll(' ', '-')}`], itemRef: 'budget',
    }],
  }] },
  items: [{ itemId: 'budget', kind: 'SEMANTIC', dependsOn: [] }],
  assertions: [],
})

test('R2-P6 production browser composes the exact Control Plane journey', {
  skip: admittedGit && databaseConfigured ? false :
    'requires CONEXUS_R2_P4_GIT_LIVE=true and CONEXUS_TEST_DB_*',
  timeout: 900_000,
}, async (t) => {
  const cleanup = []
  t.after(async () => {
    const failures = []
    for (const action of cleanup.reverse()) {
      try { await action() } catch (error) { failures.push(error) }
    }
    if (failures.length) throw new AggregateError(failures, 'R2_P6_COMPOSED_CLEANUP_FAILED')
  })
  const admin = {
    host: process.env.CONEXUS_TEST_DB_HOST, port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME, user: process.env.CONEXUS_TEST_DB_USER,
    password: process.env.CONEXUS_TEST_DB_PASSWORD,
  }
  const version = await query(admin, 'SHOW server_version_num')
  assert.match(version.rows[0].server_version_num, /^17/)
  const database = `conexus_r2_p6_composed_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  await query(admin, `CREATE DATABASE ${quoteIdentifier(database)}`)
  const fresh = { ...admin, database }
  cleanup.push(() => query(admin, `DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`))
  const databaseUrl = new URL('postgresql://localhost')
  databaseUrl.hostname = fresh.host; databaseUrl.port = String(fresh.port); databaseUrl.pathname = `/${database}`
  databaseUrl.username = fresh.user; databaseUrl.password = fresh.password
  const migration = await runR2HubMigrations({ connectionString: databaseUrl.toString() })
  assert.equal(migration.versions.at(-1), '018')

  const { hubRoot, webRoot, built } = compileProduction()
  cleanup.push(() => { rmSync(hubRoot, { recursive: true, force: true }); rmSync(webRoot, { recursive: true, force: true }) })
  const storageRoot = mkdtempSync('/tmp/conexus-r2-p6-composed-')
  const credentialRoot = resolve(storageRoot, 'credentials')
  mkdirSync(credentialRoot, { mode: 0o700 })
  cleanup.push(async () => {
    // OCI runner finally-blocks can finish their own intent-directory cleanup
    // immediately after the HTTP response; sweep again after that micro-tail.
    rmSync(storageRoot, { recursive: true, force: true })
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
    rmSync(storageRoot, { recursive: true, force: true })
  })
  const secretDir = resolve(storageRoot, 'secrets')
  mkdirSync(secretDir, { mode: 0o700 })
  const secretPath = (name, value) => {
    const path = resolve(secretDir, name)
    writeFileSync(path, `${value}\n`, { mode: 0o600 })
    return path
  }

  const accountId = randomUUID(); const workspaceId = randomUUID(); const projectId = randomUUID()
  const artifactId = randomUUID(); const firstBrainRevisionId = randomUUID(); const secondBrainRevisionId = randomUUID()
  const manifest = { schemaVersion: 'conexus-project-brain-realization/v1', selectedRoots: ['budget'], mappings: [], sourceInputs: [] }
  const source = createSourceRepository({ storageRoot, projectId, manifest })
  const firstBrain = brainSource('Budget amount v1'); const secondBrain = brainSource('Budget amount v2')
  const firstBrainDigest = digestOf(firstBrain); const secondBrainDigest = digestOf(secondBrain)

  await query(fresh, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', $2, 'P6 Operator')`, [accountId, `p6-${accountId}`])
  await query(fresh, 'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, 'P6 Control Workspace'])
  await query(fresh, `INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project,
    can_read_brain, can_read_connection, can_manage_connection, can_qualify_connection)
    VALUES ($1, $2, false, true, true, true, true)`, [accountId, workspaceId])
  await query(fresh, `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'P6 Control Project', 'EXISTING_GIT', $3, 'p6-project')`, [projectId, workspaceId, source.sourceRevision])
  await query(fresh, `INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage,
    can_read_connection, can_manage_connection, can_qualify_connection, can_bind_brain, can_use_connection)
    VALUES ($1, $2, true, true, true, true, true, true, true)`, [accountId, projectId])
  await query(fresh, `INSERT INTO reg.artifact(artifact_id, workspace_id, kind, semantic_name)
    VALUES ($1, $2, 'brain', 'P6 Finance Brain')`, [artifactId, workspaceId])
  for (const [index, revision] of [
    { id: firstBrainRevisionId, digest: firstBrainDigest, payload: firstBrain },
    { id: secondBrainRevisionId, digest: secondBrainDigest, payload: secondBrain },
  ].entries()) {
    await query(fresh, `INSERT INTO reg.artifact_revision(artifact_revision_id, artifact_id, source_revision, digest, payload, availability)
      VALUES ($1, $2, $3, $4, $5::jsonb, 'AVAILABLE')`,
    [revision.id, artifactId, String(index + 1).repeat(40), revision.digest, JSON.stringify(revision.payload)])
    await query(fresh, 'SELECT brn.bootstrap_brain_health($1,$2,$3,$4::jsonb)', [
      digestOf({ revision: revision.id, state: 'VALID' }), revision.id, revision.digest,
      JSON.stringify([{ semanticRef: 'budget', state: 'VALID', critical: true }]),
    ])
  }
  await query(fresh, 'UPDATE reg.artifact SET published_revision_id = $2 WHERE artifact_id = $1', [artifactId, firstBrainRevisionId])

  const rolePasswords = new Map()
  for (const role of ['hub_r2_connections', 'hub_r2_project_binding', 'hub_r2_brain_attester', 'hub_r2_brain_read']) {
    const password = `${role}-${randomUUID()}`
    rolePasswords.set(role, password)
    await query(admin, `ALTER ROLE ${role} PASSWORD '${password}'`)
  }
  cleanup.push(async () => {
    for (const role of rolePasswords.keys()) await query(admin, `ALTER ROLE ${role} PASSWORD NULL`)
  })
  const connectionPasswordFile = secretPath('connections', rolePasswords.get('hub_r2_connections'))
  const bindingPasswordFile = secretPath('binding', rolePasswords.get('hub_r2_project_binding'))
  const attesterPasswordFile = secretPath('attester', rolePasswords.get('hub_r2_brain_attester'))
  const credentialKeyPath = secretPath('credential-key', Buffer.from('p'.repeat(32)).toString('base64'))
  const ownershipPath = resolve(storageRoot, 'ownership.json')
  writeFileSync(ownershipPath, JSON.stringify({
    '.conexus/brain/realization.json': 'APP-OWNED',
    '.conexus/project/connection-bindings.json': 'PLATFORM-CONTRACT',
  }), { mode: 0o600 })

  const sankhyaRequests = []
  const standIn = await new Promise((resolveServer, reject) => {
    const server = createServer(async (incoming, outgoing) => {
      for await (const _chunk of incoming) { /* consume without retaining credential bytes */ }
      sankhyaRequests.push({ method: incoming.method, path: incoming.url })
      outgoing.setHeader('content-type', 'application/json; charset=utf-8')
      if (incoming.url === '/authenticate') return outgoing.end(JSON.stringify({
        access_token: 'controlled-bearer', expires_in: 1800, 'not-before-policy': 0,
        refresh_expires_in: 0, token_type: 'Bearer', scope: 'gateway',
      }))
      const company = incoming.url === '/v1/empresas/1' ? 1 : incoming.url === '/v1/empresas/2' ? 2 : null
      if (company) return outgoing.end(JSON.stringify({ empresas: { codigoEmpresa: company } }))
      outgoing.statusCode = 404
      return outgoing.end(JSON.stringify({ status: 'not-found' }))
    })
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolveServer({
      origin: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise((resolveClose) => server.close(resolveClose)),
    }))
  })
  cleanup.push(() => standIn.close())
  const fetchImpl = (input, init) => {
    const requested = new URL(String(input))
    assert.equal(requested.origin, 'https://api.sankhya.com.br')
    return fetch(`${standIn.origin}${requested.pathname}${requested.search}`, init)
  }

  const [http, platformPostgres, platformCredential, brainModule, registryModule, connectionModule, projectModule] = await Promise.all([
    import(built('http/app.js')), import(built('platform/postgres.js')), import(built('platform/credential-backend.js')),
    import(built('brain/module.js')), import(built('registry/module.js')), import(built('connections/module.js')),
    import(built('project/module.js')),
  ])
  const databaseConfig = { host: fresh.host, port: fresh.port, database }
  const port = await reservePort()
  const configuredOrigin = `http://127.0.0.1:${port}`
  const resolveCurrentSession = async () => ({ account: { accountId } })
  const sourceSnapshot = projectModule.createConfiguredProjectSourceSnapshotFactory({
    storageRoot, sourceOwnershipManifestFile: ownershipPath,
  })
  const credentialBackend = platformCredential.createEncryptedFileCredentialBackend({
    root: credentialRoot, keyFile: credentialKeyPath, keyGeneration: '1',
  })
  const brainPool = platformPostgres.createPostgresPool({
    ...databaseConfig, user: 'hub_r2_brain_read', password: rolePasswords.get('hub_r2_brain_read'),
  })
  const brain = brainModule.createBrainModule({
    pool: brainPool, registry: registryModule.createRegistryStore(), resolveCurrentSession,
    projectContext: projectModule.createProjectBrainRealizationPort(sourceSnapshot),
  })
  const connections = connectionModule.createConfiguredConnectionModule({
    database: databaseConfig,
    connections: {
      passwordFile: connectionPasswordFile, credentialRoot,
      credentialKeyFile: credentialKeyPath, credentialKeyGeneration: '1',
    },
    credentialBackend, fetchImpl, origin: configuredOrigin, resolveCurrentSession,
  })
  const validator = brainModule.createBrainBindingValidator({
    conformance: { execute: async () => { throw new Error('P6_UNEXPECTED_PHYSICAL_ASSERTION') } },
  })
  const bindings = projectModule.createConfiguredProjectBindingModule({
    database: databaseConfig,
    bindings: {
      passwordFile: bindingPasswordFile, attesterPasswordFile,
      storageRoot, sourceOwnershipManifestFile: ownershipPath,
    },
    sourceSnapshot, validator, origin: configuredOrigin, resolveCurrentSession,
  })
  cleanup.push(async () => { await Promise.all([bindings.close(), connections.close(), brain.close()]) })
  const app = await http.createHttpApp({ staticRoot: webRoot, registerRoutes: async (server) => {
    server.get('/api/control/access-context', async () => ({
      account: { accountId, displayName: 'P6 Operator' },
      workspaces: [{ workspaceId, name: 'P6 Control Workspace' }],
      projects: [{ projectId, workspaceId, name: 'P6 Control Project', archived: false }],
    }))
    server.get('/api/control/workspaces/:workspaceId', async (request, reply) =>
      request.params.workspaceId === workspaceId
        ? { workspaceId, name: 'P6 Control Workspace' }
        : reply.code(404).send({ type: 'urn:conexus:problem:not-found' }))
    server.get('/api/control/projects/:projectId', async (request, reply) =>
      request.params.projectId === projectId
        ? { projectId, workspaceId, name: 'P6 Control Project', projectRevision: 'p6-project', archived: false }
        : reply.code(404).send({ type: 'urn:conexus:problem:not-found' }))
    return [
      ...await brain.registerBrainRoutes(server),
      ...await connections.registerConnectionRoutes(server),
      ...await bindings.registerProjectConnectionBindingRoutes(server),
      ...await bindings.registerProjectBrainBindingRoutes(server),
    ]
  } })
  cleanup.push(() => app.close())
  assert.deepEqual(app.routeCensus(), [
    'BRN-01', 'BRN-02', 'BRN-03', 'BRN-10', 'BRN-14',
    'CON-01', 'CON-02', 'CON-03', 'CON-04', 'CON-05', 'CON-06', 'CON-07', 'CON-08', 'CON-09',
    'PRJ-10', 'PRJ-11', 'PRJ-12', 'PRJ-13', 'PRJ-14', 'PRJ-15',
  ])
  await app.listen({ host: '127.0.0.1', port })

  const browser = await chromium.launch({
    headless: true, args: [`--unsafely-treat-insecure-origin-as-secure=${configuredOrigin}`],
  })
  cleanup.push(() => browser.close())
  const context = await browser.newContext()
  const secureCookieUrl = new URL(configuredOrigin); secureCookieUrl.protocol = 'https:'
  await context.addCookies([{ name: '__Host-conexus_csrf', value: 'csrf-p6', url: secureCookieUrl.href, secure: true, sameSite: 'Strict' }])
  const page = await context.newPage()
  page.setDefaultTimeout(120_000)
  const browserOperations = new Set()
  const browserResponses = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/api/control/')) browserOperations.add(`${request.method()} ${path}`)
  })
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname
    if (path.startsWith('/api/control/')) browserResponses.push(`${response.request().method()} ${path} ${response.status()}`)
  })

  await page.goto(`${configuredOrigin}/workspaces/${workspaceId}/brain`)
  await page.getByRole('heading', { name: 'Brain', exact: true }).waitFor()
  await page.getByText('Budget amount v1', { exact: true }).waitFor()
  await page.getByRole('tab', { name: 'Revisões' }).click()
  await page.getByText('Reviewed Budget amount v2 meaning.', { exact: true }).waitFor()
  await page.getByRole('tab', { name: 'Saúde' }).click()
  await page.getByText('Dependência crítica', { exact: true }).waitFor()
  await page.reload()
  await page.getByRole('heading', { name: 'Brain', exact: true }).waitFor()

  await page.goto(`${configuredOrigin}/workspaces/${workspaceId}/connections`)
  await page.getByRole('heading', { name: 'Connections', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Nova Connection' }).click()
  await page.getByRole('dialog', { name: 'Criar Connection' }).waitFor()
  await page.getByLabel('Nome da Connection').fill('Sankhya Matriz')
  await page.getByLabel('Ambiente').selectOption('PRODUCTION')
  await page.getByLabel('Código da empresa').fill('1')
  await page.getByRole('button', { name: 'Criar Connection' }).click()
  const connectionPanel = page.getByRole('dialog', { name: 'Sankhya Matriz' })
  await connectionPanel.waitFor()
  const connectionId = await connectionPanel.locator('dd code').first().textContent().catch(() => null)
  await connectionPanel.getByRole('button', { name: 'Substituir credencial' }).click()
  await connectionPanel.getByLabel('Client ID').fill('p6-client-id')
  await connectionPanel.getByLabel('Client Secret').fill('p6-client-secret')
  await connectionPanel.getByLabel('X-Token').fill('p6-x-token')
  await connectionPanel.getByRole('button', { name: 'Salvar nova credencial' }).click()
  await connectionPanel.getByText('Credencial configurada. O valor permanece protegido e não é exibido.', { exact: true }).waitFor()
  assert.equal(await connectionPanel.getByLabel('Client Secret').count(), 0)
  await connectionPanel.getByRole('button', { name: 'Testar Connection' }).click()
  await connectionPanel.getByText('Resultado: PASSED', { exact: true }).waitFor()
  assert.doesNotMatch(await page.locator('body').innerText(), /p6-client-secret|p6-x-token|controlled-bearer/)
  await connectionPanel.getByRole('button', { name: 'Fechar' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Abrir Connection' }).click()
  await page.getByRole('dialog', { name: 'Sankhya Matriz' }).getByText('Resultado: PASSED', { exact: true }).waitFor()
  await page.getByRole('dialog', { name: 'Sankhya Matriz' }).getByRole('button', { name: 'Fechar' }).click()

  await page.goto(`${configuredOrigin}/projects/${projectId}/integrations`)
  await page.getByRole('heading', { name: 'Sistemas usados por este Project' }).waitFor()
  await page.getByRole('button', { name: 'Usar Connection' }).click()
  const firstAdoptionResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/projects/${projectId}/commands/set-connection-binding`), { timeout: 120_000 })
  await page.getByRole('dialog', { name: 'Connections elegíveis' }).getByRole('button', { name: 'Usar no Project' }).click()
  const firstAdoptionResponse = await firstAdoptionResponsePromise
  const firstAdoptionBody = await firstAdoptionResponse.text()
  assert.equal(firstAdoptionResponse.status(), 200, firstAdoptionBody.slice(0, 1_000))
  assert.doesNotMatch(firstAdoptionBody, /p6-client-secret|p6-x-token|controlled-bearer/)
  assert.equal(
    [...browserOperations].some((entry) => entry === `POST /api/control/projects/${projectId}/commands/set-connection-binding`),
    true,
    browserResponses.slice(-12).join('\n'),
  )
  assert.equal(
    browserResponses.findLast((entry) => entry.includes(`/projects/${projectId}/commands/set-connection-binding`)),
    `POST /api/control/projects/${projectId}/commands/set-connection-binding 200`,
    browserResponses.slice(-12).join('\n'),
  )
  const firstAdoptionNotice = page.locator('p[role="status"][aria-live="polite"]')
  await firstAdoptionNotice.waitFor()
  assert.equal(await firstAdoptionNotice.textContent(),
    'O uso da revisão e do ambiente exatos foi confirmado pelo servidor.', browserResponses.slice(-8).join('\n'))
  const firstConnectionDeclaration = source.readJson('.conexus/project/connection-bindings.json')
  assert.equal(firstConnectionDeclaration.bindings.length, 1)
  assert.equal(firstConnectionDeclaration.bindings[0].connectionId, connectionId)
  assert.equal(firstConnectionDeclaration.bindings[0].environment, 'PRODUCTION')
  await page.reload()
  await page.getByRole('heading', { name: 'Sankhya Matriz' }).waitFor()

  await page.goto(`${configuredOrigin}/projects/${projectId}/brain`)
  await page.getByRole('heading', { name: 'Brain do Project' }).waitFor()
  await page.getByRole('button', { name: 'Administrar vínculo do Brain' }).click()
  await page.getByText('Nenhum vínculo foi divulgado', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Escolher revisão imutável' }).click()
  await page.getByLabel('Revisão disponível para adoção explícita').selectOption(firstBrainRevisionId)
  await page.getByRole('button', { name: 'Adotar revisão' }).click()
  await page.getByText('A adoção explícita foi confirmada pelo servidor.', { exact: true }).waitFor()
  await page.getByText('Budget amount v1', { exact: true }).waitFor()
  assert.equal(source.readJson('.conexus/project/brain-binding.json').brainRevisionId, firstBrainRevisionId)

  await query(fresh, 'UPDATE reg.artifact SET published_revision_id = $2 WHERE artifact_id = $1', [artifactId, secondBrainRevisionId])
  await page.reload()
  await page.getByText('Budget amount v1', { exact: true }).waitFor()
  await page.getByText('Sim — não adotada automaticamente', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Administrar vínculo do Brain' }).click()
  await page.getByText('Há uma revisão mais nova disponível; ela ainda não foi adotada.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Escolher revisão imutável' }).click()
  await page.getByLabel('Revisão disponível para adoção explícita').selectOption(secondBrainRevisionId)
  await page.getByRole('button', { name: 'Trocar revisão adotada' }).click()
  await page.getByText('Budget amount v2', { exact: true }).waitFor()
  assert.equal(source.readJson('.conexus/project/brain-binding.json').brainRevisionId, secondBrainRevisionId)

  await page.goto(`${configuredOrigin}/workspaces/${workspaceId}/connections`)
  await page.getByRole('button', { name: 'Abrir Connection' }).click()
  const revisedPanel = page.getByRole('dialog', { name: 'Sankhya Matriz' })
  await revisedPanel.getByRole('button', { name: 'Editar' }).click()
  await revisedPanel.getByLabel('Código da empresa').fill('2')
  await revisedPanel.getByRole('button', { name: 'Salvar configuração' }).click()
  await revisedPanel.getByText('Precisa de novo teste', { exact: true }).waitFor()
  await revisedPanel.getByRole('button', { name: 'Testar Connection' }).click()
  await revisedPanel.getByText('Resultado: PASSED', { exact: true }).waitFor()
  await revisedPanel.getByRole('button', { name: 'Fechar' }).click()

  await page.goto(`${configuredOrigin}/projects/${projectId}/integrations`)
  await page.getByText('Sankhya Matriz', { exact: true }).first().waitFor()
  await page.getByRole('button', { name: 'Usar Connection' }).click()
  await page.getByRole('dialog', { name: 'Connections elegíveis' }).getByRole('button', { name: 'Adotar revisão atual' }).click()
  await page.getByText('O uso da revisão e do ambiente exatos foi confirmado pelo servidor.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Nova Connection' }).click()
  await page.getByRole('dialog', { name: 'Criar Connection' }).getByLabel('Nome da Connection').fill('Sankhya privada')
  await page.getByRole('dialog', { name: 'Criar Connection' }).getByLabel('Ambiente').selectOption('PRODUCTION')
  await page.getByRole('dialog', { name: 'Criar Connection' }).getByLabel('Código da empresa').fill('1')
  await page.getByRole('dialog', { name: 'Criar Connection' }).getByRole('button', { name: 'Criar Connection' }).click()
  await page.getByRole('dialog', { name: 'Sankhya privada' }).waitFor()
  await page.getByRole('dialog', { name: 'Sankhya privada' }).getByRole('button', { name: 'Fechar' }).click()
  await page.getByRole('button', { name: 'Remover uso do Project' }).click()
  await page.getByText('A remoção do uso foi confirmada; a Connection permanece inalterada.', { exact: true }).waitFor()
  assert.deepEqual(source.readJson('.conexus/project/connection-bindings.json'), { bindings: [] })

  await page.goto(`${configuredOrigin}/projects/${projectId}/brain`)
  await page.getByText('Budget amount v2', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Administrar vínculo do Brain' }).click()
  await page.getByRole('button', { name: 'Remover vínculo atual' }).click()
  await page.getByText('A remoção do vínculo foi confirmada pelo servidor. O Workspace Brain não foi alterado.', { exact: true }).waitFor()
  await page.reload()
  await page.getByRole('button', { name: 'Administrar vínculo do Brain' }).click()
  await page.getByText('Nenhum vínculo foi divulgado', { exact: true }).waitFor()
  assert.equal(source.hasPath('.conexus/project/brain-binding.json'), false)

  assert.equal(connectionId === null || /^[0-9a-f-]{36}$/.test(connectionId), true)
  assert.deepEqual(sankhyaRequests, [
    { method: 'POST', path: '/authenticate' }, { method: 'GET', path: '/v1/empresas/1' },
    { method: 'POST', path: '/authenticate' }, { method: 'GET', path: '/v1/empresas/2' },
  ])
  assert.equal((await query(fresh, 'SELECT count(*)::int AS count FROM project.connection_binding WHERE project_id = $1', [projectId])).rows[0].count, 0)
  assert.equal((await query(fresh, 'SELECT count(*)::int AS count FROM project.brain_binding WHERE project_id = $1', [projectId])).rows[0].count, 0)
  assert.equal((await query(fresh, `SELECT count(*)::int AS count FROM con.connection WHERE owner_scope_kind = 'PROJECT' AND project_id = $1`, [projectId])).rows[0].count, 1)
  assert.equal([...browserOperations].some((entry) => entry.endsWith('/qualifications')), true)
  assert.equal([...browserOperations].some((entry) => entry.includes('/brain-context')), true)
  t.diagnostic(`browser traversed ${browserOperations.size} distinct method/path pairs over exact 20-operation production modules`)
  t.diagnostic('Sankhya was a controlled loopback transport; no live provider or ERP effect occurred')
})
