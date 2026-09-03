import { appendFileSync } from 'node:fs'
import { createOAuthTokenStore } from './oauth-token-store.mjs'

const [filePath, counterPath] = process.argv.slice(2)
const store = createOAuthTokenStore({
  filePath,
  refresh: async () => {
    appendFileSync(counterPath, 'refresh\n', { mode: 0o600 })
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
    return { access: 'access-process', refresh: 'refresh-process', expiresAt: Date.now() + 60000 }
  },
})
process.stdout.write(`${await store.getAccessToken()}\n`)
