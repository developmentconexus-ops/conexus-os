import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { build } from 'vite'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { ID, setupProjects } from './project-fixture.mjs'
import { opaque, testListener } from './access/test-listener.mjs'

// Real Fastify + real PostgreSQL, driven by a real Chromium, exactly as the Hub runs: only the
// session/administrator lookup is a test double (a real sign-in needs Keycloak, which this suite
// must not touch). Everything else -- the store, the credential envelope and the SQL authority
// checks -- is production code.
const configured = ['CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME', 'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD']
  .every((name) => process.env[name])

const repositoryRoot = resolve(import.meta.dirname, '../..')

const { createConnectorModule } = await import(hubModuleUrl('connectors/module.js'))
const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))

// One build of the real SPA, shared by every test in this file: the Hub serves it exactly as
// production does (staticRoot), so a reload is a real server round trip, not a Vite dev artifact.
// The build goes outside apps/web: every other browser suite serves that directory with a Vite dev
// server running beside this one, and a file written inside it reloads their pages mid-test.
const staticRoot = configured ? mkdtempSync(join(tmpdir(), 'conexus-web-static-')) : null
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

const findFreePort = () => new Promise((settle, reject) => {
  const probe = createServer()
  probe.on('error', reject)
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address()
    probe.close(() => settle(port))
  })
})

const setupFixture = async (t) => {
  const fixture = await setupProjects(t, 'connector_integrations')
  const { connection, database, seedProject } = fixture

  const adminAccountId = ID.memberAdministrator // installation administrator, Workspace member, not Owner
  const ownerAccountId = ID.owner // Workspace Owner, not an installation administrator
  const bothAccountId = ID.administrator // both
  const accounts = { [adminAccountId]: 'Administrador', [ownerAccountId]: 'Dona do Workspace', [bothAccountId]: 'Rita' }
  for (const [id, name] of Object.entries(accounts)) await query(connection, 'UPDATE iam.account SET display_name = $2 WHERE account_id = $1', [id, name])
  await query(connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [bothAccountId, ID.workspace])
  const workspaceId = ID.workspace
  const projectId = await seedProject('Pedidos de compra')

  const logLines = []
  const sessions = Object.fromEntries(Object.entries(accounts).map(([id, displayName]) => [opaque(id), { account: { accountId: id, displayName }, issuer: 'https://connector-integrations.test', subject: id }]))

  const port = await findFreePort()
  const origin = `http://127.0.0.1:${port}`
  const envelope = createSecretEnvelope('cd'.repeat(32))
  const connectors = createConnectorModule({ database, envelope })

  const { app } = await testListener({
    hubOrigin: origin,
    sessions,
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
    { name: SESSION_COOKIE, value: opaque(accountId), domain: '127.0.0.1', path: '/', secure: true },
  ])
  const page = await context.newPage()
  const responseBodies = []
  page.on('response', (response) => {
    if (!response.url().startsWith(origin)) return
    responseBodies.push(response.text().then((text) => ({ url: response.url(), text })).catch(() => null))
  })
  await page.route('**/api/session', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ account: { accountId, displayName: accounts[accountId] }, workspaces: [{ workspaceId, name: 'Metal Nobre' }], administrator: false }),
  }))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ projectId, workspaceId, name: 'Pedidos de compra', projectRevision: '50000000-0000-4000-8000-000000000001', archived: false, deleting: false }),
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

const sections = (page) => ({
  connections: page.locator('section[aria-labelledby="connector-connections"]'),
  bindings: page.locator('section[aria-labelledby="connector-bindings"]'),
})

const addConnection = async (page, label) => {
  await page.getByLabel('Nome da conexão').fill(label)
  await page.getByLabel('Client id').fill(CREDENTIAL.clientId)
  await page.getByLabel('Client secret').fill(CREDENTIAL.clientSecret)
  await page.getByLabel('X-Token').fill(CREDENTIAL.xToken)
  await page.getByRole('button', { name: 'Adicionar conexão Sankhya' }).click()
}

const bindableRow = (page, label) => sections(page).bindings.getByRole('listitem').filter({ hasText: label })

