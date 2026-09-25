// The product proof for "several conversations per Project". Drives the real Hub as the test
// operator: open a Project, hold two conversations with different messages, switch between them,
// rename one, and check that switching leaves the Project's source and last good Preview alone.
// Pass 1 writes. Pass 2 runs after the Hub restarts and checks both are still there.
import { chromium } from '~/conexus-os/node_modules/@playwright/test/index.mjs'

const base = 'https://hub.conexus.localhost:3443'
const statePath = process.env.CONEXUS_STATE ?? '~/.local/share/conexus/pilot/slice7/operator-storage-state.json'
const projectId = process.argv[2]
const pass = process.argv[3] ?? '1'
const stamp = () => new Date().toISOString().slice(11, 19)
let failures = 0
const check = (ok, claim) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${claim}`)
  if (!ok) failures += 1
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ storageState: statePath, viewport: { width: 1480, height: 1000 } })
const page = await context.newPage()

const session = () => page.evaluate(async (id) => {
  const response = await fetch(`/api/control/projects/${id}/builder-session`, { credentials: 'same-origin' })
  return response.ok ? response.json() : { httpStatus: response.status }
}, projectId)

const pills = () => page.locator('.builder-conversations-list button')
const titles = async () => pills().allInnerTexts()
const selectedTitle = async () => {
  const active = page.locator('.builder-conversations-list button[aria-pressed="true"]')
  return await active.count() === 1 ? (await active.innerText()).trim() : `(${await active.count()} selected)`
}
const transcript = async () => (await page.locator('.builder-conversation').innerText().catch(() => '')).replace(/\s+/g, ' ')
const selectByTitle = async (title) => {
  await pills().filter({ hasText: title }).first().click()
  await page.waitForTimeout(1_200)
}

try {
  await page.goto(`${base}/projects/${projectId}/build`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Conversas' }).waitFor({ timeout: 120_000 })
  const before = await session()
  console.log(`${stamp()} pass=${pass} source=${before.preview?.workingSourceRevision} lastGood=${before.preview?.lastGoodSourceRevision}`)
  check(before.threadId === undefined, 'the builder-session no longer projects a single thread id')
  check(before.modelChoices === undefined, 'the builder-session no longer projects Conexus model offers')

  if (pass === '1') {
    const started = await titles()
    console.log(`${stamp()} conversations on arrival: ${JSON.stringify(started)}`)
    check(started.length >= 1, `opening the Project shows at least one conversation (got ${started.length})`)

    await page.getByRole('button', { name: 'Nova conversa' }).click()
    await page.waitForTimeout(1_500)
    await page.getByRole('button', { name: 'Renomear' }).click()
    await page.getByLabel('Novo nome da conversa').fill('Conversa A')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await page.waitForTimeout(1_500)
    check((await titles()).includes('Conversa A'), `renaming the new conversation shows its name (got ${JSON.stringify(await titles())})`)

    await page.getByRole('button', { name: 'Nova conversa' }).click()
    await page.waitForTimeout(1_500)
    await page.getByRole('button', { name: 'Renomear' }).click()
    await page.getByLabel('Novo nome da conversa').fill('Conversa B')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await page.waitForTimeout(1_500)

    const both = await titles()
    console.log(`${stamp()} conversations now: ${JSON.stringify(both)}`)
    check(both.includes('Conversa A') && both.includes('Conversa B'), 'the Project holds both conversations at once')
    check(both.indexOf('Conversa B') < both.indexOf('Conversa A'), 'the list is newest first')

    await selectByTitle('Conversa A')
    check(await selectedTitle() === 'Conversa A', `switching selects the conversation that was clicked (got ${await selectedTitle()})`)
    const afterSwitch = await session()
    check(afterSwitch.preview?.workingSourceRevision === before.preview?.workingSourceRevision,
      'switching conversations leaves the Project on the same source')
    check(afterSwitch.preview?.lastGoodSourceRevision === before.preview?.lastGoodSourceRevision,
      "switching conversations leaves the Project's last good Preview alone")
  } else {
    const found = await titles()
    console.log(`${stamp()} conversations after the restart: ${JSON.stringify(found)}`)
    check(found.includes('Conversa A') && found.includes('Conversa B'),
      `both conversations survived the Hub restart (got ${JSON.stringify(found)})`)
    await selectByTitle('Conversa A')
    const a = await transcript()
    await selectByTitle('Conversa B')
    const b = await transcript()
    console.log(`${stamp()} A="${a.slice(0, 160)}"`)
    console.log(`${stamp()} B="${b.slice(0, 160)}"`)
    check(a !== b, 'each conversation shows its own messages, not the other one\'s')
  }
} finally {
  await context.close()
  await browser.close()
}
console.log(failures === 0 ? 'PROOF PASSED' : `PROOF FAILED with ${failures} false claims`)
process.exit(failures === 0 ? 0 : 1)
