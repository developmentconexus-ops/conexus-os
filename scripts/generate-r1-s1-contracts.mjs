import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { canonicalBytes, sha256 } from '../packages/canonical-json/src/index.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')
const source = resolve(repositoryRoot, 'contracts/api/product/openapi.yaml')
const target = resolve(repositoryRoot, 'apps/hub/src/generated/s1-routes.ts')
const clientTarget = resolve(repositoryRoot, 'apps/web/src/generated/iam-client.ts')
const operationSource = resolve(repositoryRoot, 'runtime/r1/generated/r1/operations.json')
const temporary = mkdtempSync(resolve(tmpdir(), 'conexus-s1-wire-'))
const bundlePath = resolve(temporary, 'openapi.json')
const ownerIds = new Set(['IAM-01', 'IAM-02', 'IAM-03'])

try {
  const cli = resolve(repositoryRoot, 'node_modules/@redocly/cli/bin/cli.js')
  const bundled = spawnSync(process.execPath, [cli, 'bundle', source, '--output', bundlePath, '--ext', 'json', '--dereferenced'], { encoding: 'utf8' })
  if (bundled.status !== 0) throw new Error(`REDOCLY_BUNDLE_FAILED\n${bundled.stdout}\n${bundled.stderr}`)
  const openapi = JSON.parse(readFileSync(bundlePath, 'utf8'))
  const definitions = []
  for (const [path, pathItem] of Object.entries(openapi.paths)) {
    for (const method of ['get', 'post', 'delete']) {
      const operation = pathItem[method]
      if (!operation || !ownerIds.has(operation['x-conexus-4a-id'])) continue
      const schema = {}
      const parameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]
      const headers = parameters.filter((parameter) => parameter.in === 'header')
      if (headers.length) {
        schema.headers = {
          type: 'object',
          required: headers.filter((parameter) => parameter.required).map((parameter) => parameter.name.toLowerCase()),
          properties: Object.fromEntries(headers.map((parameter) => [parameter.name.toLowerCase(), parameter.schema])),
        }
      }
      const body = operation.requestBody?.content?.['application/json']?.schema
      if (body) schema.body = body
      const responses = {}
      for (const [status, response] of Object.entries(operation.responses)) {
        const responseSchema = response.content?.['application/json']?.schema ?? response.content?.['application/problem+json']?.schema
        if (responseSchema) responses[status] = responseSchema
      }
      if (Object.keys(responses).length) schema.response = responses
      definitions.push({ ownerId: operation['x-conexus-4a-id'], operationId: operation.operationId, method: method.toUpperCase(), url: path, schema })
    }
  }
  definitions.sort((a, b) => a.ownerId.localeCompare(b.ownerId, 'en'))
  if (definitions.length !== 3) throw new Error(`S1_ROUTE_CENSUS_${definitions.length}`)
  const canonicalOperations = JSON.parse(readFileSync(operationSource, 'utf8')).operations
  for (const definition of definitions) {
    const operation = canonicalOperations.find((candidate) => candidate.ownerId === definition.ownerId)
    if (!operation || operation.operationId !== definition.operationId || operation.method !== definition.method || operation.path !== definition.url) {
      throw new Error(`S1_G0_ROUTE_MISMATCH_${definition.ownerId}`)
    }
  }
  const sourceDigest = sha256(readFileSync(source))
  const projectionDigest = sha256(canonicalBytes(definitions))
  const byId = new Map(definitions.map((definition) => [definition.ownerId, definition]))
  const output = [
    '// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-r1-s1-contracts.mjs. Do not edit.',
    "import type { FastifySchema } from 'fastify'",
    '',
    `export const S1_PRODUCT_OAS_DIGEST = ${JSON.stringify(sourceDigest)}`,
    `export const S1_ROUTE_PROJECTION_DIGEST = ${JSON.stringify(projectionDigest)}`,
    "export type S1OwnerId = 'IAM-01' | 'IAM-02' | 'IAM-03'",
    `export type Iam01Response = ${toTypeScript(byId.get('IAM-01').schema.response['200'])}`,
    `export type Iam03Body = ${toTypeScript(byId.get('IAM-03').schema.body)}`,
    `export type Iam03Response = ${toTypeScript(byId.get('IAM-03').schema.response['201'])}`,
    "export type S1RouteDefinition = Readonly<{ ownerId: S1OwnerId; operationId: string; method: 'GET' | 'POST' | 'DELETE'; url: string; schema: FastifySchema }>",
    `export const S1_GENERATED_ROUTES = Object.freeze(Object.fromEntries(${JSON.stringify(definitions)}.map((definition) => [definition.ownerId, Object.freeze(definition)])) as Record<S1OwnerId, S1RouteDefinition>)`,
    '',
  ].join('\n')
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, output, 'utf8')
  const client = [
    '// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-r1-s1-contracts.mjs. Do not edit.',
    `export const S1_PRODUCT_OAS_DIGEST = ${JSON.stringify(sourceDigest)}`,
    `export const S1_ROUTE_PROJECTION_DIGEST = ${JSON.stringify(projectionDigest)}`,
    `export type AccountSummary = ${toTypeScript(byId.get('IAM-03').schema.response['201'])}`,
    `export type AccessContext = ${toTypeScript(byId.get('IAM-01').schema.response['200'])}`,
    `export type ProvisionAccountInput = ${toTypeScript(byId.get('IAM-03').schema.body)}`,
    "const csrf = () => document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=')",
    "const request = async (url: string, init: RequestInit = {}) => fetch(url, { ...init, credentials: 'same-origin', headers: { ...(init.headers ?? {}), ...(init.method && init.method !== 'GET' ? { 'x-conexus-csrf': decodeURIComponent(csrf() ?? '') } : {}) } })",
    'export const iamClient = Object.freeze({',
    `  getAccessContext: () => request(${JSON.stringify(byId.get('IAM-01').url)}),`,
    `  provisionAccount: (body: ProvisionAccountInput, idempotencyKey: string) => request(${JSON.stringify(byId.get('IAM-03').url)}, { method: ${JSON.stringify(byId.get('IAM-03').method)}, headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) }),`,
    `  endSession: () => request(${JSON.stringify(byId.get('IAM-02').url)}, { method: ${JSON.stringify(byId.get('IAM-02').method)} }),`,
    '})',
    '',
  ].join('\n')
  mkdirSync(dirname(clientTarget), { recursive: true })
  writeFileSync(clientTarget, client, 'utf8')
  process.stdout.write(`${JSON.stringify({ sourceDigest, projectionDigest, routes: definitions.length })}\n`)
} finally {
  rmSync(temporary, { recursive: true, force: true })
}

function toTypeScript(schema) {
  if (schema.oneOf) return schema.oneOf.map(toTypeScript).join(' | ')
  if (schema.type === 'array') return `${toTypeScript(schema.items)}[]`
  if (schema.type === 'string') return 'string'
  if (schema.type === 'integer' || schema.type === 'number') return 'number'
  if (schema.type === 'boolean') return 'boolean'
  if (schema.type === 'object') {
    const required = new Set(schema.required ?? [])
    const members = Object.entries(schema.properties ?? {}).map(([name, property]) => `${JSON.stringify(name)}${required.has(name) ? '' : '?'}: ${toTypeScript(property)}`)
    return `{ ${members.join('; ')} }`
  }
  if (Object.hasOwn(schema, 'const')) return JSON.stringify(schema.const)
  return 'unknown'
}
