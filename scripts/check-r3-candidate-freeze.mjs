import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(import.meta.dirname, '..')
const freezeRelative = 'docs/evidence/4f/4f-r3-rf05-rf08-candidate-freeze.md'
const attestationRelative = 'docs/evidence/4f/4f-r3-rf05-rf08-candidate-attestation.json'
const migrationRelativeRoot = 'apps/hub/migrations'
const projectMigrationRelativeRoot = 'apps/hub/project-migrations'
const projectMigrationNames = Object.freeze([
  '001_budget_analyzer_read_model.sql',
  '002_budget_analyzer_observation_gap.sql',
])
const requiredCustodyPaths = Object.freeze([
  'docs/roadmap.md',
  'docs/index.md',
  'docs/decisions/index.md',
  'docs/evidence/4d/atlas.sum-legacy-019.txt',
  'docs/evidence/4f/4f-r3-4d-c-selection-packet.md',
  'docs/evidence/4f/4f-r3-rf05-rf08-owner-decision.md',
  'docs/evidence/4f/4f-r3-admission-preparation.md',
  'docs/evidence/4d/4d-opp-b02-postgresql-migrations-cr1-study.md',
  'docs/evidence/4d/4d-opp-b03-governed-sync-mar-study.md',
  'docs/evidence/4f/4f-r3-rf05-rf08-candidate-review-brief.md',
  'docs/evidence/4f/4f-r3-p2-p3-owner-decision.md',
  'docs/evidence/4f/4f-r3-p2-p3-astra-advisor-receipt.md',
  'docs/evidence/4f/4f-r3-p2-p3-implementation-review-brief.md',
  'docs/tasks/r3.md',
  'docs/evidence/4f/4f-r3-mar-migration-implementation-packet.md',
  'docs/reference/managed-execution-qualification.md',
  'docs/reference/data-and-persistence.md',
  'contracts/api/product/builder-paths.yaml',
  'scripts/run-hub-migrations.mjs',
  'scripts/check-r3-candidate-freeze.mjs',
  'scripts/conexus-review.mjs',
  'scripts/conexus-verify.mjs',
  'apps/hub/migrations/024_mar_pg_boss_projection.sql',
  'apps/hub/migrations/025_mar_admission_function.sql',
  'apps/hub/project-migrations/001_budget_analyzer_read_model.sql',
  'apps/hub/project-migrations/002_budget_analyzer_observation_gap.sql',
  'apps/hub/src/mar/admission.ts',
  'apps/hub/src/project/read-model.ts',
  'scripts/run-project-migrations.mjs',
  'apps/hub/src/platform/postgres.ts',
  'apps/hub/src/connections/store.ts',
  'apps/hub/src/brain/store.ts',
  'apps/hub/src/workspace/store.ts',
  'apps/hub/src/project/store.ts',
  'apps/hub/src/project/inception.ts',
  'apps/hub/src/project/binding-recovery.ts',
  'apps/hub/src/identity-access/store.ts',
  'apps/hub/src/builder/store.ts',
  'tests/implementation/r1-s2-postgres.test.mjs',
  'tests/implementation/r3-mar-migration.test.mjs',
  'tests/implementation/r3-mar-admission.test.mjs',
  'tests/implementation/r3-project-read-model.test.mjs',
  'tests/repository/r3-candidate-freeze.test.mjs',
  'package.json',
  'package-lock.json',
  'qualification/3l/managed-execution/package.json',
  'qualification/3l/managed-execution/package-lock.json',
  'qualification/3l/managed-execution/admission/criteria.json',
  'qualification/3l/managed-execution/evidence/dt1p.json',
  'qualification/3l/managed-execution/vendor/pgboss-12.26.3-mar.sql',
  'qualification/4f/r3-root-tuple/run.mjs',
  'qualification/4f/r3-root-tuple/managed-execution.mjs',
])
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = message => { throw new Error(`R3_CANDIDATE_FREEZE_${message}`) }

const inside = (root, candidate) => {
  const remainder = relative(root, candidate)
  return remainder === '' || (remainder !== '..' && !remainder.startsWith(`..${sep}`) && !remainder.startsWith(sep))
}

