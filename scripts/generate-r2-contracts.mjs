import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { canonicalBytes, sha256 } from '../packages/canonical-json/src/index.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')
const openapiSource = resolve(repositoryRoot, 'contracts/api/product/openapi.yaml')
const hubTarget = resolve(repositoryRoot, 'apps/hub/src/generated/r2-routes.ts')
const webTarget = resolve(repositoryRoot, 'apps/web/src/generated/r2-client.ts')
const authoritySources = [
  'contracts/api/product/openapi.yaml',
  'contracts/api/product/brain-paths.yaml',
  'contracts/api/product/project-brain-context-paths.yaml',
  'contracts/api/product/connection-paths.yaml',
  'contracts/api/product/project-paths.yaml',
  'docs/evidence/4d/4d-r1-operation-reachability-map.md',
  'docs/product/operation-ledger.md',
]
const expectedOperations = [
  ['BRN-01', 'GetWorkspaceBrain', 'GET', '/api/control/workspaces/{workspaceId}/brain', 'NONE'],
  ['BRN-02', 'ListBrainRevisions', 'GET', '/api/control/workspaces/{workspaceId}/brain/revisions', 'NONE'],
  ['BRN-03', 'GetBrainRevision', 'GET', '/api/control/workspaces/{workspaceId}/brain/revisions/{brainRevisionId}', 'NONE'],
  ['BRN-10', 'GetBrainHealth', 'GET', '/api/control/workspaces/{workspaceId}/brain/health', 'NONE'],
  ['BRN-14', 'GetProjectBrainContext', 'GET', '/api/control/projects/{projectId}/brain-context', 'NONE'],
  ['CON-01', 'ListConnectorDefinitions', 'GET', '/api/control/connectors', 'NONE'],
  ['CON-02', 'GetConnectorDefinition', 'GET', '/api/control/connectors/{connectorDefinitionId}', 'NONE'],
  ['CON-03', 'ListConnections', 'GET', '/api/control/connection-scopes/{ownerScopeKind}/{ownerId}/connections', 'NONE'],
  ['CON-04', 'GetConnection', 'GET', '/api/control/connections/{connectionId}', 'NONE'],
  ['CON-05', 'CreateConnection', 'POST', '/api/control/connection-scopes/{ownerScopeKind}/{ownerId}/connections', 'IDEMPOTENCY_KEY'],
  ['CON-06', 'ReviseConnection', 'POST', '/api/control/connections/{connectionId}/revisions', 'EXPLICIT_CURRENT_REVISION'],
  ['CON-07', 'SetConnectionCredential', 'PUT', '/api/control/connections/{connectionId}/credential', 'IDEMPOTENCY_KEY'],
  ['CON-08', 'QualifyConnection', 'POST', '/api/control/connections/{connectionId}/qualifications', 'IDEMPOTENCY_KEY'],
  ['CON-09', 'GetConnectionQualification', 'GET', '/api/control/connections/{connectionId}/qualifications/{qualificationId}', 'NONE'],
  ['PRJ-10', 'GetProjectBrainBinding', 'GET', '/api/control/projects/{projectId}/brain-binding', 'NONE'],
  ['PRJ-11', 'SetProjectBrainBinding', 'PUT', '/api/control/projects/{projectId}/brain-binding', 'CURRENT_OR_ABSENT'],
  ['PRJ-12', 'ClearProjectBrainBinding', 'DELETE', '/api/control/projects/{projectId}/brain-binding', 'IF_MATCH'],
  ['PRJ-13', 'ListProjectConnectionBindings', 'GET', '/api/control/projects/{projectId}/connection-bindings', 'NONE'],
  ['PRJ-14', 'SetProjectConnectionBinding', 'POST', '/api/control/projects/{projectId}/commands/set-connection-binding', 'EXPLICIT_CURRENT_SUBJECT'],
  ['PRJ-15', 'RemoveProjectConnectionBinding', 'POST', '/api/control/projects/{projectId}/commands/remove-connection-binding', 'EXPLICIT_CURRENT_SUBJECT'],
].map(([ownerId, operationId, method, path, currentStateCarrier]) => ({ ownerId, operationId, method, path, currentStateCarrier }))

const expectedByOwnerId = new Map(expectedOperations.map((operation) => [operation.ownerId, operation]))
if (resolve(process.argv[1] ?? '') === import.meta.filename) generate()

