import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { parseRoadmap, runPreflight } from '../../scripts/conexus-preflight.mjs'

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
      if (file === 'git' && args[0] === 'fetch') return { status: 0, stdout: '', stderr: '' }
      if (file === 'gh') return { status: 1, stdout: '', stderr: 'gh unavailable in fixture' }
      return command(file, args, options)
    }
    const networkResult = runPreflight({ repositoryRoot, noNetwork: false, command: simulatedNetworkCommand })
    assert.equal(networkResult.base.fetch.attempted, true)
    assert.equal(networkResult.base.fetch.status, 'fetched')
    assert.equal(networkCalls.some(call => call.file === 'git' && call.args[0] === 'fetch' && call.args.includes('origin') && call.args.includes('main')), true)
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
