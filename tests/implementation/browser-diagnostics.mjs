import { randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const recordings = new WeakMap()

export async function recordBrowserContext(context) {
  const root = process.env.CONEXUS_VERIFY_EVIDENCE
  if (!root || recordings.has(context)) return
  const directory = join(root, 'browser', randomUUID())
  mkdirSync(directory, { recursive: true })
  const log = text => appendFileSync(join(directory, 'browser.log'), `${text}\n`)
  function recordPage(page) {
    page.on('console', message => log(`console.${message.type()} ${message.text()}`))
    page.on('pageerror', error => log(`pageerror ${error.message}`))
    page.on('requestfailed', request => log(`requestfailed ${request.method()} ${new URL(request.url()).pathname} ${request.failure()?.errorText ?? ''}`))
    page.on('response', response => log(`response ${response.status()} ${new URL(response.url()).pathname}`))
  }
  for (const page of context.pages()) recordPage(page)
  context.on('page', recordPage)
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false })
  recordings.set(context, directory)
}

export async function saveBrowserContext(context) {
  const directory = recordings.get(context)
  if (!directory) return
  recordings.delete(context)
  try {
    for (const [index, page] of context.pages().entries()) {
      if (!page.isClosed()) await page.screenshot({ path: join(directory, `page-${index}.png`) })
    }
    await context.tracing.stop({ path: join(directory, 'trace.zip') })
  } catch (error) {
    appendFileSync(join(directory, 'browser.log'), `diagnostic capture failed: ${error.message}\n`)
  }
}

export async function saveBrowserDiagnostics(browser) {
  for (const context of browser.contexts()) await saveBrowserContext(context)
}
