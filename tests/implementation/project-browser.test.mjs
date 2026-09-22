import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const path = (relative) => resolve(repositoryRoot, relative)
const port = 41736
const origin = `http://127.0.0.1:${port}`
// Set to a folder to also save desktop and phone screenshots, light and dark, of every screen.
const shotDirectory = process.env.CONEXUS_SCREENSHOT_DIR ? resolve(process.env.CONEXUS_SCREENSHOT_DIR) : null

const ids = {
  account: '10000000-0000-4000-8000-000000000001',
  diego: '10000000-0000-4000-8000-000000000002',
  operations: '20000000-0000-4000-8000-000000000001',
  sales: '20000000-0000-4000-8000-000000000002',
  vacation: '30000000-0000-4000-8000-000000000001',
  visits: '30000000-0000-4000-8000-000000000002',
  checklist: '30000000-0000-4000-8000-000000000003',
  stock: '30000000-0000-4000-8000-000000000004',
  created: '30000000-0000-4000-8000-000000000099',
  invitation: '40000000-0000-4000-8000-000000000001',
}
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString()

function hubFixture() {
  return {
    accessStatus: 200,
    workspaces: [{ workspaceId: ids.operations, name: 'Operações' }, { workspaceId: ids.sales, name: 'Comercial' }],
    summariesStatus: 200,
    summaries: [
      { projectId: ids.vacation, name: 'Pedidos de férias', archived: false, lastActivityAt: minutesAgo(5), latestRun: { state: 'SUCCEEDED', resultKind: 'SOURCE_CHANGED' }, hasPreview: true },
      { projectId: ids.visits, name: 'Visitas a clientes', archived: false, lastActivityAt: minutesAgo(42), latestRun: { state: 'RUNNING', resultKind: null }, hasPreview: true },
      { projectId: ids.checklist, name: 'Checklist de abertura da loja', archived: false, lastActivityAt: minutesAgo(60 * 26), latestRun: { state: 'FAILED', resultKind: null }, hasPreview: false },
      { projectId: ids.stock, name: 'Estoque do almoxarifado', archived: false, lastActivityAt: minutesAgo(60 * 24 * 9), latestRun: null, hasPreview: false },
    ],
    repository: { state: 'REACHABLE', fullName: 'empresa-exemplo/pedidos-de-ferias', url: 'https://github.com/empresa-exemplo/pedidos-de-ferias' },
    roster: {
      viewerRole: 'owner',
      entries: [
        { kind: 'member', accountId: ids.account, displayName: 'Marina Alves', email: 'marina@empresa.com.br', role: 'owner', since: '2026-08-01T12:00:00.000Z' },
        { kind: 'member', accountId: ids.diego, displayName: 'Diego Souza', email: 'diego@empresa.com.br', role: 'member', since: '2026-09-02T12:00:00.000Z' },
        { kind: 'invitation', invitationId: ids.invitation, email: 'carla@empresa.com.br', role: 'member', invitedAt: '2026-09-20T12:00:00.000Z', expiresAt: '2026-10-04T12:00:00.000Z' },
      ],
    },
    requests: [],
  }
}

const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body ?? {}) })
const projectOf = (projectId) => ({ projectId, workspaceId: ids.operations, name: projectId === ids.created ? 'Controle de pedidos de férias' : 'Pedidos de férias', projectRevision: 'revision-1', archived: false })

