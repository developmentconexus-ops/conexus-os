import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildReapCommand, buildWorktreeAddCommand, main } from '../../scripts/worktree-new.mjs'

test('buildReapCommand runs the reaper in apply mode', () => {
  assert.deepEqual(buildReapCommand(), ['node', 'scripts/worktree-reap.mjs', '--apply'])
})

test('buildWorktreeAddCommand creates a worktree on a new branch from origin/main', () => {
  assert.deepEqual(
    buildWorktreeAddCommand({ bareRepoPath: '/home/u/conexus-os.git', worktreePath: '/home/u/wt-foo', branch: 'feat/foo' }),
    ['git', '-C', '/home/u/conexus-os.git', 'worktree', 'add', '/home/u/wt-foo', '-b', 'feat/foo', 'origin/main']
  )
})

function recordingCommand(responses) {
  const calls = []
  const command = (file, args, options) => {
    calls.push([file, ...args])
    const key = [file, ...args].join(' ')
    return responses[key] ?? { status: 0, stdout: '' }
  }
  return { command, calls }
}

test('prints usage and runs nothing when name or branch is missing', () => {
  const { command, calls } = recordingCommand({})
  const code = main([], { command })
  assert.equal(code, 1)
  assert.deepEqual(calls, [])
})

test('prints usage and runs nothing when only the name is given', () => {
  const { command, calls } = recordingCommand({})
  const code = main(['foo'], { command })
  assert.equal(code, 1)
  assert.deepEqual(calls, [])
})

test('resolves the bare repo path, reaps, then creates the worktree, in that order', () => {
  const { command, calls } = recordingCommand({
    'git rev-parse --git-common-dir': { status: 0, stdout: '/home/u/conexus-os.git\n' },
  })
  const code = main(['foo', 'feat/foo'], { command, cwd: '/home/u/conexus-os' })
  assert.equal(code, 0)
  assert.deepEqual(calls, [
    ['git', 'rev-parse', '--git-common-dir'],
    ['node', 'scripts/worktree-reap.mjs', '--apply'],
    ['git', '-C', '/home/u/conexus-os.git', 'worktree', 'add', '/home/u/wt-foo', '-b', 'feat/foo', 'origin/main'],
  ])
})

test('stops and does not create the worktree when the reap step fails', () => {
  const { command, calls } = recordingCommand({
    'git rev-parse --git-common-dir': { status: 0, stdout: '/home/u/conexus-os.git\n' },
    'node scripts/worktree-reap.mjs --apply': { status: 1, stdout: '' },
  })
  const code = main(['foo', 'feat/foo'], { command, cwd: '/home/u/conexus-os' })
  assert.equal(code, 1)
  assert.deepEqual(calls, [
    ['git', 'rev-parse', '--git-common-dir'],
    ['node', 'scripts/worktree-reap.mjs', '--apply'],
  ])
})

test('stops without creating the worktree when the bare repo path cannot be resolved', () => {
  const { command, calls } = recordingCommand({
    'git rev-parse --git-common-dir': { status: 128, stdout: '' },
  })
  const code = main(['foo', 'feat/foo'], { command, cwd: '/home/u/conexus-os' })
  assert.equal(code, 128)
  assert.deepEqual(calls, [['git', 'rev-parse', '--git-common-dir']])
})
