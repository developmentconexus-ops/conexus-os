import test from 'node:test'
import { shareWebBrowser } from './web-dev-server.mjs'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const WORKSPACE = { workspaceId: '20000000-0000-4000-8000-000000000001', name: 'Operações' }

const web = shareWebBrowser()

const withServer = async (t) => {
  const { page, origin } = await web.openPage(t, { viewport: { width: 1200, height: 900 } })
  return { page, origin }
}

const routeAccessContext = (page, account) =>
  page.route('**/api/control/access-context', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ account, workspaces: [WORKSPACE], projects: [] }),
  }))

const routeProject = (page, project) =>
  page.route(`**/api/control/projects/${PROJECT_ID}`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(project),
  }))

// The Hub purges project.project before the GitHub repository is gone, so projectRevision being
// empty only ever tells this screen that side of the purge was reached -- it says nothing about
// whether the GitHub delete that runs after it has succeeded. Both copy variants below must stay
// true to that: neither claims the GitHub repository still exists or is already gone.
test('an incomplete deletion before the Hub purge does not claim any GitHub state', async (t) => {
  const { page, origin } = await withServer(t)
  await routeAccessContext(page, { accountId: 'a1', displayName: 'Ana Beatriz Cardoso', email: 'ana@example.com' })
  await routeProject(page, {
    projectId: PROJECT_ID, workspaceId: WORKSPACE.workspaceId, name: 'Faturamento',
    projectRevision: '50000000-0000-4000-8000-000000000001', archived: false, deleting: true,
  })

  await page.goto(`${origin}/projects/${PROJECT_ID}/settings`)
  await page.getByText('Exclusão de Faturamento não terminou').waitFor()
  await page.getByText('A exclusão deste Projeto está em andamento.').waitFor()
  await page.getByText(/GitHub/).count().then((count) => { if (count !== 0) throw new Error('must not describe GitHub repository state before the Hub purge') })
  await page.getByRole('button', { name: 'Terminar exclusão' }).waitFor()
})

test('an incomplete deletion after the Hub purge does not claim the GitHub repository still exists or is gone', async (t) => {
  const { page, origin } = await withServer(t)
  await routeAccessContext(page, { accountId: 'a1', displayName: 'Ana Beatriz Cardoso', email: 'ana@example.com' })
  await routeProject(page, {
    projectId: PROJECT_ID, workspaceId: WORKSPACE.workspaceId, name: 'Faturamento',
    projectRevision: '', archived: false, deleting: true,
  })

  await page.goto(`${origin}/projects/${PROJECT_ID}/settings`)
  await page.getByText('Exclusão de Faturamento não terminou').waitFor()
  await page.getByText('O código e os dados deste Projeto já foram apagados. A exclusão do repositório no GitHub pode não ter sido concluída.').waitFor()
  await page.getByText('O repositório no GitHub ainda não').count().then((count) => { if (count !== 0) throw new Error('must not claim the GitHub repository still exists') })
  await page.getByText('O repositório no GitHub já foi apagado').count().then((count) => { if (count !== 0) throw new Error('must not claim the GitHub repository is already gone') })
  await page.getByRole('button', { name: 'Terminar exclusão' }).waitFor()
})
