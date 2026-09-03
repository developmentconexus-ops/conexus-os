import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { canonicalBytes, sha256 } from '../packages/canonical-json/src/index.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')
const source = resolve(repositoryRoot, 'contracts/api/product/openapi.yaml')
const target = resolve(repositoryRoot, 'apps/hub/src/generated/s3-routes.ts')
const clientTarget = resolve(repositoryRoot, 'apps/web/src/generated/project-client.ts')
const operationSource = resolve(repositoryRoot, 'runtime/r1/generated/r1/operations.json')
const expectedOperations = [
  { ownerId: 'PRJ-01', operationId: 'ListProjects', method: 'GET', path: '/api/control/workspaces/{workspaceId}/projects' },
  { ownerId: 'PRJ-02', operationId: 'GetProject', method: 'GET', path: '/api/control/projects/{projectId}' },
  { ownerId: 'PRJ-03', operationId: 'CreateProject', method: 'POST', path: '/api/control/workspaces/{workspaceId}/projects' },
  { ownerId: 'PRJ-07', operationId: 'RunInceptionInvestigation', method: 'POST', path: '/api/control/projects/{projectId}/inception-investigations' },
  { ownerId: 'PRJ-08', operationId: 'GetApprovedProjectBaseline', method: 'GET', path: '/api/control/projects/{projectId}/baseline' },
  { ownerId: 'PRJ-09', operationId: 'ApproveProjectBaselineRevision', method: 'POST', path: '/api/control/projects/{projectId}/baseline/decisions' },
  { ownerId: 'PRJ-23', operationId: 'GetProjectBaselineCandidate', method: 'GET', path: '/api/control/projects/{projectId}/baseline-candidates/{candidateBaselineDigest}' },
  { ownerId: 'PRJ-24', operationId: 'AskConexusAboutBaselineCandidate', method: 'POST', path: '/api/control/projects/{projectId}/baseline-candidates/{candidateBaselineDigest}/assistant/queries' },
]

