import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import ts from 'typescript'
import { findings, staleSqlDependencies, violations } from '../../scripts/check-boundaries.mjs'

const root = resolve(import.meta.dirname, '../..')
const fixture = (name, options = {}) => {
  const program = ts.createProgram({
    rootNames: [resolve(root, `tests/fixtures/census-boundaries/${name}.ts`)],
    options: { strict: true, skipLibCheck: true, noEmit: true, target: ts.ScriptTarget.ES2022, lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'], module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: [] },
  })
  return findings(program, { root, pgEdge: [], responseEdge: [], ...options })
}

test('rows read from pg without a schema are found through a direct call, a renamed call, a wrapper and a destructured method', () => {
  assert.deepEqual(fixture('pg-rows').pgQueryRows.sort(), [
    'tests/fixtures/census-boundaries/pg-rows.ts#destructured',
    'tests/fixtures/census-boundaries/pg-rows.ts#direct',
    'tests/fixtures/census-boundaries/pg-rows.ts#renamed',
    'tests/fixtures/census-boundaries/pg-rows.ts#wrapper',
  ])
})

test('a response body read outside the one caller is found through an assertion, a double assertion, a helper and a chain', () => {
  assert.deepEqual(fixture('web-json').webResponseJson.sort(), [
    'tests/fixtures/census-boundaries/web-json.ts#asserted',
    'tests/fixtures/census-boundaries/web-json.ts#chained',
    'tests/fixtures/census-boundaries/web-json.ts#doubleAsserted',
    'tests/fixtures/census-boundaries/web-json.ts#helper',
  ])
})

test('the data module and the one caller are the edge', () => {
  const program = ts.createProgram({
    rootNames: [resolve(root, 'tests/fixtures/census-boundaries/pg-rows.ts')],
    options: { strict: true, skipLibCheck: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: [] },
  })
  assert.deepEqual(findings(program, { root, pgEdge: ['tests/fixtures/census-boundaries/pg-rows.ts'], responseEdge: [] }), { pgQueryRows: [], pgImportFiles: [], webResponseJson: [], sqlWrites: [], authorityTableWrites: [], gateReferences: [], rawPersonReads: [], sqlOwners: [] })
})

test('a write whose filter is not visible in its template is found, and a write with one is not', () => {
  const prefix = 'tests/fixtures/census-boundaries/sql-writes.ts#'
  assert.deepEqual(fixture('sql-writes').sqlWrites.sort(), [
    ['afterCte', 'an update with no where outside parentheses'],
    ['afterSemicolon', 'a delete with no where outside parentheses'],
    ['commentedWhere', 'a delete with no where outside parentheses'],
    ['constantDisjunct', 'an update with a where whose predicate is a constant'],
    ['constantEquality', 'an update with a where whose predicate is a constant'],
    ['constantTrue', 'a delete with a where whose predicate is a constant'],
    ['deleteAll', 'a delete with no where outside parentheses'],
    ['inCte', 'a delete with no where outside parentheses'],
    ['literalHidesDisjunct', 'a delete with a where whose predicate is a constant'],
    ['merge', 'a merge'],
    ['noWhere', 'an update with no where outside parentheses'],
    ['spaced', 'a delete with no where outside parentheses'],
    ['upperCase', 'a delete with no where outside parentheses'],
    ['upsertWithoutWhere', 'an insert ... on conflict do update with no where'],
    ['whereInterpolated', 'a delete with no where outside parentheses'],
    ['whereOnlyInSubquery', 'a delete with no where outside parentheses'],
    ['wholeFilterInterpolated', 'a delete with a where with no comparison of a column written in the template'],
  ].map(([name, problem]) => `${prefix}${name}: ${problem}`).sort())
})

test('a statement that writes an authority table outside its owning modules is found by table and verb, every table of schema iam outside its folder, and a read or another verb is not', () => {
  const prefix = 'tests/fixtures/census-boundaries/authority-writes.ts#'
  assert.deepEqual(fixture('authority-writes').authorityTableWrites.sort(), [
    ['commentedDelete', 'DELETE project.project'],
    ['commentedVerb', 'DELETE project.project'],
    ['deletes', 'DELETE iam.workspace_membership'],
    ['inCte', 'INSERT iam.workspace_membership'],
    ['inserts', 'INSERT iam.workspace_membership'],
    ['onlyDelete', 'DELETE project.project'],
    ['onlyUpdate', 'UPDATE iam.workspace_membership'],
    ['otherTable', 'UPDATE iam.account'],
    ['projectDelete', 'DELETE project.project'],
    ['receiptDelete', 'DELETE platform.operation_receipt'],
    ['receiptMerge', 'MERGE platform.operation_receipt'],
    ['tombstoneDelete', 'DELETE project.project_deletion'],
    ['tombstoneInsert', 'INSERT project.project_deletion'],
    ['tombstoneUpdate', 'UPDATE project.project_deletion'],
    ['updates', 'UPDATE iam.workspace_membership'],
  ].map(([name, write]) => `${prefix}${name}: writes ${write}`).sort())
  const owners = [
    { table: 'iam.*', verbs: ['INSERT', 'UPDATE', 'DELETE'], modules: ['tests/fixtures/census-boundaries/'] },
    { table: 'project.project_deletion', verbs: ['INSERT', 'UPDATE', 'DELETE'], modules: ['tests/fixtures/census-boundaries/authority-writes.ts'] },
    { table: 'project.project', verbs: ['DELETE'], modules: ['tests/fixtures/census-boundaries/authority-writes.ts'] },
    { table: 'platform.operation_receipt', verbs: ['DELETE'], modules: ['tests/fixtures/census-boundaries/authority-writes.ts'] },
  ]
  assert.deepEqual(fixture('authority-writes', { authorityWriters: owners }).authorityTableWrites, [])
})

test('the rules of the real register name the modules that may write the authority tables', async () => {
  const { AUTHORITY_TABLE_WRITERS } = await import('../../scripts/check-boundaries.mjs')
  assert.deepEqual(AUTHORITY_TABLE_WRITERS.map(({ table, verbs, modules }) => [table, verbs.join('/'), modules.join(' ')]), [
    ['iam.*', 'INSERT/UPDATE/DELETE', 'apps/hub/src/identity-access/'],
    ['project.project_deletion', 'INSERT/UPDATE/DELETE', 'apps/hub/src/project/deletion.ts'],
    ['project.project', 'DELETE', 'apps/hub/src/project/deletion.ts'],
    ['platform.operation_receipt', 'DELETE', 'apps/hub/src/platform/receipt.ts'],
  ])
})

test('every reference to the openGate symbol outside the gate readers is found, through any import form', () => {
  const prefix = 'tests/fixtures/census-boundaries/gate-uses.ts#'
  const gate = { declaration: /gate-db\.ts$/, readers: [] }
  assert.deepEqual(fixture('gate-uses', { gate }).gateReferences.sort(), [
    '<module>', '<module>', '<module>', 'aliased', 'bracket', 'destructuredRenamed', 'destructuredShorthand', 'dynamic', 'named', 'namespaced',
  ].map((name) => (name === '<module>' ? `${prefix}<module>` : `${prefix}${name}`)).sort())
  assert.deepEqual(fixture('gate-uses', { gate: { ...gate, readers: ['tests/fixtures/census-boundaries/gate-uses.ts'] } }).gateReferences, [])
})

test('an update or a delete of a split table must compare one of its register key columns', () => {
  const prefix = 'tests/fixtures/census-boundaries/key-columns.ts#'
  const splitTables = { 'project.project': ['project_id', 'workspace_id'], 'iam.account': ['account_id'] }
  const problem = (table, keys, verb = 'delete') => `${verb === 'update' ? 'an' : 'a'} ${verb} of ${table} whose where compares none of its key columns (${keys})`
  assert.deepEqual(fixture('key-columns', { splitTables }).sqlWrites.sort(), [
    ['accountByRole', problem('iam.account', 'account_id', 'update')],
    ['byFlagOnly', problem('project.project', 'project_id, workspace_id')],
    ['byLiteral', problem('project.project', 'project_id, workspace_id')],
    ['byNameOnly', problem('project.project', 'project_id, workspace_id', 'update')],
    ['byOtherTable', 'a delete with a where with no comparison of a column written in the template'],
    ['byRange', problem('project.project', 'project_id, workspace_id')],
    ['inCte', problem('project.project', 'project_id, workspace_id')],
  ].map(([name, text]) => `${prefix}${name}: ${text}`).sort())
  assert.deepEqual(fixture('key-columns').sqlWrites, [`${prefix}byOtherTable: a delete with a where with no comparison of a column written in the template`])
})

test('every finding is prohibited unless it is an explicit boundary exception', () => {
  assert.deepEqual(violations({ pgQueryRows: ['a.ts#x'], webResponseJson: ['apps/web/src/app/failure.ts#readFailure'], gateReferences: ['a.ts#y'] }), ['pgQueryRows: a.ts#x', 'gateReferences: a.ts#y'])
  assert.deepEqual(violations({ webResponseJson: ['a.ts#x', 'b.ts#y'] }, { webResponseJson: ['a.ts#x'] }), ['webResponseJson: b.ts#y'])
  assert.deepEqual(violations({ authorityTableWrites: ['DELETE iam.account'], sqlWrites: ['a merge'], pgImportFiles: ['a.ts'] }), ['authorityTableWrites: DELETE iam.account', 'sqlWrites: a merge', 'pgImportFiles: a.ts'])
})

test('SQL ownership follows the actual tag declaration, registered relations and scoped CTEs', () => {
  const path = 'tests/fixtures/census-boundaries/sql-relations.ts'
  const prefix = `${path}#`
  const sqlTables = { 'project.project': [], 'iam.account': [], 'unknown.project': [] }
  const options = { sqlTables, sqlOwner: (source) => source === path ? 'project' : null }
  const expected = [
    ['quoted', 'foreign SQL relation iam.account'],
    ['aliased', 'foreign SQL relation iam.account'],
    ['localAlias', 'foreign SQL relation iam.account'],
    ['destructuredAlias', 'foreign SQL relation iam.account'],
    ['bracketAlias', 'foreign SQL relation iam.account'],
    ['nested', 'foreign SQL relation iam.account'],
    ['foreignWrite', 'foreign SQL relation iam.account'],
    ['unknown', 'unregistered SQL relation project.unregistered'],
    ['unknownSchema', 'unregistered SQL relation unknown.project'],
    ['unqualified', 'unregistered SQL relation project'],
    ['nestedCte', 'foreign SQL relation iam.account'],
    ['cteScope', 'unregistered SQL relation owned'],
    ['quotedCase', 'unregistered SQL relation IAM.account'],
    ['dynamic', 'dynamic SQL relation'],
    ['dynamicQuoted', 'dynamic SQL relation'],
    ['dynamicJoin', 'dynamic SQL relation'],
    ['dynamicComma', 'dynamic SQL relation'],
    ['dynamicFragment', 'dynamic SQL relation'],
    ['dynamicFunction', 'dynamic SQL relation'],
    ['composed', 'foreign SQL relation iam.account'],
  ].map(([operation, problem]) => `${prefix}${operation}: ${problem}`)
  assert.deepEqual(fixture('sql-relations', options).sqlOwners.sort(), expected.sort())

  const dependency = `${prefix}nested -> iam.account`
  const matchedSqlDependencies = new Set()
  const allowed = fixture('sql-relations', { ...options, sqlDependencies: [dependency, `${prefix}foreignWrite -> iam.account`], matchedSqlDependencies })
  assert.deepEqual(allowed.sqlOwners.sort(), expected.filter((entry) => entry !== `${prefix}nested: foreign SQL relation iam.account`).sort())
  assert.deepEqual(staleSqlDependencies([dependency], matchedSqlDependencies), [])
  assert.deepEqual(staleSqlDependencies([`${prefix}owned -> iam.account`], matchedSqlDependencies), [`stale SQL dependency: ${prefix}owned -> iam.account`])
  const unknownOwner = fixture('sql-relations', { ...options, sqlOwner: (source) => source === path ? undefined : null }).sqlOwners
  assert.ok(unknownOwner.includes(`${prefix}owned: unknown SQL owner`))
})
