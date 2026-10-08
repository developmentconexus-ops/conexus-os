import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { matchesGlob, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const scripts = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).scripts
const groups = ['unit', 'network', 'postgres', 'browser', 'smoke', 'live:extended', 'backup']
const patterns = Object.fromEntries(groups.map(group => [group, [...scripts[`test:${group}`].matchAll(/'([^']+\.test\.mjs)'|(tests\/\S+\.test\.mjs)/g)].map(([, quoted, bare]) => quoted ?? bare)]))
const owners = path => groups.filter(group => patterns[group].some(pattern => matchesGlob(path, pattern)))
const tracked = execFileSync('git', ['ls-files', 'tests'], { cwd: root, encoding: 'utf8' }).split('\n')
  .filter(path => path.endsWith('.test.mjs') && !path.startsWith('tests/manual/') && existsSync(resolve(root, path)))

test('every surviving nonmanual test is discovered exactly once by the direct CI commands', () => {
  assert.deepEqual(tracked.filter(path => owners(path).length !== 1), [])
  const workflow = readFileSync(resolve(root, '.github/workflows/verify.yml'), 'utf8')
  for (const group of ['network', 'postgres', 'browser', 'smoke']) assert.match(workflow, new RegExp(`group: ${group}`))
  assert.match(workflow, /npm run test:unit/)
  assert.match(workflow, /npm run test:live:extended/)
  assert.match(workflow, /npm run test:backup/)
})

test('suffixes isolate network, database, browser and backup; unknown folders remain unplaced', () => {
  assert.deepEqual(owners('tests/implementation/a.network.test.mjs'), ['network'])
  assert.deepEqual(owners('tests/implementation/a.postgres.test.mjs'), ['postgres'])
  assert.deepEqual(owners('tests/implementation/a.browser.test.mjs'), ['browser'])
  assert.deepEqual(owners('tests/implementation/conexus-backup.test.mjs'), ['backup'])
  assert.deepEqual(owners('tests/newfolder/a.test.mjs'), [])
  assert.deepEqual(owners('tests/manual/a.test.mjs'), [])
})

test('every live test is in exactly one smoke or extended partition and remains in test:live', () => {
  for (const path of tracked.filter(path => path.startsWith('tests/live/'))) {
    assert.ok(['smoke', 'live:extended'].includes(owners(path)[0]))
    assert.ok(matchesGlob(path, 'tests/live/*.test.mjs'))
  }
  assert.match(scripts['test:live'], /'tests\/live\/\*\.test\.mjs'/)
})
