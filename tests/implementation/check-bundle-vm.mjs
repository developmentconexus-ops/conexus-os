import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { hubBuildDirectory } from './hub-build.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const bundleBytes = readFileSync(join(hubBuildDirectory(), 'app-check/main.mjs'))
const BUNDLE_SHA256 = createHash('sha256').update(bundleBytes).digest('hex')

/**
 * Lays the Hub's built bundle out the way the VM has it, `<tools>/check/<sha256>/main.mjs` beside
 * `<tools>/compiler`, with this repository's vite standing in for the template's copy of the same
 * version. Returns the bundle's path.
 */
export const placeBundle = (tools) => {
  mkdirSync(join(tools, 'compiler'), { recursive: true })
  symlinkSync(join(repositoryRoot, 'node_modules'), join(tools, 'compiler/node_modules'))
  const main = join(tools, 'check', BUNDLE_SHA256, 'main.mjs')
  mkdirSync(dirname(main), { recursive: true })
  writeFileSync(main, bundleBytes)
  return main
}

/** The server half of `root`, built into `out` by the bundle's `server` command, as the Builder's operation tool runs it. */
export const serverCommand = (main, root, out) => spawnSync(process.execPath, [main, 'server', '--root', root, '--out', out], { encoding: 'utf8', timeout: 120_000 })
