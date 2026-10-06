// Renames the Hub hosting module from the acronym `mar` to `hosting`.
// Follows scripts/codemods/operation-code-to-name.mjs.
// Renames directory apps/hub/src/mar to apps/hub/src/hosting if it exists,
// rewrites module specifiers, types, factories, invariants, and whitelisted
// local identifiers and docs references across tracked files. Rerunning changes nothing.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const tracked = (...paths) =>
  execFileSync('git', ['ls-files', '-z', '--', ...paths], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)

// 1. Move apps/hub/src/mar to apps/hub/src/hosting if mar exists and hosting does not
const marDir = join(root, 'apps/hub/src/mar')
const hostingDir = join(root, 'apps/hub/src/hosting')

if (existsSync(marDir) && !existsSync(hostingDir)) {
  try {
    execFileSync('git', ['mv', 'apps/hub/src/mar', 'apps/hub/src/hosting'], { cwd: root, stdio: 'inherit' })
    console.log('git mv apps/hub/src/mar apps/hub/src/hosting')
  } catch (_e) {
    renameSync(marDir, hostingDir)
    console.log('fs rename apps/hub/src/mar -> apps/hub/src/hosting')
  }
}

// 2. Replacements across tracked files
const skipped = /^(apps\/hub\/migrations\/|packages\/contract\/dist\/|contracts\/api\/product\/openapi\.json$|scripts\/codemods\/|scripts\/builder-eval\/|tests\/implementation\/hub-baseline\.postgres\.test\.mjs$)/
const extensions = /\.(ts|tsx|mjs|js|json|md|yaml|yml|sh)$/

// Specific identifier replacement rules for bounded `\bmar\b`
const marIdentifierWhitelistedFiles = new Set([
  'apps/hub/src/hub.ts',
  'apps/hub/src/hosting/module.ts',
  'apps/hub/src/mar/module.ts',
  'tests/implementation/access/access-rule.test.mjs',
  'tests/implementation/access/walk-listeners.mjs',
  'tests/implementation/application-host-registry.postgres.test.mjs',
  'tests/implementation/application-host.test.mjs',
  'tests/implementation/application-invoker.test.mjs',
  'tests/implementation/preview-application-api.test.mjs',
  'tests/implementation/telemetry-logs.test.mjs',
  'docs/reference/architecture.md',
])

let changed = 0

for (const file of tracked(
  'packages',
  'apps',
  'scripts',
  'tests',
  'contracts',
  'docs/specs/0015-checked-boundaries',
  'docs/reference',
  'docs/development',
)) {
  if (skipped.test(file) || !extensions.test(file)) continue
  const fullPath = join(root, file)
  if (!existsSync(fullPath)) continue
  let text = readFileSync(fullPath, 'utf8')
  const before = text

  // Universal module / symbol replacements
  text = text.replaceAll('apps/hub/src/mar/', 'apps/hub/src/hosting/')
  text = text.replaceAll('apps/hub/src/mar/**', 'apps/hub/src/hosting/**')
  text = text.replaceAll('apps/hub/src/mar', 'apps/hub/src/hosting')
  text = text.replaceAll('/mar/module.js', '/hosting/module.js')
  text = text.replaceAll('./mar/module.js', './hosting/module.js')
  text = text.replaceAll('../mar/module.js', '../hosting/module.js')
  text = text.replaceAll('mar/module.js', 'hosting/module.js')
  text = text.replaceAll('mar/module.ts', 'hosting/module.ts')
  text = text.replaceAll('mar/application-host-routes.js', 'hosting/application-host-routes.js')
  text = text.replaceAll('mar/application-invoker.js', 'hosting/application-invoker.js')
  text = text.replaceAll('mar/preview-routes.js', 'hosting/preview-routes.js')
  text = text.replaceAll('mar/application-host-routes.ts', 'hosting/application-host-routes.ts')
  text = text.replaceAll('mar/application-invoker.ts', 'hosting/application-invoker.ts')
  text = text.replaceAll('mar/preview-routes.ts', 'hosting/preview-routes.ts')

  text = text.replaceAll('createMarModule', 'createHostingModule')
  text = text.replaceAll('MarModule', 'HostingModule')
  text = text.replaceAll('MarRegistry', 'HostingRegistry')
  text = text.replaceAll('MAR_CONFIG_REFUSED', 'HOSTING_CONFIG_REFUSED')
  text = text.replaceAll('MAR_REGISTRY_READER_UNAVAILABLE', 'HOSTING_REGISTRY_READER_UNAVAILABLE')

  // Comments / docs mentioning MAR
  text = text.replaceAll('The MAR module bounds', 'The hosting module bounds')
  text = text.replaceAll('handed to MAR,', 'handed to hosting,')
  text = text.replaceAll('the MAR owner', 'the hosting owner')
  text = text.replaceAll('MAR and `hub.ts`', 'Hosting and `hub.ts`')
  text = text.replaceAll("MAR's failure codes", "hosting's failure codes")
  text = text.replaceAll('and MAR `readPreviewFile`', 'and hosting `readPreviewFile`')
  text = text.replaceAll('Project and MAR copies', 'Project and hosting copies')
  text = text.replaceAll('the MAR catch around', 'the hosting catch around')
  text = text.replaceAll('and goes to MAR;', 'and goes to hosting;')

  // Whitelisted identifier `mar` -> `hosting`
  if (marIdentifierWhitelistedFiles.has(file)) {
    if (file === 'docs/reference/architecture.md') {
      text = text.replace(/`mar`/g, '`hosting`')
    } else {
      text = text.replace(/\bmar\b/g, 'hosting')
    }
  }

  if (text !== before) {
    writeFileSync(fullPath, text)
    changed += 1
    console.log(file)
  }
}

console.log(`${changed} files rewritten`)
