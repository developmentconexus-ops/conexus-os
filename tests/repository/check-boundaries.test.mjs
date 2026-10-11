import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import ts from 'typescript'
import { GATE_OPENER, findings, staleSqlDependencies, violations } from '../../scripts/check-boundaries.mjs'

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
  assert.deepEqual(findings(program, { root, pgEdge: ['tests/fixtures/census-boundaries/pg-rows.ts'], responseEdge: [] }), { pgQueryRows: [], pgImportFiles: [], webResponseJson: [], sqlWrites: [], authorityTableWrites: [], gateReferences: [], rawPersonReads: [], sqlOwners: [], obsoleteRuntimeSymbols: [] })
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

test('every reference to a gate opener outside the modules listed for it is found, through any import form', () => {
  const prefix = 'tests/fixtures/census-boundaries/gate-uses.ts#'
  const self = 'tests/fixtures/census-boundaries/gate-uses.ts'
  const found = (readers) => fixture('gate-uses', { gate: { declaration: /gate-db\.ts$/, readers } }).gateReferences.map((entry) => entry.slice(prefix.length)).sort()
  const write = ['<module>', '<module>', '<module>', 'aliased', 'bracket', 'destructuredRenamed', 'destructuredShorthand', 'dynamic', 'named', 'namespaced']
  const read = ['<module>', 'readDestructured', 'readNamed', 'readNamespaced']
  assert.deepEqual(found({ openGate: [], openReadGate: [] }), [...write, ...read].sort())
  assert.deepEqual(found({ openGate: [self], openReadGate: [] }), read)
  assert.deepEqual(found({ openGate: [], openReadGate: [self] }), write)
  assert.deepEqual(found({ openGate: [self], openReadGate: [self] }), [])
})

