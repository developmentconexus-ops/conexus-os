import assert from 'node:assert/strict'
import test from 'node:test'
import { checkPatchChurn, findHotFiles, isCounted, parseLog } from '../../scripts/check-patch-churn.mjs'

const fixOn = (file, n) => ({ subject: `fix(hub): repair ${n}`, files: [file] })
const hotCommits = [fixOn('apps/hub/src/a.ts', 1), fixOn('apps/hub/src/a.ts', 2), fixOn('apps/hub/src/a.ts', 3), { subject: 'feat(hub): add b', files: ['apps/hub/src/b.ts'] }]

test('parseLog reads subjects and files from git log output', () => {
  assert.deepEqual(parseLog('\x01fix(hub): one\n\na.ts\nb.ts\n\x01feat: two\n\nc.ts\n'), [
    { subject: 'fix(hub): one', files: ['a.ts', 'b.ts'] },
    { subject: 'feat: two', files: ['c.ts'] },
  ])
})

test('a fix PR on a file with three fix commits fails and names the file, count and subjects', () => {
  const result = checkPatchChurn({ title: 'fix(hub): again', labels: [], commits: hotCommits, changedFiles: ['apps/hub/src/a.ts'] })
  assert.equal(result.ok, false)
  assert.deepEqual(result.hot, [{ file: 'apps/hub/src/a.ts', count: 3, subjects: ['fix(hub): repair 1', 'fix(hub): repair 2', 'fix(hub): repair 3'] }])
  assert.equal(result.message, [
    'apps/hub/src/a.ts: 3 fix commits in the last 30 days',
    '  fix(hub): repair 1',
    '  fix(hub): repair 2',
    '  fix(hub): repair 3',
    'Before another fix here, check the premise (principle: attack the premise). If a redesign was considered, add the label `premise-checked` to the PR.',
  ].join('\n'))
})

test('a non-fix PR on the same hot file passes', () => {
  assert.equal(checkPatchChurn({ title: 'feat(hub): new', labels: [], commits: hotCommits, changedFiles: ['apps/hub/src/a.ts'] }).ok, true)
})

test('the label premise-checked passes a fix PR on a hot file', () => {
  assert.equal(checkPatchChurn({ title: 'fix: again', labels: ['premise-checked'], commits: hotCommits, changedFiles: ['apps/hub/src/a.ts'] }).ok, true)
})

test('a fix PR on a file with only two fixes passes, and feat commits do not count', () => {
  const commits = [fixOn('apps/hub/src/c.ts', 1), fixOn('apps/hub/src/c.ts', 2), { subject: 'feat: x', files: ['apps/hub/src/c.ts'] }, { subject: 'refix: x', files: ['apps/hub/src/c.ts'] }]
  assert.deepEqual(findHotFiles({ commits, changedFiles: ['apps/hub/src/c.ts'] }), [])
})

test('a fix subject is fix( or fix: only', () => {
  const commits = ['fix: a', 'fix(x): b', 'fixup: c'].map((subject) => ({ subject, files: ['apps/hub/src/d.ts'] }))
  assert.deepEqual(findHotFiles({ commits, changedFiles: ['apps/hub/src/d.ts'] }), [])
  assert.equal(findHotFiles({ commits, changedFiles: ['apps/hub/src/d.ts'], threshold: 2 })[0].count, 2)
})

test('only production source under apps and packages counts, generated files excluded', () => {
  assert.deepEqual(
    ['apps/hub/src/builder/module.ts', 'packages/brand/src/index.ts', 'scripts/conexus-verify.mjs', 'package.json', 'tests/repository/a.test.mjs', 'package-lock.json', 'apps/web/src/generated/iam-client.ts', 'apps/hub/src/telemetry/log-codes.generated.ts'].map(isCounted),
    [true, true, false, false, false, false, false, false],
  )
})

test('a fix touching only the test graph and a test file passes, a fix on a hot hub source file fails', () => {
  const commits = ['scripts/conexus-verify.mjs', 'tests/repository/a.test.mjs', 'apps/hub/src/builder/module.ts'].flatMap((file) => [1, 2, 3].map((n) => fixOn(file, n)))
  const registry = checkPatchChurn({ title: 'fix: add a test', labels: [], commits, changedFiles: ['scripts/conexus-verify.mjs', 'tests/repository/a.test.mjs'] })
  assert.deepEqual([registry.ok, registry.hot], [true, []])
  const source = checkPatchChurn({ title: 'fix: again', labels: [], commits, changedFiles: ['scripts/conexus-verify.mjs', 'apps/hub/src/builder/module.ts'] })
  assert.deepEqual([source.ok, source.hot.map(({ file, count }) => [file, count])], [false, [['apps/hub/src/builder/module.ts', 3]]])
})
