import fs from 'node:fs'
const oas = JSON.parse(fs.readFileSync('/tmp/conexus-product-openapi.bundle.json', 'utf8'))
const expectedIds = ['PRJ-01', 'PRJ-02', 'PRJ-03', 'PRJ-07', 'PRJ-08', 'PRJ-09', 'PRJ-23', 'PRJ-24']
const operations = new Map()
for (const [path, item] of Object.entries(oas.paths ?? {})) for (const [method, operation] of Object.entries(item ?? {})) {
  if (operation?.['x-conexus-4a-id']) operations.set(operation['x-conexus-4a-id'], { path, method, operation })
}
for (const id of expectedIds) {
  const entry = operations.get(id)
  if (entry?.operation['x-conexus-contract-state'] !== 'SCHEMA_CLOSED') throw new Error(`current Project operation is not schema-closed: ${id}`)
}
console.log(`Project current wire passed (${expectedIds.length} operations).`)
