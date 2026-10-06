import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { BUILDER_TEMPLATE_COMPILER_FILES } from '../../scripts/builder-e2b-template.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const template = resolve(repositoryRoot, 'apps/hub/compiler-template')
const cache = resolve(repositoryRoot, 'node_modules/.cache/compiler-root')

/**
 * A local copy of the E2B image's compiler root: the template's files, the lockfile's install as
 * `full/node_modules` and `node_modules` as the allowlist's view of it. Installed once per template
 * content and shared by every suite that needs a real compiler.
 */
export const ensureCompilerRoot = async () => {
  const hash = createHash('sha256')
  for (const name of BUILDER_TEMPLATE_COMPILER_FILES) hash.update(readFileSync(resolve(template, name)))
  const key = hash.digest('hex').slice(0, 16)
  const ready = resolve(cache, key)
  if (existsSync(resolve(ready, 'node_modules'))) return ready
  mkdirSync(cache, { recursive: true })
  const lock = resolve(cache, `${key}.lock`)
  for (let waited = 0; ; waited += 500) {
    try {
      mkdirSync(lock)
      break
    } catch {
      if (existsSync(resolve(ready, 'node_modules'))) return ready
      if (waited > 10 * 60_000) throw new Error('COMPILER_ROOT_LOCK_TIMEOUT')
      await sleep(500)
    }
  }
  try {
    if (existsSync(resolve(ready, 'node_modules'))) return ready
    const partial = resolve(cache, `${key}.partial`)
    rmSync(partial, { recursive: true, force: true })
    mkdirSync(partial)
    for (const name of BUILDER_TEMPLATE_COMPILER_FILES) cpSync(resolve(template, name), resolve(partial, name))
    // Never a synchronous child: the live suite calls this inside the Hub's process, whose event loop
    // must keep answering requests and settling database connects while the install runs.
    const run = (command, args) => new Promise((settle, fail) => {
      const child = spawn(command, args, { cwd: partial, stdio: ['ignore', 'pipe', 'pipe'] })
      let output = ''
      child.stdout.on('data', (piece) => { output += piece })
      child.stderr.on('data', (piece) => { output += piece })
      child.once('error', fail)
      child.once('close', (code) => (code === 0 ? settle() : fail(new Error(`COMPILER_ROOT_INSTALL_FAILED ${command} ${args.join(' ')}\n${output}`))))
    })
    await run('npm', ['ci', '--no-audit', '--no-fund'])
    mkdirSync(resolve(partial, 'full'))
    renameSync(resolve(partial, 'node_modules'), resolve(partial, 'full/node_modules'))
    await run(process.execPath, ['allowlist.mjs', 'link', '.'])
    renameSync(partial, ready)
    return ready
  } finally {
    rmSync(lock, { recursive: true, force: true })
  }
}
