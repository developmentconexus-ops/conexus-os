import assert from 'node:assert/strict'
import test from 'node:test'
import { lintCatalog } from '../../scripts/hub-catalog-lint.mjs'

const relation = (table, acl = [], { rls = true } = {}) => `relation ${table} kind=r owner=conexus_owner rls=${rls} forcerls=${rls} disabled_triggers=0 acl=${acl.map(([role, privilege]) => `${role}:${privilege}:false`).join(',')}`
const column = (table, name, acl) => `column ${table}.${name} text notnull=false default= acl=${acl.map(([role, privilege]) => `${role}:${privilege}:false`).join(',')}`
const policy = (table, name, command, roles, using = 'true', check = 'true') => `policy ${table}.${name} cmd=${command} permissive=true roles=${roles} using=${using} check=${check}`
const fn = (name, args, acl) => `function ${name}(${args}) returns void acl=${acl.map((role) => `${role}:EXECUTE:false`).join(',')} body=SELECT 1`

const WORKSPACE = 'workspace.workspace'
const DELETION = 'project.project_deletion'
const row = (table, extra = {}) => ({ table, reader: true, command: ['INSERT', 'SELECT'], runtime: [], compositeKeys: [], ...extra })

const base = () => ({
  catalog: {
    column: [],
    constraint: [],
    relation: [relation(WORKSPACE, [['hub_reader', 'SELECT'], ['hub_command', 'INSERT'], ['hub_command', 'SELECT']])],
    policy: [policy(WORKSPACE, 'reader', 'r', 'hub_reader', 'rls.acting_account() IS NOT NULL'), policy(WORKSPACE, 'command', '*', 'hub_command')],
    function: [fn('rls.acting_account', '', ['iam_rls', 'hub_reader'])],
  },
  functions: [{ name: 'rls.acting_account', owner: 'iam_rls', body: '' }],
  census: {
    unscoped: { permanent: [], pending: [] },
    register: { split: [row(WORKSPACE)], functions: { hub_reader: ['rls.acting_account()'], hub_command: [] } },
    ceilings: { ruleFunctions: 0, legacyOwnerPolicies: 0, runtimePrivileges: 0 },
  },
})

const lint = (mutate) => {
  const input = base()
  mutate(input)
  return lintCatalog(input).problems
}

test('a split table with a true command policy, a named reader policy and exact grants passes', () => {
  assert.deepEqual(lint(() => undefined), [])
})

test('a command policy that is not true is named', () => {
  assert.deepEqual(lint((input) => { input.catalog.policy[1] = policy(WORKSPACE, 'command', '*', 'hub_command', 'false') }), [
    `${WORKSPACE} must have exactly one policy TO hub_command, FOR ALL, USING (true) WITH CHECK (true)`,
  ])
})

test('a reader grant without a reader policy is named', () => {
  assert.deepEqual(lint((input) => { input.catalog.policy.splice(0, 1) }), [
    `${WORKSPACE} must have a reader policy named reader if and only if hub_reader holds SELECT`,
  ])
})

test('a verb the register does not list for the command role is named', () => {
  assert.deepEqual(lint((input) => { input.catalog.relation[0] = relation(WORKSPACE, [['hub_reader', 'SELECT'], ['hub_command', 'INSERT'], ['hub_command', 'SELECT'], ['hub_command', 'DELETE']]) }), [
    `${WORKSPACE} gives hub_command DELETE, INSERT, SELECT, and its register row says INSERT, SELECT`,
  ])
})

test('a reader that holds more than SELECT is named', () => {
  assert.deepEqual(lint((input) => { input.catalog.relation[0] = relation(WORKSPACE, [['hub_reader', 'SELECT'], ['hub_reader', 'UPDATE'], ['hub_command', 'INSERT'], ['hub_command', 'SELECT']]) }), [
    `${WORKSPACE} gives hub_reader SELECT, UPDATE, and the reader may only SELECT`,
  ])
})

test('a register row with readerColumns allows exactly that column list and refuses a table level reader grant', () => {
  const columns = (input) => { input.catalog.column.push(column(WORKSPACE, 'name', [['hub_reader', 'SELECT']]), column(WORKSPACE, 'workspace_id', [['hub_reader', 'SELECT']])) }
  assert.deepEqual(lint((input) => {
    input.catalog.relation[0] = relation(WORKSPACE, [['hub_command', 'INSERT'], ['hub_command', 'SELECT']])
    columns(input)
    input.census.register.split[0].readerColumns = ['name', 'workspace_id']
  }), [])
  assert.deepEqual(lint((input) => {
    columns(input)
    input.census.register.split[0].readerColumns = ['name', 'workspace_id']
  }), [`${WORKSPACE} gives hub_reader SELECT, and the reader may only SELECT(name,workspace_id)`])
  assert.deepEqual(lint((input) => {
    input.catalog.relation[0] = relation(WORKSPACE, [['hub_command', 'INSERT'], ['hub_command', 'SELECT']])
    columns(input)
    input.census.register.split[0].readerColumns = ['name']
  }), [`${WORKSPACE} gives hub_reader SELECT(name,workspace_id), and the reader may only SELECT(name)`])
})

