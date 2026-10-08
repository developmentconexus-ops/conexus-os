import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { checkHubBuild } from '../../scripts/check-hub-build.mjs'

test('only a complete compiled artifact of the exact selected SHA is accepted', t => {
  const root = mkdtempSync(join(tmpdir(), 'hub-artifact-'))
  const directory = join(root, 'build')
  mkdirSync(directory)
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const sha = '1'.repeat(40)
  assert.throws(() => checkHubBuild(undefined, sha), /directory/)
  assert.throws(() => checkHubBuild(directory, 'main'), /exact source SHA/)
  assert.throws(() => checkHubBuild(directory, sha), /ENOENT/)
  writeFileSync(join(directory, 'source-sha'), `${'2'.repeat(40)}\n`)
  assert.throws(() => checkHubBuild(directory, sha), /another commit/)
  writeFileSync(join(directory, 'source-sha'), `${sha}\n`)
  writeFileSync(join(directory, 'server.js'), 'export const server = 1')
  mkdirSync(join(directory, 'app-check'))
  assert.throws(() => checkHubBuild(directory, sha), /ENOENT/)
  writeFileSync(join(directory, 'app-check/main.mjs'), '')
  assert.throws(() => checkHubBuild(directory, sha), /missing compiled content/)
  writeFileSync(join(directory, 'app-check/main.mjs'), 'export const check = 1')
  assert.throws(() => checkHubBuild(directory, sha), /ENOENT/)
  mkdirSync(join(root, 'public'))
  writeFileSync(join(root, 'public/index.html'), '<title>Compiled web fixture</title>')
  assert.doesNotThrow(() => checkHubBuild(directory, sha))
})
