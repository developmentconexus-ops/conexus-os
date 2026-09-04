import { expect, test } from '@playwright/test'

const userPassword = process.env.CONEXUS_LIVE_USER_PASSWORD

test('real Keycloak + PostgreSQL + Chromium complete bootstrap, normal re-entry and Conexus-only sign-out', async ({ page }) => {
  await page.goto('http://localhost:3000')
  await expect(page.getByRole('heading', { name: 'Entre no Conexus' })).toBeVisible()
  await page.getByRole('link', { name: 'Entrar' }).click()
  await page.locator('#username').fill('r1f-user')
  await page.locator('#password').fill(userPassword)
  await page.locator('#kc-login').click()
  await expect(page).toHaveURL('http://localhost:3000/setup')
  await expect(page.getByRole('heading', { name: 'Configure sua conta' })).toBeVisible()
  await page.getByLabel('Nome de exibição').fill('Leandro Theodoro')
  await page.getByLabel(/E-mail/).fill('leandro@example.test')
  await page.getByRole('button', { name: 'Criar minha conta' }).click()
  await expect(page.getByRole('heading', { name: 'Conta criada' })).toBeVisible()
  await page.getByRole('link', { name: 'Entrar para continuar' }).click()
  await expect(page.getByRole('heading', { name: 'Sua conta está pronta' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Nenhum Workspace ainda' })).toBeVisible()

  await page.getByRole('button', { name: 'Leandro Theodoro' }).click()
  await expect(page.getByText('leandro@example.test')).toBeVisible()
  await page.getByRole('button', { name: 'Sair do Conexus' }).click()
  await expect(page.getByRole('heading', { name: 'Entre no Conexus' })).toBeVisible()

  await page.getByRole('link', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Sua conta está pronta' })).toBeVisible()
})
