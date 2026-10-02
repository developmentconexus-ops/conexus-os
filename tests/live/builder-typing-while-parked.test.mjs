import assert from 'node:assert/strict'
import test from 'node:test'
import { expect } from '@playwright/test'
import { liveFlow } from './harness.mjs'

const REQUEST = 'Crie uma agenda de visitas'
const QUESTION = 'Quantas visitas por dia a equipe faz?'
const TYPED = 'abcdefghij'
const MAX_THREAD_READS = 1
const MAX_SESSION_READS = 1
let threadReads

liveFlow({ id: 'builder.typing-while-parked', nome: 'Digitar no campo de mensagem enquanto o pedido espera' }, async ({ page, model, hub }) => {
  model.script({ parts: [{ call: { name: 'ask_user', args: { questions: [{ question: QUESTION }] } } }] })

  await page.goto(`/workspaces/${hub.workspaceId}/projects`)
  await page.getByLabel('Mensagem para o agente').fill(REQUEST)
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await page.getByRole('button', { name: 'Criar e começar' }).click()
  await page.waitForURL(/\/projects\/[^/]+\/c\/[^/]+$/)
  await expect(page.getByLabel('Pergunta do agente').getByText(QUESTION, { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => hub.db(`select phase from builder.builder_run where request_text = '${REQUEST}'`), { timeout: 30_000 })
    .toEqual([{ phase: 'PARKED' }])

  const gets = []
  page.on('request', (request) => { if (request.method() === 'GET' && request.url().includes('/api/')) gets.push(new URL(request.url()).pathname) })
  const composer = page.getByLabel('Mensagem para o agente')
  await composer.click()
  await composer.pressSequentially(TYPED, { delay: 150 })
  await page.waitForTimeout(5_000)

  assert.equal(await composer.inputValue(), TYPED, 'every key typed in the composer stays there')
  assert.equal(await composer.evaluate((node) => node === document.activeElement), true, 'the composer keeps focus')
  threadReads = gets.filter((path) => path.endsWith('/threads')).length
  const sessionReads = gets.filter((path) => path.endsWith('/builder-session')).length
  assert.ok(sessionReads <= MAX_SESSION_READS, `at most ${MAX_SESSION_READS} session read in about 6.5 s of typing and waiting, saw ${sessionReads}`)
  assert.deepEqual(gets.filter((path) => path.includes('/stream')), [], 'the parked run stream is not chased')
  assert.equal(model.calls.length, 1)
})

// Defect: while the run waits, the conversation list is read about once a second, because the thread
// never gets a title when its first turn parks on a question (seen: 7 reads in 6.5 s).
test('builder.typing-while-parked: the thread list is read at most once in about 6.5 s of typing and waiting', { todo: 'defect: the thread list is polled every second while a run waits on a question' }, () => {
  assert.ok(threadReads <= MAX_THREAD_READS, `at most ${MAX_THREAD_READS} thread-list read in about 6.5 s of typing and waiting, saw ${threadReads}`)
})
