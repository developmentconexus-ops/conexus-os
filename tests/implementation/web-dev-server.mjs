import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const repositoryRoot = resolve(import.meta.dirname, '../..')

// Vite writes its optimized dependencies to a cache directory and rewrites it when it finds a new
// dependency. Browser suites run as separate processes at the same time; a server whose optimized
// dependencies another process rewrote answers 504 "Outdated Optimize Dep" and the page stays blank.
// Each process gets a cache of its own, removed on exit.
const viteCacheDir = resolve(repositoryRoot, `node_modules/.cache/vite-web-${process.pid}`)
process.once('exit', () => rmSync(viteCacheDir, { recursive: true, force: true }))

// Each browser suite serves apps/web on a port the OS picks. A fixed port inside Linux's ephemeral
// range can be held by any outgoing connection at that moment; the listen then failed, and a server
// whose close was not registered yet kept the test process alive until the runner killed it.
export const startWebServer = async (t, options = {}) => {
  const server = await createServer({
    configFile: resolve(repositoryRoot, 'apps/web/vite.config.mjs'),
    root: resolve(repositoryRoot, 'apps/web'),
    cacheDir: viteCacheDir,
    logLevel: 'info',
    ...options,
    server: { host: '127.0.0.1', port: 0 },
  })
  t.after(() => server.close())
  await server.listen()
  return `http://127.0.0.1:${server.httpServer.address().port}`
}