test('an installation administrator and Owner adds two Connections and binds one under a name; a name already in use is refused and says so; nothing leaks the credential; unbinding offers it again', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const fixture = await setupFixture(t)
  const { page, responseBodies } = await withPage(t, { ...fixture, accountId: fixture.bothAccountId })
  const { connections, bindings } = sections(page)

  await page.goto(`${fixture.origin}/projects/${fixture.projectId}/integrations`)
  await page.getByRole('heading', { name: 'Integrações', exact: true }).waitFor()

  await addConnection(page, 'ERP de teste')
  await connections.getByText('ERP de teste').waitFor()
  await page.getByText('Para trocar a credencial de uma conexão, desative-a e adicione outra.').waitFor()
  assert.deepEqual(await page.$$eval('input[name="clientId"], input[name="clientSecret"], input[name="xToken"]', (inputs) => inputs.map((input) => input.value)),
    ['', '', ''], 'the form is reset once the Connection is saved, so no field holds a value')

  await page.getByRole('button', { name: 'Testar' }).click()
  await page.getByText('A integração com o sistema da empresa não está configurada. A falha foi registrada.').waitFor()

  await addConnection(page, 'ERP filial')
  await connections.getByText('ERP filial').waitFor()
  assert.deepEqual(await connections.locator('.cx-connection strong').allInnerTexts(), ['ERP de teste', 'ERP filial'], 'a second Sankhya Connection is its own row')

  const row = bindableRow(page, 'ERP de teste')
  await row.getByLabel('Nome no Projeto').fill('ERP')
  await row.getByRole('button', { name: 'Vincular', exact: true }).click()
  await row.getByText('Use letras minúsculas, números e hífen, começando por uma letra.').waitFor()
  await row.getByLabel('Nome no Projeto').fill('erp')
  await row.getByRole('button', { name: 'Vincular', exact: true }).click()
  await bindings.getByRole('heading', { name: /Vinculadas/ }).getByText('1').waitFor()
  await bindings.getByText('Nenhuma conexão vinculada ainda.').waitFor({ state: 'detached' })
  assert.deepEqual(await bindings.locator('.cx-connection code').allInnerTexts(), ['erp'])
  assert.equal(await bindings.getByRole('button', { name: 'Vincular', exact: true }).count(), 1, 'only ERP filial is left to bind')

  const filial = bindableRow(page, 'ERP filial')
  await filial.getByLabel('Nome no Projeto').fill('erp')
  await filial.getByRole('button', { name: 'Vincular', exact: true }).click()
  await filial.getByRole('alert').filter({ hasText: 'Este nome já está em uso neste Projeto, ou esta conexão já está vinculada com outro nome.' }).waitFor()
  assert.deepEqual(await bindings.locator('.cx-connection code').allInnerTexts(), ['erp'])

  await assertNoCredential({ page, responseBodies, logLines: fixture.logLines })

  await page.reload()
  await page.getByRole('heading', { name: 'Integrações', exact: true }).waitFor()
  await bindings.getByText('erp', { exact: true }).waitFor()
  assert.deepEqual(await bindings.locator('.cx-connection strong').allInnerTexts(), ['ERP de teste', 'ERP filial'])
  assert.deepEqual(await bindings.locator('.cx-connection code').allInnerTexts(), ['erp'], 'the refused bind saved nothing')
  await assertNoCredential({ page, responseBodies, logLines: fixture.logLines })

  await bindings.getByRole('button', { name: 'Desvincular' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Desvincular' }).click()
  await bindings.getByText('Nenhuma conexão vinculada ainda.').waitFor()
  assert.equal(await bindings.getByRole('button', { name: 'Vincular', exact: true }).count(), 2)

  await assertNoCredential({ page, responseBodies, logLines: fixture.logLines })
})

test('an installation administrator who is not the Owner sees Connections but not bindings', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const fixture = await setupFixture(t)
  const { page } = await withPage(t, { ...fixture, accountId: fixture.adminAccountId })
  await page.goto(`${fixture.origin}/projects/${fixture.projectId}/integrations`)
  await page.getByRole('heading', { name: 'Conexões do Workspace' }).waitFor()
  await page.getByRole('button', { name: 'Adicionar conexão Sankhya' }).waitFor()
  await page.getByText('Só o Owner do Workspace vincula e desvincula conexões deste Projeto.').waitFor()
})

test('a Workspace Owner who is not an installation administrator sees bindings but not Connections', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const fixture = await setupFixture(t)
  const { page } = await withPage(t, { ...fixture, accountId: fixture.ownerAccountId })
  await page.goto(`${fixture.origin}/projects/${fixture.projectId}/integrations`)
  await page.getByRole('heading', { name: 'Integrações deste Projeto' }).waitFor()
  await page.getByText('Só um administrador da instalação vê e administra as conexões do Workspace.').waitFor()
})

