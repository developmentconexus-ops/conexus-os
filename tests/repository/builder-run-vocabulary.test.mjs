import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { test } from 'node:test'
import { readVocabulary, renderVocabulary, vocabularyDrift, vocabularyTargets } from '../../scripts/generate-builder-run-vocabulary.mjs'

const root = resolve(import.meta.dirname, '../..')
const catalog = JSON.parse(readFileSync(join(root, 'contracts/technical/hub-catalog-snapshot.json'), 'utf8')).catalog
const committedFiles = () => Object.fromEntries(vocabularyTargets.map((target) => [target, readFileSync(join(root, target), 'utf8')]))

test('the run vocabulary source, the SQL CHECK lists and both generated files agree', () => {
  assert.deepEqual(vocabularyDrift(readVocabulary(), catalog, committedFiles()), [])
  assert.equal(committedFiles()['apps/web/src/generated/builder-run-vocabulary.ts'].includes("export const BUILDER_RUN_PHASES = ['PREPARING', 'AGENT', 'PARKED', 'SOURCE_ADMISSION', 'COMPILING', 'FINALIZING'] as const"), true)
})

test('a phase added to the source only fails naming the SQL list and both generated sets', () => {
  const source = readVocabulary()
  const added = { ...source, phases: [...source.phases, 'REVIEWING'] }
  assert.deepEqual(vocabularyDrift(added, catalog, committedFiles()), [
    'BUILDER_RUN_VOCABULARY_SQL_DRIFT: phases is [PREPARING, AGENT, PARKED, SOURCE_ADMISSION, COMPILING, FINALIZING, REVIEWING] in contracts/technical/builder-run-vocabulary.json and [PREPARING, AGENT, PARKED, SOURCE_ADMISSION, COMPILING, FINALIZING] in the SQL list builder.builder_run.builder_run_phase_check; add a migration and run npm run db:catalog:snapshot',
    'BUILDER_RUN_VOCABULARY_STALE: apps/hub/src/generated/builder-run-vocabulary.ts is not generated from contracts/technical/builder-run-vocabulary.json; run node scripts/generate-builder-run-vocabulary.mjs',
    'BUILDER_RUN_VOCABULARY_STALE: apps/web/src/generated/builder-run-vocabulary.ts is not generated from contracts/technical/builder-run-vocabulary.json; run node scripts/generate-builder-run-vocabulary.mjs',
  ])
  const regenerated = Object.fromEntries(vocabularyTargets.map((target) => [target, renderVocabulary(added)]))
  assert.equal(vocabularyDrift(added, catalog, regenerated).length, 1, 'regenerating leaves only the SQL list, which needs a migration')
})

// Two values of one list next to each other, as an array or a union: a hand-typed copy of the list.
const OWNERS = ['apps/hub/src/builder', 'apps/hub/src/project', 'apps/web/src/features/builder', 'apps/web/src/features/project']
const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name)
  if (entry.isDirectory()) return walk(path)
  return /\.tsx?$/.test(entry.name) ? [path] : []
})

test('no Builder or Project source types a run state, phase or result kind list by hand', () => {
  const vocabulary = readVocabulary()
  const copies = Object.values(vocabulary).map((values) => {
    const one = `'(?:${values.join('|')})'`
    return new RegExp(`${one}(?:, | \\| )${one}`)
  })
  const offenders = OWNERS.flatMap((owner) => walk(join(root, owner))).flatMap((file) =>
    readFileSync(file, 'utf8').split('\n').flatMap((line, index) => copies.some((copy) => copy.test(line)) ? [`${relative(root, file)}:${index + 1}`] : []))
  assert.deepEqual(offenders, [])
  assert.equal(copies[1].test("phase: 'PREPARING' | 'AGENT' | null"), true, 'the scan finds a retyped union')
})