async function mockHub(page, hub) {
  await page.route('**/protocol/oidc/login', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Keycloak</title><h1>Keycloak</h1>' }))
  // Like the real Preview host, the entry refuses a plain GET and admits only a POST of the grant.
  await page.route('**/__preview/**', (route) => route.request().method() !== 'POST' || route.request().postData() !== 'entryGrant=grant' ? route.fulfill({ status: 403, body: '' }) : route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><body style="margin:0;font:16px system-ui;background:#fff;color:#1b2230"><header style="display:flex;justify-content:space-between;padding:28px 40px;border-bottom:1px solid #e7eaf0"><b style="font-size:26px">${decodeURIComponent(route.request().url().split('/').at(-1))}</b><span style="color:#6b7384">3 aguardando decisão</span></header>${['Marina Alves', 'Diego Souza', 'Carla Mendes', 'Rafael Lima'].map((name) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:22px 40px;border-bottom:1px solid #eef0f4;font-size:20px"><span>${name}</span><span style="padding:10px 18px;border-radius:8px;background:#2563eb;color:#fff">Aprovar</span></div>`).join('')}</body>`,
  }))
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const body = request.postData() ? request.postDataJSON() : null
    hub.requests.push({ method, path: url.pathname, body, idempotencyKey: await request.headerValue('idempotency-key') })
    const p = url.pathname
    if (p === '/api/control/access-context') {
      if (hub.accessStatus !== 200) return json(route, hub.accessStatus, { type: 'authentication-required' })
      return json(route, 200, { account: { accountId: ids.account, displayName: 'Marina Alves', email: 'marina@empresa.com.br' }, workspaces: hub.workspaces, projects: [] })
    }
    if (p === '/api/session' && method === 'DELETE') return route.fulfill({ status: 204 })
    if (p === '/api/control/accounts' && method === 'POST') return json(route, 201, { accountId: ids.account, displayName: body.displayName })
    if (p === '/api/control/workspaces' && method === 'POST') return json(route, 201, { workspaceId: ids.sales, name: body.name, initialAccessEstablished: true, creatorAccountId: ids.account })
    const summaries = p.match(/^\/api\/control\/workspaces\/([^/]+)\/project-summaries$/)
    if (summaries) return json(route, hub.summariesStatus, hub.summariesStatus === 200 ? { projects: hub.summaries } : { type: 'unavailable' })
    const projects = p.match(/^\/api\/control\/workspaces\/([^/]+)\/projects$/)
    if (projects && method === 'POST') return json(route, 201, projectOf(ids.created))
    if (projects) return json(route, 200, hub.summaries.map(({ projectId, name, archived }) => ({ projectId, workspaceId: ids.operations, name, archived })))
    if (p.endsWith('/members')) return json(route, 200, hub.roster)
    if (p.endsWith('/invitations') && method === 'POST') return json(route, 200, { kind: 'invitation', invitationId: ids.invitation, email: body.email, role: body.role, invitedAt: '2026-09-22T12:00:00.000Z', expiresAt: '2026-10-06T12:00:00.000Z' })
    if (p.includes('/roster/') && method === 'DELETE') return route.fulfill({ status: 204 })
    if (p.endsWith('/repository')) return json(route, 200, hub.repository)
    if (p.endsWith('/builder-session/preview')) {
      const projectId = p.split('/')[4]
      const name = hub.summaries.find((summary) => summary.projectId === projectId)?.name ?? 'App'
      return json(route, 201, { entryUrl: `${origin}/__preview/${encodeURIComponent(name)}`, previewUrl: '', entryGrant: 'grant', artifactRevisionId: 'a', artifactDigest: 'd', expiresAt: minutesAgo(-30) })
    }
    if (p.endsWith('/conversations') && method === 'POST') return json(route, 201, { conversation: { conversationId: body.conversationId, title: null, createdAt: minutesAgo(0) } })
    if (p.endsWith('/builder-session/messages') && method === 'POST') return json(route, 201, { builderRun: { builderRunId: 'run-1', state: 'QUEUED' } })
    const project = p.match(/^\/api\/control\/projects\/([^/]+)$/)
    if (project) return json(route, 200, projectOf(project[1]))
    return json(route, 404, { type: 'not-mocked' })
  })
}

// The frame scrolls inside itself, so its main area and the top bar must fit as well as the page.
const measureOverflow = (page) => page.evaluate(() => [document.documentElement, ...document.querySelectorAll('[data-slot="app-shell-main"], .cx-topbar')].filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => `${element.className || element.tagName} ${element.scrollWidth}>${element.clientWidth}`))
// A resize animates the rail into its drawer, so the check waits for the layout to settle.
async function overflowing(page) {
  let found = await measureOverflow(page)
  for (let attempt = 0; attempt < 20 && found.length > 0; attempt += 1) {
    await page.waitForTimeout(100)
    found = await measureOverflow(page)
  }
  return found
}

async function shoot(page, name, { settle } = {}) {
  if (!shotDirectory) return
  mkdirSync(shotDirectory, { recursive: true })
  for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    for (const scheme of ['light', 'dark']) {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      if (settle) await settle()
      await page.waitForTimeout(250)
      // The frame scrolls inside itself, so the page grows to the frame's content for a full shot.
      const overflow = await page.evaluate(() => {
        const main = document.querySelector('[data-slot="app-shell-main"]')
        return main ? main.scrollHeight - main.clientHeight : 0
      })
      if (overflow > 0) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height + overflow })
        await page.waitForTimeout(250)
      }
      await page.screenshot({ path: resolve(shotDirectory, `${name}-${label}-${scheme}.png`), fullPage: true })
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
}