function generate() {
  const temporary = mkdtempSync(resolve(tmpdir(), 'conexus-r2-wire-'))
  const bundlePath = resolve(temporary, 'openapi.json')
  const stagedHubTarget = `${hubTarget}.tmp-${process.pid}`
  const stagedWebTarget = `${webTarget}.tmp-${process.pid}`
  try {
    assertAuthorityCensus()
    const cli = resolve(repositoryRoot, 'node_modules/@redocly/cli/bin/cli.js')
    const bundled = spawnSync(process.execPath, [cli, 'bundle', openapiSource, '--output', bundlePath, '--ext', 'json', '--dereferenced'], { encoding: 'utf8' })
    if (bundled.status !== 0) throw new Error(`R2_REDOCLY_BUNDLE_FAILED\n${bundled.stdout}\n${bundled.stderr}`)

    const openapi = JSON.parse(readFileSync(bundlePath, 'utf8'))
    const definitions = projectOperations(openapi)
    if (definitions.length !== expectedOperations.length || definitions.some((definition, index) => !sameProjection(definition, expectedOperations[index]))) {
      throw new Error(`R2_EXACT_OPERATION_CENSUS_FAILED_${definitions.length}`)
    }

    const sourceDigests = Object.fromEntries(authoritySources.map((path) => [path, sha256(readFileSync(resolve(repositoryRoot, path)))]))
    const projectionDigest = sha256(canonicalBytes(definitions))
    const hub = renderHub(definitions, sourceDigests, projectionDigest)
    const web = renderWeb(definitions, sourceDigests, projectionDigest)

    mkdirSync(dirname(hubTarget), { recursive: true })
    mkdirSync(dirname(webTarget), { recursive: true })
    writeFileSync(stagedHubTarget, hub, 'utf8')
    writeFileSync(stagedWebTarget, web, 'utf8')
    if (process.argv.includes('--check')) {
      assertGeneratedTarget(hubTarget, hub, 'R2_GENERATED_HUB_DRIFT')
      assertGeneratedTarget(webTarget, web, 'R2_GENERATED_WEB_DRIFT')
    } else {
      publishAtomically([
        { staged: stagedHubTarget, target: hubTarget },
        { staged: stagedWebTarget, target: webTarget },
      ])
    }
    process.stdout.write(`${JSON.stringify({ projectionDigest, routes: definitions.length, owners: definitions.map(({ ownerId }) => ownerId), sourceDigests })}\n`)
  } finally {
    rmSync(stagedHubTarget, { force: true })
    rmSync(stagedWebTarget, { force: true })
    rmSync(temporary, { recursive: true, force: true })
  }
}

function assertAuthorityCensus() {
  for (const path of authoritySources.slice(-2)) {
    const authority = readFileSync(resolve(repositoryRoot, path), 'utf8')
    for (const { ownerId } of expectedOperations) {
      if (!authority.includes(ownerId)) throw new Error(`R2_AUTHORITY_CENSUS_MISSING_${ownerId}_${path}`)
    }
  }
}

function projectOperations(openapi) {
  const definitions = []
  for (const [path, pathItem] of Object.entries(openapi.paths ?? {})) {
    for (const method of ['get', 'post', 'delete', 'put', 'patch']) {
      const operation = pathItem?.[method]
      const ownerId = operation?.['x-conexus-4a-id']
      if (!expectedByOwnerId.has(ownerId)) continue
      const schema = {}
      const parameters = mergeParameters(pathItem.parameters ?? [], operation.parameters ?? [])
      addParameterSchema(schema, parameters, 'header')
      addParameterSchema(schema, parameters, 'path')
      addParameterSchema(schema, parameters, 'query')
      const body = operation.requestBody?.content?.['application/json']?.schema
      if (body) schema.body = body
      const responses = {}
      for (const [status, response] of Object.entries(operation.responses ?? {})) {
        const responseSchema = response.content?.['application/json']?.schema ?? response.content?.['application/problem+json']?.schema
        if (responseSchema) responses[status] = responseSchema
      }
      if (Object.keys(responses).length) schema.response = responses
      definitions.push({
        ownerId,
        operationId: operation.operationId,
        method: method.toUpperCase(),
        path,
        url: toFastifyUrl(path),
        currentStateCarrier: operation['x-conexus-current-state-carrier'],
        schema,
      })
    }
  }
  return definitions.sort((left, right) => left.ownerId.localeCompare(right.ownerId, 'en'))
}

