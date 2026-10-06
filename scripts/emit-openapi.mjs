import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { FAILURE_STATUS, OPERATIONS, Problem } from '@conexus/contract'

const root = resolve(import.meta.dirname, '..')
const target = resolve(root, 'contracts/api/product/openapi.json')
const cli = resolve(root, 'node_modules/@redocly/cli/bin/cli.js')
const common = ['AUTHENTICATION_REQUIRED', 'REQUEST_AUTHENTICITY_DENIED', 'REQUEST_VALIDATION_FAILED', 'INTERNAL_UNEXPECTED']

const bundleYaml = () => {
  const directory = mkdtempSync(join(tmpdir(), 'conexus-oas-'))
  try {
    const output = join(directory, 'bundle.json')
    const result = spawnSync(process.execPath, [cli, 'bundle', 'contracts/api/product/openapi.yaml', '--output', output, '--ext', 'json'], { cwd: root, encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`OPENAPI_YAML_BUNDLE_FAILED: ${result.stderr}${result.stdout}`)
    return JSON.parse(readFileSync(output, 'utf8'))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const noExtensions = (value) => {
  if (Array.isArray(value)) return value.map(noExtensions)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !key.startsWith('x-conexus-'))
    .map(([key, entry]) => [key, noExtensions(entry)]))
}

const asComponent = (schema, components, io) => {
  const json = z.toJSONSchema(schema, { io })
  for (const [name, definition] of Object.entries(json.$defs ?? {})) {
    const normalized = JSON.parse(JSON.stringify(definition).replaceAll('#/$defs/', '#/components/schemas/'))
    if (components[name] && JSON.stringify(components[name]) !== JSON.stringify(normalized)) throw new Error(`OPENAPI_SCHEMA_COLLISION: ${name}`)
    components[name] = normalized
  }
  delete json.$schema
  delete json.$defs
  return JSON.parse(JSON.stringify(json).replaceAll('#/$defs/', '#/components/schemas/'))
}

const parameters = (part, location, components) => {
  if (part === null) return []
  return Object.entries(part.shape).map(([name, schema]) => ({
    name,
    in: location,
    required: location === 'path' || !schema.safeParse(undefined).success,
    schema: asComponent(schema, components, 'input'),
  }))
}

const emit = () => {
  const bundled = bundleYaml()
  const yamlIds = new Set()
  const yamlOperationIds = new Set()
  for (const path of Object.values(bundled.paths)) {
    for (const entry of Object.values(path)) {
      if (entry && typeof entry === 'object' && entry['x-conexus-4a-id']) {
        const id = entry['x-conexus-4a-id']
        if (yamlIds.has(id)) throw new Error(`OPENAPI_DUPLICATE_OPERATION: ${id}`)
        yamlIds.add(id)
        yamlOperationIds.add(entry.operationId)
      }
    }
  }
  const document = noExtensions(bundled)
  const components = document.components.schemas
  delete components.Problem
  asComponent(Problem, components, 'output')
  for (const op of Object.values(OPERATIONS)) {
    if (yamlOperationIds.has(op.id)) throw new Error(`OPENAPI_DUPLICATE_OPERATION: ${op.id}`)
    const path = op.path.replace(/:(\w+)/g, '{$1}')
    const method = op.method.toLowerCase()
    document.paths[path] ??= {}
    if (document.paths[path][method]) throw new Error(`OPENAPI_DUPLICATE_METHOD_PATH: ${op.method} ${path}`)
    const responses = {}
    for (const [status, body] of Object.entries(op.success)) {
      responses[status] = { description: `Success ${status}` }
      if (body !== null) {
        const binary = 'mediaType' in body
        responses[status].content = binary
          ? { [body.mediaType]: { schema: { type: 'string', format: 'binary', maxLength: body.maxBytes } } }
          : { 'application/json': { schema: asComponent(body, components, 'output') } }
        if (binary && body.cache === 'revalidate-private') responses[status].headers = { ETag: { schema: { type: 'string' } }, 'Cache-Control': { schema: { type: 'string', enum: ['private, no-cache'] } } }
      }
    }
    const failureCodes = [...new Set([...common, ...op.failures, ...Object.values(op.malformed ?? {}), ...(op.headers?.shape?.['idempotency-key'] ? ['IDEMPOTENCY_KEY_REQUIRED'] : [])])]
    for (const code of failureCodes) {
      const status = FAILURE_STATUS[code]
      if (status === undefined) throw new Error(`OPENAPI_UNKNOWN_FAILURE: ${code}`)
      const key = String(status)
      const response = responses[key] ?? { description: 'Problem' }
      response.content = { 'application/problem+json': { schema: { allOf: [
        { $ref: '#/components/schemas/Problem' },
        { type: 'object', properties: { code: { enum: failureCodes.filter((item) => FAILURE_STATUS[item] === status) } } },
      ] } } }
      responses[key] = response
    }
    document.paths[path][method] = {
      operationId: op.id,
      summary: op.summary,
      parameters: [
        ...parameters(op.params, 'path', components),
        ...parameters(op.query, 'query', components),
        ...parameters(op.headers, 'header', components),
      ],
      ...(op.body === null ? {} : { requestBody: { required: true, content: { 'application/json': { schema: asComponent(op.body, components, 'input') } } } }),
      responses,
    }
  }
  return `${JSON.stringify(document, null, 2)}\n`
}

const output = emit()
if (process.argv.includes('--check')) {
  const directory = mkdtempSync(join(tmpdir(), 'conexus-oas-check-'))
  try {
    const candidate = join(directory, 'openapi.json')
    writeFileSync(candidate, output)
    if (readFileSync(target, 'utf8') !== readFileSync(candidate, 'utf8')) throw new Error('OPENAPI_STALE: run npm run contract:emit')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
} else {
  writeFileSync(target, output)
}
