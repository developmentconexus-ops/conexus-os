import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import { liveFlow } from './harness.mjs'

const REQUEST = 'Crie um relatório de comissões'
const FIRST = 'Qual o período do relatório?'
const SECOND = 'Quem recebe o relatório por e-mail?'
const REPLY = 'Pronto, o relatório mensal vai para a diretoria.'

liveFlow({ id: 'builder.second-question', nome: 'Ver a segunda pergunta numa página já aberta' }, async ({ page, model, hub }) => {
  model.script(
    { parts: [{ call: { name: 'ask_user', args: { questions: [{ question: FIRST }] } } }] },
    { parts: [{ call: { name: 'ask_user', args: { questions: [{ question: SECOND }] } } }] },
    { parts: [{ text: REPLY }] },
  )

  await page.goto(`/workspaces/${hub.workspaceId}/projects`)
  await page.getByLabel('Mensagem para o agente').fill(REQUEST)
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await page.getByRole('button', { name: 'Criar e começar' }).click()
  await page.waitForURL(/\/projects\/[^/]+\/c\/[^/]+$/)

  const card = page.getByLabel('Pergunta do agente')
  await expect(card.getByText(FIRST, { exact: true })).toBeVisible({ timeout: 60_000 })
  await card.getByRole('textbox').fill('Mensal')
  await card.getByRole('button', { name: 'Enviar resposta' }).click()

  // No reload: the page opened before the second question parked the run.
  await expect(card.getByText(SECOND, { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('ask-user')).toHaveCount(1)
  await expect(page.getByText(FIRST, { exact: true })).toHaveCount(0)
  await expect(page.locator('.cx-working')).toHaveText('Esperando a sua resposta · Aguardando você')

  await card.getByRole('textbox').fill('Diretoria')
  await card.getByRole('button', { name: 'Enviar resposta' }).click()
  await expect(page.getByRole('log')).toContainText(REPLY, { timeout: 60_000 })
  await expect(page.getByTestId('ask-user')).toHaveCount(0)

  await expect.poll(() => hub.db(`select state, result_kind from builder.builder_run where request_text = '${REQUEST}'`), { timeout: 30_000 })
    .toEqual([{ state: 'SUCCEEDED', result_kind: 'RESPONSE_ONLY' }])
  assert.equal(model.calls.length, 3)
  assert.ok(JSON.stringify(model.calls[2].contents).includes('Diretoria'), "the third call carries the second answer")
})
