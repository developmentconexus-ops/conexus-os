import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import { liveFlow } from './harness.mjs'

const REQUEST = 'Crie um cadastro de fornecedores'
const QUESTION = 'Qual o limite de crédito de cada fornecedor?'
const ANSWER = '5000'
const REPLY = 'Fechado, o limite de cada fornecedor é 5000.'

liveFlow({ id: 'builder.reload-while-parked', nome: 'Recarregar a página com uma pergunta esperando resposta' }, async ({ page, model, hub }) => {
  model.script(
    { parts: [{ call: { name: 'ask_user', args: { questions: [{ question: QUESTION }] } } }] },
    { parts: [{ text: REPLY }] },
  )

  await page.goto(`/workspaces/${hub.workspaceId}/projects`)
  await page.getByLabel('Mensagem para o agente').fill(REQUEST)
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await page.getByRole('button', { name: 'Criar e começar' }).click()
  await page.waitForURL(/\/projects\/[^/]+\/c\/[^/]+$/)
  const card = page.getByLabel('Pergunta do agente')
  await expect(card.getByText(QUESTION, { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => hub.db(`select phase from builder.builder_run where request_text = '${REQUEST}'`), { timeout: 30_000 })
    .toEqual([{ phase: 'PARKED' }])

  await page.reload()

  await expect(card.getByText(QUESTION, { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('ask-user')).toHaveCount(1)
  await expect(page.getByText(QUESTION, { exact: true })).toHaveCount(1)
  await expect(page.locator('.cx-working')).toHaveText('Esperando a sua resposta · Aguardando você')
  assert.equal(model.calls.length, 1, 'the reload asked the model nothing')

  await card.getByRole('textbox').fill(ANSWER)
  await card.getByRole('button', { name: 'Enviar resposta' }).click()
  await expect(page.getByRole('log')).toContainText(REPLY, { timeout: 60_000 })
  await expect(page.getByTestId('ask-user')).toHaveCount(0)
  await expect.poll(() => hub.db(`select state, result_kind from builder.builder_run where request_text = '${REQUEST}'`), { timeout: 30_000 })
    .toEqual([{ state: 'SUCCEEDED', result_kind: 'RESPONSE_ONLY' }])
  assert.equal(model.calls.length, 2)
})
