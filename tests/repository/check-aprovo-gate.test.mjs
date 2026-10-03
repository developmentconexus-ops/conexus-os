import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ungatedPaths } from '../../scripts/check-aprovo-gate.mjs'

const script = fileURLToPath(new URL('../../scripts/check-aprovo-gate.mjs', import.meta.url))

const areas = [
  { area: 'migrations', gate: 'aprovo', paths: ['apps/hub/migrations/**', 'scripts/*-secret.mjs'] },
  { area: 'frontend', paths: ['apps/web/**'] },
]

test('a changed path in a gated area without the label is reported', () => {
  assert.deepEqual(ungatedPaths({ areas, changedFiles: ['apps/hub/migrations/0099_x.sql', 'apps/web/a.ts', 'scripts/x-secret.mjs'], labels: ['lane:fast'] }), ['apps/hub/migrations/0099_x.sql', 'scripts/x-secret.mjs'])
})

test('the label needs:aprovo clears the gate', () => {
  assert.deepEqual(ungatedPaths({ areas, changedFiles: ['apps/hub/migrations/0099_x.sql'], labels: ['needs:aprovo'] }), [])
})

test('an area without a gate never reports', () => {
  assert.deepEqual(ungatedPaths({ areas, changedFiles: ['apps/web/a.ts'], labels: [] }), [])
})

test('a pure rename out of a gated area fails the gate', context => {
  const repo = mkdtempSync(resolve(tmpdir(), 'conexus-aprovo-gate-'))
  context.after(() => rmSync(repo, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo })
  git('init', '--quiet', '-b', 'main')
  mkdirSync(resolve(repo, 'docs/development/review'), { recursive: true })
  mkdirSync(resolve(repo, 'apps/hub/migrations'), { recursive: true })
  writeFileSync(resolve(repo, 'docs/development/review/areas.json'), JSON.stringify(areas))
  writeFileSync(resolve(repo, 'apps/hub/migrations/001.sql'), 'select 1;\n')
  git('add', '-A')
  git('commit', '--quiet', '-m', 'base')
  git('checkout', '--quiet', '-b', 'pr')
  git('mv', 'apps/hub/migrations/001.sql', 'docs/001.sql')
  git('commit', '--quiet', '-m', 'rename')
  const event = resolve(repo, 'event.json')
  writeFileSync(event, JSON.stringify({ pull_request: { labels: [] } }))
  const result = spawnSync(process.execPath, [script, '--base', 'main'], { cwd: repo, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_PATH: event } })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /^apps\/hub\/migrations\/001\.sql is in the gated area migrations$/m)
})
