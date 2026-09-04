import { expect, test } from '@playwright/test'

const origin = 'http://localhost:3000'
const primaryPassword = process.env.CONEXUS_LIVE_USER_PASSWORD
const secondaryPassword = process.env.CONEXUS_LIVE_SECONDARY_PASSWORD
const secondarySubject = process.env.CONEXUS_LIVE_SECONDARY_SUBJECT

const signIn = async (page, username, password) => {
  await page.goto(origin)
  await page.getByRole('link', { name: 'Entrar' }).click()
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.locator('#kc-login').click()
}

const csrfFetch = async (page, { path, method = 'GET', body, key }) => page.evaluate(async (input) => {
  const csrf = document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=')
  const response = await fetch(input.path, {
    method: input.method,
    credentials: 'same-origin',
    headers: {
      ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(input.method === 'POST' || input.method === 'DELETE' ? { 'x-conexus-csrf': decodeURIComponent(csrf ?? '') } : {}),
      ...(input.key ? { 'idempotency-key': input.key } : {}),
    },
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  })
  return { status: response.status, body: await response.text() }
}, { path, method, body, key })

test('real Keycloak + PostgreSQL + Chromium prove first Workspace, re-entry, idempotency and authority negatives', async ({ browser }) => {
  const operatorContext = await browser.newContext()
  const page = await operatorContext.newPage()
  await signIn(page, 'r1f-user', primaryPassword)

  await expect(page).toHaveURL(`${origin}/setup`)
  await page.getByLabel('Nome de exibição').fill('Leandro Theodoro')
  await page.getByLabel(/E-mail/).fill('leandro@example.test')
  await page.getByRole('button', { name: 'Criar minha conta' }).click()
  await expect(page.getByRole('heading', { name: 'Conta criada' })).toBeVisible()
  await page.getByRole('link', { name: 'Entrar para continuar' }).click()

  await expect(page.getByRole('heading', { name: 'Crie seu primeiro Workspace' })).toBeVisible()
  await page.getByRole('link', { name: 'Novo Workspace' }).click()
  await page.getByLabel('Nome do Workspace').fill('Metal Nobre')
  await page.getByRole('button', { name: 'Criar Workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Metal Nobre' })).toBeVisible()
  await expect(page.getByText('O acesso inicial desta conta foi confirmado pelo servidor.')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Metal Nobre' })).toBeVisible()
  const access = await csrfFetch(page, { path: '/api/control/access-context' })
  expect(access.status).toBe(200)
  const accessBody = JSON.parse(access.body)
  expect(accessBody.workspaces).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Metal Nobre' })]))
  const metalNobre = accessBody.workspaces.find((workspace) => workspace.name === 'Metal Nobre')

  const replayKey = 's2-live-replay-key'
  const first = await csrfFetch(page, { path: '/api/control/workspaces', method: 'POST', key: replayKey, body: { name: 'Replay Workspace' } })
  const replay = await csrfFetch(page, { path: '/api/control/workspaces', method: 'POST', key: replayKey, body: { name: 'Replay Workspace' } })
  const conflict = await csrfFetch(page, { path: '/api/control/workspaces', method: 'POST', key: replayKey, body: { name: 'Changed Workspace' } })
  expect(first.status).toBe(201)
  expect(replay.status).toBe(201)
  expect(JSON.parse(replay.body)).toEqual(JSON.parse(first.body))
  expect(conflict.status).toBe(409)
  const afterReplayResponse = await csrfFetch(page, { path: '/api/control/access-context' })
  expect(afterReplayResponse.status).toBe(200)
  const afterReplay = JSON.parse(afterReplayResponse.body)
  expect(afterReplay.workspaces.filter((workspace) => workspace.name === 'Replay Workspace')).toHaveLength(1)
  expect(afterReplay.workspaces.some((workspace) => workspace.name === 'Changed Workspace')).toBe(false)

  const provisionSecondary = await csrfFetch(page, {
    path: '/api/control/accounts', method: 'POST', key: 's2-live-secondary-account',
    body: { externalSubject: secondarySubject, displayName: 'Secondary Operator', email: 'secondary@example.test' },
  })
  expect(provisionSecondary.status).toBe(201)

  await page.getByRole('button', { name: 'Leandro Theodoro' }).click()
  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page.getByRole('heading', { name: 'Entre no Conexus' })).toBeVisible()
  await expect(page.getByText('Metal Nobre')).toHaveCount(0)
  const signedOut = await csrfFetch(page, { path: '/api/control/access-context' })
  expect(signedOut.status).toBe(401)
  await expect(page.getByText('Metal Nobre')).toHaveCount(0)
  await operatorContext.close()

  const secondaryContext = await browser.newContext()
  const secondaryPage = await secondaryContext.newPage()
  await signIn(secondaryPage, 'r1f-secondary', secondaryPassword)
  await expect(secondaryPage.getByRole('heading', { name: 'Crie seu primeiro Workspace' })).toBeVisible()
  await expect(secondaryPage.getByText('Metal Nobre')).toHaveCount(0)

  const absentOperator = await csrfFetch(secondaryPage, {
    path: '/api/control/workspaces', method: 'POST', key: 's2-live-forbidden-create', body: { name: 'Forbidden Workspace' },
  })
  expect(absentOperator.status).toBe(403)
  const crossWorkspace = await csrfFetch(secondaryPage, { path: `/api/control/workspaces/${metalNobre.workspaceId}` })
  expect(crossWorkspace.status).toBe(404)
  expect(crossWorkspace.body).not.toContain('Metal Nobre')
  const secondaryAccessResponse = await csrfFetch(secondaryPage, { path: '/api/control/access-context' })
  expect(secondaryAccessResponse.status).toBe(200)
  const secondaryAccess = JSON.parse(secondaryAccessResponse.body)
  expect(secondaryAccess.workspaces).toEqual([])
  await secondaryPage.reload()
  await expect(secondaryPage.getByText('Metal Nobre')).toHaveCount(0)
  await secondaryContext.close()
})
