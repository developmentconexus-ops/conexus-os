import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import { liveFlow } from './harness.mjs'

const REQUEST = 'Crie um contador simples com um botão de somar'
const REPLY = 'Posso montar esse contador em React. Quer que eu comece pela tela principal?'

liveFlow({ id: 'builder.send-and-reply', nome: 'Enviar um pedido e ler a resposta do agente' }, async ({ page, model, hub }) => {
  model.script({ parts: [{ thought: 'O pedido é um contador com um botão. Vou propor o plano antes de construir.' }, { text: REPLY }] })

  await page.goto(`/workspaces/${hub.workspaceId}/projects`)
  await page.getByLabel('Mensagem para o agente').fill(REQUEST)
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await page.getByRole('button', { name: 'Criar e começar' }).click()
  await page.waitForURL(/\/projects\/[^/]+\/c\/[^/]+$/)

  await expect(page.getByRole('log')).toContainText(REPLY, { timeout: 60_000 })

  // The reply streams before the run settles, so the row is read until it does.
  await expect.poll(() => hub.db('select state, result_kind, request_text from builder.builder_run'), { timeout: 30_000 })
    .toEqual([{ state: 'SUCCEEDED', result_kind: 'RESPONSE_ONLY', request_text: REQUEST }])

  assert.equal(model.calls.length, 1)
  const lastUser = model.calls[0].contents.findLast((content) => content.role === 'user')
  assert.ok(lastUser.parts.some((part) => part.text?.includes(REQUEST)), `the model's last user content carries "${REQUEST}"`)
})
