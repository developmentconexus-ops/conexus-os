// Captures every Construir screen against a mocked Hub: desktop 1440 and mobile 390, light and dark.
// Run from the repository root: node docs/evidence/screens/feat-screens-construir/capture.mjs
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../../..')
const port = 41790
const origin = `http://127.0.0.1:${port}`
const only = process.argv[2]

const accountId = '70000000-0000-4000-8000-0000000000a1'
const workspaceId = '70000000-0000-4000-8000-0000000000a2'
const projectId = '70000000-0000-4000-8000-0000000000a3'
const conversationId = '70000000-0000-4000-8000-0000000000a4'
const otherConversation = '70000000-0000-4000-8000-0000000000a5'
const runId = '70000000-0000-4000-8000-0000000000a6'
const olderRunId = '70000000-0000-4000-8000-0000000000a7'
const base = '1'.repeat(40)
const middle = '2'.repeat(40)
const result = '3'.repeat(40)
const artifact = '70000000-0000-4000-8000-0000000000a8'
const controller = '**/api/mastra-factory/agent-controller/code'
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString()

const models = [
  { id: 'openai/gpt-5.5', provider: 'openai', modelName: 'GPT-5.5', hasApiKey: true, useCount: 3 },
  { id: 'anthropic/claude-sonnet-5', provider: 'anthropic', modelName: 'Claude Sonnet 5', hasApiKey: true, useCount: 1 },
  { id: 'google/gemini-3.1-pro', provider: 'google', modelName: 'Gemini 3.1 Pro', hasApiKey: true, useCount: 0 },
]
const message = (id, role, parts, minutes) => ({ id, role, createdAt: minutesAgo(minutes), content: { format: 2, parts } })
const text = (value) => ({ type: 'text', text: value })
const tool = (toolCallId, toolName, args, resultValue) => ({ type: 'tool-invocation', toolInvocation: { toolCallId, toolName, args, state: 'result', result: resultValue } })
const thread = [
  message('u1', 'user', [text('Crie um controle de pedidos de férias com aprovação do gestor.')], 42),
  message('a1', 'assistant', [
    text('Vou criar a lista de pedidos, com quem pediu, o período e os botões de decisão.'),
    tool('t1', 'write_file', { path: 'src/App.tsx' }, 'ok'),
    tool('t2', 'execute_command', { command: 'npm run build' }, 'built in 2.1s'),
    text('Pronto. A lista mostra os pedidos que aguardam decisão.'),
  ], 40),
  message('u2', 'user', [text('Quando o gestor recusar, ele tem que escrever o motivo.')], 1),
]
const run = (overrides) => ({
  builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'AGENT', mode: 'BUILD',
  baseSourceRevision: middle, resultSourceRevision: null, resultKind: null, failureCode: null, failureCategory: null,
  requestText: 'Quando o gestor recusar, ele tem que escrever o motivo.', createdAt: minutesAgo(1.3), ...overrides,
})
const older = {
  builderRunId: olderRunId, projectId, conversationId, state: 'SUCCEEDED', phase: null, mode: 'BUILD',
  baseSourceRevision: base, resultSourceRevision: middle, resultKind: 'SOURCE_CHANGED', failureCode: null, failureCategory: null,
  requestText: 'Crie um controle de pedidos de férias com aprovação do gestor.', createdAt: minutesAgo(40),
}
const livePreview = { workingSourceRevision: middle, lastGoodSourceRevision: middle, lastGoodArtifactRevisionId: artifact, lastGoodArtifactDigest: 'd'.repeat(64) }
const files = {
  'package.json': '{\n  "name": "pedidos-de-ferias",\n  "private": true,\n  "scripts": { "build": "vite build" }\n}\n',
  'src/App.tsx': "import { Requests } from './Requests'\n\nexport function App() {\n  return <main>\n    <h1>Pedidos de férias</h1>\n    <Requests />\n  </main>\n}\n",
  'src/Requests.tsx': "export function Requests() {\n  const pending = usePending()\n  return <ul>{pending.map((request) => <Request key={request.id} request={request} />)}</ul>\n}\n",
  'index.html': '<!doctype html>\n<div id="root"></div>\n<script type="module" src="/src/main.tsx"></script>\n',
}
const changed = { 'src/Requests.tsx': "export function Requests() {\n  const pending = usePending()\n  const [reason, setReason] = useState('')\n  return <ul>{pending.map((request) => <Request key={request.id} request={request} onDecline={(why) => decline(request, why)} />)}</ul>\n}\n", 'src/Reason.tsx': "export function Reason({ onSubmit }) {\n  return <form onSubmit={onSubmit}><label>Motivo<textarea required /></label></form>\n}\n" }
const app = `<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width"><style>
body{margin:0;font:15px/1.45 system-ui,sans-serif;color:#1b2230;background:#fff}header{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #e7eaf0}
b{font-size:16px}span{font-size:12px;color:#6b7384}ul{list-style:none;margin:0;padding:6px 18px}li{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:11px 0;border-bottom:1px solid #eef0f4}
small{display:block;color:#6b7384;font-size:12px}button{font:inherit;font-size:12px;padding:5px 10px;border-radius:6px;border:1px solid #cfd5df;background:#fff}.ok{background:#2563eb;border-color:#2563eb;color:#fff}</style>
<header><b>Pedidos de férias</b><span>3 aguardando decisão</span></header><ul>
<li><div>Marina Alves<small>12 a 26 de outubro</small></div><button>Recusar</button><button class="ok">Aprovar</button></li>
<li><div>Diego Souza<small>3 a 10 de novembro</small></div><button>Recusar</button><button class="ok">Aprovar</button></li>
<li><div>Carla Mendes<small>1 a 15 de dezembro</small></div><button>Recusar</button><button class="ok">Aprovar</button></li></ul></html>`

