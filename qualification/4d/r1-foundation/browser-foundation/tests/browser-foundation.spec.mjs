import { expect, test } from '@playwright/test'

const mutationCount = async page => (await (await page.request.get('/__evidence/mutations')).json()).mutationCount
const goto = (page, url) => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })

test('authorized same-origin command uses secure session and CSRF', async ({ page, context }) => {
  await goto(page, '/projects/project-a?workspaceId=forged-workspace')
  await expect(page.getByRole('heading', { name: 'Project A' })).toBeVisible()
  await expect(page.getByText('Requested workspace: forged-workspace')).toBeVisible()
  const cookies = await context.cookies()
  const sid = cookies.find(cookie => cookie.name === 'sid')
  expect(sid).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax' })
  await page.getByRole('button', { name: 'Save project' }).click()
  await expect(page.getByRole('status')).toContainText('Saved')
})

test('URL and localStorage cannot manufacture server owner truth', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('conexus:projectId', 'project-a'))
  await goto(page, '/projects/project-b?workspaceId=workspace-a&admin=true')
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible()
})

test('forged query cache may alter local pixels but cannot authorize a command', async ({ page }) => {
  await goto(page, '/projects/project-b')
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible()
  const before = await mutationCount(page)
  await page.evaluate(() => window.__R1F_QUERY_CLIENT.setQueryData(
    ['project', 'project-b'],
    { id: 'project-b', name: 'Forged Project' },
  ))
  await expect(page.getByRole('heading', { name: 'Forged Project' })).toBeVisible()
  await page.getByRole('button', { name: 'Save project' }).click()
  await expect(page.getByRole('status')).toHaveText('Denied')
  expect(await mutationCount(page)).toBe(before)
  await page.evaluate(() => window.__R1F_QUERY_CLIENT.invalidateQueries({ queryKey: ['project', 'project-b'] }))
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible()
})

test('cross-origin and missing Fetch-Metadata/CSRF requests cannot mutate', async ({ page }) => {
  await goto(page, '/projects/project-a')
  await expect(page.getByRole('heading', { name: 'Project A' })).toBeVisible()
  const csrf = await page.evaluate(() => window.__R1F_QUERY_CLIENT.getQueryData(['session']).csrf)
  const before = await mutationCount(page)

  const direct = await page.request.post('/api/projects/project-a/save', {
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
    data: { expectedRevision: 1 },
  })
  expect(direct.status()).toBe(403)

  await goto(page, 'https://127.0.0.1:4444/')
  const crossOrigin = await page.evaluate(async token => {
    try {
      const response = await fetch('https://127.0.0.1:4443/api/projects/project-a/save', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ expectedRevision: 1 }),
      })
      return { status: response.status }
    } catch (error) {
      return { blocked: true, name: error.name }
    }
  }, csrf)
  expect(crossOrigin.blocked || crossOrigin.status === 403).toBeTruthy()
  expect(await mutationCount(page)).toBe(before)
})
