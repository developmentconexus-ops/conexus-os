import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')
const ledger = read('docs/product/operation-ledger.md')
const permissions = read('docs/product/permission-contract.md')
const rootOas = read('contracts/api/product/openapi.yaml')
const explorerOas = read('contracts/api/product/project-data-explorer-paths.yaml')
const design = read('docs/evidence/4c/p02-f22-data-explorer-design.md')
const recompile = read('docs/evidence/4c/p02-f22-data-explorer-recompile-proof.md')
const pkg = read('package.json')
const selected = [
  ['PRJ-25', 'ListProjectDataExplorerSources'],
  ['PRJ-26', 'ListProjectDataExplorerObjects'],
  ['PRJ-27', 'GetProjectDataExplorerObject'],
  ['PRJ-28', 'ListProjectDataExplorerRows'],
]

test('F22 has four Project-owned reads and no new Permission family', () => {
  for (const [id, op] of selected) {
    assert.match(ledger, new RegExp(`${id}.*${op}`))
    assert.match(explorerOas, new RegExp(`x-conexus-4a-id: ${id}`))
    assert.match(explorerOas, new RegExp(`operationId: ${op}`))
  }
  assert.match(permissions, /project\.data\.read[\s\S]*PRJ-25\.\.28/)
  assert.doesNotMatch(permissions, /`project\.data\.(explore|sql|admin|write)`/)
})

test('F22 routes a bounded Project explorer and executable checker', () => {
  for (const token of [
    '/api/control/projects/{projectId}/data-explorer/sources',
    'data-explorer/sources/{dataSourceId}/objects',
    'objects/{dataObjectId}', 'rows:query',
  ]) assert.ok(rootOas.includes(token), `missing ${token}`)
  for (const token of [
    'ProjectDataExplorerSource', 'ProjectDataExplorerObject',
    'ProjectDataExplorerFilter', 'ProjectDataExplorerRowPage',
    'dataSourceId', 'dataObjectId', 'dataColumnId',
  ]) assert.ok(explorerOas.includes(token), `missing ${token}`)
  assert.match(pkg, /check-wire-project-data-explorer\.mjs/)
  assert.doesNotMatch(explorerOas, /\b(sql|connectionString|credential|password|ddl)\b\s*:/i)
})

test('F22 adversarial-review clarifications remain explicit and routed', () => {
  assert.match(explorerOas, /continuationToken[\s\S]*filters[\s\S]*sort[\s\S]*422[\s\S]*never reinterpreted/i)
  assert.match(permissions, /already-issued `project\.data\.read`[\s\S]*raw-row/i)
  assert.match(design, /semantic Data inspection without raw-row disclosure/i)
  assert.match(explorerOas, /locale-dependent or ambiguous[\s\S]*422/i)
  assert.match(explorerOas, /undisclosed[\s\S]*absent[\s\S]*404/i)
  assert.match(recompile, /PENDING-RUNTIME[\s\S]*cross-Project[\s\S]*ineligible[\s\S]*operator\/type[\s\S]*page token/i)
})