test('a misnamed reader policy is named', () => {
  assert.deepEqual(lint((input) => { input.catalog.policy[0] = policy(WORKSPACE, 'read', 'r', 'hub_reader') }), [
    `${WORKSPACE} must have a reader policy named reader if and only if hub_reader holds SELECT`,
    `${WORKSPACE} has a reader policy named read, which is neither reader nor reader_admin`,
  ])
})

test('a reader_admin policy off the administrator reach list is named', () => {
  assert.deepEqual(lint((input) => {
    input.catalog.policy.push(policy(WORKSPACE, 'reader_admin', 'r', 'hub_reader'))
    input.census.register.split[0].readerAdmin = true
  }), [`${WORKSPACE} has reader_admin but is not on the administrator reach list`])
})

test('a reader_admin policy on the reach list passes, and one the register does not name is named', () => {
  const input = base()
  input.catalog.relation = [relation(DELETION, [['hub_reader', 'SELECT'], ['hub_command', 'INSERT'], ['hub_command', 'SELECT']])]
  input.catalog.policy = [policy(DELETION, 'reader', 'r', 'hub_reader'), policy(DELETION, 'reader_admin', 'r', 'hub_reader'), policy(DELETION, 'command', '*', 'hub_command')]
  input.census.register.split = [row(DELETION, { readerAdmin: true })]
  assert.deepEqual(lintCatalog(input).problems, [])
  input.census.register.split = [row(DELETION)]
  assert.deepEqual(lintCatalog(input).problems, [`${DELETION} must have a reader_admin policy if and only if its register row says readerAdmin`])
})

test('a policy TO hub_runtime is named unless it is legacy_runtime on iam.account with an unported reader', () => {
  assert.deepEqual(lint((input) => { input.catalog.policy.push(policy(WORKSPACE, 'runtime', '*', 'hub_runtime')) }), [
    `${WORKSPACE} has a policy runtime TO hub_runtime; only legacy_runtime on iam.account is allowed`,
  ])
  assert.deepEqual(lint((input) => { input.catalog.policy.push(policy(WORKSPACE, 'legacy_runtime', '*', 'hub_runtime')) }), [
    `${WORKSPACE} has a policy legacy_runtime TO hub_runtime; only legacy_runtime on iam.account is allowed`,
  ])
})

test('a legacy_runtime bridge on iam.account needs an unported reader, and an unported reader needs the bridge', () => {
  const account = 'iam.account'
  const input = base()
  input.catalog.relation = [relation(account, [['hub_reader', 'SELECT'], ['hub_command', 'SELECT'], ['hub_runtime', 'SELECT']])]
  input.catalog.policy = [policy(account, 'reader', 'r', 'hub_reader'), policy(account, 'command', '*', 'hub_command'), policy(account, 'legacy_runtime', '*', 'hub_runtime')]
  input.census.register.split = [row(account, { command: ['SELECT'], runtime: ['SELECT'] })]
  input.census.ceilings.runtimePrivileges = 1
  assert.deepEqual(lintCatalog(input).problems, [`${account} has a legacy_runtime bridge but no unported TypeScript reads it`])
  assert.deepEqual(lintCatalog({ ...input, unported: new Map([[account, ['apps/hub/src/x.ts']]]) }).problems, [])
  input.catalog.policy.pop()
  assert.deepEqual(lintCatalog({ ...input, unported: new Map([[account, ['apps/hub/src/x.ts']]]) }).problems, [
    `${account} is read by unported TypeScript and has no legacy_runtime bridge`,
  ])
})

test('a legacy_runtime bridge on iam.workspace_membership is named', () => {
  const table = 'iam.workspace_membership'
  const input = base()
  input.catalog.relation = [relation(table, [['hub_reader', 'SELECT'], ['hub_command', 'SELECT']])]
  input.catalog.policy = [policy(table, 'reader', 'r', 'hub_reader'), policy(table, 'command', '*', 'hub_command'), policy(table, 'legacy_runtime', '*', 'hub_runtime')]
  input.census.register.split = [row(table, { command: ['SELECT'] })]
  assert.deepEqual(lintCatalog({ ...input, unported: new Map([[table, ['apps/hub/src/x.ts']]]) }).problems, [
    `${table} has a policy legacy_runtime TO hub_runtime; only legacy_runtime on iam.account is allowed`,
  ])
})

