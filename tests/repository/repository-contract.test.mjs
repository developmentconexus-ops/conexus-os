import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const runAt = (script, candidateRoot) => spawnSync(process.execPath, [resolve(root, script), candidateRoot], {
  cwd: candidateRoot,
  encoding: 'utf8',
})
const gitFixture = (context, files) => {
  const target = mkdtempSync(resolve(tmpdir(), 'conexus-repository-contract-'))
  context.after(() => rmSync(target, { recursive: true, force: true }))
  execFileSync('git', ['init', '--quiet', '-b', 'main'], { cwd: target })
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(resolve(target, path)), { recursive: true })
    writeFileSync(resolve(target, path), contents)
  }
  execFileSync('git', ['add', '.'], { cwd: target })
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '--quiet', '-m', 'fixture'], { cwd: target })
  return target
}
const currentFiles = () => Object.fromEntries([
  'AGENTS.md', 'README.md', 'docs/index.md', 'docs/roadmap.md',
  'docs/product/contract.md', 'docs/decisions/index.md',
  'docs/development/engineering-method.md', 'docs/development/delivery.md',
  'docs/development/review-checklist.md',
  '.agents/skills/conexus-frontend/SKILL.md',
  'contracts/api/product/openapi.yaml',
].map(path => [path, '# fixture\n']).concat([
  ['package.json', '{"name":"conexus-os","private":true}\n'],
  ['.github/workflows/verify.yml', 'on: [push]\npermissions:\n  contents: read\n'],
]))
const assertPass = result => assert.equal(result.status, 0, result.stdout + result.stderr)
const assertFailure = (result, message) => {
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(result.stderr, message)
}

test('working documents and historical phase prose do not require admission', context => {
  const candidate = gitFixture(context, currentFiles())
  writeFileSync(resolve(candidate, 'docs/roadmap.md'), '# Current work\nNo phase table is required.\n')
  writeFileSync(resolve(candidate, 'README.md'), '# History\n3N = NEXT / NOT STARTED\n')
  mkdirSync(resolve(candidate, 'docs/work'), { recursive: true })
  writeFileSync(resolve(candidate, 'docs/work/handoff-round.md'), '# local dialogue\n')
  assertPass(runAt('scripts/check-agent-context.mjs', candidate))
})

for (const state of ['unstaged', 'staged', 'untracked', 'untracked-crlf', 'committed']) {
  test(`agent-context rejects ${state} conflict markers`, context => {
    const candidate = gitFixture(context, currentFiles())
    const path = state.startsWith('untracked') ? 'new-file.md' : 'README.md'
    const markers = '<<<<<<< ours\nfirst\n=======\nsecond\n>>>>>>> theirs\n'
    writeFileSync(resolve(candidate, path), state === 'untracked-crlf' ? markers.replaceAll('\n', '\r\n') : markers)
    if (state === 'staged' || state === 'committed') {
      execFileSync('git', ['add', path], { cwd: candidate })
    }
    if (state === 'committed') {
      execFileSync('git', ['switch', '-c', 'candidate'], { cwd: candidate, stdio: 'ignore' })
      execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        'commit', '--quiet', '-m', 'conflict'], { cwd: candidate })
    }
    assertFailure(runAt('scripts/check-agent-context.mjs', candidate), /conflict marker/)
  })
}

test('agent-context ignores a deleted workflow and rejects a new unsafe workflow', context => {
  const candidate = gitFixture(context, currentFiles())
  rmSync(resolve(candidate, '.github/workflows/verify.yml'))
  assertPass(runAt('scripts/check-agent-context.mjs', candidate))
  writeFileSync(resolve(candidate, '.github/workflows/new.yml'), 'on: pull_request_target\n')
  assertFailure(runAt('scripts/check-agent-context.mjs', candidate), /unsafe pull_request_target/)
  writeFileSync(resolve(candidate, '.github/workflows/new.yml'), 'on: push\npermissions:\n  contents: write\n')
  assertFailure(runAt('scripts/check-agent-context.mjs', candidate), /contents: write/)
})

test('repository checks reject a public package identity', context => {
  const candidate = gitFixture(context, currentFiles())
  writeFileSync(resolve(candidate, 'package.json'), '{"name":"conexus-os","private":false}\n')
  assertFailure(runAt('scripts/check-agent-context.mjs', candidate), /private/)
})
