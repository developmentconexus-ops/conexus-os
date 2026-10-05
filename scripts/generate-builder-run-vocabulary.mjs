import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')
const sourcePath = 'contracts/technical/builder-run-vocabulary.json'
export const vocabularyTargets = Object.freeze([
  'apps/hub/src/generated/builder-run-vocabulary.ts',
  'apps/web/src/generated/builder-run-vocabulary.ts',
  'packages/contract/src/builder-run-vocabulary.ts',
])

// Each list the database holds, by the CHECK constraint that holds it.
const SQL_LISTS = Object.freeze([
  { key: 'states', constraint: 'builder.builder_run.builder_run_state_check' },
  { key: 'phases', constraint: 'builder.builder_run.builder_run_phase_check' },
  { key: 'resultKinds', constraint: 'builder.builder_run.builder_run_result_kind_check' },
])

export const readVocabulary = (root = repositoryRoot) => JSON.parse(readFileSync(resolve(root, sourcePath), 'utf8'))

const literals = (values) => values.map((value) => `'${value}'`).join(', ')

export const renderVocabulary = (vocabulary) => [
  `// GENERATED from ${sourcePath} by scripts/generate-builder-run-vocabulary.mjs. Do not edit.`,
  '',
  `export const BUILDER_RUN_STATES = [${literals(vocabulary.states)}] as const`,
  'export type BuilderRunState = (typeof BUILDER_RUN_STATES)[number]',
  `export const BUILDER_RUN_PHASES = [${literals(vocabulary.phases)}] as const`,
  'export type BuilderRunPhase = (typeof BUILDER_RUN_PHASES)[number]',
  `export const BUILDER_RUN_RESULT_KINDS = [${literals(vocabulary.resultKinds)}] as const`,
  'export type BuilderRunResultKind = (typeof BUILDER_RUN_RESULT_KINDS)[number]',
  '',
].join('\n')

/** The values of the `ARRAY[...]` in a committed CHECK constraint line, in order. */
const checkValues = (line) => [...(/ARRAY\[([^\]]*)\]/.exec(line)?.[1] ?? '').matchAll(/'([^']*)'::text/g)].map((match) => match[1])

/** Every place a list drifted from the source, each naming the SQL list and the generated files to change. */
export const vocabularyDrift = (vocabulary, catalog, generated) => {
  const drift = []
  for (const { key, constraint } of SQL_LISTS) {
    const line = catalog.constraint.find((entry) => entry.startsWith(`constraint ${constraint} `))
    const sql = line ? checkValues(line) : []
    if (sql.join(',') !== vocabulary[key].join(',')) {
      drift.push(`BUILDER_RUN_VOCABULARY_SQL_DRIFT: ${key} is [${vocabulary[key].join(', ')}] in ${sourcePath} and [${sql.join(', ')}] in the SQL list ${constraint}; add a migration and run npm run db:catalog:snapshot`)
    }
  }
  const rendered = renderVocabulary(vocabulary)
  for (const target of vocabularyTargets) {
    if (generated[target] !== rendered) drift.push(`BUILDER_RUN_VOCABULARY_STALE: ${target} is not generated from ${sourcePath}; run node scripts/generate-builder-run-vocabulary.mjs`)
  }
  return drift
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rendered = renderVocabulary(readVocabulary())
  for (const target of vocabularyTargets) writeFileSync(resolve(repositoryRoot, target), rendered)
}
