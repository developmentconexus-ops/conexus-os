import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium } from '@playwright/test'
import pg from 'pg'
import { build } from 'vite'
import { hubModuleUrl } from './hub-build.mjs'
import { buildHubDatabase } from './hub-database.mjs'

// Real Fastify + real PostgreSQL, driven by a real Chromium, exactly as the Hub runs: only the
// session/administrator lookup is a test double (a real sign-in needs Keycloak, which this suite
// must not touch). Everything else -- the store, the credential envelope, the admitted operation
// ids and the SQL authority checks -- is production code.
const configured = ['CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME', 'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD']
  .every((name) => process.env[name])

const repositoryRoot = resolve(import.meta.dirname, '../..')

const { createHttpApp } = await import(hubModuleUrl('http/app.js'))
const { createConnectorModule } = await import(hubModuleUrl('connectors/module.js'))
const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))

// One build of the real SPA, shared by every test in this file: the Hub serves it exactly as
// production does (staticRoot), so a reload is a real server round trip, not a Vite dev artifact.
const staticRoot = configured ? mkdtempSync(resolve(repositoryRoot, 'apps/web/test-static-')) : null
if (staticRoot) {
  process.once('exit', () => rmSync(staticRoot, { recursive: true, force: true }))
  await build({
    configFile: resolve(repositoryRoot, 'apps/web/vite.config.mjs'),
    root: resolve(repositoryRoot, 'apps/web'),
    build: { outDir: staticRoot, emptyOutDir: true },
    logLevel: 'silent',
  })
}

// Three obviously-fake credential values, generated here and nowhere else: this whole suite proves
// they never reach the page, the DOM, a network response or the Hub's own log lines.
const CREDENTIAL = Object.freeze({
  clientId: `test-integrations-client-${randomUUID()}`,
  clientSecret: `test-integrations-secret-${randomUUID()}`,
  xToken: `test-integrations-xtoken-${randomUUID()}`,
})
const CREDENTIAL_VALUES = Object.values(CREDENTIAL)

const SESSION_COOKIE = '__Host-conexus_session'
const CSRF_COOKIE = '__Host-conexus_csrf'
const CSRF_TOKEN = 'connector-integrations-csrf-1'

const findFreePort = () => new Promise((settle, reject) => {
  const probe = createServer()
  probe.on('error', reject)
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address()
    probe.close(() => settle(port))
  })
})

/** One Workspace, one Project, and three Accounts covering every split of the two authorities this
 *  screen depends on: installation administrator (Connections) and Workspace Owner (Grants). */
const setupFixture = async (t) => {
  const fixture = await buildHubDatabase(t, 'connector_integrations')
  const owner = new pg.Client({ connectionString: fixture.connectionString })
  await owner.connect()
  fixture.onCleanup(() => owner.end())

  const adminAccountId = randomUUID() // installation administrator, Workspace member, not Owner
  const ownerAccountId = randomUUID() // Workspace Owner, not an installation administrator
  const bothAccountId = randomUUID() // both
  const accounts = { [adminAccountId]: 'Administrador', [ownerAccountId]: 'Dona do Workspace', [bothAccountId]: 'Leandro' }
  for (const [id, name] of Object.entries(accounts)) {
    await owner.query(
      'INSERT INTO iam.account(account_id, issuer, external_subject, display_name, email, active) VALUES ($1,$2,$3,$4,$5,true)',
      [id, 'https://connector-integrations.test', id, name, `${id}@connector-integrations.test`],
    )
  }
  await owner.query("INSERT INTO iam.installation_administrator(account_id, granted_via) VALUES ($1, 'OPERATOR_BOOTSTRAP')", [adminAccountId])
  await owner.query("INSERT INTO iam.installation_administrator(account_id, granted_via) VALUES ($1, 'OPERATOR_BOOTSTRAP')", [bothAccountId])

  const workspaceId = randomUUID()
  await owner.query('INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1,$2)', [workspaceId, 'Metal Nobre'])
  await owner.query("INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1,$2,'owner')", [ownerAccountId, workspaceId])
  await owner.query("INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1,$2,'owner')", [bothAccountId, workspaceId])
  await owner.query("INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1,$2,'member')", [adminAccountId, workspaceId])

  const projectId = randomUUID()
  await owner.query(
    "INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1,$2,$3,'NEW',$4,$5)",
    [projectId, workspaceId, 'Pedidos de compra', 'a'.repeat(40), 'r1'],
  )

  const runtimePool = new pg.Pool({ connectionString: fixture.connectionString, options: '-c role=hub_iam_runtime', max: 4 })
  runtimePool.on('error', () => {})
  fixture.onCleanup(() => runtimePool.end())

  const logLines = []
  const resolveCurrentSession = async (request, requireCsrf = false) => {
    const sessionCookie = request.cookies[SESSION_COOKIE]
    if (!sessionCookie || !(sessionCookie in accounts)) return null
    if (requireCsrf) {
      const value = request.headers['x-conexus-csrf']
      if ((Array.isArray(value) ? value[0] : value) !== CSRF_TOKEN) return null
    }
    return { account: { accountId: sessionCookie, displayName: accounts[sessionCookie] }, issuer: 'https://connector-integrations.test', subject: sessionCookie }
  }
  // Real authority, read from the same table the production function reads (iam.is_installation_administrator):
  // only resolveCurrentSession is a test double, since a real one needs Keycloak.
  const isInstallationAdministrator = async (accountId) => {
    const result = await owner.query('SELECT 1 FROM iam.installation_administrator WHERE account_id = $1 AND revoked_at IS NULL', [accountId])
    return result.rowCount > 0
  }

  const port = await findFreePort()
  const origin = `http://127.0.0.1:${port}`
  const envelope = createSecretEnvelope('cd'.repeat(32))
  const connectors = createConnectorModule({ pool: runtimePool, envelope, origin, resolveCurrentSession, isInstallationAdministrator })

  const app = await createHttpApp({
    staticRoot,
    registerRoutes: async (fastify) => {
      // The Hub's own record of every request and response this server answers: the same shape a
      // request logger would produce.
      fastify.addHook('onSend', (request, reply, payload, done) => {
        logLines.push(`${request.method} ${request.url} -> ${reply.statusCode} ${typeof payload === 'string' ? payload : ''}`)
        done(null, payload)
      })
      return connectors.registerConnectorRoutes(fastify)
    },
  })
  await app.listen({ host: '127.0.0.1', port })
  fixture.onCleanup(() => app.close())

  return { origin, projectId, workspaceId, adminAccountId, ownerAccountId, bothAccountId, accounts, logLines }
}

