import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import pg from 'pg'
import { chromium } from '@playwright/test'
import { runHubMigrations } from '../../scripts/run-hub-migrations.mjs'

process.env.MASTRA_TELEMETRY_DISABLED = '1'
const { Client } = pg
const repositoryRoot = resolve(import.meta.dirname, '../..')
const required = (name) => process.env[name] || (() => { throw new Error(`MISSING_TEST_CONFIG_${name}`) })()
const adminConnection = {
  host: required('CONEXUS_TEST_DB_HOST'), port: Number(required('CONEXUS_TEST_DB_PORT')),
  database: required('CONEXUS_TEST_DB_NAME'), user: required('CONEXUS_TEST_DB_USER'),
  password: required('CONEXUS_TEST_DB_PASSWORD'),
}
const quote = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('UNSAFE_TEST_IDENTIFIER')
  return `"${value}"`
}
const connectionString = (connection) => {
  const url = new URL('postgresql://localhost')
  url.hostname = connection.host; url.port = String(connection.port); url.pathname = `/${connection.database}`
  url.username = connection.user; url.password = connection.password
  return url.toString()
}
const query = async (connection, statement, values = []) => {
  const client = new Client(connection)
  await client.connect()
  try { return await client.query(statement, values) } finally { await client.end() }
}
const hasToolResult = (prompt, toolName) => prompt.some((message) =>
  message.role === 'tool' && JSON.stringify(message.content).includes(toolName))
const reservePort = () => new Promise((resolvePort, reject) => {
  const server = createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (!address || typeof address === 'string') return reject(new Error('TEST_PORT_RESERVATION_FAILED'))
    server.close((error) => error ? reject(error) : resolvePort(address.port))
  })
})

