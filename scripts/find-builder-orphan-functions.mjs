// Computes which builder.* functions migration 038 left alive over tables it dropped are now
// orphaned: unreachable from the Hub and from every surviving function body.
//
// Method: migrate a scratch database to head, read every function's definition with
// pg_get_functiondef (not migration file text, because later migrations re-issue functions).
// Roots are direct calls from apps/hub/src/**/*.ts to any schema-qualified function that exists in
// the catalog. The closure follows calls between function bodies across every schema, not just
// builder, because iam.admit_project_review and builder.admit_verified_application_source are each
// called from outside the builder schema, and a builder-only graph would misjudge both.
//
// Every builder.* function outside the closure, plus iam.admit_project_review if it too falls
// outside, is a candidate orphan. Each candidate then passes a cross-check before being trusted:
// its body must either reference a relation that no longer exists in the head catalog, or have no
// caller left among the surviving (in-closure) functions. A candidate whose only remaining callers
// are themselves outside the closure still passes (the whole dead chain drops together); a
// candidate with a live caller fails and moves to follow-ups with the reason recorded.
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { loadCurrentHubMigrationFiles, runSelectedHubMigrations } from './run-hub-migrations.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')

const fail = (code, detail) => { throw new Error(detail ? `${code}: ${detail}` : code) }
const required = (name) => process.env[name] ?? fail(`MISSING_CONFIG_${name}`)
const readAdmin = () => ({
  host: required('CONEXUS_TEST_DB_HOST'),
  port: Number(required('CONEXUS_TEST_DB_PORT')),
  database: required('CONEXUS_TEST_DB_NAME'),
  user: required('CONEXUS_TEST_DB_USER'),
  password: required('CONEXUS_TEST_DB_PASSWORD'),
})
const connectionStringFor = (admin, database) => {
  const url = new URL('postgresql://localhost')
  url.hostname = admin.host
  url.port = String(admin.port)
  url.pathname = `/${database}`
  url.username = admin.user
  url.password = admin.password
  return url.toString()
}

const walkTsFiles = (dir, out = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walkTsFiles(path, out)
    else if (entry.name.endsWith('.ts')) out.push(path)
  }
  return out
}

const readHubSourceText = () => {
  const srcRoot = resolve(repositoryRoot, 'apps/hub/src')
  return walkTsFiles(srcRoot).map(file => readFileSync(file, 'utf8'))
}

const findCalledNames = (text, schema) => {
  const found = new Set()
  const pattern = new RegExp(`\\b${schema}\\.([a-z_][a-z0-9_]*)\\s*\\(`, 'g')
  for (const match of text.matchAll(pattern)) found.add(match[1])
  return found
}

