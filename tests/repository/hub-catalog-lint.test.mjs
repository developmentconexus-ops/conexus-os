import assert from 'node:assert/strict'
import test from 'node:test'
import { lintCatalog } from '../../scripts/hub-catalog-lint.mjs'

const relation = (table, acl = [], { rls = false } = {}) => `relation ${table} kind=r owner=conexus_owner rls=${rls} forcerls=${rls} disabled_triggers=0 acl=${acl.map(([role, privilege]) => `${role}:${privilege}:false`).join(',')}`
const column = (table, name, acl) => `column ${table}.${name} text notnull=false default= acl=${acl.map(([role, privilege]) => `${role}:${privilege}:false`).join(',')}`
const fn = (name, args, owner, acl) => `function ${name}(${args}) returns void kind=f owner=${owner} secdef=true volatility=v config=search_path=pg_catalog,pg_temp acl=${acl.map((role) => `${role}:EXECUTE:false`).join(',')} body=SELECT 1`

const WORKSPACE = 'workspace.workspace'
const LOCK = 'iam.lock_administrators'
const row = (table, privileges = ['INSERT', 'SELECT'], extra = {}) => ({ table, privileges, compositeKeys: [], keyColumns: [], ...extra })
const base = () => ({
  catalog: {
    column: [], constraint: [],
    relation: [relation(WORKSPACE, [['hub_runtime', 'INSERT'], ['hub_runtime', 'SELECT']])],
    policy: [],
    function: [fn(LOCK, '', 'conexus_owner', ['conexus_owner', 'hub_runtime'])],
  },
  functions: [{ name: LOCK, owner: 'conexus_owner', body: '' }],
  census: {
    unscoped: { permanent: [] },
    register: { tables: [row(WORKSPACE)], functions: { hub_runtime: [`${LOCK}()`] } },
    ceilings: { ruleFunctions: 0, runtimePrivileges: 3 },
  },
})
const lint = (mutate = () => undefined) => {
  const input = base()
  mutate(input)
  return lintCatalog(input).problems
}

test('native grants pass with RLS and policies removed', () => {
  assert.deepEqual(lint(), [])
})

test('unexpected runtime verbs and retired role grants are named', () => {
  assert.deepEqual(lint((input) => {
    input.catalog.relation[0] = relation(WORKSPACE, [['hub_runtime', 'DELETE'], ['hub_runtime', 'INSERT'], ['hub_runtime', 'SELECT'], ['hub_reader', 'SELECT']])
  }), [
    `${WORKSPACE} gives hub_runtime DELETE, INSERT, SELECT, and its register row says INSERT, SELECT`,
    `${WORKSPACE} still grants hub_reader SELECT`,
    'runtimePrivileges is 4, above its ceiling 3',
  ])
})

test('policies and enabled row security are refused', () => {
  assert.deepEqual(lint((input) => {
    input.catalog.relation[0] = relation(WORKSPACE, [['hub_runtime', 'INSERT'], ['hub_runtime', 'SELECT']], { rls: true })
    input.catalog.policy.push('policy workspace.workspace.reader cmd=r permissive=true roles=hub_reader using=true check=')
  }), [`${WORKSPACE} must have row level security disabled`, 'the catalog has 1 row security policies; none are registered'])
})

test('column grants preserve the exact native privilege surface', () => {
  assert.deepEqual(lint((input) => {
    input.catalog.relation[0] = relation(WORKSPACE, [['hub_runtime', 'INSERT']])
    input.catalog.column.push(column(WORKSPACE, 'name', [['hub_runtime', 'SELECT']]))
    input.census.register.tables[0] = row(WORKSPACE, ['INSERT', 'SELECT(name)'])
  }), [])
  assert.deepEqual(lint((input) => {
    input.catalog.relation[0] = relation(WORKSPACE, [['hub_runtime', 'INSERT']])
    input.catalog.column.push(column(WORKSPACE, 'name', [['hub_runtime', 'SELECT']]), column(WORKSPACE, 'workspace_id', [['hub_runtime', 'SELECT']]))
    input.census.register.tables[0] = row(WORKSPACE, ['INSERT', 'SELECT(name)'])
  }), [`${WORKSPACE} gives hub_runtime INSERT, SELECT(name,workspace_id), and its register row says INSERT, SELECT(name)`])
})

test('a missing key column or composite key is named', () => {
  assert.deepEqual(lint((input) => {
    input.catalog.column.push(column(WORKSPACE, 'workspace_id', []))
    input.census.register.tables[0] = row(WORKSPACE, ['INSERT', 'SELECT'], { keyColumns: ['workspace_id', 'tenant_id'], compositeKeys: ['workspace_tenant_fkey'] })
  }), [
    `${WORKSPACE} register names key column tenant_id, which does not exist`,
    `${WORKSPACE} register names composite key workspace_tenant_fkey, which does not exist`,
  ])
})

test('the register names missing or extra catalog tables', () => {
  assert.deepEqual(lint((input) => { input.catalog.relation.push(relation('builder.builder_run')) }), [
    'builder.builder_run is in no list of the register: it is not runtime or permanent',
  ])
  assert.deepEqual(lint((input) => { input.census.register.tables.push(row('gone.table')) }), [
    'the register names gone.table, which is not a table of the catalog',
    'gone.table gives hub_runtime nothing, and its register row says INSERT, SELECT',
  ])
})

test('a table outside the register stays permanently scoped with its registered grants', () => {
  assert.deepEqual(lint((input) => {
    input.catalog.relation.push(relation('iam.schema_migration', [['hub_runtime', 'SELECT']], { rls: false }))
    input.census.unscoped.permanent.push({ table: 'iam.schema_migration', reason: 'Migration ledger.', privileges: ['SELECT'] })
    input.census.ceilings.runtimePrivileges = 4
  }), [])
})

test('unexpected functions and execution grants are named', () => {
  assert.deepEqual(lint((input) => {
    input.catalog.function.push(fn('workspace.extra', '', 'conexus_owner', ['conexus_owner', 'hub_runtime']))
    input.functions.push({ name: 'workspace.extra', owner: 'conexus_owner', body: '' })
  }), [
    'hub_runtime may EXECUTE iam.lock_administrators(), workspace.extra(), and the register says iam.lock_administrators()',
    'workspace.extra() is executable by conexus_owner, hub_runtime, and only conexus_owner may',
    'ruleFunctions is 1, above its ceiling 0',
    'runtimePrivileges is 4, above its ceiling 3',
  ])
})
