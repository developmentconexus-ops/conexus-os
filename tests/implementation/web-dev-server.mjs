import { resolve } from 'node:path'
import { after, before } from 'node:test'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import { BROWSER_CLASSES } from '../../scripts/conexus-verify.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')

// The verify graph names the class of the step it runs. A test that reaches a real browser from a step
// of another class fails here, where it launches, not minutes later in a group without Chromium.
const launchReal = (options) => {
  const stepClass = process.env.CONEXUS_VERIFY_STEP_CLASS
  if (stepClass && !BROWSER_CLASSES.has(stepClass)) throw new Error(`BROWSER_IN_NON_BROWSER_STEP:${stepClass}`)
  return chromium.launch(options)
}

const real = { createServer, launch: launchReal }

// The cleanup is registered as soon as Vite has created the server, before it listens: a listen
// that rejects must still close what Vite already opened.
const listenWebServer = async (onCleanup, options, deps) => {
  const server = await deps.createServer({
    configFile: resolve(repositoryRoot, 'apps/web/vite.config.mjs'),
    root: resolve(repositoryRoot, 'apps/web'),
    ...options,
    server: { host: '127.0.0.1', port: 0 },
  })
  onCleanup(() => server.close())
  await server.listen()
  return `http://127.0.0.1:${server.httpServer.address().port}`
}

// Each browser suite serves apps/web on a port the OS picks. A fixed port inside Linux's ephemeral
// range can be held by any outgoing connection at that moment; the listen then failed, and a server
// whose close was not registered yet kept the test process alive until the runner killed it.
export const startWebServer = (t, options = {}, deps = real) => listenWebServer((close) => t.after(close), options, deps)

// One Vite server and one Chromium, closed by close() and also closed here when a later step fails.
export const launchWebBrowser = async (serverOptions = {}, deps = real) => {
  const cleanups = []
  const close = async () => {
    for (const cleanup of cleanups.reverse()) await cleanup()
  }
  try {
    const origin = await listenWebServer((cleanup) => cleanups.push(cleanup), serverOptions, deps)
    const browser = await deps.launch({ headless: true })
    cleanups.push(() => browser.close())
    return { origin, browser, close }
  } catch (error) {
    await close()
    throw error
  }
}

// One Vite server and one Chromium per test file, closed by the file's after hook even when a test
// fails. Every test still gets its own browser context, so cookies, storage and routes never leak
// from one test into the next. Call it once at the top level of the file.
export const shareWebBrowser = (serverOptions = {}) => {
  let web = null
  before(async () => {
    web = await launchWebBrowser(serverOptions)
  })
  after(async () => {
    await web?.close()
  })
  return {
    openPage: async (t, contextOptions = {}) => {
      const context = await web.browser.newContext(contextOptions)
      t.after(() => context.close())
      return { page: await context.newPage(), origin: web.origin, context }
    },
  }
}
