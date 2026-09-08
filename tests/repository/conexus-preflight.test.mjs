import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { formatHuman, parseRoadmap, runPreflight } from '../../scripts/conexus-preflight.mjs'

const git = (repositoryRoot, args) => execFileSync('git', args, {
  cwd: repositoryRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe']
}).trim()

const command = (file, args, options) => {
  const result = spawnSync(file, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    windowsHide: true
  })
  if (result.error) throw result.error
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  }
}

test('roadmap parsing is conservative and deterministic', () => {
  const roadmap = `# Roadmap

| Phase | Status | Exit condition / preserved result | Reopen trigger |
| --- | --- | --- | --- |
| 4D — Runtime | OPEN / OPERATOR APPROVED | Runtime contract | Material falsifier |
| Product implementation | S2 CLOSED PASS / S3 BLOCKED ON SEPARATE GRANT | Product slice | Owner contradiction |

Continuation readiness = GREEN / repository-governance blocker = 0

## Exact next action

**Before any S3 byte, obtain the separate S3 execution grant and revalidate repository/PR/CI.**
`

  const expected = {
    source: 'docs/roadmap.md',
    phaseRows: [
      {
        name: '4D — Runtime',
        status: 'OPEN / OPERATOR APPROVED',
        exitCondition: 'Runtime contract',
        reopenTrigger: 'Material falsifier'
      },
      {
        name: 'Product implementation',
        status: 'S2 CLOSED PASS / S3 BLOCKED ON SEPARATE GRANT',
        exitCondition: 'Product slice',
        reopenTrigger: 'Owner contradiction'
      }
    ],
    productImplementation: {
      name: 'Product implementation',
      status: 'S2 CLOSED PASS / S3 BLOCKED ON SEPARATE GRANT',
      exitCondition: 'Product slice',
      reopenTrigger: 'Owner contradiction'
    },
    continuationReadiness: 'GREEN / repository-governance blocker = 0',
    exactNextAction: 'Before any S3 byte, obtain the separate S3 execution grant and revalidate repository/PR/CI.'
  }

  assert.deepEqual(parseRoadmap(roadmap), expected)
  assert.deepEqual(parseRoadmap(roadmap), parseRoadmap(roadmap.replaceAll('\n', '\r\n')))
})

test('repository roadmap exposes the current Product posture and next action', () => {
  const roadmap = parseRoadmap(readFileSync(new URL('../../docs/roadmap.md', import.meta.url), 'utf8'))
  assert.match(roadmap.productImplementation?.status ?? '', /^PAUSED\b/)
  assert.equal(roadmap.exactNextAction, 'Freeze and prove the operating-model candidate.')
})

