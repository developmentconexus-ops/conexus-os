import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const path = (relative) => resolve(repositoryRoot, relative)

test('S3-P6 browser routes remain preserved beside the bounded S4 candidate route', () => {
  const expected = [
    'apps/web/src/routes/workspace-projects.tsx',
    'apps/web/src/routes/workspace-project-new.tsx',
    'apps/web/src/routes/project-detail.tsx',
    'apps/web/src/features/project/api.ts',
    'apps/web/src/features/project/components/project-list.tsx',
    'apps/web/src/features/project/components/project-create-form.tsx',
    'apps/web/src/features/project/components/project-detail.tsx',
  ]
  for (const file of expected) assert.equal(existsSync(path(file)), true, file)
  const router = readFileSync(path('apps/web/src/app/router.tsx'), 'utf8')
  assert.match(router, /workspaceProjectsRoute/)
  assert.match(router, /workspaceProjectNewRoute/)
  assert.match(router, /projectDetailRoute/)
  assert.doesNotMatch(router, /inception/i)
})

test('S3-P6 browse states and filters remain honest and local', () => {
  const source = readFileSync(path('apps/web/src/features/project/components/project-list.tsx'), 'utf8')
  assert.match(source, /Carregando os Projects/)
  assert.match(source, /Nenhum Project divulgado/)
  assert.match(source, /não revelou os Projects/)
  assert.match(source, /Não foi possível consultar os Projects/)
  assert.match(source, /Nome do Project/)
  assert.match(source, /Ativos|Arquivados|Todos/)
  assert.match(source, />Abrir</)
  assert.doesNotMatch(source, /\bfetch\(|workspace\.access\.manage/)
})

test('S3-P6 create form exposes both source modes and conditional locator', () => {
  const source = readFileSync(path('apps/web/src/features/project/components/project-create-form.tsx'), 'utf8')
  assert.match(source, /type="radio"/)
  assert.match(source, /value="NEW"/)
  assert.match(source, /value="EXISTING_GIT"/)
  assert.match(source, /Localizador do repositório/)
  assert.match(source, /crypto\.randomUUID\(\)/)
  assert.match(source, /status === 409/)
  assert.match(source, /status === 422/)
  assert.match(source, /status === 503/)
})

test('S3-P6 responsive contract includes a one-column Project card reflow', () => {
  const styles = readFileSync(path('apps/web/src/styles.css'), 'utf8')
  assert.match(styles, /\.project-grid/)
  assert.match(styles, /grid-template-columns:\s*repeat\(2/)
  assert.match(styles, /grid-template-columns:\s*1fr/)
})

test('S3-P6 real Chromium proves browse, filters, create navigation and narrow reflow', async (t) => {
  const workspaceId = '20000000-0000-4000-8000-000000000091'
  const projectId = '30000000-0000-4000-8000-000000000091'
  const archivedId = '30000000-0000-4000-8000-000000000092'
  const createdId = '30000000-0000-4000-8000-000000000093'
  const origin = 'http://127.0.0.1:41736'
  const server = await createServer({
    configFile: path('apps/web/vite.config.mjs'),
    root: path('apps/web'),
    server: { host: '127.0.0.1', port: 41736, strictPort: true },
  })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  let listStatus = 200
  let projects = [
    { projectId, workspaceId, name: 'Active Project', archived: false },
    { projectId: archivedId, workspaceId, name: 'Archived Project', archived: true },
  ]
  let createKey = ''
  await page.route('**/api/control/access-context', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      account: { accountId: '10000000-0000-4000-8000-000000000091', displayName: 'P6 Operator' },
      workspaces: [{ workspaceId, name: 'P6 Workspace' }],
      projects: [],
    }),
  }))
  await page.route(`**/api/control/workspaces/${workspaceId}/projects`, async (route) => {
    if (route.request().method() === 'POST') {
      createKey = await route.request().headerValue('idempotency-key') ?? ''
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ projectId: createdId, workspaceId, name: 'Imported Project', projectRevision: 'revision-created', archived: false }),
      })
    }
    return route.fulfill({ status: listStatus, contentType: 'application/json', body: JSON.stringify(listStatus === 200 ? projects : { title: 'unavailable' }) })
  })
  await page.route('**/api/control/projects/*', (route) => {
    const requestedId = route.request().url().split('/').at(-1)
    const project = requestedId === createdId
      ? { projectId: createdId, workspaceId, name: 'Imported Project', projectRevision: 'revision-created', archived: false }
      : { projectId, workspaceId, name: 'Active Project', projectRevision: 'revision-active', archived: false }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(project) })
  })

  await page.goto(`${origin}/workspaces/${workspaceId}/projects`)
  await page.getByRole('heading', { name: 'Projects', exact: true }).waitFor()
  assert.equal(await page.locator('.project-card').count(), 1)
  await page.getByLabel('Estado').selectOption('ALL')
  assert.equal(await page.locator('.project-card').count(), 2)
  await page.getByLabel('Nome do Project').fill('Archived')
  assert.equal(await page.locator('.project-card').count(), 1)
  await page.getByLabel('Nome do Project').fill('Active')
  await page.getByRole('link', { name: 'Abrir' }).click()
  await page.getByRole('heading', { name: 'Active Project' }).waitFor()

  await page.goto(`${origin}/workspaces/${workspaceId}/projects/new`)
  await page.getByLabel('Nome do Project').fill('Imported Project')
  await page.getByLabel('Repositório Git existente').check()
  await page.getByLabel('Localizador do repositório').fill('catalog://admitted/project')
  await page.getByRole('button', { name: 'Criar Project' }).click()
  await page.getByRole('heading', { name: 'Imported Project' }).waitFor()
  assert.notEqual(createKey, '')

  projects = []
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto(`${origin}/workspaces/${workspaceId}/projects`)
  await page.getByRole('heading', { name: 'Nenhum Project divulgado' }).waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  projects = [{ projectId, workspaceId, name: 'Active Project', archived: false }]
  await page.reload()
  await page.locator('.project-card').waitFor()
  assert.equal(await page.locator('.project-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length), 1)
  listStatus = 503
  await page.reload()
  await page.getByRole('heading', { name: 'Não foi possível consultar os Projects' }).waitFor()
})
