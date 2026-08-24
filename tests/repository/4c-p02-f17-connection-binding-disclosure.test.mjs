import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')

test('F17 makes Project Connection bindings selectable without granting generic Connection read authority', () => {
  const ledger = read('docs/product/operation-ledger.md')
  const permissions = read('docs/product/permission-contract.md')
  const projectWire = read('contracts/api/product/project-paths.yaml')
  const connectionWire = read('contracts/api/product/connection-paths.yaml')

  for (const token of ['4C-F17', 'project.manage + connection.use', 'CON-03', 'purpose-bound', 'connectionName']) {
    assert.ok(ledger.includes(token), `operation ledger missing F17 token: ${token}`)
  }
  assert.ok(permissions.includes('connection.use -X-> generic connection.read'), 'permission contract must preserve read/use separation')
  assert.match(projectWire, /ProjectConnectionBinding:[\s\S]*required:\s*\[[^\]]*connectionName[^\]]*\]/, 'binding must require connectionName')
  assert.match(connectionWire, /name: forProjectId[\s\S]*in: query[\s\S]*required: false/, 'CON-03 must carry optional exact target Project context')
  assert.doesNotMatch(connectionWire, /ListBindableConnections/, 'F17 must not add a screen-shaped bindable-connections operation')
  assert.doesNotMatch(connectionWire, /qualificationHistory|qualificationMatrix/, 'F17 must not prebuild multi-environment qualification history')
})