test('no-network preflight observes a temporary repository without mutating it', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'conexus-preflight-'))
  const repositoryRoot = join(fixtureRoot, 'repo')
  try {
    mkdirSync(repositoryRoot, { recursive: true })
    execFileSync('git', ['init', '-b', 'main', repositoryRoot], { stdio: 'ignore' })
    const docsRoot = join(repositoryRoot, 'docs')
    mkdirSync(docsRoot, { recursive: true })
    writeFileSync(join(repositoryRoot, 'AGENTS.md'), '# fixture\n')
    writeFileSync(join(docsRoot, 'index.md'), '# fixture\n')
    writeFileSync(join(docsRoot, 'roadmap.md'), '| Phase | Status | Exit condition / preserved result | Reopen trigger |\n| --- | --- | --- | --- |\n| Product implementation | BLOCKED | Fixture | Fixture |\n')
    writeFileSync(join(repositoryRoot, 'package.json'), '{"name":"conexus-os","private":true}\n')
    execFileSync('git', ['add', '.'], { cwd: repositoryRoot, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.name=Preflight Test', '-c', 'user.email=preflight@example.invalid', 'commit', '-m', 'fixture'], { cwd: repositoryRoot, stdio: 'ignore' })
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:developmentconexus-ops/conexus-os.git'], { cwd: repositoryRoot, stdio: 'ignore' })
    execFileSync('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], { cwd: repositoryRoot, stdio: 'ignore' })
    execFileSync('git', ['switch', '-c', 'feature'], { cwd: repositoryRoot, stdio: 'ignore' })
    writeFileSync(join(repositoryRoot, 'local-note.txt'), 'pre-existing untracked state\n')

    const before = {
      head: git(repositoryRoot, ['rev-parse', 'HEAD']),
      branch: git(repositoryRoot, ['branch', '--show-current']),
      refs: git(repositoryRoot, ['for-each-ref', '--format=%(refname) %(objectname)']),
      trackedFiles: git(repositoryRoot, ['ls-files']),
      note: readFileSync(join(repositoryRoot, 'local-note.txt'), 'utf8')
    }
    const calls = []
    const observedCommand = (file, args, options) => {
      calls.push({ file, args: [...args] })
      return command(file, args, options)
    }

    const result = runPreflight({ repositoryRoot, noNetwork: true, command: observedCommand })

    assert.equal(result.ok, true)
    assert.equal(result.repository.branch, 'feature')
    assert.equal(result.base.ahead, 0)
    assert.equal(result.base.behind, 0)
    assert.equal(result.toolchain.node.actual, process.version.replace(/^v/, ''))
    assert.equal(result.toolchain.node.expected, null)
    assert.equal(typeof result.toolchain.npm.available, 'boolean')
    assert.equal(result.workingTree.clean, false)
    assert.deepEqual(result.workingTree.untracked, ['local-note.txt'])
    assert.equal(result.pullRequest.status, 'skipped')
    assert.equal(result.mainCi.status, 'skipped')
    assert.equal(calls.some(call => call.file === 'gh'), false)
    assert.equal(calls.some(call => call.file === 'git' && call.args[0] === 'fetch'), false)

    const networkCalls = []
    const simulatedNetworkCommand = (file, args, options) => {
      networkCalls.push({ file, args: [...args] })
      if (file === 'git' && args[0] === 'ls-remote') return { status: 0, stdout: `${before.head}\trefs/heads/main\n`, stderr: '' }
      if (file === 'gh') return { status: 1, stdout: '', stderr: 'gh unavailable in fixture' }
      return command(file, args, options)
    }
    const networkResult = runPreflight({ repositoryRoot, noNetwork: false, command: simulatedNetworkCommand })
    assert.equal(networkResult.base.fetch.attempted, false)
    assert.equal(networkResult.base.fetch.status, 'not-used')
    assert.equal(networkResult.base.remoteMain, before.head)
    assert.equal(networkResult.base.localRemoteMismatch, false)
    assert.equal(networkCalls.some(call => call.file === 'git' && call.args[0] === 'ls-remote' && call.args.includes('origin') && call.args.includes('refs/heads/main')), true)
    assert.equal(networkCalls.some(call => call.file === 'git' && call.args[0] === 'fetch'), false)
    assert.equal(networkCalls.some(call => call.file === 'gh'), true)

    const after = {
      head: git(repositoryRoot, ['rev-parse', 'HEAD']),
      branch: git(repositoryRoot, ['branch', '--show-current']),
      refs: git(repositoryRoot, ['for-each-ref', '--format=%(refname) %(objectname)']),
      trackedFiles: git(repositoryRoot, ['ls-files']),
      note: readFileSync(join(repositoryRoot, 'local-note.txt'), 'utf8')
    }
    assert.deepEqual(after, before)
    assert.equal(existsSync(join(repositoryRoot, 'local-note.txt')), true)
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test('remote main remains an explicit fact when local origin/main is absent', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'conexus-preflight-'))
  const repositoryRoot = join(fixtureRoot, 'repo')
  try {
    mkdirSync(join(repositoryRoot, 'docs'), { recursive: true })
    execFileSync('git', ['init', '-b', 'main', repositoryRoot], { stdio: 'ignore' })
    writeFileSync(join(repositoryRoot, 'AGENTS.md'), '# fixture\n')
    writeFileSync(join(repositoryRoot, 'docs/index.md'), '# fixture\n')
    writeFileSync(join(repositoryRoot, 'docs/roadmap.md'), '| Phase | Status | Exit condition / preserved result | Reopen trigger |\n| --- | --- | --- | --- |\n| Product implementation | BLOCKED | Fixture | Fixture |\n')
    writeFileSync(join(repositoryRoot, 'package.json'), '{"name":"conexus-os","private":true}\n')
    execFileSync('git', ['add', '.'], { cwd: repositoryRoot, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.name=Preflight Test', '-c', 'user.email=preflight@example.invalid', 'commit', '-m', 'fixture'], { cwd: repositoryRoot, stdio: 'ignore' })
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:developmentconexus-ops/conexus-os.git'], { cwd: repositoryRoot, stdio: 'ignore' })
    const head = git(repositoryRoot, ['rev-parse', 'HEAD'])
    const calls = []
    const observedCommand = (file, args, options) => {
      calls.push({ file, args: [...args] })
      if (file === 'git' && args[0] === 'ls-remote') return { status: 0, stdout: `${head}\trefs/heads/main\n`, stderr: '' }
      if (file === 'gh' && args[0] === '--version') return { status: 1, stdout: '', stderr: 'gh unavailable in fixture' }
      return command(file, args, options)
    }

    const result = runPreflight({ repositoryRoot, command: observedCommand })

    assert.equal(result.base.localOriginMain, null)
    assert.equal(result.base.remoteMain, head)
    assert.equal(result.base.localRemoteMismatch, null)
    assert.equal(result.base.ahead, null)
    assert.equal(result.base.behind, null)
    assert.equal(calls.some(call => call.file === 'git' && call.args[0] === 'fetch'), false)
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test('PR and CI facts bind to the current SHA and exact workflow', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'conexus-preflight-'))
  const repositoryRoot = join(fixtureRoot, 'repo')
  try {
    mkdirSync(join(repositoryRoot, 'docs'), { recursive: true })
    execFileSync('git', ['init', '-b', 'feature', repositoryRoot], { stdio: 'ignore' })
    writeFileSync(join(repositoryRoot, 'AGENTS.md'), '# fixture\n')
    writeFileSync(join(repositoryRoot, 'docs/index.md'), '# fixture\n')
    writeFileSync(join(repositoryRoot, 'docs/roadmap.md'), '| Phase | Status | Exit condition / preserved result | Reopen trigger |\n| --- | --- | --- | --- |\n| Product implementation | BLOCKED | Fixture | Fixture |\n')
    writeFileSync(join(repositoryRoot, 'package.json'), '{"name":"conexus-os","private":true}\n')
    execFileSync('git', ['add', '.'], { cwd: repositoryRoot, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.name=Preflight Test', '-c', 'user.email=preflight@example.invalid', 'commit', '-m', 'fixture'], { cwd: repositoryRoot, stdio: 'ignore' })
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:developmentconexus-ops/conexus-os.git'], { cwd: repositoryRoot, stdio: 'ignore' })
    execFileSync('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], { cwd: repositoryRoot, stdio: 'ignore' })
    const head = git(repositoryRoot, ['rev-parse', 'HEAD'])
    const unrelated = '1111111111111111111111111111111111111111'
    const calls = []
    const observedCommand = (file, args, options) => {
      calls.push({ file, args: [...args] })
      if (file === 'git' && args[0] === 'ls-remote') return { status: 0, stdout: `${head}\trefs/heads/main\n`, stderr: '' }
      if (file === 'gh' && args[0] === '--version') return { status: 0, stdout: 'gh version 2.0.0\n', stderr: '' }
      if (file === 'gh' && args[0] === 'pr' && args[1] === 'list') {
        return {
          status: 0,
          stdout: JSON.stringify([
            { number: 12, title: 'old branch PR', state: 'CLOSED', url: 'https://example.invalid/12', headRefName: 'feature', baseRefName: 'main', headRefOid: unrelated, mergeCommit: { oid: unrelated }, updatedAt: '2026-09-08T12:00:00Z' },
            { number: 70, title: 'current merged PR', state: 'MERGED', url: 'https://example.invalid/70', headRefName: 'old-source', baseRefName: 'main', headRefOid: unrelated, mergeCommit: { oid: head }, updatedAt: '2026-09-08T10:00:00Z' }
          ]),
          stderr: ''
        }
      }
      if (file === 'gh' && args[0] === 'run' && args[1] === 'list') {
        return {
          status: 0,
          stdout: JSON.stringify([
            { databaseId: 2, workflowName: 'Other', status: 'completed', conclusion: 'failure', headBranch: 'main', headSha: head, event: 'push', url: 'https://example.invalid/other', createdAt: '2026-09-08T12:00:00Z', updatedAt: '2026-09-08T12:00:01Z' },
            { databaseId: 1, workflowName: 'Verify', status: 'in_progress', conclusion: '', headBranch: 'main', headSha: head, event: 'push', url: 'https://example.invalid/verify', createdAt: '2026-09-08T11:00:00Z', updatedAt: '2026-09-08T11:00:01Z' },
            { databaseId: 3, workflowName: 'Verify', status: 'completed', conclusion: 'success', headBranch: 'main', headSha: unrelated, event: 'push', url: 'https://example.invalid/wrong-sha', createdAt: '2026-09-08T13:00:00Z', updatedAt: '2026-09-08T13:00:01Z' }
          ]),
          stderr: ''
        }
      }
      return command(file, args, options)
    }

    const result = runPreflight({ repositoryRoot, command: observedCommand })

    assert.equal(result.pullRequest.number, 70)
    assert.equal(result.pullRequest.match, 'merged-exact-sha')
    assert.equal(result.mainCi.lookupStatus, 'found')
    assert.equal(result.mainCi.workflowName, 'Verify')
    assert.equal(result.mainCi.headSha, head)
    assert.equal(result.mainCi.conclusion, '')
    assert.equal(result.mainCi.status, 'in_progress')
    assert.equal(result.mainCi.matchesRemoteMain, true)
    assert.equal(calls.some(call => call.file === 'gh' && call.args.includes('--commit') && call.args.includes(head) && call.args.includes('--workflow') && call.args.includes('Verify')), true)
    assert.equal(calls.some(call => call.file === 'git' && call.args[0] === 'fetch'), false)
    assert.match(formatHuman(result), /CI main: Verify in_progress/)
    assert.doesNotMatch(formatHuman(result), /CI main: Verify \?\?/)
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
