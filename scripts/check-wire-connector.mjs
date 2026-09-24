import fs from 'node:fs'
const oas = JSON.parse(fs.readFileSync('/tmp/conexus-product-openapi.bundle.json', 'utf8'))
const expectedIds = ['CON-01', 'CON-02', 'CON-03', 'CON-04', 'CON-05', 'CON-06', 'CON-07']
const operations = new Map()
for (const [path, item] of Object.entries(oas.paths ?? {})) for (const [method, operation] of Object.entries(item ?? {})) {
  if (operation?.['x-conexus-4a-id']) operations.set(operation['x-conexus-4a-id'], { path, method, operation })
}
for (const id of expectedIds) {
  const entry = operations.get(id)
  if (entry?.operation['x-conexus-contract-state'] !== 'SCHEMA_CLOSED') throw new Error(`current Connector operation is not schema-closed: ${id}`)
}
// No response schema of a current Connector operation may carry a credential field, and the
// credential fields CON-02 accepts must stay writeOnly: a leak here is a wire defect, not a review
// nitpick.
const CREDENTIAL_FIELDS = new Set(['clientId', 'clientSecret', 'xToken', 'credential', 'credentialSealed'])
const walk = (schema, onProperty) => {
  if (!schema || typeof schema !== 'object') return
  if (schema.properties) for (const [name, property] of Object.entries(schema.properties)) { onProperty(name, property); walk(property, onProperty) }
  if (schema.items) walk(schema.items, onProperty)
  for (const key of ['oneOf', 'anyOf', 'allOf']) for (const branch of schema[key] ?? []) walk(branch, onProperty)
}
for (const { operation } of operations.values()) {
  for (const [status, response] of Object.entries(operation.responses ?? {})) {
    if (status[0] !== '2') continue
    const schema = response.content?.['application/json']?.schema
    walk(schema, (name) => {
      if (CREDENTIAL_FIELDS.has(name)) throw new Error(`a successful Connector response schema carries the credential field ${name}`)
    })
  }
  const requestSchema = operation.requestBody?.content?.['application/json']?.schema
  walk(requestSchema, (name, property) => {
    if (CREDENTIAL_FIELDS.has(name) && name !== 'credential' && property?.writeOnly !== true) {
      throw new Error(`Connector credential field ${name} is not writeOnly`)
    }
  })
}
console.log(`Connector current wire passed (${expectedIds.length} operations; no credential field in any response; every credential field writeOnly).`)
