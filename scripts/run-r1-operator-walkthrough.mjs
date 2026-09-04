import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import pg from 'pg'
import { chromium } from '@playwright/test'
import { runHubMigrations } from './run-hub-migrations.mjs'

process.env.MASTRA_TELEMETRY_DISABLED = '1'

const { Client } = pg
const root = resolve(import.meta.dirname, '..')
const verify = process.argv.includes('--verify')
const required = (name) => process.env[name] || (() => { throw new Error(`MISSING_RC01_CONFIG_${name}`) })()
const admin = {
  host: required('CONEXUS_TEST_DB_HOST'),
  port: Number(required('CONEXUS_TEST_DB_PORT')),
  database: required('CONEXUS_TEST_DB_NAME'),
  user: required('CONEXUS_TEST_DB_USER'),
  password: required('CONEXUS_TEST_DB_PASSWORD'),
}
const quote = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('UNSAFE_RC01_IDENTIFIER')
  return `"${value}"`
}
const query = async (connection, statement, values = []) => {
  const client = new Client(connection)
  await client.connect()
  try { return await client.query(statement, values) } finally { await client.end() }
}
const connectionString = (connection) => {
  const url = new URL('postgresql://localhost')
  url.hostname = connection.host
  url.port = String(connection.port)
  url.pathname = `/${connection.database}`
  url.username = connection.user
  url.password = connection.password
  return url.toString()
}
const reservePort = () => new Promise((resolvePort, reject) => {
  const server = createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (!address || typeof address === 'string') return reject(new Error('RC01_PORT_RESERVATION_FAILED'))
    server.close((error) => error ? reject(error) : resolvePort(address.port))
  })
})
const hasToolResult = (prompt, toolName) => prompt.some((message) =>
  message.role === 'tool' && JSON.stringify(message.content).includes(toolName))

const cleanup = []
const close = async () => {
  const failures = []
  for (const action of cleanup.reverse()) {
    try { await action() } catch (error) { failures.push(error) }
  }
  if (failures.length) throw new AggregateError(failures, 'RC01_WALKTHROUGH_CLEANUP_FAILED')
}

let closing = false
const closeOnce = async () => {
  if (closing) return
  closing = true
  await close()
}

