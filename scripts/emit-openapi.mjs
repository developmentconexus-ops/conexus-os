import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { FAILURE_STATUS, OPERATIONS, Problem } from '@conexus/contract'

const root = resolve(import.meta.dirname, '..')
const target = resolve(root, 'contracts/api/product/openapi.json')
const common = ['AUTHENTICATION_REQUIRED', 'REQUEST_AUTHENTICITY_DENIED', 'REQUEST_VALIDATION_FAILED', 'INTERNAL_UNEXPECTED']

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
  const components = {}
  const document = {
    openapi: '3.1.2',
    jsonSchemaDialect: 'https://spec.openapis.org/oas/3.1/dialect/2024-11-10',
    info: { title: 'Conexus Product API', version: '1.0.0', description: 'The Product HTTP API, emitted from the operations of @conexus/contract.' },
    servers: [{ url: '/', description: 'Relative Product API root.' }],
    security: [{ ConexusSession: [] }],
    paths: {},
    components: {
      securitySchemes: {
        ConexusSession: {
          type: 'apiKey', in: 'cookie', name: '__Host-conexus_session',
          description: 'Opaque server-owned Conexus session. The cookie is Secure, HttpOnly, SameSite=Lax, Path=/, with no Domain attribute.',
        },
      },
      schemas: components,
    },
  }
  asComponent(Problem, components, 'output')
  for (const op of Object.values(OPERATIONS)) {
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
    const failureCodes = [...new Set([...common, ...op.failures, ...Object.values(op.malformed ?? {}), ...(op.headers?.shape?.['idempotency-key'] ? ['IDEMPOTENCY_KEY_REQUIRED', 'IDEMPOTENCY_CONFLICT'] : [])])]
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
