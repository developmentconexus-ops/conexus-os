import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { BUILDER_CONTROLLER, builderState, conversation, routeBuilder, userMessage } from './builder-browser-fixtures.mjs'
import { startWebServer } from './web-dev-server.mjs'

// A run waiting on a question, with its stream down: the open call lives in the thread message's
// metadata until the answer clears it.
const waitingAsk = (question) => {
  const args = { questions: [{ question }] }
  return {
    id: 'assistant-waiting', role: 'assistant', createdAt: new Date().toISOString(),
    content: {
      format: 2,
      parts: [{ type: 'tool-invocation', toolInvocation: { toolCallId: 'call_waiting', toolName: 'ask_user', state: 'call', args } }],
      metadata: { suspendedTools: { call_waiting: { toolCallId: 'call_waiting', toolName: 'ask_user', args, suspendPayload: args } } },
    },
  }
}

const openWaitingRun = async (t, { phase, messages, refusal = null }) => {
  const accountId = '70000000-0000-4000-8000-000000000321'
  const projectId = '70000000-0000-4000-8000-000000000322'
  const conversationId = 'conversation-waiting'
  const sourceRevision = 'd'.repeat(40)
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  const state = builderState([conversation(conversationId, 'Título')], { [conversationId]: messages })
  const run = { builderRunId: '70000000-0000-4000-8000-000000000323', projectId, conversationId, state: 'RUNNING', phase, baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null, requestText: 'Mude o título', createdAt: new Date(Date.now() - 10 * 60_000).toISOString() }
  const requests = { session: 0, stream: 0, answers: [], messages: [], cancels: 0, holdMessages: null }
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, state)
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Título', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => {
    requests.session += 1
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      projectId, latestBuilderRun: run, latestCodeChangingRun: null,
      preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
      runHistory: [],
    }) })
  })
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => {
    requests.stream += 1
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'no session' }) })
  })
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/tool-suspension*`, (route) => {
    requests.answers.push(route.request().postDataJSON())
    if (refusal) return route.fulfill({ status: refusal.status, contentType: 'application/problem+json', body: JSON.stringify({ type: `urn:conexus:problem:${refusal.type}`, title: refusal.type, status: refusal.status, code: refusal.type }) })
    run.phase = 'AGENT'
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route(`**/api/control/projects/${projectId}/builder-session/messages`, async (route) => {
    requests.messages.push(route.request().postDataJSON())
    if (requests.holdMessages) await requests.holdMessages
    run.phase = 'AGENT'
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ builderRun: run, created: false }) })
  })
  await page.route(`**/api/control/projects/${projectId}/builder-session/runs/*/cancel`, (route) => {
    requests.cancels += 1
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(run) })
  })
  await page.goto(`${origin}/projects/${projectId}`)
  return { page, state, run, requests, conversationId }
}

const WAITING_QUESTION = 'Qual número de orçamento podemos usar?'
const card = (page) => page.getByLabel('Pergunta do agente')

const openWaitingCard = async (t) => {
  const opened = await openWaitingRun(t, { phase: 'WAITING', messages: [userMessage('user-1', 'Mude o título'), waitingAsk(WAITING_QUESTION)] })
  await card(opened.page).getByText(WAITING_QUESTION, { exact: true }).waitFor()
  return opened
}

test('a run waiting on a question shows the card once and no clock counting the wait', async (t) => {
  const { page } = await openWaitingCard(t)
  assert.equal(await page.getByTestId('ask-user').count(), 1, 'one card')
  assert.equal(await page.getByText(WAITING_QUESTION, { exact: true }).count(), 1, 'the question is drawn once')
  assert.equal(await page.locator('.cx-working').innerText(), 'Esperando a sua resposta · Aguardando você')
})

test('typing in the composer while a waiting run shows its card is never taken over by the card', async (t) => {
  const { page } = await openWaitingCard(t)
  const composer = page.getByLabel('Mensagem para o agente')
  await composer.click()
  await composer.pressSequentially('abcdefghij', { delay: 150 })
  await page.waitForTimeout(2_500)
  assert.equal(await composer.inputValue(), 'abcdefghij', 'every key typed in the composer stays there')
  assert.equal(await composer.evaluate((node) => node === document.activeElement), true, 'the composer keeps focus')
})

test('an open call the thread kept from an earlier run draws no card until this run waits on the person', async (t) => {
  const { page, run } = await openWaitingRun(t, { phase: 'PREPARING', messages: [userMessage('user-1', 'Mude o título'), waitingAsk(WAITING_QUESTION)] })
  await page.getByText('Preparando', { exact: false }).first().waitFor()
  await page.waitForTimeout(1_000)
  assert.equal(await page.getByTestId('ask-user').count(), 0, 'no card while the run prepares')
  run.phase = 'WAITING'
  await card(page).getByText(WAITING_QUESTION, { exact: true }).waitFor({ timeout: 8_000 })
})

test('a page that read the thread before the run asked draws the card once the run waits', async (t) => {
  const { page, state, run, conversationId } = await openWaitingRun(t, { phase: 'AGENT', messages: [userMessage('user-1', 'Mude o título')] })
  await page.getByText('Agente trabalhando', { exact: false }).first().waitFor()
  assert.equal(await page.getByTestId('ask-user').count(), 0)
  state.messages[conversationId] = [userMessage('user-1', 'Mude o título'), waitingAsk(WAITING_QUESTION)]
  run.phase = 'WAITING'
  await card(page).getByText(WAITING_QUESTION, { exact: true }).waitFor({ timeout: 8_000 })
  assert.equal(await page.getByTestId('ask-user').count(), 1)
  assert.equal(await page.getByText('Pensando…').count(), 0)
})

test('answering the card of a waiting run shows the run going again without the slow poll', async (t) => {
  const { page, requests } = await openWaitingRun(t, { phase: 'WAITING', messages: [userMessage('user-1', 'Mude o título'), waitingAsk(WAITING_QUESTION)] })
  await card(page).getByRole('textbox').fill('144118')
  await card(page).getByRole('button', { name: 'Enviar resposta' }).click()
  await page.getByText('Agente trabalhando').first().waitFor({ timeout: 4_000 })
  assert.deepEqual(requests.answers, [{ toolCallId: 'call_waiting', resumeData: ['144118'] }])
})

test('an answer the Hub refuses keeps the card and says why: already answered, no longer waited on, or not delivered', async (t) => {
  const said = []
  for (const refusal of [{ status: 409, type: 'TOOL_ANSWER_ALREADY_GIVEN' }, { status: 409, type: 'QUESTION_ENDED' }, { status: 503, type: 'BUILDER_UNAVAILABLE' }]) {
    const { page } = await openWaitingRun(t, { phase: 'WAITING', messages: [userMessage('user-1', 'Mude o título'), waitingAsk(WAITING_QUESTION)], refusal })
    await card(page).getByRole('textbox').fill('144118')
    await card(page).getByRole('button', { name: 'Enviar resposta' }).click()
    said.push(await card(page).getByRole('alert').innerText())
  }
  assert.deepEqual(said, [
    'Esta pergunta já foi respondida.',
    'Esta pergunta já foi encerrada. A resposta pode ir na próxima mensagem.',
    'O Builder não está disponível agora. A falha foi registrada.',
  ])
})

test('while a question waits, Enter sends the message to the run and Stop is its own control', async (t) => {
  const { page, requests } = await openWaitingCard(t)
  const form = page.getByRole('form', { name: 'Enviar pedido ao agente' })
  const composer = page.getByLabel('Mensagem para o agente')
  assert.equal(await form.getByRole('button', { name: 'Parar' }).count(), 1, 'Stop is shown')
  await composer.fill('Use o número 42')
  assert.equal(await form.getByRole('button', { name: 'Enviar' }).isEnabled(), true, 'Send is enabled while the run waits')
  await composer.press('Enter')
  await page.waitForFunction(() => document.querySelector('[aria-label="Mensagem para o agente"]')?.value === '')
  assert.deepEqual(requests.messages.map((message) => message.content), ['Use o número 42'])
  assert.equal(requests.cancels, 0, 'sending never stops the run')
  assert.equal(await page.getByText('Use o número 42').count() > 0, true, 'the message joins the thread')
})

test('while the message that continues a waiting run is still being sent, Stop stays available', async (t) => {
  const { page, requests } = await openWaitingCard(t)
  let deliver = () => undefined
  requests.holdMessages = new Promise((settle) => { deliver = settle })
  const form = page.getByRole('form', { name: 'Enviar pedido ao agente' })
  await page.getByLabel('Mensagem para o agente').fill('Use o número 42')
  await page.getByLabel('Mensagem para o agente').press('Enter')
  await form.getByRole('button', { name: 'Enviando' }).waitFor()
  const stop = form.getByRole('button', { name: 'Parar' })
  assert.equal(await stop.isEnabled(), true, 'Stop is there while the send is pending')
  const cancelled = page.waitForRequest((request) => request.url().endsWith('/cancel'))
  await stop.click()
  await cancelled
  assert.equal(requests.cancels, 1, 'Stop reaches the Hub during the send')
  deliver()
})
