import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import { liveFlow } from './harness.mjs'

const REQUEST = 'Crie um controle de estoque'
const QUESTION = 'Qual número de orçamento podemos usar?'
const ANSWER = '144118'
const REPLY = 'Anotei o orçamento 144118 e sigo com o estoque.'

liveFlow({ id: 'builder.park-and-answer', nome: 'Deixar o pedido esperando uma pergunta e responder depois' }, async ({ page, model, hub }) => {
  model.script(
    { parts: [{ call: { name: 'ask_user', args: { questions: [{ question: QUESTION }] } } }] },
    { parts: [{ text: REPLY }] },
  )

  // Every stream the page opens, and whether it is still open.
  const streams = []
  page.on('request', (request) => {
    if (!new URL(request.url()).pathname.endsWith('/stream')) return
    const stream = { status: null, open: true }
    streams.push(stream)
    request.response().then((response) => { stream.status = response?.status() ?? null }, () => undefined)
    const closed = (ended) => { if (ended === request) stream.open = false }
    page.on('requestfinished', closed)
    page.on('requestfailed', closed)
  })

  await page.goto(`/workspaces/${hub.workspaceId}/projects`)
  await page.getByLabel('Mensagem para o agente').fill(REQUEST)
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await page.getByRole('button', { name: 'Criar e começar' }).click()
  await page.waitForURL(/\/projects\/[^/]+\/c\/[^/]+$/)

  const card = page.getByLabel('Pergunta do agente')
  await expect(card.getByText(QUESTION, { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('ask-user')).toHaveCount(1)
  await expect(page.getByText(QUESTION, { exact: true })).toHaveCount(1)
  await expect(page.locator('.cx-working')).toHaveText('Esperando a sua resposta · Aguardando você')

  const waiting = `select state, phase, result_kind from builder.builder_run where request_text = '${REQUEST}'`
  await expect.poll(() => hub.db(waiting), { timeout: 30_000 }).toEqual([{ state: 'RUNNING', phase: 'PARKED', result_kind: null }])
  // Past one slow read of the run (15 s with the stream open), the page still follows the parked run's live session.
  await page.waitForTimeout(16_000)
  assert.deepEqual(streams.filter(({ status }) => status === 200).map(({ open }) => open), [true], 'one stream, open while the run is parked')

  await card.getByRole('textbox').fill(ANSWER)
  await card.getByRole('button', { name: 'Enviar resposta' }).click()

  await expect(page.getByRole('log')).toContainText(REPLY, { timeout: 60_000 })
  await expect(page.getByTestId('ask-user')).toHaveCount(0)
  await expect.poll(() => hub.db(waiting), { timeout: 30_000 }).toEqual([{ state: 'SUCCEEDED', phase: null, result_kind: 'RESPONSE_ONLY' }])

  assert.equal(streams.filter(({ status }) => status === 200).length, 1, 'the answer reached the page on the stream that followed the park')
  await expect(page.getByRole('combobox', { name: 'Conversa' })).toContainText('Contador simples', { timeout: 30_000 })

  assert.equal(model.calls.length, 2)
  assert.ok(JSON.stringify(model.calls[1].contents).includes(ANSWER), "the model's second call carries the person's answer")
})