export const findOrphans = async () => {
  const admin = readAdmin()
  const owner = new pg.Client(admin)
  await owner.connect()
  const database = `conexus_f03_orphan_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  try {
    await owner.query(`CREATE DATABASE "${database}"`)
    const migrations = loadCurrentHubMigrationFiles()
    const connectionString = connectionStringFor(admin, database)
    await runSelectedHubMigrations({ connectionString, migrations, recognizedMigrations: migrations, catalogSnapshot: null })
    const client = new pg.Client({ connectionString })
    await client.connect()
    try {
      const relations = (await client.query(`
        SELECT n.nspname || '.' || c.relname AS qualified
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND c.relkind IN ('r', 'p', 'v', 'm')
      `)).rows.map(row => row.qualified)
      const relationSet = new Set(relations)

      const allFunctions = (await client.query(`
        SELECT n.nspname AS schema, p.proname AS name,
          pg_get_function_identity_arguments(p.oid) AS args,
          pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND p.prokind = 'f'
      `)).rows
      const key = (row) => `${row.schema}.${row.name}(${row.args})`
      const schemas = [...new Set(allFunctions.map(row => row.schema))]
      const namesBySchema = new Map(schemas.map(schema => [schema, new Set(allFunctions.filter(row => row.schema === schema).map(row => row.name))]))

      const builderFunctions = allFunctions.filter(row => row.schema === 'builder')

      // Every migration ever issued, to find table names that once existed and are now gone.
      const migrationsRoot = resolve(repositoryRoot, 'apps/hub/migrations')
      const everCreatedTables = new Set()
      for (const name of readdirSync(migrationsRoot)) {
        if (!name.endsWith('.sql')) continue
        const text = readFileSync(join(migrationsRoot, name), 'utf8')
        for (const match of text.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi)) {
          everCreatedTables.add(match[1].toLowerCase())
        }
      }
      const deadRelations = [...everCreatedTables].filter(name => !relationSet.has(name))

      // Global call graph: which functions (any schema) does each function's body call, by name.
      // Names are resolved per schema so an edge only fires against a name that schema still has.
      const callEdges = new Map()
      for (const row of allFunctions) {
        const calls = new Set()
        for (const schema of schemas) {
          for (const name of findCalledNames(row.definition, schema)) {
            if (schema === row.schema && name === row.name) continue
            if (namesBySchema.get(schema).has(name)) calls.add(`${schema}.${name}`)
          }
        }
        callEdges.set(`${row.schema}.${row.name}`, calls)
      }

      // Roots: every schema.name the Hub calls directly, restricted to names the catalog has.
      const hubSourceText = readHubSourceText()
      const builderRoots = new Set()
      const allRoots = new Set()
      for (const text of hubSourceText) {
        for (const schema of schemas) {
          for (const name of findCalledNames(text, schema)) {
            if (namesBySchema.get(schema).has(name)) {
              allRoots.add(`${schema}.${name}`)
              if (schema === 'builder') builderRoots.add(name)
            }
          }
        }
      }

      // A function wired to a live trigger fires on table changes, not on a text-visible call, so
      // it is a root in its own right regardless of whether anything else names it. Kept separate
      // from the Hub-called roots above: it is a distinct reason to survive, not a Hub call.
      const triggerFunctionRoots = (await client.query(`
        SELECT DISTINCT n.nspname AS schema, p.proname AS name
        FROM pg_trigger t
        JOIN pg_proc p ON p.oid = t.tgfoid
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE NOT t.tgisinternal
      `)).rows.map(row => `${row.schema}.${row.name}`)
      for (const node of triggerFunctionRoots) allRoots.add(node)

      const closure = new Set(allRoots)
      let frontier = [...allRoots]
      while (frontier.length > 0) {
        const next = []
        for (const node of frontier) {
          for (const called of callEdges.get(node) ?? []) {
            if (!closure.has(called)) { closure.add(called); next.push(called) }
          }
        }
        frontier = next
      }

      const candidates = builderFunctions.filter(row => !closure.has(`${row.schema}.${row.name}`))
      const admitProjectReview = allFunctions.find(row => row.schema === 'iam' && row.name === 'admit_project_review')
      if (admitProjectReview && !closure.has('iam.admit_project_review')) candidates.push(admitProjectReview)

      // Cross-check: a dead relation reference, or no caller left among the surviving (in-closure) functions.
      const dropped = []
      const followups = []
      for (const row of candidates) {
        const referencesDeadRelation = deadRelations.find(rel => new RegExp(`\\b${rel.replace('.', '\\.')}\\b`, 'i').test(row.definition))
        const survivingCallers = allFunctions.filter(other =>
          closure.has(`${other.schema}.${other.name}`) &&
          (callEdges.get(`${other.schema}.${other.name}`) ?? new Set()).has(`${row.schema}.${row.name}`))
        const zeroSurvivingCallers = survivingCallers.length === 0
        if (referencesDeadRelation || zeroSurvivingCallers) {
          dropped.push({ schema: row.schema, name: row.name, args: row.args, reason: referencesDeadRelation ? `references dropped relation ${referencesDeadRelation}` : 'no surviving caller' })
        } else {
          followups.push({ schema: row.schema, name: row.name, args: row.args, reason: `cross-check failed: no dead-relation reference found and a surviving caller remains (${survivingCallers.map(key).join(', ')})` })
        }
      }

      return {
        aliveBuilderFunctionCount: builderFunctions.length,
        rootCount: builderRoots.size,
        roots: [...builderRoots].sort(),
        triggerRoots: triggerFunctionRoots.filter(node => node.startsWith('builder.')).sort(),
        closureCount: [...closure].filter(node => node.startsWith('builder.')).length,
        deadRelations,
        admitProjectReviewCandidate: admitProjectReview ? !closure.has('iam.admit_project_review') : false,
        dropped: dropped.sort((a, b) => `${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`)),
        followups,
      }
    } finally {
      await client.end()
    }
  } finally {
    await owner.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
    await owner.end()
  }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const outPath = resolve(repositoryRoot, 'scripts/.f03-orphan-report.json')
  const result = await findOrphans()
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify({
    aliveBuilderFunctionCount: result.aliveBuilderFunctionCount,
    rootCount: result.rootCount,
    closureCount: result.closureCount,
    droppedCount: result.dropped.length,
    followupCount: result.followups.length,
    reportPath: 'scripts/.f03-orphan-report.json',
  }, null, 2))
}
