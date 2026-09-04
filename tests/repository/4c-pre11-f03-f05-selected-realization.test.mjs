import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

const ledger = read('docs/product/operation-ledger.md')
const permission = read('docs/product/permission-contract.md')
const product = read('docs/product/contract.md')
const security = read('docs/reference/security-and-authority.md')
const identityWire = read('contracts/api/product/identity-workspace-paths.yaml')
const projectWire = read('contracts/api/product/project-paths.yaml')
const brainWire = read('contracts/api/product/project-brain-context-paths.yaml')
const builderWire = read('contracts/api/product/builder-paths.yaml')

test('F03 admits one transient pre-Account bootstrap principal and no SaaS machinery', () => {
  for (const token of [
    'TRUSTED_BOOTSTRAP_CONTEXT',
    'preconfigured bootstrap OIDC subject',
    'IAM-03',
    'WS-01',
    'initial Workspace access',
    'N_platform = 128',
  ]) assert.ok((ledger + permission + product + security).includes(token), `F03 authority missing ${token}`)

  assert.doesNotMatch(ledger + permission + product + security, /bootstrap tenant|public bootstrap signup|default bootstrap password/i)
})

test('F03 wire derives the bootstrap subject server-side and closes first Workspace access', () => {
  for (const token of [
    'x-conexus-authority-routes: [platform_operator, trusted_bootstrap_context]',
    'BootstrapProvisionAccountRequest',
    'externalSubject is resolved from the exact trusted bootstrap context',
    'initialAccessEstablished',
    'creatorAccountId',
  ]) assert.ok(identityWire.includes(token), `F03 wire missing ${token}`)
  assert.ok(identityWire.includes('required: [account, workspaces, projects]'), 'IAM-01 must carry canonical current AccountSummary')
  assert.match(identityWire, /account:\s*\n\s*\$ref: '#\/components\/schemas\/AccountSummary'/)
})

test('F05 adds one Project-owned model-policy read and purpose-bound build discovery', () => {
  for (const token of [
    'PRJ-29',
    'ListProjectModelPolicies',
    '/api/control/projects/{projectId}/model-policies',
    'ProjectModelPolicySummary',
    'policyRef',
    'label',
    'purpose',
    'isDefault',
    'samplingLimits',
    'x-conexus-authority-routes: [project.read, project.build]',
  ]) assert.ok((ledger + projectWire).includes(token), `F05 Project authority missing ${token}`)

  assert.ok(permission.includes('Project model-policy discovery'), 'F05 Permission contract must explain purpose-bound project.build disclosure')
})

test('F05 Project Brain references distinguish authoring identity and withheld detail', () => {
  for (const token of [
    'x-conexus-authority-routes:',
    'project.build',
    'authoringRef',
    'detailDisclosed',
    'withheld by current authority',
  ]) assert.ok(brainWire.includes(token), `F05 Brain authority missing ${token}`)
})

test('F05 minimal F1 forbids free optional refs while preserving complete draft truth', () => {
  for (const token of [
    '4C-PRE11-F05',
    'policyRefs',
    'approvalPolicyRefs',
    'budgetPolicyRefs',
    'verificationRefs',
    'maxItems: 0',
    'preserved exactly for EXISTING',
    'invalid authoring reference',
  ]) assert.ok(builderWire.includes(token), `F05 Builder wire missing ${token}`)
})
