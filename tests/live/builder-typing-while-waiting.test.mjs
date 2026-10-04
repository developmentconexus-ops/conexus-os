import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import { liveFlow } from './harness.mjs'

const REQUEST = 'Crie uma agenda de visitas'
const QUESTION = 'Quantas visitas por dia a equipe faz?'
const TYPED = 'abcdefghij'
const MAX_SESSION_READS = 1
const MAX_THREAD_LIST_READS = 1

liveFlow({ id: 'builder.typing-while-waiting', nome: 'Digitar no campo de mensagem enquanto o pedido espera' }, async ({ page, model, hub }) => {
  model.script({ parts: [{ call: { name: 'ask_user', args: { questions: [{ question: QUESTION }] } } }] })

  await page.goto(`/workspaces/${hub.workspaceId}/projects`)
  await page.getByLabel('Mensagem para o agente').fill(REQUEST)
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await page.getByRole('button', { name: 'Criar e começar' }).click()
  await page.waitForURL(/\/projects\/[^/]+\/c\/[^/]+$/)
  await expect(page.getByLabel('Pergunta do agente').getByText(QUESTION, { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => hub.db(`select phase from builder.builder_run where request_text = '${REQUEST}'`), { timeout: 30_000 })
    .toEqual([{ phase: 'WAITING' }])

  const gets = []
  page.on('request', (request) => { if (request.method() === 'GET' && request.url().includes('/api/')) gets.push(new URL(request.url()).pathname) })
  const composer = page.getByLabel('Mensagem para o agente')
  await composer.click()
  await composer.pressSequentially(TYPED, { delay: 150 })
  await page.waitForTimeout(5_000)

  assert.equal(await composer.inputValue(), TYPED, 'every key typed in the composer stays there')
  assert.equal(await composer.evaluate((node) => node === document.activeElement), true, 'the composer keeps focus')
  const sessionReads = gets.filter((path) => path.endsWith('/builder-session')).length
  assert.ok(sessionReads <= MAX_SESSION_READS, `at most ${MAX_SESSION_READS} session read in about 6.5 s of typing and waiting, saw ${sessionReads}`)
  const threadListReads = gets.filter((path) => path.endsWith('/threads')).length
  assert.ok(threadListReads <= MAX_THREAD_LIST_READS, `at most ${MAX_THREAD_LIST_READS} thread list read in about 6.5 s of typing and waiting, saw ${threadListReads}`)
  assert.deepEqual(gets.filter((path) => path.includes('/stream')), [], 'the waiting run stream is not chased')
  assert.equal(model.calls.length, 1)
})
