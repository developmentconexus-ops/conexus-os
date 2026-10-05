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
  assert.deepEqual(findings(program, { root, pgEdge: ['tests/fixtures/census-boundaries/pg-rows.ts'], responseEdge: [] }), { pgQueryRows: [], pgImportFiles: [], webResponseJson: [] })
})
