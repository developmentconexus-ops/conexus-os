import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { canonicalBytes, sha256 } from '../packages/canonical-json/src/index.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')
const source = resolve(repositoryRoot, 'contracts/api/product/openapi.yaml')
const target = resolve(repositoryRoot, 'apps/hub/src/generated/s2-routes.ts')
const clientTarget = resolve(repositoryRoot, 'apps/web/src/generated/workspace-client.ts')
const operationSource = resolve(repositoryRoot, 'runtime/r1/generated/r1/operations.json')
const expectedOperations = [
  { ownerId: 'WS-01', operationId: 'CreateWorkspace', method: 'POST', path: '/api/control/workspaces' },
  { ownerId: 'WS-02', operationId: 'GetWorkspace', method: 'GET', path: '/api/control/workspaces/{workspaceId}' },
]

const temporary = mkdtempSync(resolve(tmpdir(), 'conexus-s2-wire-'))
const bundlePath = resolve(temporary, 'openapi.json')
const stagedTarget = resolve(temporary, 's2-routes.ts')
const stagedClientTarget = resolve(temporary, 'workspace-client.ts')

try {
  const cli = resolve(repositoryRoot, 'node_modules/@redocly/cli/bin/cli.js')
  const bundled = spawnSync(process.execPath, [cli, 'bundle', source, '--output', bundlePath, '--ext', 'json', '--dereferenced'], { encoding: 'utf8' })
  if (bundled.status !== 0) throw new Error(`REDOCLY_BUNDLE_FAILED\n${bundled.stdout}\n${bundled.stderr}`)

  const openapi = JSON.parse(readFileSync(bundlePath, 'utf8'))
  const definitions = []
  for (const [path, pathItem] of Object.entries(openapi.paths ?? {})) {
    for (const method of ['get', 'post', 'delete', 'put', 'patch']) {
      const operation = pathItem?.[method]
      if (!operation || !expectedOperations.some(({ ownerId }) => ownerId === operation['x-conexus-4a-id'])) continue
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
      definitions.push({ ownerId: operation['x-conexus-4a-id'], operationId: operation.operationId, method: method.toUpperCase(), path, url: toFastifyUrl(path), schema })
    }
  }

  definitions.sort((a, b) => a.ownerId.localeCompare(b.ownerId, 'en'))
  if (definitions.length !== expectedOperations.length || definitions.some((definition, index) => !sameProjection(definition, expectedOperations[index]))) {
    throw new Error(`S2_ROUTE_CENSUS_OR_OAS_PROJECTION_${definitions.length}`)
  }

  const canonicalOperations = JSON.parse(readFileSync(operationSource, 'utf8')).operations
  if (!Array.isArray(canonicalOperations)) throw new Error('S2_CANONICAL_OPERATIONS_MISSING')
  for (const expected of expectedOperations) {
    const matches = canonicalOperations.filter((candidate) => candidate.ownerId === expected.ownerId)
    if (matches.length !== 1 || !sameProjection(matches[0], expected)) throw new Error(`S2_G0_ROUTE_MISMATCH_${expected.ownerId}`)
  }
  for (const definition of definitions) {
    const operation = canonicalOperations.find((candidate) => candidate.ownerId === definition.ownerId)
    if (!operation || operation.operationId !== definition.operationId || operation.method !== definition.method || operation.path !== definition.path) {
      throw new Error(`S2_G0_ROUTE_MISMATCH_${definition.ownerId}`)
    }
  }

  const sourceDigest = sha256(readFileSync(source))
  const routeDefinitions = definitions.map(({ path: _path, ...definition }) => definition)
  const projectionDigest = sha256(canonicalBytes(routeDefinitions))
  const byId = new Map(routeDefinitions.map((definition) => [definition.ownerId, definition]))

  const output = [
    '// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-r1-s2-contracts.mjs. Do not edit.',
    "import type { FastifySchema } from 'fastify'",
    '',
    `export const S2_PRODUCT_OAS_DIGEST = ${JSON.stringify(sourceDigest)}`,
    `export const S2_ROUTE_PROJECTION_DIGEST = ${JSON.stringify(projectionDigest)}`,
    "export type S2OwnerId = 'WS-01' | 'WS-02'",
    `export type Ws01Body = ${toTypeScript(byId.get('WS-01').schema.body)}`,
    `export type Ws01Response = ${toTypeScript(byId.get('WS-01').schema.response['201'])}`,
    `export type Ws02Params = ${toTypeScript(byId.get('WS-02').schema.params)}`,
    `export type Ws02Response = ${toTypeScript(byId.get('WS-02').schema.response['200'])}`,
    "export type S2RouteDefinition = Readonly<{ ownerId: S2OwnerId; operationId: string; method: 'GET' | 'POST'; url: string; schema: FastifySchema }>",
    `export const S2_GENERATED_ROUTES = Object.freeze(Object.fromEntries(${JSON.stringify(routeDefinitions)}.map((definition) => [definition.ownerId, Object.freeze(definition)])) as unknown as Record<S2OwnerId, S2RouteDefinition>)`,
    '',
  ].join('\n')

  const client = [
    '// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-r1-s2-contracts.mjs. Do not edit.',
    `export const S2_PRODUCT_OAS_DIGEST = ${JSON.stringify(sourceDigest)}`,
    `export const S2_ROUTE_PROJECTION_DIGEST = ${JSON.stringify(projectionDigest)}`,
    `export type WorkspaceSummary = ${toTypeScript(byId.get('WS-02').schema.response['200'])}`,
    `export type CreateWorkspaceInput = ${toTypeScript(byId.get('WS-01').schema.body)}`,
    `export type CreateWorkspaceResponse = ${toTypeScript(byId.get('WS-01').schema.response['201'])}`,
    "const csrf = () => document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=')",
    "const request = async (url: string, init: RequestInit = {}) => { const method = (init.method ?? 'GET').toUpperCase(); return fetch(url, { ...init, credentials: 'same-origin', headers: { ...(init.headers ?? {}), ...(method === 'POST' ? { 'x-conexus-csrf': decodeURIComponent(csrf() ?? '') } : {}) } }) }",
    'export const workspaceClient = Object.freeze({',
    `  createWorkspace: (body: CreateWorkspaceInput, idempotencyKey: string) => request(${JSON.stringify(byId.get('WS-01').url)}, { method: ${JSON.stringify(byId.get('WS-01').method)}, headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) }),`,
    `  getWorkspace: (workspaceId: string) => request(${JSON.stringify(byId.get('WS-02').url.replace(':workspaceId', ''))} + encodeURIComponent(workspaceId)),`,
    '})',
    '',
  ].join('\n')

  mkdirSync(dirname(target), { recursive: true })
  mkdirSync(dirname(clientTarget), { recursive: true })
  writeFileSync(stagedTarget, output, 'utf8')
  writeFileSync(stagedClientTarget, client, 'utf8')
  publishAtomically([
    { staged: stagedTarget, target },
    { staged: stagedClientTarget, target: clientTarget },
  ], temporary)
  process.stdout.write(`${JSON.stringify({ sourceDigest, projectionDigest, routes: definitions.length })}\n`)
} finally {
  rmSync(temporary, { recursive: true, force: true })
}

