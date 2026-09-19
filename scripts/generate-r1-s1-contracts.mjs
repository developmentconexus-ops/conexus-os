import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { canonicalBytes, sha256 } from '../packages/canonical-json/src/index.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')
const source = resolve(repositoryRoot, 'contracts/api/product/openapi.yaml')
const target = resolve(repositoryRoot, 'apps/hub/src/generated/s1-routes.ts')
const clientTarget = resolve(repositoryRoot, 'apps/web/src/generated/iam-client.ts')
const temporary = mkdtempSync(resolve(tmpdir(), 'conexus-s1-wire-'))
const bundlePath = resolve(temporary, 'openapi.json')
const ownerIds = new Set(['IAM-01', 'IAM-02', 'IAM-03', 'IAM-04', 'IAM-05', 'IAM-06', 'IAM-10'])
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
  if (definitions.length !== ownerIds.size) throw new Error(`S1_ROUTE_CENSUS_${definitions.length}`)
  const sourceDigest = sha256(readFileSync(source))
  const projectionDigest = sha256(canonicalBytes(definitions))
  const byId = new Map(definitions.map((definition) => [definition.ownerId, definition]))
  const output = [
    '// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-r1-s1-contracts.mjs. Do not edit.',
    "import type { FastifySchema } from 'fastify'",
    '',
    `export const S1_PRODUCT_OAS_DIGEST = ${JSON.stringify(sourceDigest)}`,
    `export const S1_ROUTE_PROJECTION_DIGEST = ${JSON.stringify(projectionDigest)}`,
    `export type S1OwnerId = ${[...ownerIds].sort().map((id) => JSON.stringify(id).replaceAll('"', "'")).join(' | ')}`,
    `export type Iam01Response = ${toTypeScript(byId.get('IAM-01').schema.response['200'])}`,
    `export type Iam03Body = ${toTypeScript(byId.get('IAM-03').schema.body)}`,
    `export type Iam03Response = ${toTypeScript(byId.get('IAM-03').schema.response['201'])}`,
    `export type Iam04Response = ${toTypeScript(byId.get('IAM-04').schema.response['200'])}`,
    `export type Iam05Body = ${toTypeScript(byId.get('IAM-05').schema.body)}`,
    `export type Iam05Response = ${toTypeScript(byId.get('IAM-05').schema.response['200'])}`,
    `export type Iam10Body = ${toTypeScript(byId.get('IAM-10').schema.body)}`,
    `export type WorkspaceParams = ${JSON.stringify({ workspaceId: 'string' }).replaceAll('"', '')}`,
    `export type MemberParams = ${JSON.stringify({ workspaceId: 'string', accountId: 'string' }).replaceAll('"', '')}`,
    `export type RosterEntryParams = ${JSON.stringify({ workspaceId: 'string', entryKind: 'string', entryId: 'string' }).replaceAll('"', '')}`,
    "export type S1RouteDefinition = Readonly<{ ownerId: S1OwnerId; operationId: string; method: 'GET' | 'POST' | 'PUT' | 'DELETE'; path: string; url: string; schema: FastifySchema }>",
    `export const S1_GENERATED_ROUTES = Object.freeze(Object.fromEntries(${JSON.stringify(definitions)}.map((definition) => [definition.ownerId, Object.freeze(definition)])) as Record<S1OwnerId, S1RouteDefinition>)`,
    '',
  ].join('\n')
  const client = [
    '// GENERATED from contracts/api/product/openapi.yaml by scripts/generate-r1-s1-contracts.mjs. Do not edit.',
    `export const S1_PRODUCT_OAS_DIGEST = ${JSON.stringify(sourceDigest)}`,
    `export const S1_ROUTE_PROJECTION_DIGEST = ${JSON.stringify(projectionDigest)}`,
    `export type AccountSummary = ${toTypeScript(byId.get('IAM-03').schema.response['201'])}`,
    `export type AccessContext = ${toTypeScript(byId.get('IAM-01').schema.response['200'])}`,
    `export type ProvisionAccountInput = ${toTypeScript(byId.get('IAM-03').schema.body)}`,
    `export type WorkspaceRoster = ${toTypeScript(byId.get('IAM-04').schema.response['200'])}`,
    `export type InviteWorkspaceMemberInput = ${toTypeScript(byId.get('IAM-05').schema.body)}`,
    `export type WorkspaceInvitation = ${toTypeScript(byId.get('IAM-05').schema.response['200'])}`,
    `export type SetWorkspaceMemberRoleInput = ${toTypeScript(byId.get('IAM-10').schema.body)}`,
    "const csrf = () => document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=')",
    "const request = async (url: string, init: RequestInit = {}) => fetch(url, { ...init, credentials: 'same-origin', headers: { ...(init.headers ?? {}), ...(init.method && init.method !== 'GET' ? { 'x-conexus-csrf': decodeURIComponent(csrf() ?? '') } : {}) } })",
    'export const iamClient = Object.freeze({',
    `  getAccessContext: () => request(${JSON.stringify(byId.get('IAM-01').url)}),`,
    `  provisionAccount: (body: ProvisionAccountInput, idempotencyKey: string) => request(${JSON.stringify(byId.get('IAM-03').url)}, { method: ${JSON.stringify(byId.get('IAM-03').method)}, headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) }),`,
    `  endSession: () => request(${JSON.stringify(byId.get('IAM-02').url)}, { method: ${JSON.stringify(byId.get('IAM-02').method)} }),`,
    `  listWorkspaceMembers: (workspaceId: string) => request(${templateUrl(byId.get('IAM-04').path)}),`,
    `  inviteWorkspaceMember: (workspaceId: string, body: InviteWorkspaceMemberInput) => request(${templateUrl(byId.get('IAM-05').path)}, { method: ${JSON.stringify(byId.get('IAM-05').method)}, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),`,
    `  setWorkspaceMemberRole: (workspaceId: string, accountId: string, body: SetWorkspaceMemberRoleInput) => request(${templateUrl(byId.get('IAM-10').path)}, { method: ${JSON.stringify(byId.get('IAM-10').method)}, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),`,
    `  removeWorkspaceRosterEntry: (workspaceId: string, entryKind: 'member' | 'invitation', entryId: string) => request(${templateUrl(byId.get('IAM-06').path)}, { method: ${JSON.stringify(byId.get('IAM-06').method)} }),`,
    '})',
    '',
  ].join('\n')
  mkdirSync(dirname(target), { recursive: true })
  mkdirSync(dirname(clientTarget), { recursive: true })
  writeFileSync(stagedTarget, output, 'utf8')
  writeFileSync(stagedClientTarget, client, 'utf8')
  if (process.argv.includes('--check')) {
    if (!existsSync(target) || readFileSync(target, 'utf8') !== output) throw new Error('S1_GENERATED_ROUTE_DRIFT')
    if (!existsSync(clientTarget) || readFileSync(clientTarget, 'utf8') !== client) throw new Error('S1_GENERATED_CLIENT_DRIFT')
  } else publishAtomically([{ staged: stagedTarget, target }, { staged: stagedClientTarget, target: clientTarget }])
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

function toTypeScript(schema) {
  if (schema.oneOf) return schema.oneOf.map(toTypeScript).join(' | ')
  if (schema.type === 'array') {
    const item = toTypeScript(schema.items)
    return `${item.includes(' | ') ? `(${item})` : item}[]`
  }
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