const withPage = async (t, { origin, projectId, workspaceId, accountId, accounts }) => {
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  // `__Host-` cookies refuse a plain `url` field over CDP; `domain` + `path` is the shape Chromium
  // accepts, and it still sends them on every request to this origin (127.0.0.1 is a trustworthy
  // origin, so a Secure cookie travels over this plain-HTTP test server).
  await context.addCookies([
    { name: SESSION_COOKIE, value: accountId, domain: '127.0.0.1', path: '/', secure: true },
    { name: CSRF_COOKIE, value: CSRF_TOKEN, domain: '127.0.0.1', path: '/', secure: true },
  ])
  const page = await context.newPage()
  const responseBodies = []
  page.on('response', (response) => {
    if (!response.url().startsWith(origin)) return
    responseBodies.push(response.text().then((text) => ({ url: response.url(), text })).catch(() => null))
  })
  await page.route('**/api/control/access-context', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ account: { accountId, displayName: accounts[accountId] }, workspaces: [{ workspaceId, name: 'Metal Nobre' }], projects: [] }),
  }))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ projectId, workspaceId, name: 'Pedidos de compra', projectRevision: 'r1', archived: false }),
  }))
  return { page, responseBodies }
}

const assertNoCredential = async ({ page, responseBodies, logLines }) => {
  const bodyText = await page.locator('body').innerText()
  for (const value of CREDENTIAL_VALUES) assert.equal(bodyText.includes(value), false, `page text leaked ${value}`)

  const inputValues = await page.$$eval('input', (inputs) => inputs.map((input) => input.value))
  for (const value of CREDENTIAL_VALUES) assert.equal(inputValues.some((entered) => entered === value), false, `a DOM input still held ${value}`)

  const captured = (await Promise.all(responseBodies)).filter(Boolean)
  for (const { url, text } of captured) {
    for (const value of CREDENTIAL_VALUES) assert.equal(text.includes(value), false, `network response from ${url} leaked ${value}`)
  }

  for (const line of logLines) {
    for (const value of CREDENTIAL_VALUES) assert.equal(line.includes(value), false, `a Hub log line leaked ${value}: ${line}`)
  }
}

