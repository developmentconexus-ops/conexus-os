import assert from 'node:assert/strict'
import test from 'node:test'
import { lintCatalog } from '../../scripts/hub-catalog-lint.mjs'

const ALL = ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
const relation = (table, rls = true, granted = ALL) => `relation ${table} kind=r owner=conexus_owner rls=${rls} forcerls=${rls} disabled_triggers=0 acl=${granted.map((privilege) => `hub_runtime:${privilege}:false`).join(',')}`
const policy = (table, name, command, roles) => `policy ${table}.${name} cmd=${command} permissive=true roles=${roles} using=true check=true`
const census = (pending = [], permanent = []) => ({ unscoped: { permanent, pending }, ceilings: { ruleFunctions: 1, legacyOwnerPolicies: 1 } })
const runtimeAll = (table) => policy(table, 'runtime', '*', 'hub_runtime')

test('a policed table with a bridge for each reader passes', () => {
  const catalog = { relation: [relation('workspace.workspace')], policy: [runtimeAll('workspace.workspace'), policy('workspace.workspace', 'legacy_owner', '*', 'project_owner')] }
  const functions = [{ name: 'project.create_project', owner: 'project_owner', body: 'SELECT 1 FROM workspace.workspace' }]
  assert.deepEqual(lintCatalog({ catalog, functions, census: census() }).problems, [])
})

test('a table with no policy and no entry in UNSCOPED_TABLES is named', () => {
  const catalog = { relation: [relation('builder.builder_run', false)], policy: [] }
  assert.deepEqual(lintCatalog({ catalog, functions: [], census: census() }).problems, [
    'builder.builder_run has no FORCE row level security with hub_runtime policies for each command it grants hub_runtime, and is not in UNSCOPED_TABLES',
  ])
})

test('policies that leave a command uncovered are named', () => {
  const catalog = { relation: [relation('workspace.workspace')], policy: [policy('workspace.workspace', 'read', 'r', 'hub_runtime'), policy('workspace.workspace', 'write', 'a', 'hub_runtime'), policy('workspace.workspace', 'update', 'w', 'hub_runtime')] }
  assert.equal(lintCatalog({ catalog, functions: [], census: census() }).problems.length, 1)
})

test('a command that hub_runtime holds no grant for needs no policy', () => {
  const catalog = { relation: [relation('workspace.workspace', true, ['SELECT', 'INSERT', 'DELETE'])], policy: [policy('workspace.workspace', 'read', 'r', 'hub_runtime'), policy('workspace.workspace', 'write', 'a', 'hub_runtime'), policy('workspace.workspace', 'remove', 'd', 'hub_runtime')] }
  assert.deepEqual(lintCatalog({ catalog, functions: [], census: census() }).problems, [])
})

test('a bridge that omits the owner of a function that reads the table is named', () => {
  const catalog = { relation: [relation('workspace.workspace')], policy: [runtimeAll('workspace.workspace'), policy('workspace.workspace', 'legacy_owner', '*', 'workspace_owner')] }
  const functions = [{ name: 'project.create_project', owner: 'project_owner', body: 'SELECT 1 FROM workspace.workspace' }]
  assert.deepEqual(lintCatalog({ catalog, functions, census: census() }).problems, [
    'project.create_project owned by project_owner reads workspace.workspace, which has no bridge policy for project_owner',
  ])
})

test('a pending entry for a table that is already policed is named', () => {
  const catalog = { relation: [relation('workspace.workspace')], policy: [runtimeAll('workspace.workspace')] }
  assert.deepEqual(lintCatalog({ catalog, functions: [], census: census([{ table: 'workspace.workspace', part: 0 }]) }).problems, [
    'workspace.workspace is policed but still listed as pending',
  ])
})

test('a ceiling that went up and an entry for a table that does not exist are named', () => {
  const catalog = { relation: [], policy: [policy('a.b', 'legacy_owner', '*', 'x'), policy('a.c', 'legacy_owner', '*', 'x')] }
  const functions = [{ name: 'iam.acting_account', owner: 'iam_rls', body: '' }, { name: 'iam.other', owner: 'iam_owner', body: '' }, { name: 'iam.third', owner: 'iam_owner', body: '' }]
  assert.deepEqual(lintCatalog({ catalog, functions, census: census([{ table: 'gone.table', part: 1 }]) }).problems, [
    'UNSCOPED_TABLES names gone.table, which is not a table of the catalog',
    'ruleFunctions is 2, above its ceiling 1',
    'legacyOwnerPolicies is 2, above its ceiling 1',
  ])
})
