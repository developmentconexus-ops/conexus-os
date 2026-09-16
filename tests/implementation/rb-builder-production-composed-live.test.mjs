import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { SpanType } from '@mastra/core/observability'
import { LibSQLStore } from '@mastra/libsql'

const live = process.env.CONEXUS_RB_COMPOSED_LIVE === 'true'
const required = [
  'CONEXUS_RB_COMPOSED_WORKSPACE_ID',
  'CONEXUS_RB_COMPOSED_OPERATOR_STORAGE_STATE',
  'CONEXUS_RB_COMPOSED_DENIED_STORAGE_STATE',
]

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const readSession = (page, projectId) => page.evaluate(async (id) => {
  const response = await fetch(`/api/control/projects/${encodeURIComponent(id)}/builder-session`, { credentials: 'same-origin' })
  return response.ok ? response.json() : { status: response.status }
}, projectId)

test('RB composed production journey uses server.ts, Preview, and native local traces', {
  skip: live ? false : 'requires explicit CONEXUS_RB_COMPOSED_LIVE=true',
  timeout: 20 * 60_000,
}, async (t) => {
  const missing = required.filter((name) => !process.env[name])
  const origin = process.env.CONEXUS_RB_COMPOSED_ORIGIN ?? process.env.CONEXUS_ORIGIN
  const workspaceId = process.env.CONEXUS_RB_COMPOSED_WORKSPACE_ID
  const operatorState = process.env.CONEXUS_RB_COMPOSED_OPERATOR_STORAGE_STATE
  const deniedState = process.env.CONEXUS_RB_COMPOSED_DENIED_STORAGE_STATE
  const traceStorePath = process.env.CONEXUS_RB_COMPOSED_TRACE_STORE_PATH ??
    (process.env.CONEXUS_PROJECT_STORAGE_ROOT ? join(process.env.CONEXUS_PROJECT_STORAGE_ROOT, 'builder-session.db') : undefined)
  if (!origin || !workspaceId || !operatorState || !deniedState || !traceStorePath || missing.length > 0) {
    throw new Error(`CONEXUS_RB_COMPOSED_LIVE_CONFIG_REFUSED: ${missing.join(',') || 'references'}`)
  }
  const parsedOrigin = new URL(origin)
  assert.equal(parsedOrigin.protocol, 'https:')
  assert.equal(parsedOrigin.hostname, 'hub.conexus.localhost')

  const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP *.conexus.localhost 127.0.0.1'] })
  t.after(() => browser.close())
  const operator = await browser.newContext({ storageState: operatorState })
  t.after(() => operator.close())
  const page = await operator.newPage()
  page.setDefaultTimeout(180_000)
  const projectName = `Builder counter ${randomUUID().slice(0, 8)}`
  const requestText = 'Crie um contador acessível. Mostre inicialmente 0 em um elemento output. Inclua um botão Incrementar que muda para 1 e um botão Resetar que volta para 0.'

  await page.goto(`${origin}/workspaces/${workspaceId}/projects/new`)
  await page.getByLabel('Nome do Project').fill(projectName)
  await page.getByRole('button', { name: 'Criar Project' }).click()
  await page.getByRole('heading', { name: 'Converse com o Conexus' }).waitFor()
  const projectId = new URL(page.url()).pathname.match(/^\/projects\/([^/]+)\/build$/)?.[1]
  assert.ok(projectId, 'NEW Project must lead directly to the real Build workspace')

  const previewResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/api/control/projects/${projectId}/builder-session/preview`) &&
    response.request().method() === 'POST' && response.status() === 201)
  const builderResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/api/control/projects/${projectId}/builder-session/messages`) &&
    response.request().method() === 'POST' && response.status() === 201)
  await page.getByLabel('O que o Project precisa fazer?').fill(requestText)
  await page.getByLabel('Enviar mensagem').click()
  const accepted = await (await builderResponsePromise).json()
  const builderRunId = accepted?.builderRun?.builderRunId
  assert.match(builderRunId ?? '', /^[0-9a-f-]{36}$/i, 'the browser must observe an exact BuilderRun id')

  let terminalSession
  for (let attempt = 0; attempt < 180; attempt += 1) {
    terminalSession = await readSession(page, projectId)
    if (['SUCCEEDED', 'FAILED', 'INTERRUPTED'].includes(terminalSession?.latestBuilderRun?.state)) break
    await delay(1_000)
  }
  assert.equal(terminalSession?.latestBuilderRun?.builderRunId, builderRunId)
  assert.equal(terminalSession?.latestBuilderRun?.state, 'SUCCEEDED')

  await page.getByTitle('Preview do aplicativo').waitFor()
  const previewLaunch = await (await previewResponsePromise).json()
  const previewOrigin = new URL(previewLaunch.previewUrl).origin
  assert.match(previewOrigin, /^https:\/\/preview-[0-9a-f-]+\.conexus\.localhost:\d+$/i)
  assert.equal(new URL(previewLaunch.entryUrl).origin, previewOrigin)
  const preview = page.frameLocator('iframe[title="Preview do aplicativo"]')
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
  await page.getByTitle('Preview do aplicativo').waitFor()
  await page.getByRole('button', { name: 'Reabrir Preview' }).click()
  await preview.locator('output').waitFor()
  assert.equal(await preview.locator('output').innerText(), '0')

  const denied = await browser.newContext({ storageState: deniedState })
  t.after(() => denied.close())
  const deniedPage = await denied.newPage()
  const deniedRead = deniedPage.waitForResponse((response) =>
    response.url().includes(`/api/control/projects/${projectId}/builder-session`) && [401, 403, 404].includes(response.status()))
  await deniedPage.goto(`${origin}/projects/${projectId}/build`)
  const deniedSessionResponse = await deniedRead
  assert.ok([401, 403, 404].includes(deniedSessionResponse.status()))
  const deniedPreviewStatus = await deniedPage.evaluate(async (id) => {
    const response = await fetch(`/api/control/projects/${encodeURIComponent(id)}/builder-session/preview`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' })
    return response.status
  }, projectId)
  assert.ok([401, 403, 404].includes(deniedPreviewStatus))
  const deniedStreamStatus = await deniedPage.evaluate(async ({ id, run }) => {
    const response = await fetch(`/api/control/projects/${encodeURIComponent(id)}/builder-session/runs/${encodeURIComponent(run)}/stream`, { credentials: 'same-origin' })
    return response.status
  }, { id: projectId, run: builderRunId })
  assert.ok([401, 403, 404].includes(deniedStreamStatus))

  const storage = new LibSQLStore({ id: 'conexus-builder-session-trace-read', url: traceStorePath.startsWith('file:') ? traceStorePath : `file:${traceStorePath}` })
  await storage.init()
  try {
    const observability = await storage.getStore('observability')
    assert.ok(observability, 'native observability storage must be available')
    const traces = await observability.listTraces({
      filters: { resourceId: projectId, serviceName: 'conexus-builder' },
      pagination: { page: 0, perPage: 50 },
    })
    const trace = traces.spans.find((span) =>
      span.requestContext?.conexusBuilderProjectId === projectId && span.requestContext?.conexusBuilderRunId === builderRunId)
    assert.ok(trace, 'the exact Builder run trace must persist after its fresh Session was deleted')
    const fullTrace = await observability.getTrace({ traceId: trace.traceId })
    const spans = fullTrace?.spans ?? []
    assert.ok(spans.some((span) => span.spanType === SpanType.AGENT_RUN))
    assert.ok(spans.some((span) => [SpanType.MODEL_GENERATION, SpanType.MODEL_INFERENCE].includes(span.spanType)))
    assert.ok(spans.some((span) => span.spanType === SpanType.TOOL_CALL))
    assert.ok(spans.some((span) => span.requestContext?.conexusBuilderProjectId === projectId && span.requestContext?.conexusBuilderRunId === builderRunId))
    t.diagnostic(JSON.stringify({ projectId, traceId: trace.traceId, builderRunId, spanTypes: [...new Set(spans.map((span) => span.spanType))] }))
  } finally {
    await storage.close()
  }
})