const temporary = mkdtempSync(resolve(tmpdir(), 'conexus-s3-wire-'))
const bundlePath = resolve(temporary, 'openapi.json')
const stagedTarget = `${target}.tmp-${process.pid}`
const stagedClientTarget = `${clientTarget}.tmp-${process.pid}`
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
    throw new Error(`S3_ROUTE_CENSUS_OR_OAS_PROJECTION_${definitions.length}`)
  }
  const canonicalOperations = JSON.parse(readFileSync(operationSource, 'utf8')).operations
  if (!Array.isArray(canonicalOperations)) throw new Error('S3_CANONICAL_OPERATIONS_MISSING')
  for (const expected of expectedOperations) {
    const matches = canonicalOperations.filter((candidate) => candidate.ownerId === expected.ownerId)
    if (matches.length !== 1 || !sameProjection(matches[0], expected)) throw new Error(`S3_G0_ROUTE_MISMATCH_${expected.ownerId}`)
  }
  const routeDefinitions = definitions.map(({ path: _path, ...definition }) => definition)
  const byId = new Map(routeDefinitions.map((definition) => [definition.ownerId, definition]))
  const sourceDigest = sha256(readFileSync(source))
  const projectionDigest = sha256(canonicalBytes(routeDefinitions))
  const output = [
    '// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-r1-s3-contracts.mjs. Do not edit.',
    "import type { FastifySchema } from 'fastify'", '',
    `export const S3_PRODUCT_OAS_DIGEST = ${JSON.stringify(sourceDigest)}`,
    `export const S3_ROUTE_PROJECTION_DIGEST = ${JSON.stringify(projectionDigest)}`,
    "export type S3OwnerId = 'PRJ-01' | 'PRJ-02' | 'PRJ-03' | 'PRJ-07' | 'PRJ-08' | 'PRJ-09' | 'PRJ-23' | 'PRJ-24'",
    `export type Prj01Params = ${toTypeScript(byId.get('PRJ-01').schema.params)}`,
    `export type Prj01Response = ${toTypeScript(byId.get('PRJ-01').schema.response['200'])}`,
    `export type Prj02Params = ${toTypeScript(byId.get('PRJ-02').schema.params)}`,
    `export type Prj02Response = ${toTypeScript(byId.get('PRJ-02').schema.response['200'])}`,
    `export type Prj03Params = ${toTypeScript(byId.get('PRJ-03').schema.params)}`,
    `export type Prj03Body = ${toTypeScript(byId.get('PRJ-03').schema.body)}`,
    `export type Prj03Response = ${toTypeScript(byId.get('PRJ-03').schema.response['201'])}`,
    `export type Prj07Params = ${toTypeScript(byId.get('PRJ-07').schema.params)}`,
    `export type Prj07Body = ${toTypeScript(byId.get('PRJ-07').schema.body)}`,
    `export type Prj07Response = ${toTypeScript(byId.get('PRJ-07').schema.response['200'])}`,
    `export type Prj08Params = ${toTypeScript(byId.get('PRJ-08').schema.params)}`,
    `export type Prj08Response = ${toTypeScript(byId.get('PRJ-08').schema.response['200'])}`,
    `export type Prj09Params = ${toTypeScript(byId.get('PRJ-09').schema.params)}`,
    `export type Prj09Body = ${toTypeScript(byId.get('PRJ-09').schema.body)}`,
    `export type Prj09Response = ${toTypeScript(byId.get('PRJ-09').schema.response['200'])}`,
    `export type Prj23Params = ${toTypeScript(byId.get('PRJ-23').schema.params)}`,
    `export type Prj23Response = ${toTypeScript(byId.get('PRJ-23').schema.response['200'])}`,
    `export type Prj24Params = ${toTypeScript(byId.get('PRJ-24').schema.params)}`,
    `export type Prj24Body = ${toTypeScript(byId.get('PRJ-24').schema.body)}`,
    `export type Prj24Response = ${toTypeScript(byId.get('PRJ-24').schema.response['200'])}`,
    "export type S3RouteDefinition = Readonly<{ ownerId: S3OwnerId; operationId: string; method: 'GET' | 'POST'; url: string; schema: FastifySchema }>",
    `export const S3_GENERATED_ROUTES = Object.freeze(Object.fromEntries(${JSON.stringify(routeDefinitions)}.map((definition) => [definition.ownerId, Object.freeze(definition)])) as unknown as Record<S3OwnerId, S3RouteDefinition>)`, '',
  ].join('\n')
  const client = [
    '// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-r1-s3-contracts.mjs. Do not edit.',
    `export const S3_PRODUCT_OAS_DIGEST = ${JSON.stringify(sourceDigest)}`,
    `export const S3_ROUTE_PROJECTION_DIGEST = ${JSON.stringify(projectionDigest)}`,
    `export type ProjectSummary = ${toTypeScript(byId.get('PRJ-01').schema.response['200'].items)}`,
    `export type ProjectRepresentation = ${toTypeScript(byId.get('PRJ-02').schema.response['200'])}`,
    `export type CreateProjectInput = ${toTypeScript(byId.get('PRJ-03').schema.body)}`,
    `export type CreateProjectResponse = ${toTypeScript(byId.get('PRJ-03').schema.response['201'])}`,
    `export type RunInceptionInput = ${toTypeScript(byId.get('PRJ-07').schema.body)}`,
    `export type RunInceptionResponse = ${toTypeScript(byId.get('PRJ-07').schema.response['200'])}`,
    `export type ApprovedBaseline = ${toTypeScript(byId.get('PRJ-08').schema.response['200'])}`,
    `export type ApproveBaselineInput = ${toTypeScript(byId.get('PRJ-09').schema.body)}`,
    `export type ProjectBaselineCandidate = ${toTypeScript(byId.get('PRJ-23').schema.response['200'])}`,
    `export type AskBaselineCandidateInput = ${toTypeScript(byId.get('PRJ-24').schema.body)}`,
    `export type AskBaselineCandidateResponse = ${toTypeScript(byId.get('PRJ-24').schema.response['200'])}`,
    "const csrf = () => document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=')",
    "const request = async (url: string, init: RequestInit = {}) => { const method = (init.method ?? 'GET').toUpperCase(); return fetch(url, { ...init, credentials: 'same-origin', headers: { ...(init.headers ?? {}), ...(method === 'POST' ? { 'x-conexus-csrf': decodeURIComponent(csrf() ?? '') } : {}) } }) }",
    'export const projectClient = Object.freeze({',
    `  listProjects: (workspaceId: string) => request(${JSON.stringify(byId.get('PRJ-01').url.replace(':workspaceId/projects', ''))} + encodeURIComponent(workspaceId) + '/projects'),`,
    `  getProject: (projectId: string) => request(${JSON.stringify(byId.get('PRJ-02').url.replace(':projectId', ''))} + encodeURIComponent(projectId)),`,
    `  createProject: (workspaceId: string, body: CreateProjectInput, idempotencyKey: string) => request(${JSON.stringify(byId.get('PRJ-03').url.replace(':workspaceId/projects', ''))} + encodeURIComponent(workspaceId) + '/projects', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) }),`,
    `  runInception: (projectId: string, body: RunInceptionInput, idempotencyKey: string) => request(${JSON.stringify(byId.get('PRJ-07').url.replace(':projectId/inception-investigations', ''))} + encodeURIComponent(projectId) + '/inception-investigations', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) }),`,
    `  getApprovedBaseline: (projectId: string) => request(${JSON.stringify(byId.get('PRJ-08').url.replace(':projectId/baseline', ''))} + encodeURIComponent(projectId) + '/baseline'),`,
    `  approveBaseline: (projectId: string, body: ApproveBaselineInput) => request(${JSON.stringify(byId.get('PRJ-09').url.replace(':projectId/baseline/decisions', ''))} + encodeURIComponent(projectId) + '/baseline/decisions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),`,
    `  getBaselineCandidate: (projectId: string, candidateBaselineDigest: string) => request(${JSON.stringify(byId.get('PRJ-23').url.replace(':projectId/baseline-candidates/:candidateBaselineDigest', ''))} + encodeURIComponent(projectId) + '/baseline-candidates/' + encodeURIComponent(candidateBaselineDigest)),`,
    `  askAboutBaselineCandidate: (projectId: string, candidateBaselineDigest: string, body: AskBaselineCandidateInput) => request(${JSON.stringify(byId.get('PRJ-24').url.replace(':projectId/baseline-candidates/:candidateBaselineDigest/assistant/queries', ''))} + encodeURIComponent(projectId) + '/baseline-candidates/' + encodeURIComponent(candidateBaselineDigest) + '/assistant/queries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),`,
    '})', '',
  ].join('\n')
  mkdirSync(dirname(target), { recursive: true })
  mkdirSync(dirname(clientTarget), { recursive: true })
  writeFileSync(stagedTarget, output, 'utf8')
  writeFileSync(stagedClientTarget, client, 'utf8')
  if (process.argv.includes('--check')) {
    if (!existsSync(target) || readFileSync(target, 'utf8') !== output) throw new Error('S3_GENERATED_ROUTE_DRIFT')
    if (!existsSync(clientTarget) || readFileSync(clientTarget, 'utf8') !== client) throw new Error('S3_GENERATED_CLIENT_DRIFT')
  } else publishAtomically([{ staged: stagedTarget, target }, { staged: stagedClientTarget, target: clientTarget }])
  process.stdout.write(`${JSON.stringify({ sourceDigest, projectionDigest, routes: definitions.length })}\n`)
} finally {
  rmSync(stagedTarget, { force: true })
  rmSync(stagedClientTarget, { force: true })
  rmSync(temporary, { recursive: true, force: true })
}

