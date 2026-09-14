import fs from 'node:fs'

const oas = JSON.parse(fs.readFileSync('/tmp/conexus-product-openapi.bundle.json', 'utf8'))
const methods = new Set(['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'])
const operations = new Map()
for (const [path, pathItem] of Object.entries(oas.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem ?? {})) {
    if (methods.has(method) && operation?.['x-conexus-4a-id']) operations.set(operation['x-conexus-4a-id'], { path, method, operation })
  }
}

const expected = {
  'BLD-08': ['/source/tree', 'get'],
  'BLD-09': ['/source/file', 'get'],
  'BLD-23': ['/builder-session', 'get'],
  'BLD-24': ['/builder-session/messages', 'post'],
}
for (const [id, [suffix, method]] of Object.entries(expected)) {
  const entry = operations.get(id)
  if (!entry?.path.endsWith(suffix) || entry.method !== method) throw new Error(`${id} must expose ${method.toUpperCase()} ${suffix}`)
  if (entry.operation['x-conexus-contract-state'] !== 'SCHEMA_CLOSED') throw new Error(`${id} is not SCHEMA_CLOSED`)
}

const resolve = (value) => {
  let current = value
  const seen = new Set()
  while (current?.$ref?.startsWith('#/')) {
    if (seen.has(current.$ref)) throw new Error(`schema ref cycle at ${current.$ref}`)
    seen.add(current.$ref)
    current = current.$ref.slice(2).split('/').reduce((node, key) => node?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], oas)
  }
  return current
}
const schema = (id, location, status = '200') => {
  const operation = operations.get(id)?.operation
  return resolve(location === 'request'
    ? operation?.requestBody?.content?.['application/json']?.schema
    : operation?.responses?.[status]?.content?.['application/json']?.schema)
}
const required = (value, ...names) => names.forEach((name) => {
  if (!value?.required?.includes(name)) throw new Error(`schema is missing required ${name}`)
})
const closed = (value, label) => {
  if (value?.type !== 'object' || value.additionalProperties !== false) throw new Error(`${label} must be closed`)
  return value
}

const session = closed(schema('BLD-23', 'response'), 'BLD-23 response')
required(session, 'projectId', 'messages', 'latestBuilderRun', 'latestCodeChangingRun', 'preview')
if (session.properties?.activeBuilderRun) throw new Error('BLD-23 exposes activeBuilderRun')
const preview = closed(resolve(session.properties?.preview), 'BLD-23 preview')
required(preview, 'workingSourceRevision', 'lastGoodSourceRevision', 'lastGoodArtifactRevisionId', 'lastGoodArtifactDigest')
const message = closed(schema('BLD-24', 'request'), 'BLD-24 request')
required(message, 'content', 'mode')
for (const path of Object.keys(oas.paths ?? {})) {
  if (path.endsWith('/builder-session/preview') || (path.includes('/builder-session/runs/') && path.endsWith('/stream'))) {
    throw new Error(`technical Builder route must not be Product OAS authority: ${path}`)
  }
}
for (const id of ['BLD-08', 'BLD-09']) {
  const operation = operations.get(id).operation
  if (!operation.parameters?.some((parameter) => resolve(parameter)?.name === 'sourceRevision')) throw new Error(`${id} must require sourceRevision`)
}
console.log('Builder wire contract OK: C-020 current operations only')
