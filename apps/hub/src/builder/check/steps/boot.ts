import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { CheckContext, Place } from '../context.js'
import { failed, OK, type Outcome } from '../outcome.js'
import { outputProblem } from '../problems.js'
import { runWorker } from '../worker.js'
import { type BootProblem, connectPage } from './boot-cdp.js'
import { serveOutput } from './boot-server.js'

const BROWSER = 'chromium'
const BROWSER_START_MS = 15_000
const RENDER_SETTLE_MS = 300
const RENDER_CEILING_MS = 10_000
const ROOT_CHILDREN = '(() => { const element = document.getElementById("root"); return element ? element.children.length : -1 })()'
const evaluationSchema = z.object({ result: z.object({ value: z.unknown().optional() }).optional() })
const screenshotSchema = z.object({ data: z.string() })
const targetsSchema = z.array(z.object({ type: z.string(), webSocketDebuggerUrl: z.string().optional() }))

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const unavailable = (reason: string): Outcome => ({ kind: 'skipped', code: 'BOOT_BROWSER_UNAVAILABLE', reason })

/** Starts the browser headless with its background Google services off and waits for its DevTools page. */
const launchBrowser = async (profile: string): Promise<Readonly<{ pid: number | undefined; webSocketUrl: string | null; reason: string }>> => {
  let spawnError: Error | null = null
  const child = spawn(BROWSER, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--disable-default-apps',
    '--disable-features=Translate,OptimizationHints,MediaRouter,AutofillServerCommunication', `--user-data-dir=${profile}`, 'about:blank',
  ], { detached: true, stdio: 'ignore' })
  child.once('error', (error) => { spawnError = error })
  let lastError: unknown
  const deadline = performance.now() + BROWSER_START_MS
  while (!spawnError && performance.now() < deadline) {
    try {
      const port = Number.parseInt(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] ?? '', 10)
      const targets = targetsSchema.parse(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json())
      const webSocketUrl = targets.find((target) => target.type === 'page')?.webSocketDebuggerUrl
      if (webSocketUrl) return { pid: child.pid, webSocketUrl, reason: '' }
    } catch (error) { lastError = error }
    await wait(100)
  }
  return { pid: child.pid, webSocketUrl: null, reason: `the browser did not start: ${String(spawnError ?? lastError ?? 'no DevTools page')}` }
}

/** Waits for the first child of #root: the load event does not wait for a module script's top level await or its fetches. */
const rootChildren = async (page: Awaited<ReturnType<typeof connectPage>>, problems: readonly BootProblem[]): Promise<number> => {
  const settledAt = Date.now() + RENDER_SETTLE_MS
  const ceilingAt = Date.now() + RENDER_CEILING_MS
  for (;;) {
    const evaluated = evaluationSchema.parse(await page.send('Runtime.evaluate', { expression: ROOT_CHILDREN, returnByValue: true }))
    const count = typeof evaluated.result?.value === 'number' ? evaluated.result.value : -1
    if ((count > 0 && Date.now() >= settledAt) || problems.some((problem) => problem.code === 'BOOT_UNCAUGHT_ERROR') || Date.now() >= ceilingAt) return count
    await wait(50)
  }
}

const bootCode = (problems: readonly BootProblem[]): BootProblem['code'] =>
  problems.find((problem) => problem.code === 'BOOT_UNCAUGHT_ERROR')?.code ?? problems.find((problem) => problem.code === 'BOOT_NO_ROOT_CHILD')?.code ?? problems[0]?.code ?? 'BOOT_REQUEST_FAILED'

/** The boot step inside its own process: the built page, opened in headless Chromium under the Preview's policy. */
export const bootWorker = async ({ out }: Place): Promise<Outcome> => {
  const problems: BootProblem[] = []
  const server = serveOutput(out)
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('the boot server has no address')
  const origin = `http://127.0.0.1:${address.port}`
  const profile = mkdtempSync(join(tmpdir(), 'conexus-boot-'))
  let browserPid: number | undefined
  let page: Awaited<ReturnType<typeof connectPage>> | null = null
  try {
    const browser = await launchBrowser(profile)
    browserPid = browser.pid
    if (!browser.webSocketUrl) return unavailable(browser.reason)
    try {
      page = await connectPage(browser.webSocketUrl, origin, problems)
    } catch {
      return unavailable('the browser refused its DevTools connection')
    }
    for (const domain of ['Runtime', 'Page', 'Network', 'Audits']) await page.send(`${domain}.enable`)
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
    await page.send('Page.navigate', { url: `${origin}/` })
    await page.loaded
    const children = await rootChildren(page, problems)
    if (children <= 0) problems.push({ code: 'BOOT_NO_ROOT_CHILD', message: 'The page loaded but #root has no children: nothing was rendered.' })
    // Best effort: the Projects list shows this picture; failing to take it never fails the check.
    let thumbnailBase64: string | undefined
    if (children > 0) {
      try {
        await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 0.5, mobile: false })
        thumbnailBase64 = screenshotSchema.parse(await page.send('Page.captureScreenshot', { format: 'png' })).data
      } catch { /* the picture is optional */ }
    }
    const picture = thumbnailBase64 ? { thumbnailBase64 } : {}
    return problems.length > 0 ? { ...failed(bootCode(problems), problems), ...picture } : { ...OK, ...picture }
  } finally {
    page?.close()
    if (browserPid !== undefined) { try { process.kill(-browserPid, 'SIGKILL') } catch { /* already stopped */ } }
    server.closeAllConnections()
    server.close()
    rmSync(profile, { recursive: true, force: true })
  }
}

export const boot = (ctx: CheckContext): Promise<Outcome> =>
  runWorker(ctx, 'boot', ctx.limits.boot, { PATH: ctx.path }, (result) => unavailable(outputProblem(ctx.root, result.code, result.stderr || result.stdout).message))
