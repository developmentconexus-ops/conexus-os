import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { startWebServer } from './tests/implementation/web-dev-server.mjs'

const outDir = resolve('/tmp/parity-shots')
mkdirSync(outDir, { recursive: true })

const accountId = '70000000-0000-4000-8000-000000000001'
const workspaceId = '70000000-0000-4000-8000-000000000002'
const projectId = '70000000-0000-4000-8000-000000000003'
const conversationId = 'conversation-parity'
const baseRev = '1'.repeat(40)
const resultRev = '2'.repeat(40)
const artifactRevisionId = '70000000-0000-4000-8000-000000000004'

const BUILDER_MODELS = [
  { id: 'anthropic/claude-opus-4-5', provider: 'anthropic', modelName: 'claude-opus-4-5', hasApiKey: true },
]

const run = {
  builderRunId: 'run-parity-1', projectId, conversationId, state: 'SUCCEEDED', phase: null, mode: 'BUILD',
  baseSourceRevision: baseRev, resultSourceRevision: resultRev, resultKind: 'SOURCE_CHANGED', failureCode: null, failureCategory: null,
  requestText: 'Troque o texto em destaque da página inicial e mostre o saldo de dias de cada pessoa.', createdAt: '2026-09-22T06:12:00.000Z',
}

const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function mockAll(page) {
  await page.route('**/api/control/access-context', (route) => json(route, 200, {
    account: { accountId, displayName: 'Marina Alves', email: 'marina@empresa.com.br' },
    workspaces: [{ workspaceId, name: 'Operações' }], projects: [],
  }))
  await page.route(`**/api/control/workspaces/${workspaceId}/project-summaries`, (route) => json(route, 200, {
    projects: [
      { projectId, name: 'Pedidos de férias', archived: false, lastActivityAt: new Date(Date.now() - 29 * 60_000).toISOString(), latestRun: { state: 'SUCCEEDED', resultKind: 'SOURCE_CHANGED' }, hasPreview: true },
      { projectId: 'p2', name: 'Checklist de abertura da loja', archived: false, lastActivityAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), latestRun: { state: 'RUNNING', resultKind: null }, hasPreview: true },
      { projectId: 'p3', name: 'Cadastro de visitas a clientes', archived: false, lastActivityAt: new Date(Date.now() - 3 * 3_600_000).toISOString(), latestRun: { state: 'FAILED', resultKind: null }, hasPreview: false },
      { projectId: 'p4', name: 'Simulador de orçamento', archived: false, lastActivityAt: new Date(Date.now() - 24 * 3_600_000).toISOString(), latestRun: { state: 'SUCCEEDED', resultKind: 'SOURCE_CHANGED' }, hasPreview: true },
      { projectId: 'p5', name: 'Escala de plantão', archived: false, lastActivityAt: new Date(Date.now() - 2 * 24 * 3_600_000).toISOString(), latestRun: { state: 'SUCCEEDED', resultKind: 'SOURCE_CHANGED' }, hasPreview: true },
      { projectId: 'p6', name: 'Reembolso de despesas', archived: false, lastActivityAt: new Date(Date.now() - 5 * 24 * 3_600_000).toISOString(), latestRun: null, hasPreview: false },
    ],
  }))
  await page.route(`**/api/control/projects/${projectId}`, (route) => json(route, 200, { projectId, workspaceId, name: 'Pedidos de férias', projectRevision: 'revision', archived: false }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => json(route, 200, {
    projectId, latestBuilderRun: run, latestCodeChangingRun: { baseSourceRevision: baseRev, resultSourceRevision: resultRev, resultKind: 'SOURCE_CHANGED' },
    preview: { workingSourceRevision: resultRev, lastGoodSourceRevision: resultRev, lastGoodArtifactRevisionId: artifactRevisionId, lastGoodArtifactDigest: 'd'.repeat(64) },
    mode: 'BUILD', runHistory: [run],
  }))
  await page.route(`**/api/control/projects/${projectId}/builder-session/preview`, (route) => json(route, 201, {
    entryUrl: `${page.url().split('/').slice(0, 3).join('/')}/preview-entry`, previewUrl: 'https://pedidos-de-ferias.conexus.local', entryGrant: 'grant',
    artifactRevisionId, artifactDigest: 'd'.repeat(64), expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }))
  await page.route('**/preview-entry', (route) => route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><body style="margin:0;font:16px system-ui;background:#fff;color:#1b2230"><header style="padding:20px 32px;border-bottom:1px solid #e7eaf0;font-weight:700">Pedidos de férias</header><main style="padding:32px"><h1>Peça suas férias em 2 minutos</h1><p>Escolha as datas, envie para o gestor e acompanhe a aprovação aqui mesmo.</p></main></body>',
  }))
  await page.route(`**/api/control/projects/${projectId}/source/compare*`, (route) => json(route, 200, {
    baseSourceRevision: baseRev, resultSourceRevision: resultRev,
    files: [{ path: 'app/src/pages/Home.tsx', status: 'MODIFIED', previousPath: null }, { path: 'app/src/lib/saldoDeDias.ts', status: 'ADDED', previousPath: null }],
  }))
  await page.route(`**/api/control/projects/${projectId}/source/file*`, (route) => {
    const url = new URL(route.request().url())
    const revision = url.searchParams.get('sourceRevision')
    const path = url.searchParams.get('path')
    if (path === 'app/src/lib/saldoDeDias.ts') {
      return json(route, 200, { sourceRevision: revision, path, content: revision === baseRev ? '' : 'export function saldoDeDias(pessoa: Pessoa): number {\n  return pessoa.diasDisponiveis - pessoa.diasUsados\n}\n' })
    }
    const before = 'export function Home() {\n  return (\n    <section>\n      <h1>Bem-vindo</h1>\n      <p>Envie seu pedido de férias.</p>\n    </section>\n  )\n}\n'
    const after = 'import { saldoDeDias } from \'../lib/saldoDeDias\'\n\nexport function Home() {\n  return (\n    <section>\n      <h1>Peça suas férias em 2 minutos</h1>\n      <p>Escolha as datas, envie para o gestor e acompanhe a aprovação aqui mesmo.</p>\n      <Saldo dias={saldoDeDias(pessoaAtual)} />\n    </section>\n  )\n}\n'
    return json(route, 200, { sourceRevision: revision, path, content: revision === baseRev ? before : after })
  })
  await page.route(`**/api/control/projects/${projectId}/builder-session/runs/*/trace`, (route) => json(route, 200, { available: false }))
  await page.route(`**/api/control/projects/${projectId}/repository`, (route) => json(route, 200, { state: 'REACHABLE', fullName: 'empresa-exemplo/pedidos-de-ferias', url: 'https://github.com/empresa-exemplo/pedidos-de-ferias' }))
  await page.route('**/api/control/model-accounts/models', (route) => json(route, 200, { models: BUILDER_MODELS }))
  await page.route(`**/api/control/projects/${projectId}/conversations`, (route) => json(route, 200, { conversations: [{ conversationId, title: 'Página de pedidos de férias', createdAt: run.createdAt }] }))
  await page.route('**/api/mastra-factory/agent-controller/code/sessions/*/model', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route('**/api/mastra-factory/agent-controller/code/sessions/*/threads/*/messages*', (route) => json(route, 200, { messages: [] }))
  await page.route('**/api/mastra-factory/agent-controller/code/sessions/*', (route) => json(route, 200, { modelId: BUILDER_MODELS[0].id, modeId: 'build', threadId: 'x' }))
}

