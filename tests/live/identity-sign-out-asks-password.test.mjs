import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import { liveFlow } from './harness.mjs'

liveFlow({ id: 'identity.sign-out-asks-password', nome: 'Sair do Conexus e entrar de novo pede a senha' }, async ({ page, hub }) => {
  // A browser of its own, so signing out ends this sign-in's sessions and leaves the suite's alone.
  await page.context().clearCookies()
  await hub.signIn(page)
  const [{ account_id: accountId }] = await hub.db("select account_id from iam.account where display_name = 'Verify Operator'")
  const openHubSessions = () => hub.db(`select count(*)::int as open from iam.host_session where kind = 'HUB' and account_id = '${accountId}' and ended_at is null`)
  const [{ open: before }] = await openHubSessions()

  await page.getByRole('button', { name: 'Conta de Verify Operator' }).click()
  await page.getByRole('menuitem', { name: 'Sair do Conexus' }).click()
  await expect(page.getByRole('heading', { name: 'Sessão encerrada' })).toBeVisible()
  assert.deepEqual(await openHubSessions(), [{ open: before - 1 }], 'this Hub session ended and only it')

  await page.getByRole('link', { name: 'Entrar de novo' }).click()
  await expect(page.locator('#username'), 'Keycloak asks for the password again').toBeVisible({ timeout: 30_000 })
})
