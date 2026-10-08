import { recordBrowserContext, saveBrowserDiagnostics } from './browser-diagnostics.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { BUILDER_CONTROLLER, builderState, conversation, routeBuilder, runOf, sse, userMessage, conversationIdOf } from './builder-browser-fixtures.mjs'
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

// The Hub publishes the calls a run waits on only while it waits.
const openWaitingRun = async (t, { phase, messages, refusal = null, pendingCalls = phase === 'WAITING' ? ['call_waiting'] : [] }) => {
  const accountId = '70000000-0000-4000-8000-000000000321'
  const projectId = '70000000-0000-4000-8000-000000000322'
  const conversationId = conversationIdOf('conversation-waiting')
  const sourceRevision = 'd'.repeat(40)
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(async () => { await saveBrowserDiagnostics(browser); await browser.close() })
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  await recordBrowserContext(page.context())
  const state = builderState([conversation(conversationId, 'Título')], { [conversationId]: messages })
  const run = runOf({ builderRunId: '70000000-0000-4000-8000-000000000323', projectId, conversationId, state: 'RUNNING', phase, baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null, requestText: 'Mude o título', createdAt: new Date(Date.now() - 10 * 60_000).toISOString(), pendingCalls })
  const requests = { session: 0, stream: 0, answers: [], messages: [], cancels: 0, holdMessages: null, holdPublish: false }
  await page.route('**/api/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], administrator: false }) }))
  await routeBuilder(page, state)
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Título', projectRevision: '50000000-0000-4000-8000-000000000001', archived: false, state: 'live' }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => {
    requests.session += 1
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      projectId, latestBuilderRun: run, latestCodeChangingRun: null,
      preview: { workingSourceRevision: sourceRevision, lastPreviewSourceRevision: null, lastPreviewArtifactRevisionId: null, lastPreviewArtifactDigest: null },
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
    // The Hub publishes the run going again, waiting on nothing; a test that holds it publishes later.
    if (!requests.holdPublish) Object.assign(run, { phase: 'AGENT', pendingCalls: [] })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route(`**/api/control/projects/${projectId}/builder-session/messages`, async (route) => {
    requests.messages.push(route.request().postDataJSON())
    if (requests.holdMessages) await requests.holdMessages
    Object.assign(run, { phase: 'AGENT', pendingCalls: [] })
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

test('a call the waiting run waits on is never drawn as failed, even as a row with no card', async (t) => {
  const asked = waitingAsk(WAITING_QUESTION)
  const bare = { ...asked, content: { ...asked.content, metadata: {} } }
  for (const messages of [[userMessage('user-1', 'Mude o título'), asked], [userMessage('user-1', 'Mude o título'), bare]]) {
    const { page } = await openWaitingRun(t, { phase: 'WAITING', messages })
    await page.locator('.cx-working').getByText('Esperando a sua resposta', { exact: false }).waitFor()
    await page.getByTestId('ask-user').or(page.locator('.builder-turn-body button')).first().waitFor()
    assert.equal(await page.locator('[data-status="error"]').count(), 0, 'no error status')
    assert.equal(await page.getByText('Tool call failed').count(), 0)
  }
})

test('a question the person ended by sending a message is drawn as asked, with no answer and no error status', async (t) => {
  const args = { questions: [{ question: WAITING_QUESTION }] }
  const ended = {
    id: 'assistant-ended', role: 'assistant', createdAt: new Date().toISOString(),
    content: { format: 2, parts: [{ type: 'tool-invocation', toolInvocation: { toolCallId: 'call_ended', toolName: 'ask_user', state: 'output-denied', args, errorText: 'denied' } }] },
  }
  const { page } = await openWaitingRun(t, { phase: 'AGENT', messages: [userMessage('user-1', 'Mude o título'), ended], pendingCalls: [] })
  const row = page.getByRole('button', { name: 'Perguntou a você' })
  await row.waitFor()
  assert.equal(await page.locator('[data-status="error"]').count(), 0, 'no error status')
  assert.equal(await page.getByText('Tool call failed').count(), 0)
  await row.click()
  assert.equal((await page.locator('.cx-asked').textContent()).trim(), WAITING_QUESTION, 'the question, with no answer')
})

test('a run still WAITING in the database with no live session in this Hub, as after a restart, draws no card', async (t) => {
  const { page } = await openWaitingRun(t, { phase: 'WAITING', messages: [userMessage('user-1', 'Mude o título'), waitingAsk(WAITING_QUESTION)], pendingCalls: [] })
  await page.locator('.cx-working').getByText('Esperando a sua resposta', { exact: false }).waitFor()
  await page.waitForTimeout(1_000)
  assert.equal(await page.getByTestId('ask-user').count(), 0, 'no card the Hub would refuse')
})

// Two tabs on one conversation: run 1 asked OLD, the person answered it in tab A, and run 2 now waits
// on NEW. Tab B still holds OLD as an open card when run 2's WAITING reaches it, before its thread
// read or the NEW call does.
test('a tab that still holds an earlier question shows only the call the waiting run waits on, whatever reaches it first', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000331'
  const projectId = '70000000-0000-4000-8000-000000000332'
  const conversationId = conversationIdOf('conversation-two-tabs')
  const sourceRevision = 'e'.repeat(40)
  const OLD = 'Qual cor usar?'
  const NEW = 'Qual fonte usar?'
  const ask = (toolCallId, question) => ({ type: 'tool_suspended', toolCallId, toolName: 'ask_user', args: { questions: [{ question }] }, suspendPayload: { questions: [{ question }] } })
  const run = runOf({ builderRunId: '70000000-0000-4000-8000-000000000334', projectId, conversationId, state: 'RUNNING', phase: 'WAITING', baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null, requestText: 'Agora a fonte', createdAt: new Date().toISOString(), pendingCalls: ['call-new'] })
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(async () => { await saveBrowserDiagnostics(browser); await browser.close() })
  const openTab = async (events) => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
    await recordBrowserContext(page.context())
    await page.route('**/api/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], administrator: false }) }))
    await routeBuilder(page, builderState([conversation(conversationId, 'Título')], { [conversationId]: [userMessage('user-1', 'Mude a cor'), userMessage('user-2', 'Agora a fonte')] }))
    await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Título', projectRevision: '50000000-0000-4000-8000-000000000001', archived: false, state: 'live' }) }))
    await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      projectId, latestBuilderRun: run, latestCodeChangingRun: null,
      preview: { workingSourceRevision: sourceRevision, lastPreviewSourceRevision: null, lastPreviewArtifactRevisionId: null, lastPreviewArtifactDigest: null },
      runHistory: [],
    }) }))
    await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => route.fulfill(sse(...events)))
    await page.goto(`${origin}/projects/${projectId}`)
    return page
  }
  const tabA = await openTab([ask('call-new', NEW)])
  const tabB = await openTab([ask('call-old', OLD), { type: 'state_changed', state: { yolo: true, conexusRun: run }, changedKeys: ['conexusRun'] }, ask('call-new', NEW)])
  for (const tab of [tabA, tabB]) {
    await card(tab).getByText(NEW, { exact: true }).waitFor()
    assert.equal(await tab.getByText(OLD, { exact: true }).count(), 0, 'the earlier question has no card')
    assert.equal(await tab.getByTestId('ask-user').count(), 1)
  }
})