function sameProjection(actual, wanted) {
  return actual.ownerId === wanted.ownerId && actual.operationId === wanted.operationId && actual.method === wanted.method && (actual.path ?? actual.url) === wanted.path
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
  schema[key] = { type: 'object', required: selected.filter((parameter) => parameter.required).map((parameter) => location === 'header' ? parameter.name.toLowerCase() : parameter.name), properties: Object.fromEntries(selected.map((parameter) => [location === 'header' ? parameter.name.toLowerCase() : parameter.name, parameter.schema])) }
}
function publishAtomically(publications) {
  const completed = []
  try {
    for (const publication of publications) {
      publication.backup = `${publication.target}.backup-${process.pid}-${completed.length}`
      publication.replaced = false
      publication.installed = false
      if (existsSync(publication.target)) { renameSync(publication.target, publication.backup); publication.replaced = true }
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
  if (schema.type === 'array') return `${toTypeScript(schema.items)}[]`
  if (schema.type === 'string') return 'string'
  if (schema.type === 'integer' || schema.type === 'number') return 'number'
  if (schema.type === 'boolean') return 'boolean'
  if (schema.type === 'null') return 'null'
  if (schema.type === 'object' || schema.properties) {
    const required = new Set(schema.required ?? [])
    const members = Object.entries(schema.properties ?? {}).map(([name, property]) => `${JSON.stringify(name)}${required.has(name) ? '' : '?'}: ${toTypeScript(property)}`)
    return `{ ${members.join('; ')} }`
  }
  return 'unknown'
}
