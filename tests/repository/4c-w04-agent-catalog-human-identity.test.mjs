import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')

function requireText(text, needle, message = needle) {
  if (!text.includes(needle)) throw new Error(message)
}

function sliceBetween(text, startNeedle, endNeedle) {
  const start = text.indexOf(startNeedle)
  if (start < 0) return ''
  const end = endNeedle ? text.indexOf(endNeedle, start) : -1
  return text.slice(start, end < 0 ? undefined : end)
}

test('W-04 preserves operator-approved F13 Global-Maximum decision before recompiling Product authority', () => {
  const decision = read('docs/evidence/4c/w04-agent-catalog-human-identity-global-maximum.md')
  for (const law of [
    '4C-F13',
    'OPERATOR ACCEPTED',
    'CURRENT OWNERS CONFIRMED',
    'ProductAgent.name',
    'ProductAgent.purpose',
    'project: ProjectSummary',
    '+0 operations / +0 Permissions / +0 owners / +0 records',
    'PRJ-22 Workspace catalog → project.read',
    'PRJ-20 / PRJ-21 authored Agent inspection → project.source.read',
    'P8 remains blocked',
  ]) requireText(decision, law, `F13 decision evidence missing: ${law}`)
})

test('selected F13 realization makes Product Agent identity human-reviewable while preserving existing operation and Permission authority', () => {
  const identity = read('docs/product/human-context-identity-contract.md')
  const product = read('docs/product/contract.md')
  const ledger = read('docs/product/operation-ledger.md')
  const permissions = read('docs/product/permission-contract.md')

  for (const law of [
    '4C-F13',
    'ProductAgent.name',
    'ProductAgent.purpose',
    'agentId != ProductAgent.name',
    'name-derived authorization',
    'name-derived routing',
    'RenameProductAgent',
    'UpdateProductAgentMetadata',
    'Builder/Change',
    'agent/v1',
  ]) requireText(identity, law, `F13 Product Agent presentation authority missing law: ${law}`)

  const productAgent = sliceBetween(product, '## 5.22 Product Agent', '## 5.23 Conversation')
  for (const law of ['purpose', 'agent/v1', 'same Change, candidate, diff, proof and Release path']) {
    requireText(productAgent, law, `F13 must preserve accepted Product Agent authoring semantics: ${law}`)
  }

  requireText(ledger, 'fixed Conexus platform operations = 116', 'F13 must preserve fixed Product census')
  requireText(ledger, '## 5.3 Project — 23', 'F13 must preserve 23 Project operations')
  for (const op of [
    '`PRJ-20` | `ListProjectProductAgents`',
    '`PRJ-21` | `GetProjectProductAgent`',
    '`PRJ-22` | `ListWorkspaceProductAgents`',
  ]) requireText(ledger, op, `F13 must preserve Project operation identity: ${op}`)

  requireText(permissions, 'ordinary Permissions = 25', 'F13 must preserve ordinary Permission count')
  requireText(permissions, '`project.read`', 'F13 must preserve project.read')
  requireText(permissions, '`project.source.read`', 'F13 must preserve project.source.read')
  requireText(permissions, 'PRJ-22', 'F13 must preserve PRJ-22 under ordinary Project read')
  requireText(permissions, 'PRJ-20/21', 'F13 must preserve PRJ-20/21 under source read')
  requireText(permissions, 'agent.manage', 'F13 must preserve rejection of generic agent.manage')
})

test('selected F13 wire makes PRJ-20/21/22 self-contained for human Agent and owning-Project recognition', () => {
  const wire = read('contracts/api/product/project-paths.yaml')
  const checker = read('scripts/check-wire-project-agent-catalog.mjs')

  const agentStart = wire.indexOf('    ProjectProductAgent:\n')
  const catalogStart = wire.indexOf('    WorkspaceProductAgentCatalogItem:\n', agentStart)
  const agentSchema = wire.slice(agentStart, catalogStart)
  requireText(agentSchema, 'required: [agentId, name, purpose, authoredRevisionId, releaseRefs, activeReleaseId]', 'F13 ProjectProductAgent must require exact human-recognition fields')
  for (const field of ['name:', 'purpose:', 'minLength: 1', "pattern: '.*\\S.*'"]) {
    requireText(agentSchema, field, `F13 ProjectProductAgent schema missing ${field}`)
  }

  const catalogSchema = wire.slice(catalogStart)
  requireText(catalogSchema, 'type: object', 'F13 Workspace catalog item must be an explicit closed composition object')
  requireText(catalogSchema, 'additionalProperties: false', 'F13 Workspace catalog item must remain closed')
  requireText(catalogSchema, 'required: [agent, project]', 'F13 Workspace catalog item must require exact Agent + Project context')
  requireText(catalogSchema, 'agent:', 'F13 Workspace catalog item missing canonical Agent field')
  requireText(catalogSchema, "$ref: '#/components/schemas/ProjectProductAgent'", 'F13 Workspace catalog item must reuse canonical ProjectProductAgent')
  requireText(catalogSchema, 'project:', 'F13 Workspace catalog item missing project field')
  requireText(catalogSchema, "$ref: '#/components/schemas/ProjectSummary'", 'F13 Workspace catalog item must use canonical ProjectSummary')

  const workspaceAgents = sliceBetween(wire, 'summary: ListWorkspaceProductAgents', 'components:')
  requireText(workspaceAgents, 'WorkspaceProductAgentCatalogItem', 'PRJ-22 must keep the enriched catalog item')
  requireText(workspaceAgents, 'Access-filtered Workspace catalog projection over Project-owned Product Agents', 'PRJ-22 must preserve filtered-projection owner law')

  for (const token of ['ProjectProductAgent', 'WorkspaceProductAgentCatalogItem', 'name', 'purpose', 'ProjectSummary']) {
    requireText(checker, token, `F13 Project wire checker missing guard: ${token}`)
  }

  const ids = [...wire.matchAll(/x-conexus-4a-id: (PRJ-\d+)/g)].map(match => match[1])
  if (ids.length !== 23 || new Set(ids).size !== 23) throw new Error(`F13 must preserve 23 unique Project operations; got ${ids.length}`)
  if (ids.includes('PRJ-25')) throw new Error('F13 must not add a screen-shaped PRJ-25 operation')
})