const scenarios = {
  'construir-trabalhando': {
    session: { latestBuilderRun: run(), preview: livePreview, runHistory: [run(), older] },
    stream: [
      { type: 'message_start', message: message('live', 'assistant', [text('Vou abrir um campo de motivo ao clicar em Recusar e guardar quem decidiu e quando.'), tool('t3', 'string_replace', { path: 'src/Requests.tsx' }, 'ok')], 0) },
      { type: 'tool_approval_required', toolCallId: 't4', toolName: 'execute_command', args: { command: 'npm install date-fns' } },
    ],
  },
  'construir-modelo': {
    session: { latestBuilderRun: older, preview: livePreview, runHistory: [older] },
    act: async (page) => { await page.getByRole('button', { name: /^Modelo / }).click(); await page.locator('.cx-model-popover').waitFor() },
  },
  'construir-vazio': {
    session: { latestBuilderRun: null, preview: { workingSourceRevision: null, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null }, runHistory: [] },
    thread: [],
  },
  'construir-falhou': {
    session: {
      latestBuilderRun: run({ state: 'SUCCEEDED', phase: null, resultSourceRevision: result, resultKind: 'SOURCE_CHANGED_BUILD_FAILED', failureCode: 'BUILDER_APPLICATION_BUILD_FAILED' }),
      preview: { ...livePreview, workingSourceRevision: result },
      runHistory: [older],
    },
  },
  'construir-codigo': { session: { latestBuilderRun: older, preview: livePreview, runHistory: [older] }, lens: 'code' },
  'construir-alteracoes': {
    session: { latestBuilderRun: run({ state: 'SUCCEEDED', phase: null, resultSourceRevision: result, resultKind: 'SOURCE_CHANGED' }), preview: { ...livePreview, workingSourceRevision: result, lastGoodSourceRevision: result }, runHistory: [older] },
    lens: 'diff',
  },
  'construir-detalhes': { session: { latestBuilderRun: older, preview: livePreview, runHistory: [older] }, lens: 'details' },
}

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

const mock = async (page, scenario) => {
  await page.route(`**/api/control/projects/${projectId}/repository`, (route) => json(route, { state: 'REACHABLE', fullName: 'empresa-exemplo/pedidos-de-ferias', url: 'https://github.com/empresa-exemplo/pedidos-de-ferias' }))
  await page.route('**/api/control/access-context', (route) => json(route, { account: { accountId, displayName: 'Leandro Theodoro', email: 'leandro@example.com' }, workspaces: [{ workspaceId, name: 'Operações' }], projects: [] }))
  await page.route(`**/api/control/projects/${projectId}`, (route) => json(route, { projectId, workspaceId, name: 'Pedidos de férias', projectRevision: 'r', archived: false }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => json(route, { projectId, latestCodeChangingRun: null, mode: 'BUILD', ...scenario.session }))
  await page.route(`**/api/control/projects/${projectId}/builder-session/preview`, (route) => json(route, { entryUrl: `${origin}/preview-entry`, previewUrl: `${origin}/preview`, entryGrant: 'grant', artifactRevisionId: artifact, artifactDigest: 'd'.repeat(64), expiresAt: new Date(Date.now() + 600_000).toISOString() }, 201))
  await page.route(`${origin}/preview-entry`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: app }))
  await page.route(`**/api/control/projects/${projectId}/builder-session/runs/*/trace`, (route) => json(route, { available: true, traceId: 'a1b2c3d4e5f6', spans: [
    { spanType: 'agent_run', name: 'mastra-code', startedAt: minutesAgo(40), durationMs: 94_210, error: false },
    { spanType: 'tool_call', name: 'write_file', startedAt: minutesAgo(39), durationMs: 38, error: false },
    { spanType: 'tool_call', name: 'execute_command', startedAt: minutesAgo(38), durationMs: 2_140, error: false },
  ] }))
  await page.route(`**/api/control/projects/${projectId}/conversations`, (route) => json(route, { conversations: [
    { conversationId, title: 'Aprovação com motivo', createdAt: minutesAgo(42) },
    { conversationId: otherConversation, title: 'Relatório mensal', createdAt: minutesAgo(600) },
  ] }))
  await page.route(`**/api/control/projects/${projectId}/source/tree*`, (route) => {
    const revision = new URL(route.request().url()).searchParams.get('sourceRevision')
    const names = Object.keys(revision === result ? { ...files, ...changed } : files)
    return json(route, { sourceRevision: revision, entries: [{ path: 'src', kind: 'DIRECTORY' }, ...names.map((path) => ({ path, kind: 'FILE' }))] })
  })
  await page.route(`**/api/control/projects/${projectId}/source/file*`, (route) => {
    const query = new URL(route.request().url()).searchParams
    const all = query.get('sourceRevision') === result ? { ...files, ...changed } : files
    const path = query.get('path')
    return all[path] === undefined ? json(route, { type: 'source-file-not-found' }, 404) : json(route, { sourceRevision: query.get('sourceRevision'), path, content: all[path] })
  })
  await page.route(`**/api/control/projects/${projectId}/source/compare*`, (route) => {
    const query = new URL(route.request().url()).searchParams
    return json(route, { baseSourceRevision: query.get('baseSourceRevision'), resultSourceRevision: query.get('resultSourceRevision'), files: [
      { path: 'src/Reason.tsx', status: 'ADDED', previousPath: null },
      { path: 'src/Requests.tsx', status: 'MODIFIED', previousPath: null },
    ] })
  })
  await page.route(`${controller}/models`, (route) => json(route, { models }))
  await page.route(`${controller}/sessions/*`, (route) => json(route, { modelId: models[0].id, modeId: 'build', threadId: conversationId, settings: { yolo: false, thinkingLevel: 'medium', notifications: 'off', smartEditing: true } }))
  await page.route(`${controller}/sessions/*/threads/*/messages*`, (route) => json(route, { messages: scenario.thread ?? thread }))
  await page.route(`${controller}/sessions/*/stream*`, (route) => route.fulfill({
    status: 200, headers: { 'content-type': 'text/event-stream' },
    body: (scenario.stream ?? []).map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
  }))
}

