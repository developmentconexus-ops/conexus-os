import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const repositoryRoot = resolve(import.meta.dirname, '../..')

// Every suite that imports the Hub reads one compiled copy. `npm run verify` compiles it once, in
// its hub typecheck step, and names it in CONEXUS_HUB_BUILD; a suite run on its own compiles its
// own copy on first use. Suites only read it, so any number of them can share it at once.
const compileOwnCopy = () => {
  const build = mkdtempSync(resolve(repositoryRoot, 'apps/hub/test-build-'))
  process.once('exit', () => rmSync(build, { recursive: true, force: true }))
  const compiled = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
    '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
    '--noEmit', 'false', '--outDir', build,
  ], { encoding: 'utf8' })
  if (compiled.status !== 0) throw new Error(`HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
  return build
}

let directory = null

export const hubBuildDirectory = () => {
  if (directory) return directory
  const shared = process.env.CONEXUS_HUB_BUILD
  if (shared && !existsSync(resolve(shared, 'server.js'))) throw new Error(`HUB_BUILD_MISSING:${shared}`)
  directory = shared || compileOwnCopy()
  return directory
}

export const hubModuleUrl = (path) => pathToFileURL(resolve(hubBuildDirectory(), path)).href