test('a create or bind whose answer was lost says so and its resubmit answers what was saved; a failed disable or unbind says so and changes nothing', { skip: configured ? false : 'real PostgreSQL configuration not supplied' }, async (t) => {
  const fixture = await setupFixture(t)
  const { page, responseBodies } = await withPage(t, { ...fixture, accountId: fixture.bothAccountId })
  const { connections, bindings } = sections(page)
  const connectionsUrl = `**/api/control/workspaces/${fixture.workspaceId}/connections`
  const created = []
  let loseAnswer = true
  await page.route(connectionsUrl, async (route) => {
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
  await addConnection(page, 'ERP de teste')
  await page.getByText('A tela não conseguiu falar com o Conexus agora. Tente novamente mais tarde.').waitFor()
  await page.getByRole('button', { name: 'Adicionar conexão Sankhya' }).click()
  await connections.getByText('ERP de teste').waitFor()
  assert.deepEqual(created.map(({ status }) => status), [201, 200])
  assert.equal(created[1].connectionId, created[0].connectionId, 'the resubmit is the same request')

  await page.route(`${connectionsUrl}/*`, (route) => (route.request().method() === 'DELETE'
    ? route.fulfill({ status: 500, contentType: 'application/problem+json', body: JSON.stringify({ type: 'urn:conexus:problem:INTERNAL_UNEXPECTED', title: 'INTERNAL_UNEXPECTED', status: 500, code: 'INTERNAL_UNEXPECTED' }) })
    : route.fallback()))
  await page.getByRole('button', { name: 'Desativar' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Desativar' }).click()
  await page.getByText('O Conexus falhou de um jeito que não esperávamos. A falha foi registrada.').waitFor()
  assert.equal(await page.getByText('· desativada').count(), 0)

  const bound = []
  let loseBindAnswer = true
  await page.route(`**/api/control/projects/${fixture.projectId}/connection-bindings`, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const response = await route.fetch()
    bound.push({ status: response.status(), bindingId: (await response.json()).bindingId })
    if (loseBindAnswer) {
      loseBindAnswer = false
      return route.abort('connectionreset')
    }
    return route.fulfill({ response })
  })
  const row = bindableRow(page, 'ERP de teste')
  await row.getByLabel('Nome no Projeto').fill('erp')
  await row.getByRole('button', { name: 'Vincular', exact: true }).click()
  await row.getByRole('alert').filter({ hasText: 'A tela não conseguiu falar com o Conexus agora. Tente novamente mais tarde.' }).waitFor()
  await row.getByRole('button', { name: 'Vincular', exact: true }).click()
  await bindings.getByRole('button', { name: 'Desvincular' }).waitFor()
  assert.deepEqual(bound.map(({ status }) => status), [201, 200])
  assert.equal(bound[1].bindingId, bound[0].bindingId, 'the resubmitted bind answers the binding the lost answer saved')
  await page.route(`**/api/control/projects/${fixture.projectId}/connection-bindings/*`, (route) => (route.request().method() === 'DELETE'
    ? route.fulfill({ status: 500, contentType: 'application/problem+json', body: JSON.stringify({ type: 'urn:conexus:problem:INTERNAL_UNEXPECTED', title: 'INTERNAL_UNEXPECTED', status: 500, code: 'INTERNAL_UNEXPECTED' }) })
    : route.fallback()))
  await bindings.getByRole('button', { name: 'Desvincular' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Desvincular' }).click()
  await page.getByRole('alertdialog').waitFor({ state: 'detached' })
  const unbindFailure = bindings.getByRole('alert').filter({ hasText: 'O Conexus falhou de um jeito que não esperávamos. A falha foi registrada.' })
  await unbindFailure.waitFor()
  assert.equal(await unbindFailure.isVisible(), true, 'the failed unbind is reported where the Owner can see it')
  await bindings.getByRole('button', { name: 'Desvincular' }).waitFor()
  await assertNoCredential({ page, responseBodies, logLines: fixture.logLines })

  const check = await fetch(`${fixture.origin}/api/control/workspaces/${fixture.workspaceId}/connections/${randomUUID()}/authentication-check`, {
    method: 'POST',
    headers: { origin: fixture.origin, 'sec-fetch-site': 'same-origin', cookie: `${SESSION_COOKIE}=${opaque(fixture.bothAccountId)}` },
  })
  assert.equal(check.status, 404, 'no gateway configured, and still no outcome for a Connection that does not exist')
})