async function shots(page, name, path, { navigate = true } = {}) {
  if (navigate) await page.goto(`${globalThis.__origin}${path}`)
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.waitForTimeout(600)
    await page.screenshot({ path: resolve(outDir, `${name}-${scheme}.png`) })
  }
}

const fakeTest = { after: () => {} }
const origin = await startWebServer(fakeTest, { logLevel: 'error' })
globalThis.__origin = origin
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
const page = await context.newPage()
await mockAll(page)

await shots(page, 'hub-home', `/workspaces/${workspaceId}/projects`)
await page.goto(`${origin}/projects/${projectId}/build`)
await page.getByTitle('Prévia do aplicativo').waitFor()
await page.waitForTimeout(500)
await shots(page, 'hub-previa', null, { navigate: false })

await page.getByRole('tab', { name: 'Alterações' }).click()
await page.getByText('app/src/pages/Home.tsx').first().waitFor()
await page.waitForTimeout(300)
await shots(page, 'hub-alteracoes-unificado', null, { navigate: false })
await page.getByRole('button', { name: 'Lado a lado' }).click()
await page.waitForTimeout(300)
await shots(page, 'hub-alteracoes-split', null, { navigate: false })

await page.getByRole('tab', { name: 'Sobre' }).click()
await page.getByRole('heading', { name: 'Sobre este pedido' }).waitFor()
await page.waitForTimeout(300)
await shots(page, 'hub-sobre', null, { navigate: false })

await browser.close()
console.log('DONE', outDir)
