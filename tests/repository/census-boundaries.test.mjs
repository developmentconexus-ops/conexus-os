import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import ts from 'typescript'
import { findings } from '../../scripts/census-boundaries.mjs'

const root = resolve(import.meta.dirname, '../..')
const fixture = (name) => {
  const program = ts.createProgram({
    rootNames: [resolve(root, `tests/fixtures/census-boundaries/${name}.ts`)],
    options: { strict: true, skipLibCheck: true, noEmit: true, target: ts.ScriptTarget.ES2022, lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'], module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: [] },
  })
  return findings(program, { root, pgEdge: [], responseEdge: [] })
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
  assert.deepEqual(findings(program, { root, pgEdge: ['tests/fixtures/census-boundaries/pg-rows.ts'], responseEdge: [] }), { pgQueryRows: [], pgImportFiles: [], webResponseJson: [], sqlWrites: [], authorityTableWrites: [] })
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

test('a statement that writes an authority table outside its owning module is found, and a read or another table is not', () => {
  const prefix = 'tests/fixtures/census-boundaries/authority-writes.ts#'
  assert.deepEqual(fixture('authority-writes').authorityTableWrites.sort(), ['deletes', 'inCte', 'inserts', 'updates'].map((name) => `${prefix}${name}: writes iam.workspace_membership`))
  const program = ts.createProgram({
    rootNames: [resolve(root, 'tests/fixtures/census-boundaries/authority-writes.ts')],
    options: { strict: true, skipLibCheck: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: [] },
  })
  const owner = findings(program, { root, pgEdge: [], responseEdge: [], authorityWriters: { 'iam.workspace_membership': ['tests/fixtures/census-boundaries/authority-writes.ts'] } })
  assert.deepEqual(owner.authorityTableWrites, [])
})
