import assert from 'node:assert/strict'
import test from 'node:test'
import { shareWebBrowser } from './web-dev-server.mjs'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const WORKSPACE = { workspaceId: '20000000-0000-4000-8000-000000000001', name: 'Operações' }
const web = shareWebBrowser()
const deleting = { projectId: PROJECT_ID, workspaceId: WORKSPACE.workspaceId, name: 'Faturamento', state: 'deleting' }

const withServer = async (t, role) => {
  const { page, origin } = await web.openPage(t, { viewport: { width: 1200, height: 900 } })
  await page.route('**/api/session', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ account: { accountId: '10000000-0000-4000-8000-000000000001', displayName: 'Ana' }, workspaces: [WORKSPACE], administrator: false }),
  }))
  await page.route(`**/api/control/projects/${PROJECT_ID}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(deleting) }))
  await page.route(`**/api/control/workspaces/${WORKSPACE.workspaceId}/roster`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ viewerRole: role, entries: [] }),
  }))
  return { page, origin }
}

test('a completed delete clears cached Project and Builder state before 404 renders', async (t) => {
  const { page, origin } = await withServer(t, 'owner')
  let projectReads = 0
  const projectRequests = []
  await page.unroute(`**/api/control/projects/${PROJECT_ID}`)
  await page.route(`**/api/control/projects/${PROJECT_ID}`, (route) => {
    projectReads += 1
    projectRequests.push({ method: route.request().method(), url: route.request().url() })
    if (projectReads === 1) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      projectId: PROJECT_ID, workspaceId: WORKSPACE.workspaceId, name: 'Faturamento', state: 'live',
      projectRevision: '50000000-0000-4000-8000-000000000001', archived: false,
    }) })
    return route.fulfill({ status: 404, contentType: 'application/problem+json', body: JSON.stringify({
      type: 'urn:conexus:problem:PROJECT_NOT_FOUND', title: 'PROJECT_NOT_FOUND', status: 404, code: 'PROJECT_NOT_FOUND',
    }) })
  })
  await page.route(`**/api/control/projects/${PROJECT_ID}?*`, (route) => route.request().method() === 'DELETE'
    ? route.fulfill({ status: 204 })
    : route.continue())
  await page.route(`**/api/control/workspaces/${WORKSPACE.workspaceId}/project-summaries`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [] }),
  }))
  await page.goto(`${origin}/projects/${PROJECT_ID}/settings`)
  await page.getByRole('heading', { name: 'Sobre o Projeto' }).waitFor()
  assert.equal(projectReads, 1)
  await page.getByRole('button', { name: 'Excluir Projeto' }).click()
  await page.getByLabel('Nome do Projeto').fill('Faturamento')
  await page.getByRole('button', { name: 'Excluir para sempre' }).click()
  await page.waitForURL(`**/workspaces/${WORKSPACE.workspaceId}/projects`)
  await page.goBack()
  await page.getByRole('heading', { name: 'Projeto indisponível' }).waitFor()
  assert.equal(projectReads, 2, `Expected the stale settings tab to re-read Project; requests: ${JSON.stringify(projectRequests)}; page: ${(await page.locator('body').innerText()).slice(0, 220)}`)
  assert.equal(await page.getByRole('heading', { name: 'Sobre o Projeto' }).count(), 0)
})

test('a direct Project not-found response clears the settings view', async (t) => {
  const { page, origin } = await withServer(t, 'owner')
  await page.unroute(`**/api/control/projects/${PROJECT_ID}`)
  let projectReads = 0
  await page.route(`**/api/control/projects/${PROJECT_ID}`, (route) => {
    projectReads += 1
    return route.fulfill({ status: 404, contentType: 'application/problem+json', body: JSON.stringify({
      type: 'urn:conexus:problem:PROJECT_NOT_FOUND', title: 'PROJECT_NOT_FOUND', status: 404, code: 'PROJECT_NOT_FOUND',
    }) })
  })
  await page.goto(`${origin}/projects/${PROJECT_ID}/settings`)
  await page.getByRole('heading', { name: 'Projeto indisponível' }).waitFor()
  assert.equal(projectReads, 1)
  assert.equal(await page.getByRole('heading', { name: 'Sobre o Projeto' }).count(), 0)
})

test('a deleting Project stays in its Workspace list without live activity', async (t) => {
  const { page, origin } = await withServer(t, 'member')
  await page.route(`**/api/control/workspaces/${WORKSPACE.workspaceId}/project-summaries`, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ projects: [{ projectId: PROJECT_ID, name: 'Faturamento', state: 'deleting' }] }),
  }))
  await page.goto(`${origin}/workspaces/${WORKSPACE.workspaceId}/projects`)
  await page.getByRole('heading', { name: 'Faturamento' }).waitFor()
  await page.getByText('Exclusão em andamento').waitFor()
  assert.equal(await page.locator('.cx-project-time').count(), 0)
})

test('a Workspace owner can retry deleting a Project and returns to its Workspace', async (t) => {
  const { page, origin } = await withServer(t, 'owner')
  let deletion
  await page.route(`**/api/control/projects/${PROJECT_ID}?*`, async (route) => {
    if (route.request().method() === 'DELETE') {
      deletion = new URL(route.request().url()).searchParams.get('confirmName')
      return route.fulfill({ status: 204 })
    }
    return route.continue()
  })
  await page.route(`**/api/control/workspaces/${WORKSPACE.workspaceId}/project-summaries`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [] }),
  }))

  await page.goto(`${origin}/projects/${PROJECT_ID}/settings`)
  await page.getByRole('heading', { name: 'Exclusão de Faturamento em andamento' }).waitFor()
  await page.getByRole('button', { name: 'Tentar concluir exclusão' }).click()
  await page.waitForURL(`**/workspaces/${WORKSPACE.workspaceId}/projects`)
  assert.equal(deletion, 'Faturamento')
})

test('a Workspace member sees deleting state without a retry action', async (t) => {
  const { page, origin } = await withServer(t, 'member')
  await page.goto(`${origin}/projects/${PROJECT_ID}/settings`)
  await page.getByRole('heading', { name: 'Exclusão de Faturamento em andamento' }).waitFor()
  await page.getByText('Um responsável pelo Workspace poderá concluir a exclusão.').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Tentar concluir exclusão' }).count(), 0)
})

test('an incomplete retry keeps the Project in deleting state', async (t) => {
  const { page, origin } = await withServer(t, 'owner')
  await page.route(`**/api/control/projects/${PROJECT_ID}?*`, (route) => route.fulfill({
    status: 503, contentType: 'application/problem+json', body: JSON.stringify({
      type: 'urn:conexus:problem:PROJECT_DELETION_INCOMPLETE', title: 'PROJECT_DELETION_INCOMPLETE', status: 503, code: 'PROJECT_DELETION_INCOMPLETE',
    }),
  }))
  await page.goto(`${origin}/projects/${PROJECT_ID}/settings`)
  await page.getByRole('button', { name: 'Tentar concluir exclusão' }).click()
  await page.getByText(/A exclusão do Projeto não terminou/).waitFor()
  await page.getByRole('heading', { name: 'Exclusão de Faturamento em andamento' }).waitFor()
  await page.getByRole('button', { name: 'Tentar concluir exclusão' }).waitFor()
})
