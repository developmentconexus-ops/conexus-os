import { resolve } from 'node:path'
import { createServer } from 'vite'

const repositoryRoot = resolve(import.meta.dirname, '../..')

// Each browser suite serves apps/web on a port the OS picks. A fixed port inside Linux's ephemeral
// range can be held by any outgoing connection at that moment; the listen then failed, and a server
// whose close was not registered yet kept the test process alive until the runner killed it.
export const startWebServer = async (t, options = {}) => {
  const server = await createServer({
    configFile: resolve(repositoryRoot, 'apps/web/vite.config.mjs'),
    root: resolve(repositoryRoot, 'apps/web'),
    ...options,
    server: { host: '127.0.0.1', port: 0 },
  })
  t.after(() => server.close())
  await server.listen()
  return `http://127.0.0.1:${server.httpServer.address().port}`
}
