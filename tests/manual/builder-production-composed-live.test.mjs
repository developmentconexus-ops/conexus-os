import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { SpanType } from '@mastra/core/observability'
import { BROWSER_OPTIONS } from '../../.agents/skills/verify/scripts/control.mjs'

const live = process.env.CONEXUS_COMPOSED_LIVE === 'true'
const required = [
  'CONEXUS_COMPOSED_WORKSPACE_ID',
  'CONEXUS_COMPOSED_OPERATOR_STORAGE_STATE',
  'CONEXUS_COMPOSED_DENIED_STORAGE_STATE',
]

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const readSession = (page, projectId) => page.evaluate(async (id) => {
  const response = await fetch(`/api/control/projects/${encodeURIComponent(id)}/builder-session`, { credentials: 'same-origin' })
  return response.ok ? response.json() : { status: response.status }
}, projectId)
const readTrace = (page, projectId, builderRunId) => page.evaluate(async ({ id, run }) => {
  const response = await fetch(`/api/control/projects/${encodeURIComponent(id)}/builder-session/runs/${encodeURIComponent(run)}/trace`, { credentials: 'same-origin' })
  return response.ok ? response.json() : { status: response.status }
}, { id: projectId, run: builderRunId })

test('the composed production journey uses server.ts, Preview, and native persisted traces', {
  skip: live ? false : 'opt-in: CONEXUS_COMPOSED_LIVE=true',
  timeout: 20 * 60_000,
}, async (t) => {
  const missing = required.filter((name) => !process.env[name])
  const origin = process.env.CONEXUS_COMPOSED_ORIGIN ?? process.env.CONEXUS_ORIGIN
  const workspaceId = process.env.CONEXUS_COMPOSED_WORKSPACE_ID
  const operatorState = process.env.CONEXUS_COMPOSED_OPERATOR_STORAGE_STATE
  const deniedState = process.env.CONEXUS_COMPOSED_DENIED_STORAGE_STATE
  if (!origin || !workspaceId || !operatorState || !deniedState || missing.length > 0) {
    throw new Error(`CONEXUS_COMPOSED_LIVE_CONFIG_REFUSED: ${missing.join(',') || 'references'}`)
  }
  const parsedOrigin = new URL(origin)
  assert.equal(parsedOrigin.protocol, 'https:')
  assert.equal(parsedOrigin.hostname, 'hub.conexus.localhost')

  const { headless, args: _args, ...contextOptions } = BROWSER_OPTIONS
  const browser = await chromium.launch({ headless, args: ['--host-resolver-rules=MAP *.conexus.localhost 127.0.0.1'] })
  t.after(() => browser.close())
  const operator = await browser.newContext({ ...contextOptions, storageState: operatorState })
  t.after(() => operator.close())
  const page = await operator.newPage()
  page.setDefaultTimeout(180_000)
  const projectName = `Builder counter ${randomUUID().slice(0, 8)}`
  const requestText = 'Crie um contador acessível. Mostre inicialmente 0 em um elemento output. Inclua um botão Incrementar que muda para 1 e um botão Resetar que volta para 0.'

  const previewResponsePromise = page.waitForResponse((response) =>
    /\/api\/control\/projects\/[^/]+\/builder-session\/preview$/.test(new URL(response.url()).pathname) &&
    response.request().method() === 'POST' && response.status() === 201)
  const builderResponsePromise = page.waitForResponse((response) =>
    /\/api\/control\/projects\/[^/]+\/builder-session\/messages$/.test(new URL(response.url()).pathname) &&
    response.request().method() === 'POST' && response.status() === 201)
  await page.goto(`${origin}/workspaces/${workspaceId}/projects`)
  await page.getByLabel('Mensagem para o agente').fill(requestText)
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await page.getByLabel('Nome do Projeto').fill(projectName)
  await page.getByRole('button', { name: 'Criar e começar' }).click()
  await page.waitForURL(/\/projects\/[^/]+(?:\/c\/[^/]+)?$/)
  const projectId = new URL(page.url()).pathname.match(/^\/projects\/([^/]+)(?:\/c\/[^/]+)?$/)?.[1]
  assert.ok(projectId, 'NEW Project must lead directly to the real Build workspace')
  const accepted = await (await builderResponsePromise).json()
  const builderRunId = accepted?.builderRun?.builderRunId
  assert.match(builderRunId ?? '', /^[0-9a-f-]{36}$/i, 'the browser must observe an exact BuilderRun id')
  const conversationId = accepted?.builderRun?.conversationId
  assert.match(conversationId ?? '', /^[0-9a-f-]{36}$/i)

  let terminalSession
  for (let attempt = 0; attempt < 180; attempt += 1) {
    terminalSession = await readSession(page, projectId)
    if (['SUCCEEDED', 'FAILED', 'INTERRUPTED'].includes(terminalSession?.latestBuilderRun?.state)) break
    await delay(1_000)
  }
  assert.equal(terminalSession?.latestBuilderRun?.builderRunId, builderRunId)
  assert.equal(terminalSession?.latestBuilderRun?.state, 'SUCCEEDED')
  assert.equal(terminalSession?.latestBuilderRun?.resultKind, 'SOURCE_CHANGED')

  await page.getByTitle('Prévia do aplicativo').waitFor()
  const previewLaunch = await (await previewResponsePromise).json()
  const previewOrigin = new URL(previewLaunch.previewUrl).origin
  assert.match(previewOrigin, /^https:\/\/preview-[0-9a-f-]+\.conexus\.localhost:\d+$/i)
  assert.equal(new URL(previewLaunch.entryUrl).origin, previewOrigin)
  const preview = page.frameLocator('iframe[title="Prévia do aplicativo"]')
  let previewFrame
  for (let attempt = 0; attempt < 60; attempt += 1) {
    previewFrame = page.frames().find((frame) => frame !== page.mainFrame() && frame.url().startsWith(previewOrigin))
    if (previewFrame) break
    await delay(250)
  }
  assert.ok(previewFrame, 'the browser must open the dynamic Preview origin over HTTPS')
  await preview.locator('output').waitFor()
  assert.equal(await preview.locator('output').innerText(), '0')
  await preview.getByRole('button', { name: 'Incrementar', exact: true }).click()
  assert.equal(await preview.locator('output').innerText(), '1')
  await preview.getByRole('button', { name: 'Resetar', exact: true }).click()
  assert.equal(await preview.locator('output').innerText(), '0')

  await page.reload()
  await page.getByText(requestText, { exact: true }).waitFor()
  await page.getByTitle('Prévia do aplicativo').waitFor()
  await page.getByRole('button', { name: 'Recarregar prévia' }).click()
  await preview.locator('output').waitFor()
  assert.equal(await preview.locator('output').innerText(), '0')

  const denied = await browser.newContext({ ...contextOptions, storageState: deniedState })
  t.after(() => denied.close())
  const deniedPage = await denied.newPage()
  await deniedPage.goto(`${origin}/projects/${projectId}`)
  const sessionUrl = `${origin}/api/control/projects/${encodeURIComponent(projectId)}/builder-session`
  const streamUrl = `${origin}/api/builder/agent-controller/conexus-builder/sessions/${encodeURIComponent(`project:${projectId}`)}/stream?sessionScope=${encodeURIComponent(`conversation:${conversationId}`)}`
  const previewUrl = `${sessionUrl}/preview`
  const deniedSession = await denied.request.get(sessionUrl, { maxRedirects: 0 })
  const deniedPreview = await denied.request.post(previewUrl, { data: {}, maxRedirects: 0 })
  const deniedStream = await denied.request.get(streamUrl, { maxRedirects: 0 })
  for (const [response, url] of [[deniedSession, sessionUrl], [deniedPreview, previewUrl], [deniedStream, streamUrl]]) {
    assert.equal(response.url(), url)
    assert.ok([401, 403, 404].includes(response.status()))
  }
  t.diagnostic(JSON.stringify({ deniedPageOrigin: new URL(deniedPage.url()).origin, deniedHubResponses: [deniedSession, deniedPreview, deniedStream].map((response) => ({ url: response.url(), status: response.status() })) }))

  const trace = await readTrace(page, projectId, builderRunId)
  assert.equal(trace.available, true, 'the exact Builder run trace must be available')
  assert.match(trace.traceId ?? '', /.+/, 'a persisted trace carries its own traceId')
  assert.ok(trace.spans.some((span) => span.spanType === SpanType.AGENT_RUN))
  assert.ok(trace.spans.some((span) => [SpanType.MODEL_GENERATION, SpanType.MODEL_INFERENCE].includes(span.spanType)))
  assert.ok(trace.spans.some((span) => span.spanType === SpanType.TOOL_CALL))
  t.diagnostic(JSON.stringify({ projectId, traceId: trace.traceId, builderRunId, spanTypes: [...new Set(trace.spans.map((span) => span.spanType))] }))
})