function renderHub(definitions, sourceDigests, projectionDigest) {
  return [
    '// GENERATED from canonical R2 contracts by scripts/generate-r2-contracts.mjs. Do not edit.',
    "import type { FastifySchema } from 'fastify'",
    '',
    `export const R2_SOURCE_DIGESTS = Object.freeze(${JSON.stringify(sourceDigests)})`,
    `export const R2_ROUTE_PROJECTION_DIGEST = ${JSON.stringify(projectionDigest)}`,
    `export type R2OwnerId = ${definitions.map(({ ownerId }) => JSON.stringify(ownerId)).join(' | ')}`,
    `export type R2CurrentStateCarrier = ${[...new Set(definitions.map(({ currentStateCarrier }) => currentStateCarrier))].map(JSON.stringify).join(' | ')}`,
    ...renderContractTypes(definitions, 'R2Hub'),
    "export type R2RouteDefinition = Readonly<{ ownerId: R2OwnerId; operationId: string; method: 'GET' | 'POST' | 'PUT' | 'DELETE'; path: string; url: string; currentStateCarrier: R2CurrentStateCarrier; schema: FastifySchema }>",
    `export const R2_GENERATED_ROUTES = Object.freeze(Object.fromEntries(${JSON.stringify(definitions)}.map((definition) => [definition.ownerId, Object.freeze(definition)])) as unknown as Record<R2OwnerId, R2RouteDefinition>)`,
    '',
  ].join('\n')
}

function renderWeb(definitions, sourceDigests, projectionDigest) {
  const transportProjection = definitions.map(({ schema: _schema, url: _url, ...definition }) => definition)
  const carriers = [...new Set(definitions.map(({ currentStateCarrier }) => currentStateCarrier))]
  return [
    '// GENERATED from canonical R2 contracts by scripts/generate-r2-contracts.mjs. Do not edit.',
    `export const R2_SOURCE_DIGESTS = Object.freeze(${JSON.stringify(sourceDigests)})`,
    `export const R2_CLIENT_PROJECTION_DIGEST = ${JSON.stringify(projectionDigest)}`,
    `export type R2ClientOwnerId = ${definitions.map(({ ownerId }) => JSON.stringify(ownerId)).join(' | ')}`,
    `export type R2ClientCurrentStateCarrier = ${carriers.map(JSON.stringify).join(' | ')}`,
    ...renderContractTypes(definitions, 'R2Client'),
    "export type R2ClientOperation = Readonly<{ ownerId: R2ClientOwnerId; operationId: string; method: 'GET' | 'POST' | 'PUT' | 'DELETE'; path: string; currentStateCarrier: R2ClientCurrentStateCarrier }>",
    `export const R2_CLIENT_OPERATIONS = Object.freeze(Object.fromEntries(${JSON.stringify(transportProjection)}.map((definition) => [definition.ownerId, Object.freeze(definition)])) as unknown as Record<R2ClientOwnerId, R2ClientOperation>)`,
    `export type R2ClientContractByOwnerId = Readonly<{ ${definitions.map(({ ownerId }) => `${JSON.stringify(ownerId)}: R2Client${ownerId.replace('-', '')}Contract`).join('; ')} }>`,
    `export type R2ClientRequestByOwnerId = Readonly<{ ${definitions.map(renderClientRequestEntry).join('; ')} }>`,
    "const csrf = () => document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=')",
    "const encodePath = (path: string, params: unknown) => path.replace(/\\{([^}]+)\\}/g, (_token, name: string) => encodeURIComponent(String((params as Record<string, unknown> | undefined)?.[name] ?? '')))",
    "const appendQuery = (path: string, querystring: unknown) => { const query = new URLSearchParams(); for (const [name, value] of Object.entries((querystring ?? {}) as Record<string, unknown>)) { if (value !== undefined) query.append(name, String(value)) } const suffix = query.toString(); return suffix ? path + '?' + suffix : path }",
    "const request = async <OwnerId extends R2ClientOwnerId>(ownerId: OwnerId, input: R2ClientRequestByOwnerId[OwnerId]): Promise<Response> => { const operation = R2_CLIENT_OPERATIONS[ownerId]; const values = input as { params?: unknown; querystring?: unknown; headers?: HeadersInit; body?: unknown }; const headers = new Headers(values.headers); const init: RequestInit = { method: operation.method, credentials: 'same-origin', headers }; if (Object.hasOwn(values, 'body')) { headers.set('content-type', 'application/json'); init.body = JSON.stringify(values.body) } if (operation.method !== 'GET') headers.set('x-conexus-csrf', decodeURIComponent(csrf() ?? '')); return fetch(appendQuery(encodePath(operation.path, values.params), values.querystring), init) }",
    "export const r2Client = Object.freeze({ request })",
    '',
  ].join('\n')
}

function renderClientRequestEntry({ ownerId, schema }) {
  const contract = `R2Client${ownerId.replace('-', '')}Contract`
  const members = []
  if (schema.params) members.push(`params: ${contract}['params']`)
  if (schema.querystring) members.push(`querystring${schema.querystring.required?.length ? '' : '?'}: ${contract}['querystring']`)
  if (schema.headers) members.push(`headers: ${contract}['headers']`)
  if (schema.body) members.push(`body: ${contract}['body']`)
  return `${JSON.stringify(ownerId)}: Readonly<{ ${members.join('; ')} }>`
}

