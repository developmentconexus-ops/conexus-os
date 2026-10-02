import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { docsOnlyChange, isDocsOnly, main } from '../../scripts/ci-change-scope.mjs'

test('Markdown under docs/, under .agents/ and at the root is documentation', () => {
  assert.equal(isDocsOnly(['docs/roadmap.md', 'docs/product/operation-ledger.md', '.agents/skills/mastra/SKILL.md', 'AGENTS.md', 'README.md']), true)
})

test('any file outside the allowlist makes the change a full one', () => {
  for (const path of [
    'docs/evidence/brand/shell-dark.png',
    'docs/development/review/areas.json',
    'apps/hub/src/builder/harness/prompt/builder.md',
    'builder-skills/conexus-build/SKILL.md',
    'apps/web/AGENTS.md',
    '.github/pull_request_template.md',
    '.github/workflows/verify.yml',
    'package.json',
    'scripts/conexus-verify.mjs',
    'tests/repository/ci-change-scope.test.mjs',
  ]) {
    assert.equal(isDocsOnly(['docs/roadmap.md', path]), false, path)
  }
})

test('an empty change is not documentation', () => {
  assert.equal(isDocsOnly([]), false)
})

function repositoryWith(files) {
  const root = mkdtempSync(join(tmpdir(), 'conexus-change-scope-'))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } })
  git('init', '-q', '-b', 'main')
  const write = (path, text) => {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  write('seed.txt', 'seed')
  git('add', '.')
  git('commit', '-q', '-m', 'seed')
  git('switch', '-q', '-c', 'work')
  for (const [path, text] of Object.entries(files)) write(path, text)
  git('add', '.')
  git('commit', '-q', '-m', 'work')
  return { root, git }
}

test('the path test reads the real diff against the merge base of the base ref', () => {
  const docs = repositoryWith({ 'docs/a.md': 'a', 'README.md': 'b' })
  const code = repositoryWith({ 'docs/a.md': 'a', 'scripts/x.mjs': 'x' })
  const within = (root, base) => {
    const previous = process.cwd()
    process.chdir(root)
    try {
      return docsOnlyChange(base)
    } finally {
      process.chdir(previous)
    }
  }
  assert.equal(within(docs.root, 'main'), true)
  assert.equal(within(code.root, 'main'), false)
  assert.equal(within(docs.root, 'no-such-ref'), false)
  assert.equal(within(docs.root, ''), false)
})

test('the result is written to GITHUB_OUTPUT, and a missing base means a full run', () => {
  const directory = mkdtempSync(join(tmpdir(), 'conexus-change-output-'))
  const output = join(directory, 'out')
  writeFileSync(output, '')
  const log = console.log
  console.log = () => {}
  try {
    assert.equal(main([], { GITHUB_OUTPUT: output }), 0)
  } finally {
    console.log = log
  }
  assert.equal(readFileSync(output, 'utf8'), 'docs_only=false\n')
})
