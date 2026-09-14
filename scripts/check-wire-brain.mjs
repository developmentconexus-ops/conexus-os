import fs from 'node:fs'
const oas = JSON.parse(fs.readFileSync('/tmp/conexus-product-openapi.bundle.json', 'utf8'))
const expectedIds = ['BRN-01', 'BRN-02', 'BRN-03', 'BRN-10', 'BRN-14']
const operations = new Map()
for (const [path, item] of Object.entries(oas.paths ?? {})) for (const [method, operation] of Object.entries(item ?? {})) {
  if (operation?.['x-conexus-4a-id']) operations.set(operation['x-conexus-4a-id'], { path, method, operation })
}
for (const id of expectedIds) {
  const entry = operations.get(id)
  if (entry?.operation['x-conexus-contract-state'] !== 'SCHEMA_CLOSED') throw new Error(`current Brain operation is not schema-closed: ${id}`)
}
console.log(`Brain current wire passed (${expectedIds.length} operations).`)
