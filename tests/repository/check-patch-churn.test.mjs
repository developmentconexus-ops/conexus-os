import assert from 'node:assert/strict'
import test from 'node:test'
import { checkPatchChurn, findHotFiles, isExcluded, parseLog } from '../../scripts/check-patch-churn.mjs'

const fixOn = (file, n) => ({ subject: `fix(hub): repair ${n}`, files: [file] })
const hotCommits = [fixOn('apps/hub/a.ts', 1), fixOn('apps/hub/a.ts', 2), fixOn('apps/hub/a.ts', 3), { subject: 'feat(hub): add b', files: ['apps/hub/b.ts'] }]

test('parseLog reads subjects and files from git log output', () => {
  assert.deepEqual(parseLog('\x01fix(hub): one\n\na.ts\nb.ts\n\x01feat: two\n\nc.ts\n'), [
    { subject: 'fix(hub): one', files: ['a.ts', 'b.ts'] },
    { subject: 'feat: two', files: ['c.ts'] },
  ])
})

test('a fix PR on a file with three fix commits fails and names the file, count and subjects', () => {
  const result = checkPatchChurn({ title: 'fix(hub): again', labels: [], commits: hotCommits, changedFiles: ['apps/hub/a.ts'] })
  assert.equal(result.ok, false)
  assert.deepEqual(result.hot, [{ file: 'apps/hub/a.ts', count: 3, subjects: ['fix(hub): repair 1', 'fix(hub): repair 2', 'fix(hub): repair 3'] }])
  assert.equal(result.message, [
    'apps/hub/a.ts: 3 fix commits in the last 30 days',
    '  fix(hub): repair 1',
    '  fix(hub): repair 2',
    '  fix(hub): repair 3',
    'Before another fix here, check the premise (principle: attack the premise). If a redesign was considered, add the label `premise-checked` to the PR.',
  ].join('\n'))
})

test('a non-fix PR on the same hot file passes', () => {
  assert.equal(checkPatchChurn({ title: 'feat(hub): new', labels: [], commits: hotCommits, changedFiles: ['apps/hub/a.ts'] }).ok, true)
})

test('the label premise-checked passes a fix PR on a hot file', () => {
  assert.equal(checkPatchChurn({ title: 'fix: again', labels: ['premise-checked'], commits: hotCommits, changedFiles: ['apps/hub/a.ts'] }).ok, true)
})

test('a fix PR on a file with only two fixes passes, and feat commits do not count', () => {
  const commits = [fixOn('c.ts', 1), fixOn('c.ts', 2), { subject: 'feat: x', files: ['c.ts'] }, { subject: 'refix: x', files: ['c.ts'] }]
  assert.deepEqual(findHotFiles({ commits, changedFiles: ['c.ts'] }), [])
})

test('a fix subject is fix( or fix: only', () => {
  const commits = ['fix: a', 'fix(x): b', 'fixup: c'].map((subject) => ({ subject, files: ['d.ts'] }))
  assert.deepEqual(findHotFiles({ commits, changedFiles: ['d.ts'] }), [])
  assert.equal(findHotFiles({ commits, changedFiles: ['d.ts'], threshold: 2 })[0].count, 2)
})

test('lockfiles, generated files, the catalog snapshot and the ratchet are excluded', () => {
  assert.deepEqual(
    ['package-lock.json', 'apps/keycloak-theme/package-lock.json', 'apps/web/src/generated/iam-client.ts', 'apps/hub/src/telemetry/log-codes.generated.ts', 'contracts/technical/hub-catalog-snapshot.json', 'scripts/weak-tests-ratchet.json', 'apps/hub/a.ts'].map(isExcluded),
    [true, true, true, true, true, true, false],
  )
})