test('production Project composition completes the S6 browser journey on PostgreSQL 17.10', async (t) => {
  const cleanup = []
  t.after(async () => {
    const failures = []
    for (const action of cleanup.reverse()) {
      try { await action() } catch (error) { failures.push(error) }
    }
    if (failures.length) throw new AggregateError(failures, 'S6_COMPOSED_CLEANUP_FAILED')
  })
  const version = await query(adminConnection, 'SHOW server_version_num')
  assert.equal(version.rows[0].server_version_num, '170010')

  const database = `conexus_s6_composed_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  await query(adminConnection, `CREATE DATABASE ${quote(database)}`)
  const fresh = { ...adminConnection, database }
  cleanup.push(() => query(adminConnection, `DROP DATABASE ${quote(database)} WITH (FORCE)`))
  const migration = await runHubMigrations({ connectionString: connectionString(fresh) })
  assert.deepEqual(migration.versions, ['001', '002', '003', '004', '005', '006', '007', '008', '009', '010'])

  const passwords = {
    hub_prj03_command: 'composed-prj03-test-only', hub_s3_read: 'composed-read-test-only',
    hub_s4_baseline_read: 'composed-baseline-read-test-only',
    hub_s4_baseline_command: 'composed-baseline-command-test-only',
    hub_s6_inception_command: 'composed-inception-test-only',
  }
  for (const [role, password] of Object.entries(passwords)) {
    await query(fresh, `ALTER ROLE ${quote(role)} PASSWORD '${password}'`)
  }

  const accountId = '10000000-0000-4000-8000-000000000806'
  const workspaceId = '20000000-0000-4000-8000-000000000806'
  const projectId = '30000000-0000-4000-8000-000000000806'
  const sourceRevision = 'a'.repeat(40)
  await query(fresh, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', 's6-composed', 'S6 Operator')`, [accountId])
  await query(fresh, 'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, 'S6 Workspace'])
  await query(fresh, `INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project)
    VALUES ($1, $2, true)`, [accountId, workspaceId])
  await query(fresh, `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'S6 Project', 'NEW', $3, 'revision-s6')`, [projectId, workspaceId, sourceRevision])
  await query(fresh, `INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage)
    VALUES ($1, $2, true, true)`, [accountId, projectId])

  const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r1-s6-composed-build-'))
  const webBuild = mkdtempSync(resolve(repositoryRoot, 'apps/web/r1-s6-composed-web-'))
  cleanup.push(() => { rmSync(hubBuild, { recursive: true, force: true }); rmSync(webBuild, { recursive: true, force: true }) })
  const compiled = spawnSync(process.execPath, [resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
    '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', hubBuild], { encoding: 'utf8' })
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
  const builtWeb = spawnSync(process.execPath, [resolve(repositoryRoot, 'node_modules/vite/bin/vite.js'), 'build',
    '--config', resolve(repositoryRoot, 'apps/web/vite.config.mjs'), '--outDir', webBuild, '--emptyOutDir'],
  { cwd: resolve(repositoryRoot, 'apps/web'), encoding: 'utf8' })
  assert.equal(builtWeb.status, 0, `${builtWeb.stdout}\n${builtWeb.stderr}`)
  const built = (path) => pathToFileURL(resolve(hubBuild, path)).href
  const [{ createHttpApp }, { createPostgresPool }, { createProjectModule },
    { createProjectInceptionService }, { createProjectMastra }] = await Promise.all([
    import(built('http/app.js')), import(built('platform/postgres.js')), import(built('project/module.js')),
    import(built('project/inception.js')), import(built('project/project-mastra.js')),
  ])

  let proposalNumber = 0
  const model = {
    specificationVersion: 'v3', provider: 'qualification', modelId: 'composed-fake-1', supportedUrls: {},
    async doGenerate(options) {
      const tools = options.tools?.map((tool) => tool.name) ?? []
      if (tools.length === 0) {
        const prompt = JSON.stringify(options.prompt)
        const digest = prompt.match(/(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/)?.[0]
        const revision = prompt.match(/(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/)?.[0]
        return {
          content: [{ type: 'text', text: JSON.stringify({
            answer: 'The exact Candidate keeps approval human-owned.', provenanceRefs: [digest, revision],
          }) }], finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [],
        }
      }
      if (!hasToolResult(options.prompt, 'listProjectSourceSnapshotPaths')) return {
        content: [{ type: 'tool-call', toolCallId: 'list-1', toolName: 'listProjectSourceSnapshotPaths', input: '{}' }],
        finishReason: 'tool-calls', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [],
      }
      if (!hasToolResult(options.prompt, 'readProjectSourceSnapshotBatch')) return {
        content: [{ type: 'tool-call', toolCallId: 'read-1', toolName: 'readProjectSourceSnapshotBatch', input: JSON.stringify({ paths: ['README.md'] }) }],
        finishReason: 'tool-calls', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [],
      }
      proposalNumber += 1
      return {
        content: [{ type: 'text', text: JSON.stringify({
          sourceText: `Immutable composed Candidate ${proposalNumber}`,
          applicationRuntimeProfile: 'MANAGED', provenance: [{ path: 'README.md', digest: 'b'.repeat(64) }],
        }) }], finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [],
      }
    },
    async doStream() { throw new Error('STREAM_NOT_ADMITTED') },
  }
  const cognition = createProjectMastra([{
    admissionId: 'project-inception-opus-5', providerId: 'qualification', modelId: 'composed-fake-1', enabled: true, model,
  }])
  const source = {
    sourceRevision,
    listPaths: async () => [{ path: 'README.md', ownershipClass: 'APP-OWNED', mediaType: 'text/plain; charset=utf-8', byteLength: 14, digest: 'b'.repeat(64) }],
    readBatch: async (paths) => paths.map((path) => ({ path, digest: 'b'.repeat(64), utf8Bytes: 'bounded source' })),
  }
  const port = await reservePort()
  const configuredOrigin = `http://127.0.0.1:${port}`
  const databaseConfig = { host: fresh.host, port: fresh.port, database }
  const poolFor = (user) => createPostgresPool({ ...databaseConfig, user, password: passwords[user] })
  const inception = createProjectInceptionService({
    pool: poolFor('hub_s6_inception_command'), cognition, sourceSnapshot: () => source,
    admissionId: 'project-inception-opus-5',
  })
  const unusedGit = new Proxy({}, { get: () => async () => { throw new Error('COMPOSED_GIT_PATH_NOT_USED') } })
  const project = createProjectModule({
    commandPool: poolFor('hub_prj03_command'), readPool: poolFor('hub_s3_read'),
    baselineReadPool: poolFor('hub_s4_baseline_read'), baselineCommandPool: poolFor('hub_s4_baseline_command'),
    git: unusedGit, recovery: { cleanupClaimedProjectSource: async () => { throw new Error('COMPOSED_RECOVERY_PATH_NOT_USED') } },
    inception, cognition, origin: configuredOrigin,
    resolveCurrentSession: async () => ({ account: { accountId } }),
  })
  const app = await createHttpApp({ staticRoot: webBuild, registerRoutes: async (server) => {
    server.get('/api/control/access-context', async () => ({
      account: { accountId, displayName: 'S6 Operator' },
      workspaces: [{ workspaceId, name: 'S6 Workspace' }], projects: [],
    }))
    return project.registerProjectRoutes(server)
  } })
  cleanup.push(async () => { await app.close(); await project.close() })
  const address = await app.listen({ host: '127.0.0.1', port })
  const origin = new URL(address).origin
  assert.equal(origin, configuredOrigin)

  const browser = await chromium.launch({
    headless: true,
    args: [`--unsafely-treat-insecure-origin-as-secure=${origin}`],
  })
  cleanup.push(() => browser.close())
  const context = await browser.newContext()
  const secureCookieUrl = new URL(origin)
  secureCookieUrl.protocol = 'https:'
  await context.addCookies([{ name: '__Host-conexus_csrf', value: 'csrf-composed', url: secureCookieUrl.href, secure: true, sameSite: 'Strict' }])
  const page = await context.newPage()
  await page.goto(`${origin}/projects/${projectId}/inception`)
  await page.getByRole('heading', { name: 'Project Inception' }).waitFor()
  await page.getByLabel('O que estamos construindo, para quem e sob quais restrições importantes?').fill('Build a bounded composed Product.')
  await page.getByRole('button', { name: 'Executar Inception' }).click()
  await page.getByText('Immutable composed Candidate 1', { exact: true }).waitFor()
  const candidateA = new URL(page.url()).pathname.split('/').at(-1)
  assert.match(candidateA, /^[0-9a-f]{64}$/)

  await page.getByLabel('Pergunta sobre este Candidate exato').fill('Who owns approval?')
  const explanationResponsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' && response.url().endsWith('/assistant/queries'))
  await page.getByRole('button', { name: 'Perguntar ao Conexus' }).click()
  const explanationResponse = await explanationResponsePromise
  assert.equal(explanationResponse.status(), 200, await explanationResponse.text())
  await page.getByText('The exact Candidate keeps approval human-owned.', { exact: true }).waitFor()
  await page.getByLabel('Qual objetivo de negócio deve orientar o próximo Candidate?').fill('Keep the same bounded goal.')
  await page.getByLabel('O que deve mudar neste Candidate exato?').fill('Clarify the human approval boundary.')
  await page.getByRole('button', { name: 'Produzir novo Candidate' }).click()
  await page.getByText('Immutable composed Candidate 2', { exact: true }).waitFor()
  const candidateB = new URL(page.url()).pathname.split('/').at(-1)
  assert.match(candidateB, /^[0-9a-f]{64}$/)
  assert.notEqual(candidateB, candidateA)

  await page.getByRole('button', { name: 'Aprovar este Candidate' }).click()
  await page.getByText('Baseline aprovada pelo servidor.', { exact: true }).waitFor()
  await page.reload()
  await page.getByText('Immutable composed Candidate 2', { exact: true }).waitFor()
  await page.getByText(`Digest aprovado: ${candidateB}`, { exact: false }).waitFor()

  const stale = await page.evaluate(async ({ projectId: p, candidateA: old, csrf }) => {
    const response = await fetch(`/api/control/projects/${p}/inception-investigations`, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-conexus-csrf': csrf, 'idempotency-key': 'stale-refinement' },
      body: JSON.stringify({ intent: 'stale', priorCandidateBaselineDigest: old, reviewFeedback: 'must fail' }),
    })
    return { status: response.status, body: await response.json() }
  }, { projectId, candidateA, csrf: 'csrf-composed' })
  assert.equal(stale.status, 409)
  assert.equal(stale.body.type, 'urn:conexus:problem:project-inception-conflict')
})