test('the read gate is opened by admission alone, and the command and authentication gates by admission and authentication', () => {
  assert.deepEqual(GATE_OPENER.readers, {
    openGate: ['apps/hub/src/identity-access/admission.ts', 'apps/hub/src/identity-access/authentication.ts'],
    openReadGate: ['apps/hub/src/identity-access/admission.ts'],
  })
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

test('read dependencies never authorize INTO, DML or unsupported statement effects', () => {
  const path = 'tests/fixtures/census-boundaries/sql-ownership-regressions.ts'
  const sqlTables = { 'iam.account': [], 'project.project': [], 'project.project_deletion': [], 'builder.builder_run': [], 'builder.project_working_state': [] }
  const writes = ['into', 'insert', 'update', 'remove', 'merge', 'cteWrite']
  const unsupported = { truncate: 'TruncateStmt', lock: 'LockStmt', createAs: 'CreateTableAsStmt', copy: 'CopyStmt' }
  const refused = [...writes, ...Object.keys(unsupported)].map((operation) => `${path}#${operation} -> iam.account`)
  const reads = [`${path}#authorizedRunLock -> builder.builder_run`, `${path}#registryPointer -> builder.project_working_state`, `${path}#registryRetention -> builder.builder_run`]
  const matchedSqlDependencies = new Set()
  const found = fixture('sql-ownership-regressions', { sqlTables, sqlDependencies: [...refused, ...reads], matchedSqlDependencies, sqlOwner: (source) => source === path ? 'project' : null })
  const effects = new Set([...writes, ...Object.keys(unsupported)])
  assert.deepEqual(found.sqlOwners.filter((entry) => effects.has(entry.split('#')[1].split(':')[0])).sort(), [
    ...writes.map((operation) => `${path}#${operation}: foreign SQL relation iam.account`),
    ...Object.entries(unsupported).map(([operation, kind]) => `${path}#${operation}: unsupported SQL statement ${kind}`),
  ].sort())
  assert.deepEqual([...matchedSqlDependencies].sort(), reads.sort())
  assert.deepEqual(staleSqlDependencies([...refused, ...reads], matchedSqlDependencies).sort(), refused.map((entry) => `stale SQL dependency: ${entry}`).sort())
  for (const operation of ['ownInto', 'authorizedProjectLock', 'authorizedRunLock', 'registryPointer', 'registryRetention']) assert.ok(!found.sqlOwners.some((entry) => entry.startsWith(`${path}#${operation}:`)))

  const admissionReads = [`${path}#authorizedProjectLock -> project.project`, `${path}#authorizedProjectLock -> project.project_deletion`, `${path}#authorizedRunLock -> builder.builder_run`]
  const admitted = new Set()
  const iam = fixture('sql-ownership-regressions', { sqlTables, sqlDependencies: admissionReads, matchedSqlDependencies: admitted, sqlOwner: (source) => source === path ? 'identity-access' : null })
  assert.deepEqual([...admitted].sort(), admissionReads.sort())
  assert.ok(!iam.sqlOwners.some((entry) => /#authorized(?:Project|Run)Lock:/.test(entry)))
})

test('CTE definitions observe declaration order, recursive visibility and lexical scopes', () => {
  const path = 'tests/fixtures/census-boundaries/sql-ownership-regressions.ts'
  const operations = new Set(['nonrecursive', 'forward', 'earlier', 'recursive', 'recursiveForward', 'outer', 'nestedHidden', 'siblingScope', 'statementScope'])
  const found = fixture('sql-ownership-regressions', { sqlTables: { 'project.project': [], 'iam.account': [] }, sqlOwner: (source) => source === path ? 'project' : null })
  assert.deepEqual(found.sqlOwners.filter((entry) => operations.has(entry.split('#')[1].split(':')[0])).sort(), [
    ['nonrecursive', 'project'], ['forward', 'later'], ['nestedHidden', 'project'], ['siblingScope', 'hidden'], ['statementScope', 'project'],
  ].map(([operation, relation]) => `${path}#${operation}: unregistered SQL relation ${relation}`).sort())
})

test('a retired role, a role switch, a row security helper and a session setting are found where they are written', () => {
  const prefix = 'tests/fixtures/census-boundaries/obsolete-symbols.ts: '
  assert.deepEqual(fixture('obsolete-symbols', { obsoleteScope: () => true }).obsoleteRuntimeSymbols.sort(), [
    'conexus.account_id', 'conexus.job', 'current_setting(', 'hub_builder_ingress', 'hub_command', 'hub_reader', 'iam_rls', 'reset role', 'rls.', 'set local role', 'set role', 'set session role', 'set_config(',
  ].map((symbol) => `${prefix}${symbol}`).sort())
})

test('a name that only contains a retired word, and a command that only looks like one, is not an obsolete symbol', () => {
  assert.deepEqual(fixture('obsolete-lookalikes', { obsoleteScope: () => true }).obsoleteRuntimeSymbols, [])
})

test('only the Hub sources are scanned for obsolete symbols, and the application runner may switch roles in its own cluster', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'boundaries-obsolete-'))
  try {
    const write = (path, text) => {
      mkdirSync(dirname(resolve(directory, path)), { recursive: true })
      writeFileSync(resolve(directory, path), text)
      return resolve(directory, path)
    }
    const rootNames = [
      write('apps/hub/src/identity-access/x.ts', 'export const q = "SET ROLE a; RESET ROLE; SELECT current_setting(\'a\')"'),
      write('apps/hub/src/app-runner/data-plane.ts', 'export const q = "SET ROLE a; RESET ROLE; SELECT current_setting(\'a\')"'),
      write('apps/web/src/y.ts', 'export const q = "SET ROLE a"'),
    ]
    const program = ts.createProgram({ rootNames, options: { noEmit: true, skipLibCheck: true, types: [] } })
    assert.deepEqual(findings(program, { root: directory, pgEdge: [], responseEdge: [] }).obsoleteRuntimeSymbols.sort(), [
      'apps/hub/src/app-runner/data-plane.ts: current_setting(',
      'apps/hub/src/identity-access/x.ts: current_setting(',
      'apps/hub/src/identity-access/x.ts: reset role',
      'apps/hub/src/identity-access/x.ts: set role',
    ])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