function renderContractTypes(definitions, prefix) {
  return definitions.map(({ ownerId, schema }) => {
    const name = ownerId.replace('-', '')
    return `export type ${prefix}${name}Contract = Readonly<{ params: ${toTypeScript(schema.params)}; querystring: ${toTypeScript(schema.querystring)}; headers: ${toTypeScript(schema.headers)}; body: ${toTypeScript(schema.body)}; responses: ${toTypeScript({ type: 'object', properties: schema.response ?? {}, required: Object.keys(schema.response ?? {}) })} }>`
  })
}

function sameProjection(actual, wanted) {
  return actual.ownerId === wanted.ownerId
    && actual.operationId === wanted.operationId
    && actual.method === wanted.method
    && actual.path === wanted.path
    && actual.currentStateCarrier === wanted.currentStateCarrier
}

function assertGeneratedTarget(target, output, code) {
  if (!existsSync(target)) throw new Error(code)
  assertGeneratedBytes(readFileSync(target, 'utf8'), output, code)
}

export function assertGeneratedBytes(current, expected, code) {
  if (current !== expected) throw new Error(code)
}

function toFastifyUrl(path) { return path.replace(/\{([^}]+)\}/g, ':$1') }

function mergeParameters(pathParameters, operationParameters) {
  const parameters = new Map()
  for (const parameter of [...pathParameters, ...operationParameters]) parameters.set(`${parameter.in}:${parameter.name}`, parameter)
  return [...parameters.values()]
}

function addParameterSchema(schema, parameters, location) {
  const selected = parameters.filter((parameter) => parameter.in === location)
  if (!selected.length) return
  const key = location === 'header' ? 'headers' : location === 'path' ? 'params' : 'querystring'
  schema[key] = {
    type: 'object',
    required: selected.filter((parameter) => parameter.required).map((parameter) => location === 'header' ? parameter.name.toLowerCase() : parameter.name),
    properties: Object.fromEntries(selected.map((parameter) => [location === 'header' ? parameter.name.toLowerCase() : parameter.name, parameter.schema])),
  }
}

function publishAtomically(publications) {
  const completed = []
  try {
    for (const publication of publications) {
      publication.backup = `${publication.target}.backup-${process.pid}-${completed.length}`
      publication.replaced = false
      publication.installed = false
      if (existsSync(publication.target)) {
        renameSync(publication.target, publication.backup)
        publication.replaced = true
      }
      renameSync(publication.staged, publication.target)
      publication.installed = true
      completed.push(publication)
    }
    for (const publication of completed) if (publication.replaced) rmSync(publication.backup, { force: true })
  } catch (error) {
    for (const publication of [...publications].reverse()) {
      if (publication.installed && existsSync(publication.target)) unlinkSync(publication.target)
      if (publication.replaced && existsSync(publication.backup)) renameSync(publication.backup, publication.target)
    }
    throw error
  }
}

function toTypeScript(schema) {
  if (!schema) return 'unknown'
  if (schema.oneOf) return schema.oneOf.map(toTypeScript).join(' | ')
  if (schema.anyOf) return schema.anyOf.map(toTypeScript).join(' | ')
  if (schema.allOf) return schema.allOf.map(toTypeScript).join(' & ')
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(' | ')
  if (Object.hasOwn(schema, 'const')) return JSON.stringify(schema.const)
  if (Array.isArray(schema.type)) return schema.type.map((type) => toTypeScript({ ...schema, type })).join(' | ')
  if (schema.type === 'array') {
    const item = toTypeScript(schema.items)
    return `${item.includes(' | ') || item.includes(' & ') ? `(${item})` : item}[]`
  }
  if (schema.type === 'string') return 'string'
  if (schema.type === 'integer' || schema.type === 'number') return 'number'
  if (schema.type === 'boolean') return 'boolean'
  if (schema.type === 'null') return 'null'
  if (schema.type === 'object' || schema.properties) {
    const required = new Set(schema.required ?? [])
    const members = Object.entries(schema.properties ?? {}).map(([name, property]) => `${JSON.stringify(name)}${required.has(name) ? '' : '?'}: ${toTypeScript(property)}`)
    const shaped = `{ ${members.join('; ')} }`
    if (schema.additionalProperties === true) return members.length ? `${shaped} & Record<string, unknown>` : 'Record<string, unknown>'
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') return `${shaped} & Record<string, ${toTypeScript(schema.additionalProperties)}>`
    if (!members.length && schema.additionalProperties === false) return 'Record<string, never>'
    return shaped
  }
  return 'unknown'
}
