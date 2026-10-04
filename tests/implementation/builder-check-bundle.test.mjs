import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { hubBuildDirectory, hubModuleUrl } from './hub-build.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const built = join(hubBuildDirectory(), 'app-check/main.mjs')

// A copy of the compiled Hub inside the repository's own folders, so its bare imports still resolve.
const copyOfHub = (t) => {
  const base = join(repositoryRoot, 'node_modules/.cache')
  mkdirSync(base, { recursive: true })
  const copy = mkdtempSync(join(base, 'app-check-test-'))
  t.after(() => rmSync(copy, { recursive: true, force: true }))
  cpSync(hubBuildDirectory(), copy, { recursive: true })
  return copy
}

test('the Hub build holds one bundle, and building it again anywhere gives the same bytes', (t) => {
  const copy = copyOfHub(t)
  rmSync(join(copy, 'app-check'), { recursive: true, force: true })
  const ran = spawnSync(process.execPath, [join(repositoryRoot, 'scripts/build-app-check.mjs'), copy], { encoding: 'utf8' })
  assert.equal(ran.status, 0, ran.stderr)
  assert.equal(sha256(readFileSync(join(copy, 'app-check/main.mjs'))), sha256(readFileSync(built)))
})

test('the bundle is the whole check: only Node built-ins are imported, and the Sankhya reader is inside', () => {
  const source = readFileSync(built, 'utf8')
  const specifiers = [...source.matchAll(/^import .*? from "([^"]+)";$/gm)].map((match) => match[1])
  assert.ok(specifiers.length > 5, 'the bundle imports the Node modules it uses')
  assert.deepEqual(specifiers.filter((specifier) => !specifier.startsWith('node:')), [])
  assert.ok(source.includes(readFileSync(join(repositoryRoot, 'apps/hub/src/builder/handler-kit/sankhya.ts'), 'utf8').split('\n')[0]), 'the first line of the helper is in the bundle')
  assert.equal(source.includes('SANKHYA_HELPER_SOURCE'), false)
})

test('the Hub reads the bundle once, with the sha256 that identifies the check', async () => {
  const { loadCheckBundle } = await import(hubModuleUrl('builder/check-delivery.js'))
  const bundle = loadCheckBundle()
  assert.equal(bundle.sha256, sha256(readFileSync(built)))
  assert.deepEqual(Buffer.from(bundle.bytes), readFileSync(built))
})

test('a Hub built without the bundle refuses to start, naming the file', async (t) => {
  const copy = copyOfHub(t)
  rmSync(join(copy, 'app-check'), { recursive: true, force: true })
  assert.equal(existsSync(join(copy, 'app-check')), false)
  const { loadCheckBundle } = await import(pathToFileURL(join(copy, 'builder/check-delivery.js')).href)
  assert.throws(() => loadCheckBundle(), (error) => {
    assert.equal(error.message, 'CONFIG_MISSING')
    assert.deepEqual(error.details, { name: 'app-check/main.mjs' })
    return true
  })
})
