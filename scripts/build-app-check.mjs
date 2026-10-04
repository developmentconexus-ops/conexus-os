import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { build } from 'rolldown'

const repositoryRoot = resolve(import.meta.dirname, '..')
const SANKHYA_HELPER = join(repositoryRoot, 'apps/hub/src/builder/handler-kit/sankhya.ts')

/**
 * Bundles the compiled check (`<hub build>/builder/check/main.js`) into the one file the Hub sends to
 * each VM, `<hub build>/app-check/main.mjs`. The Sankhya helper's text goes in as a constant, so the
 * bundle is the whole check and its sha256 is the check's identity.
 */
export const buildAppCheck = async (hubBuild) => {
  const output = join(resolve(hubBuild), 'app-check/main.mjs')
  mkdirSync(join(resolve(hubBuild), 'app-check'), { recursive: true })
  await build({
    input: join(resolve(hubBuild), 'builder/check/main.js'),
    platform: 'node',
    logLevel: 'warn',
    // An import the bundle cannot resolve would be left for the VM to fail on.
    onLog: (_level, log) => { if (log.code === 'UNRESOLVED_IMPORT') throw new Error(log.message) },
    resolve: { modules: [join(repositoryRoot, 'node_modules')] },
    transform: { define: { SANKHYA_HELPER_SOURCE: JSON.stringify(readFileSync(SANKHYA_HELPER, 'utf8')) } },
    output: { file: output, format: 'esm', minify: false },
    experimental: { attachDebugInfo: 'none' },
  })
  return output
}

if (import.meta.filename === process.argv[1]) {
  const hubBuild = process.argv[2]
  if (!hubBuild) {
    process.stderr.write('usage: node scripts/build-app-check.mjs <compiled hub directory>\n')
    process.exit(2)
  }
  await buildAppCheck(hubBuild)
}