const server = await createServer({ configFile: resolve(root, 'apps/web/vite.config.mjs'), root: resolve(root, 'apps/web'), server: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ headless: true })
mkdirSync(here, { recursive: true })
try {
  for (const [name, scenario] of Object.entries(scenarios)) {
    if (only && !name.includes(only)) continue
    for (const [device, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({ viewport, colorScheme: theme, deviceScaleFactor: device === 'mobile' ? 2 : 1 })
        await context.addInitScript((value) => { window.localStorage.setItem('conexus-theme', value) }, theme)
        const page = await context.newPage()
        page.on('pageerror', (error) => console.error(`${name} ${device} ${theme}: ${error.message}`))
        await mock(page, scenario)
        const search = scenario.lens ? `?lens=${scenario.lens}` : ''
        await page.goto(`${origin}/projects/${projectId}/c/${conversationId}${search}`)
        await page.locator('.cx-construir').waitFor()
        if (device === 'mobile' && (scenario.lens || name === 'construir-falhou' || name === 'construir-vazio')) await page.getByRole('button', { name: 'App', exact: true }).click()
        await page.waitForTimeout(1200)
        await scenario.act?.(page)
        await page.waitForTimeout(400)
        if (process.env.PROBE_UP) console.log(await page.evaluate((selector) => {
          const lines = []
          for (let element = document.querySelector(selector); element; element = element.parentElement) {
            const style = getComputedStyle(element)
            lines.push(`${element.tagName.toLowerCase()}.${String(element.className).slice(0, 70)} h=${Math.round(element.getBoundingClientRect().height)} ${style.display} ${style.flexDirection} height=${style.height} flex=${style.flex}`)
          }
          return lines.join('\n')
        }, process.env.PROBE_UP))
        if (process.env.PROBE) console.log(await page.evaluate((selector) => [...document.querySelectorAll(selector)].map((element) => {
          const box = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return `${element.tagName.toLowerCase()}[${element.getAttribute('data-slot') ?? element.className}] ${Math.round(box.width)}x${Math.round(box.height)}@${Math.round(box.top)} ${style.display} ${style.visibility} op=${style.opacity}`
        }).join('\n'), process.env.PROBE))
        // No screen may scroll sideways: report every element wider than the viewport.
        // Content inside its own horizontal scroller (a code line) scrolls there, not the page.
        const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')]
          .filter((element) => {
            if (element.getBoundingClientRect().right <= window.innerWidth + 1 || !element.getClientRects().length) return false
            for (let parent = element.parentElement; parent; parent = parent.parentElement) {
              if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowX) && parent.getBoundingClientRect().right <= window.innerWidth + 1) return false
            }
            return true
          })
          .slice(0, 8).map((element) => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 60)} → ${Math.round(element.getBoundingClientRect().right)}`))
        if (overflow.length) console.warn(`${name} ${device} ${theme} overflows:\n  ${overflow.join('\n  ')}`)
        await page.screenshot({ path: resolve(here, `${name}-${device}-${theme}.png`) })
        await context.close()
      }
    }
    console.log(`captured ${name}`)
  }
} finally {
  await browser.close()
  await server.close()
}
