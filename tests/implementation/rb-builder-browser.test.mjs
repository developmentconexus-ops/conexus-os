import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const repositoryRoot = resolve(import.meta.dirname, '../..')

test('Project Build uses the Project session and BuilderRun API', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000001'
  const projectId = '70000000-0000-4000-8000-000000000002'
  const runId = '70000000-0000-4000-8000-000000000003'
  const sourceRevision = 'b'.repeat(40)
  const artifactRevisionId = '70000000-0000-4000-8000-000000000004'
  const artifactDigest = 'c'.repeat(64)
  const origin = 'http://127.0.0.1:41749'
  let run = null
  const requests = []
  const server = await createServer({
    configFile: resolve(repositoryRoot, 'apps/web/vite.config.mjs'), root: resolve(repositoryRoot, 'apps/web'),
    server: { host: '127.0.0.1', port: 41749, strictPort: true },
  })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  const session = () => ({
    projectId, threadId: `conexus-builder:${projectId}`, messages: run ? [{ id: 'message-1', role: 'user', text: 'Crie um contador', createdAt: new Date().toISOString() }] : [],
    activeBuilderRun: run, preview: { workingSourceRevision: sourceRevision, lastGoodArtifactRevisionId: run?.state === 'SUCCEEDED' ? artifactRevisionId : null, lastGoodArtifactDigest: run?.state === 'SUCCEEDED' ? artifactDigest : null }, mode: 'BUILD',
    workingSourceRevision: sourceRevision, lastPreviewChangeId: null,
  })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Counter', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session/**`, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      requests.push({ url: route.request().url(), body, key: route.request().headers()['idempotency-key'] })
      run = { builderRunId: runId, projectId, state: 'SUCCEEDED', mode: body.mode, baseSourceRevision: sourceRevision, resultSourceRevision: sourceRevision, resultKind: body.mode === 'PLAN' ? 'RESPONSE_ONLY' : 'SOURCE_CHANGED', failureCode: null }
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ threadId: `conexus-builder:${projectId}`, builderRun: run }) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session()) })
  })
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session()) }))
  await page.route(`**/api/control/projects/${projectId}/preview`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ previewId: 'preview', subjectKind: 'CURRENT_PROJECT', subjectDigest: sourceRevision, ready: Boolean(run), verified: false, workingSourceRevision: sourceRevision, lastPreviewArtifactRevisionId: run ? artifactRevisionId : null, lastPreviewArtifactDigest: run ? artifactDigest : null, live: false }) }))

  await page.goto(`${origin}/projects/${projectId}`)
  await page.getByRole('link', { name: 'Construir com o Conexus' }).click()
  await page.getByRole('heading', { name: 'Converse com o Conexus' }).waitFor()
  await page.getByLabel('O que o Project precisa fazer?').fill('Crie um contador')
  await page.getByRole('button', { name: 'Enviar mensagem' }).click()
  await page.getByText('Mensagem enviada ao Builder.').waitFor()
  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0].body, { content: 'Crie um contador', mode: 'BUILD' })
  assert.ok(requests[0].key)
  await page.getByText('Último Preview bom disponível.').waitFor()
  await page.getByText('Build concluído').waitFor()
  assert.equal(await page.getByText('BuilderRun', { exact: true }).count(), 0)
})
