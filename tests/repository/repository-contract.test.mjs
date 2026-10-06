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
  'docs/development/codebase-principles.md', 'docs/development/delivery.md',
  'docs/development/testing.md',
  'contracts/api/product/openapi.json',
].map(path => [path, '# fixture\n']).concat([
  ['package.json', '{"name":"conexus-os","private":true}\n'],
  ['docs/development/review/areas.json', '[{"area":"all","paths":["**"],"guides":["A"]}]\n'],
  ['.github/workflows/verify.yml', 'on: [push]\npermissions:\n  contents: read\n'],
]))
const assertPass = result => assert.equal(result.status, 0, result.stdout + result.stderr)
test('working documents and historical phase prose do not require admission', context => {
  const candidate = gitFixture(context, currentFiles())
  writeFileSync(resolve(candidate, 'docs/roadmap.md'), '# Current work\nNo phase table is required.\n')
  writeFileSync(resolve(candidate, 'README.md'), '# History\n3N = NEXT / NOT STARTED\n')
  mkdirSync(resolve(candidate, 'docs/work'), { recursive: true })
  writeFileSync(resolve(candidate, 'docs/work/handoff-round.md'), '# local dialogue\n')
  assertPass(runAt('scripts/check-agent-context.mjs', candidate))
})
