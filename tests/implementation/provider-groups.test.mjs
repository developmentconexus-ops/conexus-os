import assert from 'node:assert/strict'
import test from 'node:test'
import { groupProviders } from '../../apps/web/src/features/settings/provider-groups.ts'

const providers = [
  { provider: 'zai', source: 'none' },
  { provider: 'anthropic', source: 'none', oauth: { supported: true, modes: ['device-code'] } },
  { provider: '302ai', source: 'none' },
  { provider: 'openai', source: 'none', oauth: { supported: true, modes: ['device-code'] } },
  { provider: 'github-copilot', source: 'none', oauth: { supported: true, modes: ['paste-code'] } },
  { provider: 'groq', source: 'none' },
  { provider: 'abacus', source: 'none' },
]

test('empty query groups by curated-featured-then-alphabetical-rest', () => {
  const result = groupProviders(providers, '')
  assert.ok('featured' in result)
  assert.deepEqual(result.featured.map((p) => p.provider), ['anthropic', 'openai', 'groq', 'github-copilot'])
  assert.deepEqual(result.rest.map((p) => p.provider), ['302ai', 'abacus', 'zai'])
})

test('whitespace-only query is treated as empty and groups, not matches', () => {
  const result = groupProviders(providers, '   ')
  assert.ok('featured' in result)
  assert.deepEqual(result.featured.map((p) => p.provider), ['anthropic', 'openai', 'groq', 'github-copilot'])
  assert.deepEqual(result.rest.map((p) => p.provider), ['302ai', 'abacus', 'zai'])
})

test('search is case- and accent-insensitive', () => {
  const result = groupProviders(providers, 'ÁNTHROPIC')
  assert.ok('matches' in result)
  assert.deepEqual(result.matches.map((p) => p.provider), ['anthropic'])
})

test('search ranks featured matches before non-featured ones', () => {
  const result = groupProviders(providers, 'ai')
  assert.ok('matches' in result)
  assert.deepEqual(result.matches.map((p) => p.provider), ['openai', '302ai', 'zai'])
})

test('a query with no matches returns an explicit empty match list', () => {
  const result = groupProviders(providers, 'zzz-nonexistent')
  assert.ok('matches' in result)
  assert.deepEqual(result.matches, [])
})
