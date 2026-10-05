import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../../apps/hub/src')
const CREDENTIAL_COLUMNS = /\bcredential_(?:sealed|digest)\b/
const OWNER = 'connectors/store.ts'

const sourcesOf = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name)
  if (entry.isDirectory()) return sourcesOf(path)
  return entry.name.endsWith('.ts') ? [path] : []
})

export const namingCredentialColumns = (files) => files.filter(({ text }) => CREDENTIAL_COLUMNS.test(text)).map(({ path }) => path).sort()

test('only connectors/store.ts names a credential column of connector.connection', () => {
  const files = sourcesOf(root).map((path) => ({ path: relative(root, path), text: readFileSync(path, 'utf8') }))
  assert.deepEqual(namingCredentialColumns(files), [OWNER])
})

test('a source outside connectors/store.ts that selects a credential column is named, and the store passes', () => {
  const select = 'SELECT credential_sealed FROM connector.connection'
  assert.deepEqual(namingCredentialColumns([{ path: 'connectors/broker.ts', text: select }, { path: OWNER, text: select }, { path: 'project/store.ts', text: 'SELECT label FROM connector.connection' }]), ['connectors/broker.ts', OWNER])
  assert.deepEqual(namingCredentialColumns([{ path: 'connectors/scope.ts', text: 'SELECT credential_digest FROM connector.connection' }]), ['connectors/scope.ts'])
})