test('an installation administrator and Owner adds a Connection and grants an operation; nothing leaks the credential; revoking removes the grant', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const fixture = await setupFixture(t)
  const { page, responseBodies } = await withPage(t, { ...fixture, accountId: fixture.bothAccountId })

  await page.goto(`${fixture.origin}/projects/${fixture.projectId}/integrations`)
  await page.getByRole('heading', { name: 'Integrações', exact: true }).waitFor()

  await page.getByLabel('Nome da conexão').fill('ERP de teste')
  await page.getByLabel('Client id').fill(CREDENTIAL.clientId)
  await page.getByLabel('Client secret').fill(CREDENTIAL.clientSecret)
  await page.getByLabel('X-Token').fill(CREDENTIAL.xToken)
  await page.getByRole('button', { name: 'Adicionar conexão Sankhya' }).click()
  await page.getByText('ERP de teste').waitFor()
  await page.getByText('Para trocar a credencial, desative a conexão ativa e adicione outra.').waitFor()
  assert.equal(await page.locator('input[name="clientId"], input[name="clientSecret"], input[name="xToken"]').count(), 0,
    'with a Connection open, the credential form is gone, so no field can hold a value')

  await page.getByRole('button', { name: 'Testar' }).click()
  await page.getByText('O conector ainda não está configurado no servidor.').waitFor()

  await page.getByRole('button', { name: 'Conceder' }).click()
  await page.getByText('Ler pedido de compra do Sankhya').first().waitFor()
  await page.getByRole('heading', { name: /Concedidas/ }).waitFor()
  await page.getByText('Nenhuma integração concedida ainda.').waitFor({ state: 'detached' })

  await assertNoCredential({ page, responseBodies, logLines: fixture.logLines })

  await page.reload()
  await page.getByRole('heading', { name: 'Integrações', exact: true }).waitFor()
  await page.getByText('ERP de teste').waitFor()
  await page.getByText('Ler pedido de compra do Sankhya').first().waitFor()
  await assertNoCredential({ page, responseBodies, logLines: fixture.logLines })

  await page.getByRole('button', { name: 'Revogar' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Revogar' }).click()
  await page.getByRole('button', { name: 'Conceder' }).waitFor()
  await page.getByText('Nenhuma integração concedida ainda.').waitFor()

  await assertNoCredential({ page, responseBodies, logLines: fixture.logLines })
})

test('an installation administrator who is not the Owner sees Connections but not Grants', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const fixture = await setupFixture(t)
  const { page } = await withPage(t, { ...fixture, accountId: fixture.adminAccountId })
  await page.goto(`${fixture.origin}/projects/${fixture.projectId}/integrations`)
  await page.getByRole('heading', { name: 'Conexões do Workspace' }).waitFor()
  await page.getByRole('button', { name: 'Adicionar conexão Sankhya' }).waitFor()
  await page.getByText('Só o Owner do Workspace concede e revoga integrações deste Projeto.').waitFor()
})

test('a Workspace Owner who is not an installation administrator sees Grants but not Connections', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const fixture = await setupFixture(t)
  const { page } = await withPage(t, { ...fixture, accountId: fixture.ownerAccountId })
  await page.goto(`${fixture.origin}/projects/${fixture.projectId}/integrations`)
  await page.getByRole('heading', { name: 'Integrações deste Projeto' }).waitFor()
  await page.getByText('Só um administrador da instalação vê e administra as conexões do Workspace.').waitFor()
})

test('a create whose answer was lost resubmits the same id and gets 200; a failed disable says so and leaves the Connection active', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const fixture = await setupFixture(t)
  const { page, responseBodies } = await withPage(t, { ...fixture, accountId: fixture.bothAccountId })
  const connections = `**/api/control/workspaces/${fixture.workspaceId}/connections`
  const created = []
  let loseAnswer = true
  await page.route(connections, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const response = await route.fetch()
    created.push({ connectionId: route.request().postDataJSON().connectionId, status: response.status() })
    if (loseAnswer) {
      loseAnswer = false
      return route.abort('connectionreset')
    }
    return route.fulfill({ response })
  })

  await page.goto(`${fixture.origin}/projects/${fixture.projectId}/integrations`)
  await page.getByRole('heading', { name: 'Integrações', exact: true }).waitFor()
  await page.getByLabel('Nome da conexão').fill('ERP de teste')
  await page.getByLabel('Client id').fill(CREDENTIAL.clientId)
  await page.getByLabel('Client secret').fill(CREDENTIAL.clientSecret)
  await page.getByLabel('X-Token').fill(CREDENTIAL.xToken)
  await page.getByRole('button', { name: 'Adicionar conexão Sankhya' }).click()
  await page.getByText('A alteração não foi confirmada.').waitFor()
  await page.getByRole('button', { name: 'Adicionar conexão Sankhya' }).click()
  await page.getByText('ERP de teste').waitFor()
  assert.deepEqual(created.map(({ status }) => status), [201, 200])
  assert.equal(created[1].connectionId, created[0].connectionId, 'the resubmit is the same request')

  await page.route(`${connections}/*`, (route) => (route.request().method() === 'DELETE'
    ? route.fulfill({ status: 503, contentType: 'application/problem+json', body: '{}' })
    : route.fallback()))
  await page.getByRole('button', { name: 'Desativar' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Desativar' }).click()
  await page.getByText('A conexão não foi desativada e continua ativa.').waitFor()
  assert.equal(await page.getByText('· desativada').count(), 0)
  await assertNoCredential({ page, responseBodies, logLines: fixture.logLines })

  const check = await fetch(`${fixture.origin}/api/control/workspaces/${fixture.workspaceId}/connections/${randomUUID()}/authentication-check`, {
    method: 'POST',
    headers: { origin: fixture.origin, 'x-conexus-csrf': CSRF_TOKEN, cookie: `${SESSION_COOKIE}=${fixture.bothAccountId}; ${CSRF_COOKIE}=${CSRF_TOKEN}` },
  })
  assert.equal(check.status, 404, 'no gateway configured, and still no outcome for a Connection that does not exist')
})
