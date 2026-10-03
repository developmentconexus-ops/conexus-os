import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ungatedPaths } from '../../scripts/check-aprovo-gate.mjs'

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
