import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { canonicalBytes, sha256 } from '../packages/canonical-json/src/index.mjs'
import { toTypeScript } from './schema-to-typescript.mjs'

// Same shape as scripts/generate-iam-contracts.mjs, over the Connector Path Items instead of the
// IAM and Workspace ones. A second per-module generator earns its place once the projection differs
// enough to matter (it does: Connector has no Idempotency-Key carrier and two idempotent-create
// response codes), rather than growing one generator's branching over every module.

const repositoryRoot = resolve(import.meta.dirname, '..')
const source = resolve(repositoryRoot, 'contracts/api/product/openapi.yaml')
const target = resolve(repositoryRoot, 'apps/hub/src/generated/connector-routes.ts')
const clientTarget = resolve(repositoryRoot, 'apps/web/src/generated/connector-client.ts')
const temporary = mkdtempSync(resolve(tmpdir(), 'conexus-connector-wire-'))
const bundlePath = resolve(temporary, 'openapi.json')
const ownerIds = new Set(['CON-01', 'CON-02', 'CON-03', 'CON-04', 'CON-08', 'CON-09', 'CON-10'])
const stagedTarget = `${target}.tmp-${process.pid}`
const stagedClientTarget = `${clientTarget}.tmp-${process.pid}`

try {
  const cli = resolve(repositoryRoot, 'node_modules/@redocly/cli/bin/cli.js')
  const bundled = spawnSync(process.execPath, [cli, 'bundle', source, '--output', bundlePath, '--ext', 'json', '--dereferenced'], { encoding: 'utf8' })
  if (bundled.status !== 0) throw new Error(`REDOCLY_BUNDLE_FAILED\n${bundled.stdout}\n${bundled.stderr}`)
  const openapi = JSON.parse(readFileSync(bundlePath, 'utf8'))
  const definitions = []
  for (const [path, pathItem] of Object.entries(openapi.paths)) {
    for (const method of ['get', 'post', 'put', 'delete']) {
      const operation = pathItem[method]
      if (!operation || !ownerIds.has(operation['x-conexus-4a-id'])) continue
      const schema = {}
      const parameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]
      const pathParameters = parameters.filter((parameter) => parameter.in === 'path')
      if (pathParameters.length) {
        schema.params = {
          type: 'object',
          required: pathParameters.filter((parameter) => parameter.required).map((parameter) => parameter.name),
          properties: Object.fromEntries(pathParameters.map((parameter) => [parameter.name, parameter.schema])),
        }
      }
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
      definitions.push({ ownerId: operation['x-conexus-4a-id'], operationId: operation.operationId, method: method.toUpperCase(), path, url: toFastifyUrl(path), schema })
    }
  }
  definitions.sort((a, b) => a.ownerId.localeCompare(b.ownerId, 'en'))
  if (definitions.length !== ownerIds.size) throw new Error(`CONNECTOR_ROUTE_CENSUS_${definitions.length}`)
  const sourceDigest = sha256(readFileSync(source))
  const projectionDigest = sha256(canonicalBytes(definitions))
  const byId = new Map(definitions.map((definition) => [definition.ownerId, definition]))
  const output = [
    '// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-connector-contracts.mjs. Do not edit.',
    "import type { FastifySchema } from 'fastify'",
    '',
    `export const CONNECTOR_PRODUCT_OAS_DIGEST = ${JSON.stringify(sourceDigest)}`,
    `export const CONNECTOR_ROUTE_PROJECTION_DIGEST = ${JSON.stringify(projectionDigest)}`,
    `export type ConnectorOwnerId = ${[...ownerIds].sort().map((id) => JSON.stringify(id).replaceAll('"', "'")).join(' | ')}`,
    `export type ConnectorConnectionModel = ${toTypeScript(byId.get('CON-01').schema.response['200'].properties.entries.items)}`,
    `export type CreateWorkspaceConnectionBody = ${toTypeScript(byId.get('CON-02').schema.body)}`,
    `export type CheckWorkspaceConnectionResponse = ${toTypeScript(byId.get('CON-03').schema.response['200'])}`,
    `export type ConnectionBindingEntryModel = ${toTypeScript(byId.get('CON-08').schema.response['200'].properties.entries.items)}`,
    `export type BindProjectConnectionBody = ${toTypeScript(byId.get('CON-09').schema.body)}`,
    `export type ConnectionBindingModel = ${toTypeScript(byId.get('CON-09').schema.response['200'])}`,
    `export type WorkspaceConnectionsParams = ${JSON.stringify({ workspaceId: 'string' }).replaceAll('"', '')}`,
    `export type WorkspaceConnectionParams = ${JSON.stringify({ workspaceId: 'string', connectionId: 'string' }).replaceAll('"', '')}`,
    `export type ProjectConnectionBindingsParams = ${JSON.stringify({ projectId: 'string' }).replaceAll('"', '')}`,
    `export type ProjectConnectionBindingParams = ${JSON.stringify({ projectId: 'string', bindingId: 'string' }).replaceAll('"', '')}`,
    "export type ConnectorRouteDefinition = Readonly<{ ownerId: ConnectorOwnerId; operationId: string; method: 'GET' | 'POST' | 'PUT' | 'DELETE'; path: string; url: string; schema: FastifySchema }>",
    `export const CONNECTOR_GENERATED_ROUTES = Object.freeze(Object.fromEntries(${JSON.stringify(definitions)}.map((definition) => [definition.ownerId, Object.freeze(definition)])) as Record<ConnectorOwnerId, ConnectorRouteDefinition>)`,
    '',
  ].join('\n')
  const client = [
    '// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-connector-contracts.mjs. Do not edit.',
    `export const CONNECTOR_PRODUCT_OAS_DIGEST = ${JSON.stringify(sourceDigest)}`,
    `export const CONNECTOR_ROUTE_PROJECTION_DIGEST = ${JSON.stringify(projectionDigest)}`,
    `export type ConnectorConnection = ${toTypeScript(byId.get('CON-01').schema.response['200'].properties.entries.items)}`,
    `export type CreateWorkspaceConnectionInput = ${toTypeScript(byId.get('CON-02').schema.body)}`,
    `export type CheckWorkspaceConnectionOutcome = ${toTypeScript(byId.get('CON-03').schema.response['200'])}`,
    `export type ConnectionBindingEntry = ${toTypeScript(byId.get('CON-08').schema.response['200'].properties.entries.items)}`,
    `export type BindProjectConnectionInput = ${toTypeScript(byId.get('CON-09').schema.body)}`,
    `export type ConnectionBinding = ${toTypeScript(byId.get('CON-09').schema.response['200'])}`,
    `export const BINDING_NAME_PATTERN = new RegExp(${JSON.stringify(byId.get('CON-09').schema.body.properties.name.pattern)})`,
    "const request = async (url: string, init: RequestInit = {}) => fetch(url, { ...init, credentials: 'same-origin' })",
    'export const connectorClient = Object.freeze({',
    `  listWorkspaceConnections: (workspaceId: string) => request(${templateUrl(byId.get('CON-01').path)}),`,
    `  createWorkspaceConnection: (workspaceId: string, body: CreateWorkspaceConnectionInput) => request(${templateUrl(byId.get('CON-02').path)}, { method: ${JSON.stringify(byId.get('CON-02').method)}, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),`,
    `  checkWorkspaceConnection: (workspaceId: string, connectionId: string) => request(${templateUrl(byId.get('CON-03').path)}, { method: ${JSON.stringify(byId.get('CON-03').method)} }),`,
    `  disableWorkspaceConnection: (workspaceId: string, connectionId: string) => request(${templateUrl(byId.get('CON-04').path)}, { method: ${JSON.stringify(byId.get('CON-04').method)} }),`,
    `  listProjectConnectionBindings: (projectId: string) => request(${templateUrl(byId.get('CON-08').path)}),`,
    `  bindProjectConnection: (projectId: string, body: BindProjectConnectionInput) => request(${templateUrl(byId.get('CON-09').path)}, { method: ${JSON.stringify(byId.get('CON-09').method)}, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),`,
    `  unbindProjectConnection: (projectId: string, bindingId: string) => request(${templateUrl(byId.get('CON-10').path)}, { method: ${JSON.stringify(byId.get('CON-10').method)} }),`,
    '})',
    '',
  ].join('\n')
  mkdirSync(dirname(target), { recursive: true })
  mkdirSync(dirname(clientTarget), { recursive: true })
  writeFileSync(stagedTarget, output, 'utf8')
  writeFileSync(stagedClientTarget, client, 'utf8')
  publishAtomically([{ staged: stagedTarget, target }, { staged: stagedClientTarget, target: clientTarget }])
  process.stdout.write(`${JSON.stringify({ sourceDigest, projectionDigest, routes: definitions.length })}\n`)
} finally {
  rmSync(stagedTarget, { force: true })
  rmSync(stagedClientTarget, { force: true })
  rmSync(temporary, { recursive: true, force: true })
}

function templateUrl(path) {
  return `\`${path.replaceAll(/\{(\w+)\}/g, (_match, name) => `\${encodeURIComponent(${name})}`)}\``
}

function toFastifyUrl(path) { return path.replace(/\{([^}]+)\}/g, ':$1') }

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
