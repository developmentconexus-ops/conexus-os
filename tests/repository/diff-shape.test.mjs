import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { shape } from '../../scripts/diff-shape.mjs'

test('shape counts changed lines by kind and skips binary files', () => {
  const numstat = [
    '2\t1\ttests/repository/diff-shape.test.mjs',
    '3\t4\tapps/web/src/example.test.tsx',
    '5\t2\tdb/migrations/0001.sql',
    '7\t3\tapps/web/src/routes.generated.ts',
    '11\t6\tcontracts/api.ts',
    '13\t8\tdocs/guide.md',
    '17\t9\tAGENTS.md',
    '19\t10\tapps/web/src/main.tsx',
    '-\t-\tassets/logo.png',
  ].join('\n')

  assert.deepEqual(shape(numstat), {
    tests: { added: 5, deleted: 5 },
    sql: { added: 5, deleted: 2 },
    generated: { added: 18, deleted: 9 },
    docs: { added: 30, deleted: 17 },
    product: { added: 19, deleted: 10 },
  })
})

test('a file moved from docs to product counts as product added and docs deleted', () => {
  const repo = mkdtempSync(join(tmpdir(), 'diff-shape-'))
  const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' })
  try {
    git('init', '-q')
    mkdirSync(join(repo, 'docs'))
    mkdirSync(join(repo, 'apps/hub/src'), { recursive: true })
    const body = `${Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n')}\n`
    writeFileSync(join(repo, 'docs/guide.md'), body)
    git('add', '.')
    git('commit', '-q', '-m', 'base')
    git('mv', 'docs/guide.md', 'apps/hub/src/guide.ts')
    writeFileSync(join(repo, 'apps/hub/src/guide.ts'), `${body}export {}\n`)
    git('add', '.')
    git('commit', '-q', '-m', 'move')

    const cli = execFileSync('node', [fileURLToPath(new URL('../../scripts/diff-shape.mjs', import.meta.url)), repo, 'HEAD~1...HEAD'], { encoding: 'utf8' })

    assert.deepEqual(cli.trim().split('\n'), ['| Kind | Added | Deleted |', '| --- | --- | --- |', '| docs | +0 | -100 |', '| product | +101 | -0 |'])
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})
