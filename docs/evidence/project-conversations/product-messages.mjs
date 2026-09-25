// Puts a real, different message in each of the Project's two named conversations, through the
// product's own screen. Each send is a real BuilderRun paid for by the model the operator chose.
import { chromium } from '~/conexus-os/node_modules/@playwright/test/index.mjs'

const base = 'https://hub.conexus.localhost:3443'
const projectId = process.argv[2]
const stamp = () => new Date().toISOString().slice(11, 19)

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ storageState: process.env.CONEXUS_STATE, viewport: { width: 1480, height: 1000 } })
const page = await context.newPage()
page.on('response', (response) => {
  const url = new URL(response.url())
  if ((url.pathname.startsWith('/api/control') || url.pathname.startsWith('/api/mastra')) && response.status() >= 400) {
    console.log(`HTTP ${response.status()} ${url.pathname}`)
  }
})

const session = () => page.evaluate(async (id) => {
  const response = await fetch(`/api/control/projects/${id}/builder-session`, { credentials: 'same-origin' })
  return response.ok ? response.json() : { httpStatus: response.status }
}, projectId)

const pills = () => page.locator('.builder-conversations-list button')
const selectByTitle = async (title) => {
  await pills().filter({ hasText: title }).first().click()
  await page.waitForTimeout(1_500)
}

const say = async (title, text) => {
  await selectByTitle(title)
  await page.getByLabel('O que o Project precisa fazer?').fill(text)
  const before = (await session()).latestBuilderRun?.builderRunId
  await page.getByRole('button', { name: 'Enviar mensagem' }).click()
  console.log(`${stamp()} sent in "${title}": ${text}`)
  for (let tick = 0; tick < 150; tick += 1) {
    await page.waitForTimeout(4_000)
    const run = (await session().catch(() => null))?.latestBuilderRun
    if (run && run.builderRunId !== before && !['QUEUED', 'RUNNING'].includes(run.state)) {
      console.log(`${stamp()} "${title}" settled ${run.state} ${run.resultKind ?? ''} ${run.failureCode ?? ''} conversationId=${run.conversationId}`)
      return run
    }
    if (tick % 10 === 0) console.log(`${stamp()} "${title}" ${run?.state}/${run?.phase}`)
  }
  console.log(`${stamp()} "${title}" never settled`)
  return null
}

try {
  await page.goto(`${base}/projects/${projectId}/build`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Conversas' }).waitFor({ timeout: 120_000 })

  await page.locator('.builder-model-select option').nth(1).waitFor({ state: 'attached', timeout: 120_000 })
  const models = await page.locator('.builder-model-select option').allInnerTexts()
  console.log(`option count: ${models.length}`)
  console.log(`models the controller offers: ${JSON.stringify(models.slice(0, 6))}`)
  const select = page.locator('.builder-model-select select')
  const chosen = await select.inputValue()
  if (!chosen) {
    const values = await select.locator('option').evaluateAll((options) => options.map((option) => option.value).filter(Boolean))
    if (values.length === 0) throw new Error('the controller reports no authenticated model')
    const wanted = values.find((value) => value === 'openai/gpt-5.5') ?? values[0]
    await select.selectOption(wanted); console.log("chose " + wanted)
    await page.waitForTimeout(2_000)
    console.log(`${stamp()} chose model ${values[0]}`)
  } else {
    console.log(`${stamp()} model already chosen: ${chosen}`)
  }

  await say('Conversa A', 'Responda apenas com a palavra ALFA e não altere nenhum arquivo.')
  await say('Conversa B', 'Responda apenas com a palavra BETA e não altere nenhum arquivo.')
} finally {
  await context.close()
  await browser.close()
}