test('a pending table with a privilege its register row does not name is named', () => {
  const input = base()
  input.catalog.relation.push(relation('iam.handoff', [['hub_command', 'SELECT']], { rls: false }))
  input.census.unscoped.pending = [{ table: 'iam.handoff', part: 6, privileges: { hub_runtime: [], hub_reader: [], hub_command: [] } }]
  assert.deepEqual(lintCatalog(input).problems, ['iam.handoff gives hub_command SELECT, and its register row says nothing'])
  input.census.unscoped.pending[0].privileges.hub_command = ['SELECT']
  assert.deepEqual(lintCatalog(input).problems, [])
})

test('a column grant is read as UPDATE(column) in the register', () => {
  const input = base()
  input.catalog.relation[0] = relation(WORKSPACE, [['hub_reader', 'SELECT'], ['hub_command', 'SELECT']])
  input.catalog.column = [column(WORKSPACE, 'name', [['hub_command', 'UPDATE']])]
  input.census.register.split = [row(WORKSPACE, { command: ['SELECT', 'UPDATE(name)'] })]
  assert.deepEqual(lintCatalog(input).problems, [])
  input.catalog.column = [column(WORKSPACE, 'name', [['hub_command', 'UPDATE']]), column(WORKSPACE, 'created_at', [['hub_command', 'UPDATE']])]
  assert.deepEqual(lintCatalog(input).problems, [`${WORKSPACE} gives hub_command SELECT, UPDATE(created_at,name), and its register row says SELECT, UPDATE(name)`])
})

test('an EXECUTE that the register does not list is named', () => {
  assert.deepEqual(lint((input) => {
    input.catalog.function.push(fn('iam.purge_project', 'p_project_id uuid', ['hub_command']))
    input.functions.push({ name: 'iam.purge_project', owner: 'iam_owner', body: '' })
    input.census.ceilings.ruleFunctions = 1
  }), ['hub_command may EXECUTE iam.purge_project(p_project_id uuid), and the register says nothing'])
})

test('a helper outside schema rls and an rls function with the wrong owner are named', () => {
  assert.deepEqual(lint((input) => {
    input.functions.push({ name: 'iam.acting_other', owner: 'iam_rls', body: '' }, { name: 'rls.acting_other', owner: 'iam_owner', body: '' })
    input.census.ceilings.ruleFunctions = 2
  }), [
    'iam.acting_other is owned by iam_rls; a helper lives in schema rls',
    'rls.acting_other must be owned by iam_rls, not iam_owner',
  ])
})

test('an rls helper executable by another role is named', () => {
  assert.deepEqual(lint((input) => { input.catalog.function[0] = fn('rls.acting_account', '', ['iam_rls', 'hub_reader', 'hub_command']) }), [
    'hub_command may EXECUTE rls.acting_account(), and the register says nothing',
    'rls.acting_account() is executable by iam_rls, hub_reader, hub_command; only hub_reader may',
  ])
})

test('a table in no list and a ceiling that went up are named', () => {
  assert.deepEqual(lint((input) => {
    input.catalog.relation.push(relation('builder.builder_run', [], { rls: false }))
    input.functions.push({ name: 'iam.other', owner: 'iam_owner', body: '' })
    input.catalog.policy.push(policy('builder.builder_run', 'legacy_owner', '*', 'iam_owner'))
  }), [
    'builder.builder_run is in no list of the register: it is not split, pending or permanent',
    'ruleFunctions is 1, above its ceiling 0',
    'legacyOwnerPolicies is 1, above its ceiling 0',
  ])
})

test('a bridge that omits the owner of a function that reads the table is named', () => {
  assert.deepEqual(lint((input) => {
    input.catalog.policy.push(policy(WORKSPACE, 'legacy_owner', '*', 'workspace_owner'))
    input.functions.push({ name: 'project.create_project', owner: 'project_owner', body: `SELECT 1 FROM ${WORKSPACE}` })
    input.census.ceilings.ruleFunctions = 1
    input.census.ceilings.legacyOwnerPolicies = 1
  }), [
    `project.create_project owned by project_owner reads ${WORKSPACE}, which has no bridge policy for project_owner`,
    `${WORKSPACE} has a bridge policy for workspace_owner, which owns no function that reads it`,
  ])
})

test('a register row for a table that does not exist is named', () => {
  assert.deepEqual(lint((input) => { input.census.register.split.push(row('gone.table')) }), ['the register names gone.table, which is not a table of the catalog'])
})
