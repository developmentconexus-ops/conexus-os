import assert from 'node:assert/strict'
import { existsSync, globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, relative, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const HUB_BUILD_HELPER = 'tests/implementation/hub-build.mjs'
// The checks job builds the Hub only when a change touches more than documentation, so a test the
// documentation path runs must not read the compiled Hub or the build directory itself.
// The guard follows quoted relative imports only, and looks for the build-location names in the test
// file itself, not along its chain. Left out: an import that is not a quoted relative string, a helper
// that names the build location, a computed path or a spawned command. Reading text, it also raises a
// false alarm on a commented-out import or a test that only names the variable.
const BUILD_LOCATION = /CONEXUS_HUB_BUILD|conexus-hub-build|node_modules\/\.cache/
const RELATIVE_IMPORT = /\b(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g

// The files `npm run verify:docs` hands to the test runner, from the glob in package.json.
const documentationTests = (directory) => {
  const script = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8')).scripts['test:repository']
  const globs = [...script.matchAll(/'([^']+\.test\.mjs)'|(tests\/\S+\.test\.mjs)/g)].map(([, quoted, bare]) => quoted ?? bare)
  return globs.flatMap((glob) => globSync(glob, { cwd: directory })).sort()
}

// The first import chain from `file` to the Hub build helper, or the build location it names.
const needsBuild = (directory, file, seen = new Set()) => {
  if (seen.has(file)) return null
  seen.add(file)
  if (file === HUB_BUILD_HELPER) return [file]
  const text = readFileSync(resolve(directory, file), 'utf8')
  for (const [, specifier] of text.matchAll(RELATIVE_IMPORT)) {
    const target = relative(directory, resolve(directory, dirname(file), specifier))
    if (!existsSync(resolve(directory, target))) continue
    const chain = needsBuild(directory, target, seen)
    if (chain) return [file, ...chain]
  }
  return null
}

// This file holds the patterns and the fixtures it looks for, so it does not read itself.
const offenders = (directory, own = relative(root, import.meta.filename)) =>
  documentationTests(directory).filter((file) => file !== own).flatMap((file) => {
    const chain = needsBuild(directory, file)
    if (chain) return [`${chain.join(' -> ')} reads the compiled Hub`]
    return BUILD_LOCATION.test(readFileSync(resolve(directory, file), 'utf8')) ? [`${file} names the build location`] : []
  })

const fixture = (context, files) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'conexus-docs-only-'))
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  writeFileSync(resolve(directory, 'package.json'), JSON.stringify({ scripts: { 'test:repository': "bash scripts/test-with-ledger.sh 'tests/repository/!(*.browser|*.postgres).test.mjs' tests/extra/bare.test.mjs" } }))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(resolve(directory, path)), { recursive: true })
    writeFileSync(resolve(directory, path), text)
  }
  return directory
}

test('no test the documentation path runs imports the Hub build helper by a quoted relative path or names the build directory', () => {
  assert.ok(documentationTests(root).length > 0)
  assert.deepEqual(offenders(root), [])
})

test('a test that reaches the Hub build helper, directly or through a helper, or names the build directory, is found', (context) => {
  const directory = fixture(context, {
    [HUB_BUILD_HELPER]: 'export const hubModuleUrl = () => ""\n',
    'tests/implementation/uses-hub.mjs': "import { hubModuleUrl } from './hub-build.mjs'\nexport const url = hubModuleUrl\n",
    'tests/repository/direct.test.mjs': "import { hubModuleUrl } from '../implementation/hub-build.mjs'\n",
    'tests/repository/indirect.test.mjs': "const { url } = await import('../implementation/uses-hub.mjs')\n",
    'tests/repository/named.test.mjs': "const dir = process.env.CONEXUS_HUB_BUILD\n",
    'tests/extra/bare.test.mjs': "import { hubModuleUrl } from '../implementation/hub-build.mjs'\n",
    'tests/repository/clean.test.mjs': "import assert from 'node:assert/strict'\nimport { url } from '../implementation/clean-helper.mjs'\n",
    'tests/implementation/clean-helper.mjs': 'export const url = 1\n',
    'tests/repository/browser.browser.test.mjs': "import { hubModuleUrl } from '../implementation/hub-build.mjs'\n",
  })
  assert.deepEqual(offenders(directory), [
    'tests/extra/bare.test.mjs -> tests/implementation/hub-build.mjs reads the compiled Hub',
    'tests/repository/direct.test.mjs -> tests/implementation/hub-build.mjs reads the compiled Hub',
    'tests/repository/indirect.test.mjs -> tests/implementation/uses-hub.mjs -> tests/implementation/hub-build.mjs reads the compiled Hub',
    'tests/repository/named.test.mjs names the build location',
  ])
})
