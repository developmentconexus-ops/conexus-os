import { resolve } from 'node:path'
import { after, before } from 'node:test'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const repositoryRoot = resolve(import.meta.dirname, '../..')

const createWebServer = async (options = {}) => {
  const server = await createServer({
    configFile: resolve(repositoryRoot, 'apps/web/vite.config.mjs'),
    root: resolve(repositoryRoot, 'apps/web'),
    ...options,
    server: { host: '127.0.0.1', port: 0 },
  })
  await server.listen()
  return { server, origin: `http://127.0.0.1:${server.httpServer.address().port}` }
}

// Each browser suite serves apps/web on a port the OS picks. A fixed port inside Linux's ephemeral
// range can be held by any outgoing connection at that moment; the listen then failed, and a server
// whose close was not registered yet kept the test process alive until the runner killed it.
export const startWebServer = async (t, options = {}) => {
  const { server, origin } = await createWebServer(options)
  t.after(() => server.close())
  return origin
}

// One Vite server and one Chromium per test file, closed by the file's after hook even when a test
// fails. Every test still gets its own browser context, so cookies, storage and routes never leak
// from one test into the next. Call it once at the top level of the file.
export const useWebBrowser = (serverOptions = {}) => {
  let web = null
  let browser = null
  before(async () => {
    web = await createWebServer(serverOptions)
    browser = await chromium.launch({ headless: true })
  })
  after(async () => {
    await browser?.close()
    await web?.server.close()
  })
  return {
    openPage: async (t, contextOptions = {}) => {
      const context = await browser.newContext(contextOptions)
      t.after(() => context.close())
      return { page: await context.newPage(), origin: web.origin, context }
    },
  }
}
