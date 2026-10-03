import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { checkQuarantine, listTestNames } from '../../scripts/check-test-quarantine.mjs'

// biome-ignore lint/suspicious/noTemplateCurlyInString: the text is the test source the scanner reads, with a template title it must not accept
const source = ["import test from 'node:test'", "test('flaky one', () => {})", 'test(`not a literal ${1}`, () => {})'].join('\n')
const testFiles = new Map([['tests/a.test.mjs', source]])
const today = '2026-10-02'
const check = (entry) => checkQuarantine({ entries: entry ? [entry] : [], today, testFiles })
const valid = { test: 'tests/a.test.mjs:flaky one', issue: 7, until: '2026-10-10' }

test('listTestNames reads literal test names', () => {
  assert.deepEqual(listTestNames(source, 'a.test.mjs'), ['flaky one'])
})

test('an empty quarantine passes and the committed file is empty', () => {
  assert.deepEqual(check(undefined), { ok: true, errors: [] })
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
  assert.deepEqual(check({ ...valid, test: 'tests/a.test.mjs:gone' }).errors, ['tests/a.test.mjs:gone: no test named "gone" in tests/a.test.mjs'])
  assert.deepEqual(check({ ...valid, test: 'tests/b.test.mjs:flaky one' }).errors, ['tests/b.test.mjs:flaky one: the file tests/b.test.mjs does not exist'])
})