test('screens for entry, Workspaces, Projects home, Pessoas and Sobre o Projeto work in a real browser', { timeout: 240_000 }, async (t) => {
  const server = await createServer({ configFile: path('apps/web/vite.config.mjs'), root: path('apps/web'), server: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
  const page = await context.newPage()
  const hub = hubFixture()
  await mockHub(page, hub)
  const reset = async (changes = {}) => {
    Object.assign(hub, hubFixture(), changes)
    await page.setViewportSize({ width: 1440, height: 900 })
  }

  await t.test('a signed-out visit to / goes straight to sign-in', async () => {
    await reset({ accessStatus: 401 })
    await page.goto(`${origin}/`)
    await page.waitForURL(`${origin}/protocol/oidc/login`)
  })

  await t.test('entry pages name the situation and offer one way forward', async () => {
    await reset()
    await page.goto(`${origin}/signed-out`)
    await page.getByRole('heading', { name: 'Sessão encerrada' }).waitFor()
    assert.equal(await page.getByRole('link', { name: 'Entrar de novo' }).getAttribute('href'), '/protocol/oidc/login')
    await shoot(page, '01-signed-out')
    await page.goto(`${origin}/no-access`)
    await page.getByRole('heading', { name: 'Acesso ainda não liberado' }).waitFor()
    await shoot(page, '02-no-access')
    await reset({ accessStatus: 401 })
    await page.goto(`${origin}/setup`)
    await page.getByRole('heading', { name: 'Criar minha conta' }).waitFor()
    await shoot(page, '03-setup')
    await page.getByLabel('Seu nome').fill('Marina Alves')
    await page.getByRole('button', { name: 'Criar minha conta' }).click()
    await page.getByRole('heading', { name: 'Conta criada' }).waitFor()
    assert.deepEqual(hub.requests.find((entry) => entry.path === '/api/control/accounts').body, { displayName: 'Marina Alves' })
  })

  await t.test('two Workspaces and no last one lands on the list; one Workspace skips it', async () => {
    await reset()
    await page.goto(`${origin}/`)
    await page.waitForURL(`${origin}/workspaces`)
    await page.getByRole('heading', { name: 'Workspaces', exact: true }).waitFor()
    assert.equal(await page.locator('.cx-workspace-list li').count(), 2)
    await shoot(page, '04-workspaces')
    await reset({ workspaces: [{ workspaceId: ids.operations, name: 'Operações' }] })
    await page.goto(`${origin}/workspaces`)
    await page.waitForURL(`${origin}/workspaces/${ids.operations}/projects`)
  })

  await t.test('the last Workspace used is where / lands next time', async () => {
    await reset()
    await page.goto(`${origin}/workspaces/${ids.sales}/projects`)
    await page.getByRole('heading', { name: 'O que vamos construir?' }).waitFor()
    await page.goto(`${origin}/`)
    await page.waitForURL(`${origin}/workspaces/${ids.sales}/projects`)
    await page.evaluate(() => window.localStorage.clear())
  })

  await t.test('Novo Workspace creates it and opens its Projects', async () => {
    await reset()
    await page.goto(`${origin}/workspaces/new`)
    await page.getByRole('heading', { name: 'Novo Workspace' }).waitFor()
    await shoot(page, '05-workspace-new')
    await page.getByRole('button', { name: 'Criar Workspace' }).click()
    await page.getByText('Dê um nome ao Workspace.').waitFor()
    await page.getByLabel('Nome do Workspace').fill('Comercial')
    await page.getByRole('button', { name: 'Criar Workspace' }).click()
    await page.waitForURL(`${origin}/workspaces/${ids.sales}/projects`)
    const create = hub.requests.find((entry) => entry.path === '/api/control/workspaces')
    assert.deepEqual(create.body, { name: 'Comercial' })
    assert.ok(create.idempotencyKey)
  })

  await t.test('the Projects home shows cards most recent first, with state and last change', async () => {
    await reset()
    await page.goto(`${origin}/workspaces/${ids.operations}/projects`)
    await page.locator('.cx-project-card').first().waitFor()
    assert.deepEqual(await page.locator('.cx-project-card h3').allTextContents(), ['Pedidos de férias', 'Visitas a clientes', 'Checklist de abertura da loja', 'Estoque do almoxarifado'])
    assert.deepEqual(await page.locator('.cx-project-card .cx-chip').allTextContents(), ['Em uso', 'Construindo', 'Falhou', 'Sem prévia ainda'])
    assert.equal(await page.locator('.cx-project-card').first().locator('.cx-project-time').textContent(), 'Última alteração há 5 min.')
    assert.equal(await page.locator('.cx-project-card').first().getAttribute('href'), `/projects/${ids.vacation}`)
    await page.locator('.cx-thumb[data-loaded]').first().waitFor()
    assert.equal(await page.locator('.cx-thumb iframe').first().getAttribute('tabindex'), '-1')
    assert.match(await page.frameLocator(`iframe[name="cx-thumb-${ids.vacation}"]`).locator('body').innerText(), /Pedidos de férias/)
    assert.equal(await page.locator('.cx-project-cell').first().evaluate((element) => getComputedStyle(element).gridColumnStart), 'span 2')
    await shoot(page, '06-projects-home', { settle: () => page.locator('.cx-thumb[data-loaded]').first().waitFor() })
    await page.setViewportSize({ width: 390, height: 844 })
    assert.deepEqual(await overflowing(page), [])
    assert.equal(await page.locator('.cx-project-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length), 1)
    await page.setViewportSize({ width: 1440, height: 900 })
  })

  await t.test('the frame shows the trail, the Workspace rail and the account menu', async () => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('navigation', { name: 'Contexto atual' }).getByText('Operações').waitFor()
    await page.getByRole('link', { name: 'Pessoas' }).waitFor()
    await page.getByRole('button', { name: 'Trocar de Workspace' }).click()
    await page.getByRole('menuitem', { name: 'Comercial' }).waitFor()
    await shoot(page, '07-workspace-switcher')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Conta de Marina Alves' }).click()
    await page.getByRole('menuitem', { name: 'Sair do Conexus' }).waitFor()
    await page.getByText('marina@empresa.com.br').waitFor()
    await shoot(page, '08-account-menu')
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Abrir navegação' }).click()
    await page.getByRole('link', { name: 'Pessoas' }).waitFor()
    if (shotDirectory) await page.screenshot({ path: resolve(shotDirectory, '09-drawer-mobile-light.png') })
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1440, height: 900 })
  })

  await t.test('describing an app creates the Project and sends the description as its first request', async () => {
    await reset()
    await page.goto(`${origin}/workspaces/${ids.operations}/projects`)
    const prompt = page.getByLabel('Descreva o aplicativo')
    await prompt.fill('controle de pedidos de férias, com aprovação do gestor e motivo na recusa')
    await prompt.press('Enter')
    const name = page.getByLabel('Nome do Projeto')
    assert.equal(await name.inputValue(), 'Controle de pedidos de férias')
    await shoot(page, '10-projects-home-confirm')
    await page.getByRole('button', { name: 'Criar e começar' }).click()
    await page.waitForURL(`${origin}/projects/${ids.created}`)
    const create = hub.requests.find((entry) => entry.method === 'POST' && entry.path.endsWith('/projects'))
    assert.deepEqual(create.body, { name: 'Controle de pedidos de férias', sourceBootstrap: { mode: 'NEW' } })
    const conversation = hub.requests.find((entry) => entry.method === 'POST' && entry.path.endsWith('/conversations'))
    const message = hub.requests.find((entry) => entry.path.endsWith('/builder-session/messages'))
    assert.deepEqual(message.body, { content: 'controle de pedidos de férias, com aprovação do gestor e motivo na recusa', mode: 'BUILD', conversationId: conversation.body.conversationId })
    assert.ok(message.idempotencyKey)
  })

  await t.test('an empty Workspace shows only the prompt with three example ideas', async () => {
    await reset({ summaries: [] })
    await page.goto(`${origin}/workspaces/${ids.operations}/projects`)
    await page.getByRole('button', { name: 'Checklist de abertura da loja' }).waitFor()
    assert.equal(await page.locator('.cx-prompt-examples button').count(), 3)
    assert.equal(await page.locator('.cx-project-grid').count(), 0)
    await shoot(page, '11-projects-home-empty')
    await page.getByRole('button', { name: 'Cadastro de visitas a clientes' }).click()
    assert.equal(await page.getByLabel('Descreva o aplicativo').inputValue(), 'Cadastro de visitas a clientes')
  })

  await t.test('a failed Projects read says so and retries', async () => {
    await reset({ summariesStatus: 503 })
    await page.goto(`${origin}/workspaces/${ids.operations}/projects`)
    await page.getByRole('heading', { name: 'Não foi possível carregar os Projetos' }).waitFor()
    await shoot(page, '12-projects-home-error')
    hub.summariesStatus = 200
    await page.getByRole('button', { name: 'Tentar de novo' }).click()
    await page.locator('.cx-project-card').first().waitFor()
  })

  await t.test('Novo Projeto with only a name creates it without sending a request', async () => {
    await reset()
    await page.goto(`${origin}/workspaces/${ids.operations}/projects/new`)
    await page.getByRole('heading', { name: 'Novo Projeto' }).waitFor()
    await shoot(page, '13-project-new')
    await page.getByLabel('Nome do Projeto').fill('Controle de pedidos de férias')
    await page.getByRole('button', { name: 'Criar Projeto' }).click()
    await page.waitForURL(`${origin}/projects/${ids.created}`)
    assert.equal(hub.requests.some((entry) => entry.path.endsWith('/builder-session/messages')), false)
  })

  await t.test('Pessoas lists members and invitations and lets an owner invite and copy the entry link', async () => {
    await reset()
    await page.goto(`${origin}/workspaces/${ids.operations}/settings/people`)
    await page.getByRole('heading', { name: 'Pessoas', exact: true }).waitFor()
    await page.getByText('carla@empresa.com.br').waitFor()
    assert.equal(await page.locator('.cx-person-list').first().locator('.cx-person').count(), 2)
    await shoot(page, '14-people')
    await page.getByLabel('Email').fill('rafael@empresa.com.br')
    await page.getByRole('button', { name: 'Convidar' }).click()
    await page.getByText('Convite criado para rafael@empresa.com.br.').waitFor()
    assert.deepEqual(hub.requests.find((entry) => entry.path.endsWith('/invitations')).body, { email: 'rafael@empresa.com.br', role: 'member' })
    await page.getByRole('button', { name: 'Copiar link de entrada' }).click()
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${origin}/`)
    await page.getByRole('button', { name: 'Ações para Diego Souza' }).click()
    await page.getByRole('menuitem', { name: 'Remover do Workspace' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remover' }).click()
    await page.waitForFunction(() => true)
    await page.getByRole('alertdialog').waitFor({ state: 'detached' })
    assert.ok(hub.requests.some((entry) => entry.method === 'DELETE' && entry.path.endsWith(`/roster/member/${ids.diego}`)))
  })

  await t.test('a member sees Pessoas read only, with a way to leave', async () => {
    await reset()
    hub.roster = { ...hub.roster, viewerRole: 'member' }
    await page.goto(`${origin}/workspaces/${ids.operations}/settings/people`)
    await page.getByText('Diego Souza').waitFor()
    assert.equal(await page.getByRole('button', { name: 'Ações para Diego Souza' }).count(), 0)
    assert.equal(await page.getByRole('heading', { name: 'Convidar alguém' }).count(), 0)
    await page.getByRole('button', { name: 'Sair', exact: true }).waitFor()
    await shoot(page, '15-people-member')
  })

  await t.test('Sobre o Projeto shows the repository and the internet line', async () => {
    await reset()
    await page.goto(`${origin}/projects/${ids.vacation}/settings`)
    await page.getByRole('heading', { name: 'Sobre o Projeto' }).waitFor()
    const link = page.getByRole('link', { name: /empresa-exemplo\/pedidos-de-ferias/ })
    assert.equal(await link.getAttribute('href'), 'https://github.com/empresa-exemplo/pedidos-de-ferias')
    await page.getByText('O agente executa comandos sozinho num ambiente isolado com acesso à internet.').waitFor()
    await page.getByRole('link', { name: 'Construir' }).waitFor()
    await page.getByRole('link', { name: 'Voltar para Projetos' }).waitFor()
    await shoot(page, '16-project-about')
    await reset({ repository: { state: 'UNREACHABLE' } })
    await page.reload()
    await page.getByText('Inacessível').waitFor()
    await shoot(page, '17-project-about-unreachable')
  })

  await t.test('Sair do Conexus ends the session and shows Sessão encerrada', async () => {
    await reset()
    await page.goto(`${origin}/workspaces/${ids.operations}/projects`)
    await page.getByRole('button', { name: 'Conta de Marina Alves' }).click()
    await page.getByRole('menuitem', { name: 'Sair do Conexus' }).click()
    await page.waitForURL(`${origin}/signed-out`)
    assert.ok(hub.requests.some((entry) => entry.method === 'DELETE' && entry.path === '/api/session'))
  })

  await t.test('every screen fits a 390 px phone without sideways scrolling', async () => {
    await reset()
    await page.setViewportSize({ width: 390, height: 844 })
    for (const route of ['/workspaces', '/workspaces/new', `/workspaces/${ids.operations}/projects`, `/workspaces/${ids.operations}/projects/new`, `/workspaces/${ids.operations}/settings/people`, `/projects/${ids.vacation}/settings`, '/signed-out', '/no-access']) {
      await page.goto(`${origin}${route}`)
      await page.locator('h1').first().waitFor()
      assert.deepEqual(await overflowing(page), [], route)
    }
  })
})
