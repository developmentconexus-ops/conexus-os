import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { BUILDER_CONTROLLER, builderState, conversation, routeBuilder, userMessage } from './builder-browser-fixtures.mjs'
import { startWebServer } from './web-dev-server.mjs'

// A run that parked on a question, with its stream down (the Hub answers 409, as once it let the
// parked session go): the open call lives in the thread message's metadata until the answer clears it.
const parkedAsk = (question) => {
  const args = { questions: [{ question }] }
  return {
    id: 'assistant-parked', role: 'assistant', createdAt: new Date().toISOString(),
    content: {
      format: 2,
      parts: [{ type: 'tool-invocation', toolInvocation: { toolCallId: 'call_parked', toolName: 'ask_user', state: 'call', args } }],
      metadata: { suspendedTools: { call_parked: { toolCallId: 'call_parked', toolName: 'ask_user', args, suspendPayload: args } } },
    },
  }
}

const openParkedRun = async (t, { phase, messages, refusal = null }) => {
  const accountId = '70000000-0000-4000-8000-000000000321'
  const projectId = '70000000-0000-4000-8000-000000000322'
  const conversationId = 'conversation-parked'
  const sourceRevision = 'd'.repeat(40)
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  const state = builderState([conversation(conversationId, 'Título')], { [conversationId]: messages })
  const run = { builderRunId: '70000000-0000-4000-8000-000000000323', projectId, conversationId, state: 'RUNNING', phase, baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null, failureCategory: null, requestText: 'Mude o título', createdAt: new Date(Date.now() - 10 * 60_000).toISOString() }
  const requests = { session: 0, stream: 0, answers: [] }
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
    if (refusal) return route.fulfill({ status: refusal.status, contentType: 'application/problem+json', body: JSON.stringify({ type: `urn:conexus:problem:${refusal.type}`, title: 'refused', status: refusal.status }) })
    run.phase = 'PREPARING'
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.goto(`${origin}/projects/${projectId}/build`)
  return { page, state, run, requests, conversationId }
}

const PARKED_QUESTION = 'Qual número de orçamento podemos usar?'
const card = (page) => page.getByLabel('Pergunta do agente')

const openParkedCard = async (t) => {
  const opened = await openParkedRun(t, { phase: 'PARKED', messages: [userMessage('user-1', 'Mude o título'), parkedAsk(PARKED_QUESTION)] })
  await card(opened.page).getByText(PARKED_QUESTION, { exact: true }).waitFor()
  return opened
}

test('a run parked on a question shows the card once and no clock counting the wait', async (t) => {
  const { page } = await openParkedCard(t)
  assert.equal(await page.getByTestId('ask-user').count(), 1, 'one card')
  assert.equal(await page.getByText(PARKED_QUESTION, { exact: true }).count(), 1, 'the question is drawn once')
  assert.equal(await page.locator('.cx-working').innerText(), 'Esperando a sua resposta · Aguardando você')
})

test('typing in the composer while a parked run shows its card is never taken over by the card', async (t) => {
  const { page } = await openParkedCard(t)
  const composer = page.getByLabel('Mensagem para o agente')
  await composer.click()
  await composer.pressSequentially('abcdefghij', { delay: 150 })
  await page.waitForTimeout(2_500)
  assert.equal(await composer.inputValue(), 'abcdefghij', 'every key typed in the composer stays there')
  assert.equal(await composer.evaluate((node) => node === document.activeElement), true, 'the composer keeps focus')
})

test('a parked run whose stream is down is read every 15 s, retrying its stream with each read, never every second', async (t) => {
  const { page, requests } = await openParkedCard(t)
  await page.waitForTimeout(1_000)
  const before = { ...requests }
  await page.waitForTimeout(16_000)
  const reads = requests.session - before.session
  const retries = requests.stream - before.stream
  assert.deepEqual({ reads: reads >= 1 && reads <= 2, retries: retries >= 1 && retries <= 2 }, { reads: true, retries: true })
})

test('a page that read the thread before the run parked draws the card once the run turns parked', async (t) => {
  const { page, state, run, conversationId } = await openParkedRun(t, { phase: 'AGENT', messages: [userMessage('user-1', 'Mude o título')] })
  await page.getByText('Agente trabalhando', { exact: false }).first().waitFor()
  assert.equal(await page.getByTestId('ask-user').count(), 0)
  state.messages[conversationId] = [userMessage('user-1', 'Mude o título'), parkedAsk(PARKED_QUESTION)]
  run.phase = 'PARKED'
  await card(page).getByText(PARKED_QUESTION, { exact: true }).waitFor({ timeout: 8_000 })
  assert.equal(await page.getByTestId('ask-user').count(), 1)
  assert.equal(await page.getByText('Pensando…').count(), 0)
})

test('answering the card of a parked run shows the run going again without the slow poll', async (t) => {
  const { page, requests } = await openParkedRun(t, { phase: 'PARKED', messages: [userMessage('user-1', 'Mude o título'), parkedAsk(PARKED_QUESTION)] })
  await card(page).getByRole('textbox').fill('144118')
  await card(page).getByRole('button', { name: 'Enviar resposta' }).click()
  await page.getByText('Preparando o ambiente').first().waitFor({ timeout: 4_000 })
  assert.deepEqual(requests.answers, [{ toolCallId: 'call_parked', resumeData: ['144118'] }])
})

test('an answer the Hub refuses keeps the card and says why: already answered, no longer waited on, or not delivered', async (t) => {
  const said = []
  for (const refusal of [{ status: 409, type: 'tool-answer-already-given' }, { status: 404, type: 'parked-call-not-found' }, { status: 503, type: 'builder-answer-unavailable' }]) {
    const { page } = await openParkedRun(t, { phase: 'PARKED', messages: [userMessage('user-1', 'Mude o título'), parkedAsk(PARKED_QUESTION)], refusal })
    await card(page).getByRole('textbox').fill('144118')
    await card(page).getByRole('button', { name: 'Enviar resposta' }).click()
    said.push(await card(page).getByRole('alert').innerText())
  }
  assert.deepEqual(said, [
    'Esta pergunta já foi respondida.',
    'O agente não está mais esperando esta resposta.',
    'A resposta não chegou ao agente. Tente de novo.',
  ])
})
