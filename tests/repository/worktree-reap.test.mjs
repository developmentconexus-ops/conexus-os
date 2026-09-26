import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseStatus, parseWorktrees, planReap } from '../../scripts/worktree-reap.mjs'

test('parses git worktree list --porcelain, including bare and detached entries', () => {
  const porcelain = [
    'worktree /home/u/repo.git\nbare',
    'worktree /home/u/wt-a\nHEAD aaa\nbranch refs/heads/feat/a',
    'worktree /home/u/wt-b\nHEAD bbb\ndetached',
  ].join('\n\n') + '\n'
  assert.deepEqual(parseWorktrees(porcelain), [
    { path: '/home/u/repo.git', head: null, branch: null, bare: true },
    { path: '/home/u/wt-a', head: 'aaa', branch: 'feat/a', bare: false },
    { path: '/home/u/wt-b', head: 'bbb', branch: null, bare: false },
  ])
})

test('separates changes from ignored paths in git status --porcelain --ignored', () => {
  assert.deepEqual(parseStatus(' M a.ts\n?? b.ts\n!! node_modules/\n!! run.log\n'), {
    changes: 2,
    ignored: ['node_modules/', 'run.log'],
  })
})

test('removes only a worktree whose work is a closed pull request head and holds only build output', () => {
  const worktree = (path, branch, head) => ({ path, branch, head, bare: false })
  const status = {
    '/w/merged': { changes: 0, ignored: ['node_modules/', 'apps/hub/public/', 'apps/hub/.conexus-build-local-x/'] },
    '/w/closed': { changes: 0, ignored: [] },
    '/w/dirty': { changes: 3, ignored: [] },
    '/w/evidence': { changes: 0, ignored: ['node_modules/', 'docs/evidence/q1/run.log', '.env'] },
  }
  const plan = planReap({
    worktrees: [
      { path: '/repo.git', branch: null, head: null, bare: true },
      worktree('/w/current', 'feat/current', 'c1'),
      worktree('/w/merged', 'feat/merged', 'm1'),
      worktree('/w/closed', 'feat/closed', 'x1'),
      worktree('/w/open', 'feat/open', 'o2'),
      worktree('/w/ahead', 'feat/ahead', 'a2'),
      worktree('/w/nopr', 'feat/nopr', 'n1'),
      worktree('/w/detached', null, 'd1'),
      worktree('/w/gone', 'feat/gone', 'g1'),
      worktree('/w/dirty', 'feat/dirty', 'y1'),
      worktree('/w/evidence', 'feat/evidence', 'e1'),
    ],
    pullRequests: [
      { number: 1, state: 'MERGED', headRefName: 'feat/merged', headRefOid: 'm1' },
      { number: 2, state: 'CLOSED', headRefName: 'feat/closed', headRefOid: 'x1' },
      { number: 3, state: 'MERGED', headRefName: 'feat/open', headRefOid: 'o1' },
      { number: 4, state: 'OPEN', headRefName: 'feat/open', headRefOid: 'o2' },
      { number: 5, state: 'MERGED', headRefName: 'feat/ahead', headRefOid: 'a1' },
      { number: 6, state: 'MERGED', headRefName: 'feat/gone', headRefOid: 'g1' },
      { number: 7, state: 'MERGED', headRefName: 'feat/dirty', headRefOid: 'y1' },
      { number: 8, state: 'MERGED', headRefName: 'feat/evidence', headRefOid: 'e1' },
    ],
    statusOf: path => status[path],
    exists: path => path !== '/w/gone',
    current: '/w/current',
  })
  assert.deepEqual(plan.map(entry => [entry.path, entry.action, entry.reason]), [
    ['/w/merged', 'remove', '#1 merged'],
    ['/w/closed', 'remove', '#2 closed'],
    ['/w/open', 'keep', 'open pull request'],
    ['/w/ahead', 'keep', 'HEAD is not a pull request head'],
    ['/w/nopr', 'keep', 'no pull request'],
    ['/w/detached', 'keep', 'detached HEAD'],
    ['/w/gone', 'keep', 'missing directory'],
    ['/w/dirty', 'keep', '3 uncommitted changes'],
    ['/w/evidence', 'keep', 'ignored files: docs/evidence/q1/run.log, .env'],
  ])
})
