import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import { liveFlow } from './harness.mjs'

const REQUEST = 'Crie um painel de vendas por região'
const QUESTION = 'Em que moeda o painel mostra os valores?'
const REPLY = 'Combinado, o painel mostra tudo em reais.'

liveFlow({ id: 'builder.ask-and-answer', nome: 'Responder a uma pergunta do agente e ver o trabalho seguir' }, async ({ page, model, hub }) => {
  model.script(
    { parts: [{ call: { name: 'ask_user', args: { questions: [{ question: QUESTION, options: [{ label: 'Reais (recomendado)' }, { label: 'Dólares' }] }] } } }] },
    { parts: [{ text: REPLY }] },
  )

  await page.goto(`/workspaces/${hub.workspaceId}/projects`)
  await page.getByLabel('Mensagem para o agente').fill(REQUEST)
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await page.getByRole('button', { name: 'Criar e começar' }).click()
  await page.waitForURL(/\/projects\/[^/]+\/c\/[^/]+$/)

  const card = page.getByLabel('Pergunta do agente')
  await expect(card.getByText(QUESTION, { exact: true })).toBeVisible({ timeout: 60_000 })
  await card.getByLabel('Reais (recomendado)').check()
  await card.getByRole('button', { name: 'Enviar resposta' }).click()

  await expect(page.getByRole('log')).toContainText(REPLY, { timeout: 60_000 })
  await expect(page.getByTestId('ask-user')).toHaveCount(0)

  await expect.poll(() => hub.db(`select state, result_kind from builder.builder_run where request_text = '${REQUEST}'`), { timeout: 30_000 })
    .toEqual([{ state: 'SUCCEEDED', result_kind: 'RESPONSE_ONLY' }])

  assert.equal(model.calls.length, 2)
  assert.ok(JSON.stringify(model.calls[1].contents).includes('Reais (recomendado)'), "the model's second call carries the person's answer")
})