const parseEntries = text => {
  const entries = [...text.matchAll(/^\| `([^`]+)` \| `([0-9a-f]{64})` \|$/gm)]
    .map(([, path, digest]) => ({ path, digest }))
  const expected = new Set(requiredCustodyPaths)
  const actual = new Set(entries.map(({ path }) => path))
  if (entries.length !== expected.size || actual.size !== expected.size) fail('CUSTODY_TABLE_INCOMPLETE')
  if (new Set(entries.map(({ path }) => path)).size !== entries.length) fail('CUSTODY_TABLE_DUPLICATE')
  for (const path of expected) if (!actual.has(path)) fail(`CUSTODY_PATH_MISSING:${path}`)
  for (const path of actual) if (!expected.has(path)) fail(`CUSTODY_PATH_UNEXPECTED:${path}`)
  return entries
}

const manifestDigest = entries => sha256(Buffer.from(
  entries
    .map(({ path, digest }) => `${path}\0${digest}\0\n`)
    .sort()
    .join(''),
))

const migrationDigest = (root, relativeRoot, names) => sha256(Buffer.from(
  names
    .map(name => {
      const path = `${relativeRoot}/${name}`
      return `${path}\0${sha256(readFileSync(resolve(root, path)))}\0\n`
    })
    .sort()
    .join(''),
))

const sourceFiles = (root, directory) => readdirSync(resolve(root, directory), { withFileTypes: true })
  .flatMap(entry => {
    const relativePath = `${directory}/${entry.name}`
    if (entry.isDirectory()) return sourceFiles(root, relativePath)
    return entry.isFile() && entry.name.endsWith('.ts') ? [relativePath] : []
  })

// The RF-05 falsifier applies to every Hub module that checks out a database
// client. Derive this census from current source bytes so a newly added owner
// cannot be omitted by a second hand-maintained path list.
const transactionOwnerPaths = root => sourceFiles(root, 'apps/hub/src')
  .filter(path => /\.connect\s*\(\s*\)/.test(readFileSync(resolve(root, path), 'utf8')))
  .sort()

export function verifyR3CandidateFreeze({ root = repositoryRoot, freezePath = resolve(root, freezeRelative), text: suppliedText } = {}) {
  const text = suppliedText ?? readFileSync(freezePath, 'utf8')
  assert.match(text, /> \*\*Status:\*\* FROZEN IMPLEMENTATION CANDIDATE \/ R3 ADMITTED BY OPERATOR WAIVER/)
  assert.match(text, /Implementation authority\W+`1` \(operator waiver; independent closure waived\)/)
  const declaredBase = text.match(/\*\*Base:\*\* `([0-9a-f]{40})`/)?.[1]
  if (!declaredBase) fail('BASE_MISSING')
  const actualBase = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  if (declaredBase !== actualBase) fail('BASE_DRIFT')
  for (const marker of [
    '`R3-P1`', '`R3-P2`', '`R3-P3`', '`R3-P4`', '`R3-P5`', '`R3-P6`', '`R3-P7`',
    '`BLD10_PREVIEW_SUBJECT_DIGEST`', '`BuildPreview.subjectDigest`',
    '`builder.read_preview_subject`', 'mar.job_run', 'R7 retains',
    'runtime custody', 'createSchema=false', 'retryLimit=0',
    'vendorDdlSha256', 'notProductDdl',
  ]) assert.match(text, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  const entries = parseEntries(text)
  const custodyPaths = new Set(entries.map(({ path }) => path))
  for (const path of transactionOwnerPaths(root)) {
    if (!custodyPaths.has(path)) fail(`TRANSACTION_CUSTODY_PATH_MISSING:${path}`)
  }
  for (const { path, digest } of entries) {
    const absolute = resolve(root, path)
    if (!inside(root, absolute) || path === freezeRelative) fail(`CUSTODY_PATH_REFUSED:${path}`)
    if (sha256(readFileSync(absolute)) !== digest) fail(`CUSTODY_DIGEST_DRIFT:${path}`)
  }

  const declaredManifest = text.match(/Candidate manifest digest: `([0-9a-f]{64})`/)?.[1]
  if (!declaredManifest) fail('MANIFEST_DIGEST_MISSING')
  if (declaredManifest !== manifestDigest(entries)) fail('MANIFEST_DIGEST_DRIFT')

  const migrationRoot = resolve(root, migrationRelativeRoot)
  const names = readdirSync(migrationRoot)
    .filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
    .sort()
  if (names.length !== 25 || names[0] !== '001_iam_foundation.sql' || names.at(-1) !== '025_mar_admission_function.sql') {
    fail('MIGRATION_CENSUS_REFUSED')
  }
  const declaredMigration = text.match(/Migration corpus digest: `([0-9a-f]{64})`/)?.[1]
  if (!declaredMigration) fail('MIGRATION_DIGEST_MISSING')
  if (declaredMigration !== migrationDigest(root, migrationRelativeRoot, names)) fail('MIGRATION_DIGEST_DRIFT')

  const projectMigrationRoot = resolve(root, projectMigrationRelativeRoot)
  const projectNames = readdirSync(projectMigrationRoot)
    .filter(name => name.endsWith('.sql'))
    .sort()
  if (projectNames.length !== projectMigrationNames.length || projectNames.some((name, index) => name !== projectMigrationNames[index])) {
    fail('PROJECT_MIGRATION_CENSUS_REFUSED')
  }
  const declaredProjectMigration = text.match(/Project migration corpus digest: `([0-9a-f]{64})`/)?.[1]
  if (!declaredProjectMigration) fail('PROJECT_MIGRATION_DIGEST_MISSING')
  if (declaredProjectMigration !== migrationDigest(root, projectMigrationRelativeRoot, projectNames)) fail('PROJECT_MIGRATION_DIGEST_DRIFT')

  const attestation = JSON.parse(readFileSync(resolve(root, attestationRelative), 'utf8'))
  if (attestation.freezeSha256 !== sha256(Buffer.from(text))) fail('ATTESTATION_FREEZE_DRIFT')
  if (attestation.briefSha256 !== sha256(readFileSync(resolve(root, 'docs/evidence/4f/4f-r3-rf05-rf08-candidate-review-brief.md')))) fail('ATTESTATION_BRIEF_DRIFT')
  if (attestation.base !== actualBase || attestation.candidateManifestDigest !== declaredManifest || attestation.migrationCorpusDigest !== declaredMigration) fail('ATTESTATION_METADATA_DRIFT')

  return {
    verdict: 'PASS',
    freezePath: relative(root, freezePath).split(sep).join('/'),
    custodyEntries: entries.length,
    transactionOwnerPaths: transactionOwnerPaths(root),
    migrationCount: names.length,
    candidateManifestDigest: declaredManifest,
    migrationCorpusDigest: declaredMigration,
    projectMigrationCount: projectNames.length,
    projectMigrationCorpusDigest: declaredProjectMigration,
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(verifyR3CandidateFreeze())}\n`)
}