function sameProjection(actual, expected) {
  return actual.ownerId === expected.ownerId && actual.operationId === expected.operationId && actual.method === expected.method && (actual.path ?? actual.url) === expected.path
}

function toFastifyUrl(path) {
  return path.replace(/\{([^}]+)\}/g, ':$1')
}

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

function publishAtomically(publications, temporaryRoot) {
  const completed = []
  try {
    for (const publication of publications) {
      publication.backup = resolve(temporaryRoot, `${completed.length}.backup`)
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
    for (const publication of completed) {
      if (publication.replaced) {
        try { rmSync(publication.backup, { force: true }) } catch {}
      }
    }
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
  if (schema.type === 'array') return `${toTypeScript(schema.items)}[]`
  if (schema.type === 'string') return 'string'
  if (schema.type === 'integer' || schema.type === 'number') return 'number'
  if (schema.type === 'boolean') return 'boolean'
  if (schema.type === 'null') return 'null'
  if (schema.type === 'object' || schema.properties) {
    const required = new Set(schema.required ?? [])
    const members = Object.entries(schema.properties ?? {}).map(([name, property]) => `${JSON.stringify(name)}${required.has(name) ? '' : '?'}: ${toTypeScript(property)}`)
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') members.push(`[key: string]: ${toTypeScript(schema.additionalProperties)}`)
    else if (schema.additionalProperties === true) members.push('[key: string]: unknown')
    return `{ ${members.join('; ')} }`
  }
  return 'unknown'
}
