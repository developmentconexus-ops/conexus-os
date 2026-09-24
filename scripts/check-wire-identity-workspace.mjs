import fs from 'node:fs'
const oas = JSON.parse(fs.readFileSync('/tmp/conexus-product-openapi.bundle.json', 'utf8'))
const expectedIds = ['IAM-01', 'IAM-02', 'IAM-03', 'IAM-04', 'IAM-05', 'IAM-06', 'IAM-10', 'IAM-11', 'IAM-12', 'IAM-13', 'WS-01', 'WS-02']
const operations = new Map()
for (const [path, item] of Object.entries(oas.paths ?? {})) for (const [method, operation] of Object.entries(item ?? {})) {
  if (operation?.['x-conexus-4a-id']) operations.set(operation['x-conexus-4a-id'], { path, method, operation })
}
for (const id of expectedIds) {
  const entry = operations.get(id)
  if (entry?.operation['x-conexus-contract-state'] !== 'SCHEMA_CLOSED') throw new Error(`current IAM/Workspace operation is not schema-closed: ${id}`)
}
console.log(`IAM/Workspace current wire passed (${expectedIds.length} operations).`)