const main = async () => {
  const version = await query(admin, 'SHOW server_version_num')
  if (version.rows[0]?.server_version_num !== '170010') throw new Error('RC01_POSTGRES_17_10_REQUIRED')
  const database = `conexus_rc01_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  await query(admin, `CREATE DATABASE ${quote(database)}`)
  const fresh = { ...admin, database }
  cleanup.push(() => query(admin, `DROP DATABASE ${quote(database)} WITH (FORCE)`))
  const migration = await runHubMigrations({ connectionString: connectionString(fresh) })
  if (migration.versions.join(',') !== '001,002,003,004,005,006,007,008,009,010') {
    throw new Error('RC01_MIGRATION_SET_REFUSED')
  }

  const passwords = {
    hub_ws01_command: 'rc01-workspace-command-test-only',
    hub_s2_read: 'rc01-workspace-read-test-only',
    hub_prj03_command: 'rc01-project-command-test-only',
    hub_s3_read: 'rc01-project-read-test-only',
    hub_s4_baseline_read: 'rc01-baseline-read-test-only',
    hub_s4_baseline_command: 'rc01-baseline-command-test-only',
    hub_s6_inception_command: 'rc01-inception-command-test-only',
  }
  for (const [role, password] of Object.entries(passwords)) {
    await query(fresh, `ALTER ROLE ${quote(role)} PASSWORD '${password}'`)
  }
  const accountId = '10000000-0000-4000-8000-000000000901'
  const issuer = 'https://rc01.invalid'
  const subject = 'deterministic-operator'
  await query(fresh, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, $2, $3, 'RC-01 Operator')`, [accountId, issuer, subject])

  const hubBuild = mkdtempSync(resolve(root, 'apps/hub/rc01-walkthrough-build-'))
  const webBuild = mkdtempSync(resolve(root, 'apps/web/rc01-walkthrough-web-'))
  cleanup.push(() => { rmSync(hubBuild, { recursive: true, force: true }); rmSync(webBuild, { recursive: true, force: true }) })
  const compiled = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'),
    '--project', resolve(root, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', hubBuild], { encoding: 'utf8' })
  if (compiled.status !== 0) throw new Error(`RC01_HUB_BUILD_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
  const builtWeb = spawnSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'build',
    '--config', resolve(root, 'apps/web/vite.config.mjs'), '--outDir', webBuild, '--emptyOutDir'],
  { cwd: resolve(root, 'apps/web'), encoding: 'utf8' })
  if (builtWeb.status !== 0) throw new Error(`RC01_WEB_BUILD_FAILED\n${builtWeb.stdout}\n${builtWeb.stderr}`)
  const built = (path) => pathToFileURL(resolve(hubBuild, path)).href
  const [{ createHttpApp }, { createPostgresPool }, { createIdentityAccessStore }, { registerIdentityAccessRoutes },
    { createWorkspaceModule }, { createProjectModule }, { createProjectInceptionService }, { createProjectMastra }] = await Promise.all([
    import(built('http/app.js')), import(built('platform/postgres.js')),
    import(built('identity-access/store.js')), import(built('identity-access/routes.js')),
    import(built('workspace/module.js')), import(built('project/module.js')),
    import(built('project/inception.js')), import(built('project/project-mastra.js')),
  ])

  const port = await reservePort()
  const origin = `http://127.0.0.1:${port}`
  const databaseConfig = { host: fresh.host, port: fresh.port, database }
  const poolFor = (user) => createPostgresPool({ ...databaseConfig, user, password: passwords[user] })
  const adminPool = createPostgresPool({ ...databaseConfig, user: fresh.user, password: fresh.password })
  const workspaceReadPool = poolFor('hub_s2_read')
  const identityStore = createIdentityAccessStore({ pool: adminPool, workspaceReadPool })
  const session = Object.freeze({ account: { accountId, displayName: 'RC-01 Operator' }, issuer, subject })
  const resolveCurrentSession = async () => session
  const workspace = createWorkspaceModule({
    commandPool: poolFor('hub_ws01_command'), readPool: poolFor('hub_s2_read'), origin,
    operatorIssuer: issuer, operatorSubject: subject, resolveCurrentSession,
  })

  let proposalNumber = 0
  const sourceRevision = 'a'.repeat(40)
  const sourceDigest = 'b'.repeat(64)
  const model = {
    specificationVersion: 'v3', provider: 'rc01-fixture', modelId: 'deterministic-1', supportedUrls: {},
    async doGenerate(options) {
      if ((options.tools?.length ?? 0) === 0) {
        const prompt = JSON.stringify(options.prompt)
        const digest = prompt.match(/(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/)?.[0]
        const revision = prompt.match(/(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/)?.[0]
        return { content: [{ type: 'text', text: JSON.stringify({
          answer: 'A aprovação desta Candidate exata permanece humana e governada pelo Conexus.',
          provenanceRefs: [digest, revision],
        }) }], finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [] }
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
      return { content: [{ type: 'text', text: JSON.stringify({
        sourceText: `RC-01 immutable Baseline Candidate ${proposalNumber}: human approval remains authoritative.`,
        applicationRuntimeProfile: 'MANAGED', provenance: [{ path: 'README.md', digest: sourceDigest }],
      }) }], finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [] }
    },
    async doStream() { throw new Error('STREAM_NOT_ADMITTED') },
  }
  const cognition = createProjectMastra([{
    admissionId: 'project-inception-opus-5', providerId: 'rc01-fixture', modelId: 'deterministic-1', enabled: true, model,
  }])
  const sourceSnapshot = ({ sourceRevision: revision }) => ({
    sourceRevision: revision,
    listPaths: async () => [{ path: 'README.md', ownershipClass: 'APP-OWNED', mediaType: 'text/plain; charset=utf-8', byteLength: 24, digest: sourceDigest }],
    readBatch: async (paths) => paths.map((path) => ({ path, digest: sourceDigest, utf8Bytes: 'RC-01 bounded source fixture' })),
  })
  const inception = createProjectInceptionService({
    pool: poolFor('hub_s6_inception_command'), cognition, sourceSnapshot, admissionId: 'project-inception-opus-5',
  })
  const git = Object.freeze({
    stageNewProjectSource: async () => ({ status: 'STAGED', sourceRevision }),
    stageExistingGitProjectSource: async () => ({ status: 'REFUSED', code: 'CATALOG_REFUSED' }),
    promoteStagedProjectSource: async () => ({ status: 'PROMOTED', sourceRevision }),
    verifyCanonicalProjectSource: async () => ({ status: 'VERIFIED', sourceRevision }),
    createProjectSourceBundle: async () => ({ status: 'REFUSED', code: 'SOURCE_NOT_FOUND' }),
    restoreProjectSourceBundle: async () => ({ status: 'REFUSED', code: 'SOURCE_NOT_FOUND' }),
  })
  const recovery = Object.freeze({ cleanupClaimedProjectSource: async (projectId) => ({ status: 'CLEANED', projectId }) })
  const project = createProjectModule({
    commandPool: poolFor('hub_prj03_command'), readPool: poolFor('hub_s3_read'),
    baselineReadPool: poolFor('hub_s4_baseline_read'), baselineCommandPool: poolFor('hub_s4_baseline_command'),
    git, recovery, inception, cognition, origin, resolveCurrentSession,
  })
  const oidc = Object.freeze({
    begin: async () => { throw new Error('REAL_OIDC_NOT_ADMITTED') },
    complete: async () => { throw new Error('REAL_OIDC_NOT_ADMITTED') },
  })
  const app = await createHttpApp({ staticRoot: webBuild, registerRoutes: async (server) => {
    server.addHook('onRequest', (_request, reply, done) => {
      reply.setCookie('__Host-conexus_csrf', 'rc01-csrf', { path: '/', secure: true, sameSite: 'strict', httpOnly: false })
      done()
    })
    return [
      ...await registerIdentityAccessRoutes(server, {
        store: identityStore, workspaceReader: identityStore, oidc,
        config: { origin, bootstrapIssuer: issuer, bootstrapSubject: subject }, resolveCurrentSession,
      }),
      ...await workspace.registerWorkspaceRoutes(server),
      ...await project.registerProjectRoutes(server),
    ]
  } })
  cleanup.push(async () => {
    await app.close()
    await Promise.all([project.close(), workspace.close(), identityStore.close(), workspaceReadPool.end()])
  })
  await app.listen({ host: '127.0.0.1', port })

  const facts = {
    mode: verify ? 'VERIFY' : 'SERVE', origin, accountId,
    authentication: 'DETERMINISTIC_LOCAL_SESSION', model: 'DETERMINISTIC_LOCAL_MODEL',
    externalCalls: 'NONE', database,
  }
  process.stdout.write(`${JSON.stringify(facts, null, 2)}\n`)

  if (!verify) {
    process.stdout.write('RC-01 walkthrough server ready. Press Ctrl+C to stop and remove its owned database.\n')
    await new Promise((resolveWait) => {
      process.once('SIGINT', resolveWait)
      process.once('SIGTERM', resolveWait)
    })
    return
  }

  const browser = await chromium.launch({ headless: true, args: [`--unsafely-treat-insecure-origin-as-secure=${origin}`] })
  cleanup.push(() => browser.close())
  const context = await browser.newContext()
  await context.addCookies([{ name: '__Host-conexus_csrf', value: 'rc01-csrf', url: origin.replace('http:', 'https:'), secure: true, sameSite: 'Strict' }])
  const page = await context.newPage()
  await page.goto(origin)
  await page.getByRole('heading', { name: 'Olá, RC-01 Operator' }).waitFor()
  await page.getByRole('heading', { name: 'Crie seu primeiro Workspace' }).waitFor()
  await page.locator('main').getByRole('link', { name: 'Novo Workspace' }).click()
  await page.getByLabel('Nome do Workspace').fill('RC-01 Workspace')
  await page.getByRole('button', { name: 'Criar Workspace' }).click()
  await page.getByRole('heading', { name: 'RC-01 Workspace' }).waitFor()
  await page.getByRole('link', { name: 'Abrir Projects' }).click()
  await page.getByRole('heading', { name: 'Nenhum Project divulgado' }).waitFor()
  await page.locator('main').getByRole('link', { name: 'Criar Project' }).click()
  await page.getByLabel('Nome do Project').fill('RC-01 Project')
  await page.getByRole('button', { name: 'Criar Project' }).click()
  await page.getByRole('heading', { name: 'RC-01 Project' }).waitFor()
  await page.getByRole('link', { name: 'Iniciar Project Inception' }).click()
  await page.getByLabel('O que estamos construindo, para quem e sob quais restrições importantes?')
    .fill('Validar o caminho R1 com autoridade humana explícita e sem integrações externas.')
  await page.getByRole('button', { name: 'Executar Inception' }).click()
  await page.getByText('RC-01 immutable Baseline Candidate 1:', { exact: false }).waitFor()
  const candidateDigest = new URL(page.url()).pathname.split('/').at(-1)
  if (!/^[0-9a-f]{64}$/.test(candidateDigest ?? '')) throw new Error('RC01_CANDIDATE_IDENTITY_REFUSED')
  await page.getByLabel('Pergunta sobre este Candidate exato').fill('Quem mantém autoridade para aprovar?')
  await page.getByRole('button', { name: 'Perguntar ao Conexus' }).click()
  await page.getByText('A aprovação desta Candidate exata permanece humana e governada pelo Conexus.', { exact: true }).waitFor()
  await page.goto(`${origin}/projects/00000000-0000-4000-8000-000000000000`)
  await page.getByRole('heading', { name: 'Project indisponível' }).waitFor()
  process.stdout.write(`${JSON.stringify({ status: 'PASS', candidateDigest, proved: [
    'initial-empty-workspace', 'workspace-create-and-context', 'project-empty-list', 'project-create-and-open',
    'project-inception', 'immutable-candidate', 'candidate-contextual-question', 'undisclosed-project',
  ] }, null, 2)}\n`)
}

try {
  await main()
} finally {
  await closeOnce()
}
