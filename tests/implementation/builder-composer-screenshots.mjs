import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

// Construir's composer at the chat panel's width, idle and while a run works, in both themes, from
// stubbed Hub answers. Usage: node tests/implementation/builder-composer-screenshots.mjs <out-dir>
const repositoryRoot = resolve(import.meta.dirname, '../..')
const outDir = resolve(process.argv[2] ?? 'builder-composer-screens')
const CHAT_WIDTH = 420
const accountId = '70000000-0000-4000-8000-000000000901'
const projectId = '70000000-0000-4000-8000-000000000902'
const runId = '70000000-0000-4000-8000-000000000903'
const conversationId = '70000000-0000-4000-8000-000000000904'
const CONTROLLER = '**/api/builder/agent-controller/conexus-builder'
const omProgress = {
  status: 'idle', pendingTokens: 12_400, threshold: 30_000, thresholdPercent: 41.3, observationTokens: 3_100, reflectionThreshold: 40_000, reflectionThresholdPercent: 7.75,
  buffered: { observations: { status: 'idle', chunks: 0, messageTokens: 0, projectedMessageRemoval: 0, observationTokens: 0 }, reflection: { status: 'idle', inputObservationTokens: 0, observationTokens: 0 } },
  generationCount: 1, stepNumber: 0, preReflectionTokens: 0,
}
const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
const message = (id, role, text) => ({ id, role, createdAt: '2026-09-29T12:00:00.000Z', content: { format: 2, parts: [{ type: 'text', text }] } })

async function stub(page, running) {
  await page.route('**/api/control/access-context', (route) => route.fulfill(json({ account: { accountId, displayName: 'Ana Cardoso' }, workspaces: [], projects: [] })))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill(json({ projectId, workspaceId: accountId, name: 'Agenda', projectRevision: 'r', archived: false })))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill(json({
    projectId,
    latestBuilderRun: running ? {
      builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'AGENT', mode: 'PLAN', baseSourceRevision: 'c'.repeat(40),
      resultSourceRevision: null, resultKind: null, failureCode: null, failureCategory: null, requestText: 'Crie uma agenda semanal', createdAt: new Date().toISOString(),
    } : null,
    latestCodeChangingRun: null,
    preview: { workingSourceRevision: 'c'.repeat(40), lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    runHistory: [],
  })))
  await page.route('**/api/control/model-accounts/models', (route) => route.fulfill(json({ models: [
    { id: 'anthropic/claude-opus-4-5', provider: 'anthropic', providerName: 'Anthropic (Claude)', modelName: 'claude-opus-4-5', thinkingLevels: ['low', 'medium', 'high', 'xhigh'], hasApiKey: true },
  ] })))
  await page.route(`${CONTROLLER}/sessions`, (route) => route.fulfill(json({ controllerId: 'conexus-builder', resourceId: `project:${projectId}`, threadId: conversationId })))
  await page.route(`${CONTROLLER}/sessions/*/threads*`, (route) => route.fulfill(json({ threads: [{ id: conversationId, title: 'Agenda semanal', createdAt: '2026-09-29T12:00:00.000Z', updatedAt: '2026-09-29T12:00:00.000Z' }] })))
  await page.route(`${CONTROLLER}/sessions/*/threads/*/messages*`, (route) => route.fulfill(json({ messages: [
    message('u1', 'user', 'Crie uma agenda semanal para a equipe de vendas.'),
    message('a1', 'assistant', 'Li o app. Vou propor um plano antes de mudar qualquer arquivo.'),
  ] })))
  await page.route(`${CONTROLLER}/sessions/*`, (route) => route.fulfill(json({ modelId: 'anthropic/claude-opus-4-5', threadId: conversationId, omProgress })))
  await page.route(`${CONTROLLER}/sessions/*/stream*`, (route) => route.fulfill({
    status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    body: `data: ${JSON.stringify({ type: 'display_state_changed', displayState: { activeTools: {}, tasks: [], omProgress: { ...omProgress, status: 'observing', pendingTokens: 29_000 }, bufferingMessages: false, bufferingObservations: false } })}\n\n`,
  }))
}

// The chat panel is the group's right-hand panel; its separator is dragged until the panel is CHAT_WIDTH wide.
async function widenChat(page) {
  const chat = page.locator('.cx-chat')
  await chat.waitFor()
  const separator = page.locator('[data-separator]')
  const box = await separator.boundingBox()
  const width = (await chat.boundingBox()).width
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - (CHAT_WIDTH - width), box.y + box.height / 2, { steps: 8 })
  await page.mouse.up()
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const server = await createServer({ configFile: resolve(repositoryRoot, 'apps/web/vite.config.mjs'), root: resolve(repositoryRoot, 'apps/web'), server: { host: '127.0.0.1', port: 0 } })
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  const browser = await chromium.launch({ headless: true })
  try {
    for (const scheme of ['light', 'dark']) {
      for (const running of [false, true]) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, deviceScaleFactor: 2 })
        const page = await context.newPage()
        await stub(page, running)
        await page.goto(`${origin}/projects/${projectId}/build`)
        await widenChat(page)
        await page.locator('.cx-composer').waitFor()
        await page.waitForTimeout(400)
        const state = running ? 'running' : 'idle'
        const chatBox = await page.locator('.cx-chat').boundingBox()
        const composerBox = await page.locator('.cx-composer').boundingBox()
        const clip = { x: chatBox.x, y: composerBox.y - 24, width: chatBox.width, height: composerBox.height + 48 }
        await page.screenshot({ path: resolve(outDir, `composer-${state}-${scheme}.png`), clip })
        await page.screenshot({ path: resolve(outDir, `construir-${state}-${scheme}.png`) })
        if (!running) {
          const ring = page.getByRole('button', { name: /^Memória/ })
          if (await ring.count()) {
            await ring.click()
            await page.waitForTimeout(250)
            await page.screenshot({ path: resolve(outDir, `memory-detail-${scheme}.png`), clip: { ...clip, y: clip.y - 200, height: clip.height + 200 } })
          }
        }
        console.log(`${state}-${scheme}: chat ${Math.round(chatBox.width)}px`)
        await context.close()
      }
    }
  } finally {
    await browser.close()
    await server.close()
  }
}

await main()