test('an open call the thread kept from an earlier run draws no card until this run waits on the person', async (t) => {
  const { page, run } = await openWaitingRun(t, { phase: 'PREPARING', messages: [userMessage('user-1', 'Mude o título'), waitingAsk(WAITING_QUESTION)] })
  await page.getByText('Preparando', { exact: false }).first().waitFor()
  await page.waitForTimeout(1_000)
  assert.equal(await page.getByTestId('ask-user').count(), 0, 'no card while the run prepares')
  Object.assign(run, { phase: 'WAITING', pendingCalls: ['call_waiting'] })
  await card(page).getByText(WAITING_QUESTION, { exact: true }).waitFor({ timeout: 8_000 })
})

test('a page that read the thread before the run asked draws the card once the run waits', async (t) => {
  const { page, state, run, conversationId } = await openWaitingRun(t, { phase: 'AGENT', messages: [userMessage('user-1', 'Mude o título')] })
  await page.getByText('Agente trabalhando', { exact: false }).first().waitFor()
  assert.equal(await page.getByTestId('ask-user').count(), 0)
  state.messages[conversationId] = [userMessage('user-1', 'Mude o título'), waitingAsk(WAITING_QUESTION)]
  Object.assign(run, { phase: 'WAITING', pendingCalls: ['call_waiting'] })
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

test('an accepted answer keeps the card until the Hub publishes the run without the call, which then leaves it a row', async (t) => {
  const { page, run, requests } = await openWaitingCard(t)
  requests.holdPublish = true
  await card(page).getByRole('textbox').fill('144118')
  const read = requests.session
  await card(page).getByRole('button', { name: 'Enviar resposta' }).click()
  while (requests.session < read + 2) await page.waitForTimeout(100)
  assert.equal(await card(page).count(), 1, 'the card stays while the Hub still says the run waits on it')
  Object.assign(run, { phase: 'AGENT', pendingCalls: [] })
  await card(page).waitFor({ state: 'detached', timeout: 5_000 })
  assert.equal(await page.getByRole('button', { name: 'Perguntando a você' }).count(), 1, 'the question stays in the thread as a row')
  assert.equal(await page.locator('[data-status="error"]').count(), 0)
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
