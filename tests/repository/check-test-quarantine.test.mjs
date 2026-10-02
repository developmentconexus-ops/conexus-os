import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { checkQuarantine, listTests } from '../../scripts/check-test-quarantine.mjs'

const source = [
  "import test from 'node:test'",
  "test('flaky one', { skip: 'opt-in: quarantined, see #7' }, () => {})",
  "test('live one', { skip: 'opt-in: set CONEXUS_LIVE=1' }, () => {})",
  "test('healthy', () => {})",
  'test(`not a literal ${1}`, () => {})',
].join('\n')
const testFiles = new Map([['tests/a.test.mjs', source]])
const today = '2026-10-02'
const check = (entry, files = testFiles) => checkQuarantine({ entries: entry ? [entry] : [], today, testFiles: files })
const valid = { test: 'tests/a.test.mjs:flaky one', issue: 7, until: '2026-10-10' }

test('listTests reads literal test names with their literal skip reasons', () => {
  assert.deepEqual(listTests(source, 'a.test.mjs'), [
    { name: 'flaky one', skip: 'opt-in: quarantined, see #7' },
    { name: 'live one', skip: 'opt-in: set CONEXUS_LIVE=1' },
    { name: 'healthy', skip: undefined },
  ])
})

test('an empty quarantine passes and the committed file is empty', () => {
  const clean = new Map([['tests/a.test.mjs', "test('healthy', () => {})"]])
  assert.deepEqual(check(undefined, clean), { ok: true, errors: [] })
  assert.deepEqual(JSON.parse(readFileSync(new URL('../quarantine.json', import.meta.url), 'utf8')), [])
})

test('a valid entry passes, also on the first and the last allowed day', () => {
  assert.deepEqual(check(valid), { ok: true, errors: [] })
  assert.equal(check({ ...valid, until: '2026-10-02' }).ok, true)
  assert.equal(check({ ...valid, until: '2026-10-16' }).ok, true)
})

test('an entry past its date fails', () => {
  assert.deepEqual(check({ ...valid, until: '2026-10-01' }).errors, ['tests/a.test.mjs:flaky one: quarantine expired on 2026-10-01; fix the test or remove the entry'])
})

test('an entry more than 14 days ahead fails', () => {
  assert.deepEqual(check({ ...valid, until: '2026-10-17' }).errors, ['tests/a.test.mjs:flaky one: until 2026-10-17 is more than 14 days ahead (latest 2026-10-16)'])
})

test('an entry without an issue number fails', () => {
  assert.deepEqual(check({ test: valid.test, until: valid.until }).errors, ['tests/a.test.mjs:flaky one: the issue number is missing'])
})

test('an entry naming a missing test or file fails', () => {
  const own = (entry) => check(entry).errors.filter((error) => error.startsWith(entry.test))
  assert.deepEqual(own({ ...valid, test: 'tests/a.test.mjs:gone' }), ['tests/a.test.mjs:gone: no test named "gone" in tests/a.test.mjs'])
  assert.deepEqual(own({ ...valid, test: 'tests/b.test.mjs:flaky one' }), ['tests/b.test.mjs:flaky one: the file tests/b.test.mjs does not exist'])
})

test('a test skipped as quarantined without an entry fails', () => {
  assert.deepEqual(check(undefined).errors, ['tests/a.test.mjs:flaky one: skipped as quarantined but has no entry in tests/quarantine.json'])
})

test('an entry naming a test that is not skipped as quarantined fails', () => {
  assert.deepEqual(check({ ...valid, test: 'tests/a.test.mjs:healthy' }).errors.filter((error) => error.startsWith('tests/a.test.mjs:healthy')), ['tests/a.test.mjs:healthy: the test is not skipped with a reason starting "opt-in: quarantined"'])
  assert.deepEqual(check({ ...valid, test: 'tests/a.test.mjs:live one' }).errors.filter((error) => error.startsWith('tests/a.test.mjs:live one')), ['tests/a.test.mjs:live one: the test is not skipped with a reason starting "opt-in: quarantined"'])
})
