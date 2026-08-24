import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')

test('F18 permits exact Project Brain revision selection without widening brain.bind into brain.read', () => {
  const ledger = read('docs/product/operation-ledger.md')
  const permissions = read('docs/product/permission-contract.md')
  const wire = read('contracts/api/product/brain-paths.yaml')

  for (const token of ['4C-F18', 'project.manage + brain.bind', 'BRN-02', 'purpose-bound']) {
    assert.ok(ledger.includes(token), `operation ledger missing F18 token: ${token}`)
  }
  assert.ok(permissions.includes('brain.bind -X-> generic brain.read'), 'permission contract must preserve bind/read separation')

  const brn02Start = wire.indexOf('/api/control/workspaces/{workspaceId}/brain/revisions:')
  const brn03Start = wire.indexOf('/api/control/workspaces/{workspaceId}/brain/revisions/{brainRevisionId}:')
  assert.ok(brn02Start >= 0 && brn03Start > brn02Start, 'BRN-02/BRN-03 route boundaries must exist')
  const brn02 = wire.slice(brn02Start, brn03Start)
  assert.match(brn02, /name: forProjectId[\s\S]*in: query[\s\S]*required: false[\s\S]*type: string[\s\S]*minLength: 1/, 'BRN-02 must carry optional nonblank exact target Project context')
  assert.doesNotMatch(brn02, /knowledgeBrowse/, 'purpose-bound BRN-02 must remain immutable revision summary-only')

  assert.doesNotMatch(wire, /ListBindableBrainRevisions/, 'F18 must not add a screen-shaped bindable-revisions operation')
})
