import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const NETWORK_ERROR = /\b(ETIMEDOUT|ECONNRESET|EAI_AGAIN)\b/

export const isNetworkError = text => NETWORK_ERROR.test(text)

// Retries only a failure whose output names a network error. Any other failure, such as a lockfile
// mismatch, is real and ends the install at once.
export function installWithRetry({ run, sleep, attempts = 3, backoffMs = 5000, log = () => {} }) {
  for (let attempt = 1; ; attempt += 1) {
    const { status, output } = run()
    if (status === 0) return 0
    if (attempt >= attempts || !isNetworkError(output)) return status ?? 1
    const wait = backoffMs * attempt
    log(`npm ci hit a network error (attempt ${attempt} of ${attempts}); retrying in ${wait / 1000} s`)
    sleep(wait)
  }
}

function runNpmCi() {
  const result = spawnSync('npm', ['ci'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` }
}

const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = installWithRetry({ run: runNpmCi, sleep: sleepSync, log: console.error })
}
