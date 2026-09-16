import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { LibSQLStore } from '@mastra/libsql'

const live = process.env.CONEXUS_RB_COMPOSED_LIVE === 'true'
const required = [
  'CONEXUS_RB_COMPOSED_ORIGIN',
  'CONEXUS_RB_COMPOSED_WORKSPACE_ID',
  'CONEXUS_RB_COMPOSED_OPERATOR_STORAGE_STATE',
  'CONEXUS_RB_COMPOSED_DENIED_STORAGE_STATE',
  'CONEXUS_RB_COMPOSED_TRACE_STORE_PATH',
]
const configured = required.every((name) => Boolean(process.env[name]))

test('RB composed production journey uses server.ts, Preview, and native local traces', {
  skip: live && configured ? false : 'requires CONEXUS_RB_COMPOSED_LIVE=true plus the local server.ts origin, browser states, workspace, and trace store',
  timeout: 20 * 60_000,
}, async (t) => {
  const origin = process.env.CONEXUS_RB_COMPOSED_ORIGIN
  const workspaceId = process.env.CONEXUS_RB_COMPOSED_WORKSPACE_ID
  const operatorState = process.env.CONEXUS_RB_COMPOSED_OPERATOR_STORAGE_STATE
  const deniedState = process.env.CONEXUS_RB_COMPOSED_DENIED_STORAGE_STATE
  const traceStorePath = process.env.CONEXUS_RB_COMPOSED_TRACE_STORE_PATH
  if (!origin || !workspaceId || !operatorState || !deniedState || !traceStorePath) throw new Error('CONEXUS_RB_COMPOSED_LIVE_CONFIG_REFUSED')

  const browser = await chromium.launch({ headless: true, args: [`--unsafely-treat-insecure-origin-as-secure=${origin}`] })
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

  await page.getByLabel('O que o Project precisa fazer?').fill(requestText)
  await page.getByRole('button', { name: 'Enviar mensagem' }).click()
  await page.getByTitle('Preview do aplicativo').waitFor()
  const preview = page.frameLocator('iframe[title="Preview do aplicativo"]')
  await preview.locator('output').waitFor()
  assert.equal(await preview.locator('output').innerText(), '0')
  await preview.getByRole('button', { name: 'Incrementar', exact: true }).click()
  assert.equal(await preview.locator('output').innerText(), '1')
  await preview.getByRole('button', { name: 'Resetar', exact: true }).click()
  assert.equal(await preview.locator('output').innerText(), '0')

  await page.reload()
  await page.getByText(requestText, { exact: true }).waitFor()
  await page.getByTitle('Preview do aplicativo').waitFor()

  const denied = await browser.newContext({ storageState: deniedState })
  t.after(() => denied.close())
  const deniedPage = await denied.newPage()
  const deniedRead = deniedPage.waitForResponse((response) =>
    response.url().includes(`/api/control/projects/${projectId}/builder-session`) && [401, 403, 404].includes(response.status()))
  await deniedPage.goto(`${origin}/projects/${projectId}/build`)
  await deniedRead

  const storage = new LibSQLStore({ id: 'conexus-builder-session', url: `file:${traceStorePath}` })
  await storage.init()
  try {
    const observability = await storage.getStore('observability')
    assert.ok(observability, 'native observability storage must be available')
    const traces = await observability.listTraces({
      filters: { resourceId: projectId, serviceName: 'conexus-builder' },
      pagination: { page: 0, perPage: 50 },
    })
    const trace = traces.spans.find((span) => span.requestContext?.conexusBuilderProjectId === projectId &&
      typeof span.requestContext?.conexusBuilderRunId === 'string')
    assert.ok(trace, 'the Builder run trace must persist after its fresh Session has been deleted')
    const fullTrace = await observability.getTrace({ traceId: trace.traceId })
    assert.ok(fullTrace?.spans.some((span) => span.spanType === 'agent'))
    assert.ok(fullTrace?.spans.some((span) => span.spanType === 'model'))
    t.diagnostic(JSON.stringify({ projectId, traceId: trace.traceId, runId: trace.requestContext.conexusBuilderRunId }))
  } finally {
    await storage.close()
  }
})
