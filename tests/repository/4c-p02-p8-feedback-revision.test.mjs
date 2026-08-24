import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')
const ledger = read('docs/product/operation-ledger.md')
const oas = read('contracts/api/product/project-paths.yaml')
const evidence = read('docs/evidence/4c/p02-p8-feedback-revision.md')
const html = read('docs/evidence/4c/p02-project-resources-functional-wireframe.html')

function has(text, token) {
  assert.ok(text.includes(token), `missing required P-02 feedback token: ${token}`)
}

test('4C-F20 keeps Data semantic while exposing inspectable logical structure', () => {
  for (const token of ['4C-F20','resourceKind','sourceKind','ProjectDataField','ProjectDataRelationship','ProjectDataRule']) has(ledger + oas + evidence, token)
  for (const token of ['INTERNAL','INTEGRATION','DERIVED','TABLE','VIEW','DATASET','fields','relationships','rules']) has(oas, token)
  for (const forbidden of ['schemaName','tableName','indexName','ddl','connectionString','sqlText']) {
    assert.equal(oas.includes(`${forbidden}:`), false, `F20 must not turn Data into a physical DB explorer: ${forbidden}`)
  }
})

test('4C-F21 makes Capability inspection human-readable without adding execution authority', () => {
  for (const token of ['4C-F21','name','purpose','inputs','outputs','ProjectCapabilityField']) has(ledger + oas + evidence, token)
  has(oas, 'enum: [QUERY, ACTION, INTEGRATION]')
  assert.equal(/\/capabilities\/{capabilityId}\/commands\/(run|execute)/i.test(oas), false, 'F21 must not add a generic capability executor')
})

test('revised P8 Data presents origin/kind plus Overview Fields Relationships Rules', () => {
  for (const token of ['All','Internal','Integrations','Derived','Overview','Fields','Relationships','Rules','resourceKind','sourceKind','data-fields','data-relationships','data-rules']) has(html, token)
  for (const token of ['Orders','Follow-up Tasks','Sales performance']) has(html, token)
  has(html, 'semantic structure != physical database topology')
})

test('revised P8 Capabilities explains meaning, inputs and outputs while keeping technical identity secondary', () => {
  for (const token of ['What it does','Inputs','Outputs','Technical identity','function-signature','human capability name']) has(html, token)
  assert.doesNotMatch(html, /<button[^>]*>\s*(Run|Execute)\s*<\/button>/i)
})

test('revised P8 Integrations uses human switching language and explicit current-to-target flow', () => {
  for (const token of ['Connections used by this Project','Use connection','Switch connection','Connections owned by this Project','Current connection','Switch to','Confirm switch']) has(html, token)
  assert.equal(html.includes('>Add binding<'), false)
  assert.equal(html.includes('>Change<'), false)
})
