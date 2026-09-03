import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { createAuthorizationRequest, exchangeAuthorizationCode, parseAuthorizationResult } from './anthropic-oauth.mjs'
import { createOAuthTokenStore } from './oauth-token-store.mjs'

const request = await createAuthorizationRequest()
stdout.write(`\nAbra esta URL no navegador e aprove o acesso:\n\n${request.url}\n\n`)
const prompt = createInterface({ input: stdin, output: stdout })
try {
  const pasted = (await prompt.question('Cole o resultado code#state: ')).trim()
  const code = parseAuthorizationResult(pasted, request.state)
  const tokens = await exchangeAuthorizationCode({ code, verifier: request.verifier })
  const store = createOAuthTokenStore()
  store.write(tokens)
  stdout.write(`\nOAuth Anthropic salvo com custódia 0600 em ${store.filePath}\n`)
} catch (error) {
  process.stderr.write(`\nLogin OAuth falhou: ${error instanceof Error ? error.message : 'ANTHROPIC_OAUTH_FAILURE'}\n`)
  process.exitCode = 1
} finally {
  prompt.close()
}
