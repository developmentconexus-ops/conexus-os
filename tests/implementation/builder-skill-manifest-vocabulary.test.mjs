import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { admitManifest } = await import(hubModuleUrl('app-runner/server-manifest.js'))

// Every JSON Schema keyword a Builder might reach for, plus what the manifest admits today.
const CANDIDATE_KEYS = [
  'type', 'enum', 'const', 'pattern', 'format', 'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
  'multipleOf', 'items', 'minItems', 'maxItems', 'uniqueItems', 'contains', 'prefixItems', 'properties', 'required', 'additionalProperties',
  'patternProperties', 'minProperties', 'maxProperties', 'propertyNames', 'description', 'title', 'default', 'examples', 'nullable',
  'oneOf', 'anyOf', 'allOf', 'not', 'if', 'then', 'else', '$ref', '$schema', '$id', '$defs', 'definitions', 'readOnly', 'deprecated',
]
const TYPES = ['string', 'integer', 'number', 'boolean', 'object', 'array']

const admits = (type, key) => {
  const schema = { type, [key]: null }
  const manifest = { operations: { probe: { handler: 'handlers/a.ts', export: 'probe', input: { type: 'object', properties: { field: schema }, additionalProperties: false }, output: { type: 'boolean' } } } }
  try {
    admitManifest(manifest, 'source')
    return true
  } catch (error) {
    return !error.message.endsWith(`unknown key "${key}"`)
  }
}

const skillTable = () => {
  const skill = readFileSync(resolve(import.meta.dirname, '../../builder-skills/conexus-server/SKILL.md'), 'utf8')
  const block = skill.match(/<!-- manifest-schema-keys -->\n([\s\S]*?)<!-- \/manifest-schema-keys -->/)?.[1] ?? ''
  const rows = [...block.matchAll(/^\| `(\w+)` \| (.+) \|$/gm)]
  return Object.fromEntries(rows.map(([, type, keys]) => [type, keys === 'none' ? [] : [...keys.matchAll(/`(\w+)`/g)].map(([, key]) => key)]))
}

test('the conexus-server skill lists exactly the keys the manifest admits, per type', () => {
  const admitted = Object.fromEntries(TYPES.map((type) => [type, CANDIDATE_KEYS.filter((key) => key !== 'type' && admits(type, key))]))
  const listed = skillTable()
  assert.deepEqual(Object.keys(listed), TYPES)
  for (const type of TYPES) assert.deepEqual([...listed[type]].sort(), [...admitted[type]].sort(), `keys of "${type}"`)
})

test('the probe sees the admitted vocabulary as it is today', () => {
  assert.deepEqual(CANDIDATE_KEYS.filter((key) => key !== 'type' && admits('string', key)), ['enum', 'minLength', 'maxLength'])
  assert.deepEqual(CANDIDATE_KEYS.filter((key) => key !== 'type' && admits('object', key)), ['properties', 'required', 'additionalProperties'])
})
