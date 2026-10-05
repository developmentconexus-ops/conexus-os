import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '../..')

test('a query text that switches a role or sets or names a conexus setting is refused, an ordinary one is not', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'session-setting-'))
  try {
    writeFileSync(resolve(directory, 'biome.json'), JSON.stringify({ plugins: [resolve(root, 'biome/plugins/no-session-setting-in-sql.grit')], linter: { rules: { recommended: false } } }))
    cpSync(resolve(root, 'tests/fixtures/biome/session-setting-in-sql.ts'), resolve(directory, 'fixture.ts'))
    const result = spawnSync(resolve(root, 'node_modules/.bin/biome'), ['lint', '--colors=off', 'fixture.ts'], { cwd: directory, encoding: 'utf8' })
    const flagged = [...(result.stdout + result.stderr).matchAll(/^fixture\.ts:(\d+):\d+ plugin/gm)].map((found) => Number(found[1]))
    assert.deepEqual(flagged, [4, 5, 7, 8, 9, 10, 11, 12, 13, 14])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
