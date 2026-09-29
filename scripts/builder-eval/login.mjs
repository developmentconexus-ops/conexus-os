#!/usr/bin/env node
// Signs the Claude subscription in to Mastra Code's own credential store (`auth.json` under
// MASTRA_APP_DATA_DIR or the default app data dir), where the scripted person's claude-max provider
// reads it. Two steps, because the person authorizes in their own browser:
//   node scripts/builder-eval/login.mjs start            prints the address to open
//   node scripts/builder-eval/login.mjs complete <code>  stores the account
// The PKCE verifier waits between the steps in a file of mode 600 outside the repository. Nothing but
// the address is ever printed.
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { completeAnthropicLogin, startAnthropicLogin } from '@mastra/code-sdk/auth/providers/anthropic'
import { AuthStorage } from '@mastra/code-sdk/auth/storage'

const VERIFIER_FILE = join(tmpdir(), `conexus-eval-anthropic-login-${process.getuid?.() ?? 'user'}.json`)
const realAuthorization = Object.freeze({ start: startAnthropicLogin, complete: completeAnthropicLogin })

/** Starts a sign-in: keeps the verifier private and returns the address the person opens. */
export async function startLogin({ authorization = realAuthorization, verifierFile = VERIFIER_FILE } = {}) {
  const { url, verifier } = await authorization.start()
  writeFileSync(verifierFile, JSON.stringify({ verifier }), { mode: 0o600 })
  chmodSync(verifierFile, 0o600)
  return url
}

/** Finishes the sign-in with the code Anthropic's page showed and stores the account through AuthStorage. */
export async function completeLogin(code, { authorization = realAuthorization, verifierFile = VERIFIER_FILE, storage = new AuthStorage() } = {}) {
  if (!existsSync(verifierFile)) throw new Error('builder-eval login: no sign-in is open; run "login.mjs start" first')
  const { verifier } = JSON.parse(readFileSync(verifierFile, 'utf8'))
  await storage.addAccount('anthropic', await authorization.complete(code, verifier))
  rmSync(verifierFile)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, code] = process.argv.slice(2)
  try {
    if (command === 'start') console.log(await startLogin())
    else if (command === 'complete' && code) {
      await completeLogin(code)
      console.log('signed in')
    } else throw new Error('usage: login.mjs start | login.mjs complete <code>')
  } catch (error) {
    // Anthropic's error text can echo the request; only our own messages are safe to print.
    console.error(error instanceof Error && error.message.startsWith('builder-eval login') || error.message?.startsWith('usage') ? error.message : 'builder-eval login: the sign-in failed; run "login.mjs start" again')
    process.exitCode = 1
  }
}
