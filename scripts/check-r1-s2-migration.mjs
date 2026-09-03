import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'

const defaultRoot = resolve(import.meta.dirname, '..')
const phases = ['S2-P0', 'S2-P1', 'S2-P2', 'S2-P3', 'S2-P4', 'S2-P5']
const expectedProductDelta = {
  operationsRealized: ['WS-01', 'WS-02'], existingOperationProjectionChanged: ['IAM-01'], schemasAdded: ['workspace'],
  tablesAdded: ['workspace.workspace', 'workspace.operation_idempotency', 'iam.workspace_membership'],
  loginRolesAdded: ['hub_ws01_command', 'hub_s2_read'], permissionsAdded: [], appOwnedMutations: 0, laterSlicesAuthorized: [],
}

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const canonicalValue = (value) => Array.isArray(value) ? value.map(canonicalValue)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
    : value
export const canonicalBytes = (value) => Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`, 'utf8')
const absolute = (repositoryRoot, path) => resolve(repositoryRoot, ...path.split('/'))
const digest = (repositoryRoot, path) => sha256(readFileSync(absolute(repositoryRoot, path)))
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const fail = (code, detail = '') => { throw new Error(`${code}${detail ? `:${detail}` : ''}`) }
const refuseSymlinkAncestors = (repositoryRoot, path) => {
  let target = repositoryRoot
  for (const segment of path.split('/')) {
    target = resolve(target, segment)
    if (existsSync(target) && lstatSync(target).isSymbolicLink()) fail('S2_SYMLINK_REFUSED', path)
  }
}
const requireDigest = (repositoryRoot, { path, digest: expected }) => {
  const target = absolute(repositoryRoot, path)
  refuseSymlinkAncestors(repositoryRoot, path)
  if (!existsSync(target) || !lstatSync(target).isFile() || lstatSync(target).isSymbolicLink()) fail('S2_REQUIRED_FILE_REFUSED', path)
  if (digest(repositoryRoot, path) !== expected) fail('S2_DIGEST_MISMATCH', path)
}
const safePath = (path) => {
  if (typeof path !== 'string' || path.length === 0 || path.includes('\\') || path.includes('\0') || path.includes(':') || path.startsWith('/')) return false
  const segments = path.split('/')
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}

const walk = (repositoryRoot, base, output = []) => {
  const target = absolute(repositoryRoot, base)
  if (!existsSync(target)) fail('S2_CUSTODY_ROOT_MISSING', base)
  refuseSymlinkAncestors(repositoryRoot, base)
  if (lstatSync(target).isSymbolicLink()) fail('S2_SYMLINK_REFUSED', base)
  if (!lstatSync(target).isDirectory()) fail('S2_CUSTODY_ROOT_REFUSED', base)
  for (const name of readdirSync(target).sort()) {
    const path = `${base}/${name}`
    const stat = lstatSync(absolute(repositoryRoot, path))
    if (stat.isSymbolicLink()) fail('S2_SYMLINK_REFUSED', path)
    if (stat.isDirectory()) walk(repositoryRoot, path, output)
    else if (stat.isFile()) output.push(path)
    else fail('S2_ENTRY_REFUSED', path)
  }
  return output
}

export const treeDigest = (base, repositoryRoot = defaultRoot) => sha256(canonicalBytes(walk(repositoryRoot, base).map((path) => ({ path: path.slice(base.length + 1), digest: digest(repositoryRoot, path) }))))

const loadPlan = (repositoryRoot) => {
  const planPath = absolute(repositoryRoot, 'profiles/r1/v1/s2-workspace-foundation-migration.json')
  const bytes = readFileSync(planPath)
  const plan = JSON.parse(bytes)
  const schema = readJson(absolute(repositoryRoot, 'packages/profile-compiler/schemas/s2-workspace-foundation-migration.schema.json'))
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  if (!validate(plan)) fail('S2_PLAN_SCHEMA_REFUSED', JSON.stringify(validate.errors))
  if (plan.kind !== 'conexus.r1-s2-workspace-foundation-migration/v1' || plan.migrationId !== 'R1-S2-WORKSPACE-FOUNDATION') fail('S2_PLAN_KIND_REFUSED')
  if (!canonicalBytes(plan).equals(bytes)) fail('S2_PLAN_NOT_CANONICAL')
  if (JSON.stringify(plan.parts.map(({ id }) => id)) !== JSON.stringify(phases)) fail('S2_PART_ORDER_REFUSED')
  if (!canonicalBytes(plan.expectedProductDelta).equals(canonicalBytes(expectedProductDelta))) fail('S2_PRODUCT_DELTA_REFUSED')
  const paths = []
  for (const collection of [plan.bootstrapPaths, plan.changedPaths, plan.addedPaths, plan.adoptedExistingPaths, plan.protectedExistingPaths, plan.controlArtifacts]) {
    for (const entry of collection) {
      if (!safePath(entry.path)) fail('S2_UNSAFE_PATH', entry.path)
      paths.push(entry.path)
    }
  }
  for (const entry of plan.generatedRoots) {
    if (!safePath(entry.root)) fail('S2_UNSAFE_PATH', entry.root)
    paths.push(entry.root)
  }
  for (const entry of plan.sourceRefs) if (!safePath(entry.path)) fail('S2_UNSAFE_PATH', entry.path)
  if (new Set(plan.sourceRefs.map(({ path }) => path)).size !== plan.sourceRefs.length) fail('S2_SOURCE_REF_DUPLICATE')
  for (const base of plan.custodyRoots) if (!safePath(base)) fail('S2_UNSAFE_PATH', base)
  if (new Set(plan.custodyRoots).size !== plan.custodyRoots.length) fail('S2_CUSTODY_ROOT_DUPLICATE')
  const duplicate = paths.find((path, index) => paths.indexOf(path) !== index)
  if (duplicate) fail('S2_PATH_DISPOSITION_DUPLICATE', duplicate)
  if (plan.addedPaths.some(({ class: ownerClass }) => ownerClass === 'APP-OWNED') || plan.changedPaths.some(({ class: ownerClass }) => ownerClass === 'APP-OWNED')) fail('S2_APP_OWNED_REFUSED')
  return { plan, bytes }
}

const adoptMode = (repositoryRoot, plan, planBytes) => {
  const exact = [...plan.changedPaths, ...plan.addedPaths]
  const usesAdoption = exact.some(({ currentDigest }) => currentDigest) || plan.generatedRoots.some(({ currentTreeDigest }) => currentTreeDigest)
  if (!usesAdoption) return false
  if (exact.some(({ currentDigest }) => !currentDigest) || plan.generatedRoots.some(({ currentTreeDigest }) => !currentTreeDigest)) fail('S2_ADOPTION_INCOMPLETE')
  const parsedRefs = plan.sourceRefs.flatMap((entry) => {
    try {
      return [{ entry, value: readJson(absolute(repositoryRoot, entry.path)) }]
    } catch {
      return []
    }
  })
  const priorValidations = parsedRefs.filter(({ value }) => value.kind === 'conexus.r1-s2-migration-plan-validation/v1' && value.verdict === 'PASS')
  if (priorValidations.length !== 1 || priorValidations[0].value.planDigest === sha256(planBytes)) fail('S2_ADOPTION_LINEAGE_REFUSED')
  const priorPlans = parsedRefs.filter(({ entry, value }) =>
    value.kind === 'conexus.r1-s2-workspace-foundation-migration/v1' &&
    value.migrationId === 'R1-S2-WORKSPACE-FOUNDATION' &&
    entry.digest === priorValidations[0].value.planDigest)
  if (priorPlans.length !== 1) fail('S2_ADOPTION_PLAN_REFUSED')
  return true
}

const priorManifestEntries = (repositoryRoot) => readJson(absolute(repositoryRoot, 'runtime/r1/.conexus/a0-ownership-manifest.json')).entries

export const verifyS2Plan = ({ baseline = false, currentPart = null, requireValidation = false, repositoryRoot = defaultRoot } = {}) => {
  const { plan, bytes } = loadPlan(repositoryRoot)
  const validationPath = absolute(repositoryRoot, 'runtime/r1/.conexus/s2-migration-plan-validation.json')
  requireDigest(repositoryRoot, { path: 'runtime/r1/.conexus/a0-generation-receipt.json', digest: plan.prior.a0ReceiptDigest })
  requireDigest(repositoryRoot, { path: 'runtime/r1/.conexus/a0-ownership-manifest.json', digest: plan.prior.a0ManifestDigest })
  requireDigest(repositoryRoot, { path: 'apps/hub/migrations/001_iam_foundation.sql', digest: plan.prior.migration001Digest })
  for (const entry of plan.sourceRefs) requireDigest(repositoryRoot, entry)
  for (const entry of plan.bootstrapPaths) requireDigest(repositoryRoot, { path: entry.path, digest: entry.outputDigest })
  for (const entry of plan.adoptedExistingPaths) requireDigest(repositoryRoot, entry)
  for (const entry of plan.protectedExistingPaths) requireDigest(repositoryRoot, entry)
  const adopting = adoptMode(repositoryRoot, plan, bytes)

  const mutable = new Set(plan.changedPaths.map(({ path }) => path))
  const generatedBases = plan.generatedRoots.map(({ root: base }) => `${base}/`)
  const priorEntries = priorManifestEntries(repositoryRoot)
  for (const entry of priorEntries) {
    if (mutable.has(entry.path) || generatedBases.some((base) => entry.path.startsWith(base))) continue
    requireDigest(repositoryRoot, { path: entry.path, digest: entry.outputDigest })
  }

  const admitted = new Set(priorEntries.map(({ path }) => path))
  for (const collection of [plan.bootstrapPaths, plan.changedPaths, plan.addedPaths, plan.adoptedExistingPaths, plan.protectedExistingPaths, plan.controlArtifacts]) {
    for (const entry of collection) admitted.add(entry.path)
  }
  for (const base of plan.custodyRoots) {
    for (const path of walk(repositoryRoot, base)) {
      if (admitted.has(path) || generatedBases.some((generatedBase) => path.startsWith(generatedBase))) continue
      fail('S2_UNLISTED_PATH', path)
    }
  }

  if (baseline) {
    for (const entry of plan.changedPaths) requireDigest(repositoryRoot, { path: entry.path, digest: entry.currentDigest ?? entry.priorDigest })
    for (const entry of plan.addedPaths) {
      if (entry.currentDigest) requireDigest(repositoryRoot, { path: entry.path, digest: entry.currentDigest })
      else if (existsSync(absolute(repositoryRoot, entry.path))) fail('S2_PREMATURE_PATH', entry.path)
    }
    for (const entry of plan.generatedRoots) {
      if (treeDigest(entry.root, repositoryRoot) !== (entry.currentTreeDigest ?? entry.priorTreeDigest)) fail('S2_GENERATED_ROOT_DRIFT', entry.root)
    }
    if (!adopting) {
      for (const artifact of plan.controlArtifacts) if (artifact.publicationPhase !== 'S2-P0' && existsSync(absolute(repositoryRoot, artifact.path))) fail('S2_PREMATURE_CONTROL', artifact.path)
    }
  }

  let validationDigest = null
  if (requireValidation || currentPart) {
    if (!existsSync(validationPath)) fail('S2_VALIDATION_MISSING')
    const validationBytes = readFileSync(validationPath)
    const validation = JSON.parse(validationBytes)
    if (validation.kind !== 'conexus.r1-s2-migration-plan-validation/v1' || validation.verdict !== 'PASS' || validation.planDigest !== sha256(bytes)) fail('S2_VALIDATION_SUBJECT_REFUSED')
    const expectedReviewers = ['Claude Code Fable', 'AGY Gemini Pro']
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    if (validation.reviews?.length !== 2 || validation.reviews.some(({ reviewer, sessionId, verdict }, reviewIndex) =>
      reviewer !== expectedReviewers[reviewIndex] || !uuid.test(sessionId ?? '') || verdict !== 'ACCEPT') ||
      validation.reviews[0].sessionId === validation.reviews[1].sessionId) fail('S2_VALIDATION_REVIEW_REFUSED')
    validationDigest = sha256(validationBytes)
  }

  if (currentPart) {
    const partIndex = phases.indexOf(currentPart)
    if (partIndex < 0) fail('S2_PART_REFUSED', currentPart)
    for (const entry of plan.changedPaths) {
      if (adopting) {
        requireDigest(repositoryRoot, { path: entry.path, digest: entry.currentDigest })
        continue
      }
      const first = Math.min(...entry.mutationWindows.map((phase) => phases.indexOf(phase)))
      if (first > partIndex) requireDigest(repositoryRoot, { path: entry.path, digest: entry.priorDigest })
    }
    for (const entry of plan.addedPaths) {
      if (adopting) {
        requireDigest(repositoryRoot, { path: entry.path, digest: entry.currentDigest })
        continue
      }
      const first = Math.min(...entry.mutationWindows.map((phase) => phases.indexOf(phase)))
      if (first > partIndex && existsSync(absolute(repositoryRoot, entry.path))) fail('S2_FUTURE_PATH_PREMATURE', entry.path)
    }
    for (const entry of plan.generatedRoots) {
      if (adopting) {
        if (treeDigest(entry.root, repositoryRoot) !== entry.currentTreeDigest) fail('S2_GENERATED_ROOT_DRIFT', entry.root)
        continue
      }
      const first = Math.min(...entry.mutationWindows.map((phase) => phases.indexOf(phase)))
      if (first > partIndex && treeDigest(entry.root, repositoryRoot) !== entry.priorTreeDigest) fail('S2_GENERATED_ROOT_DRIFT', entry.root)
    }
  }
  return { verdict: 'PASS', plan, planDigest: sha256(bytes), validationDigest, adopting }
}

export const recordValidation = ({ fableSession, geminiSession, repositoryRoot = defaultRoot }) => {
  const validationPath = absolute(repositoryRoot, 'runtime/r1/.conexus/s2-migration-plan-validation.json')
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  if (!uuid.test(fableSession ?? '') || !uuid.test(geminiSession ?? '') || fableSession === geminiSession) fail('S2_REVIEW_SESSION_REFUSED')
  if (existsSync(validationPath)) fail('S2_VALIDATION_EXISTS')
  const verified = verifyS2Plan({ baseline: true, repositoryRoot })
  const result = {
    kind: 'conexus.r1-s2-migration-plan-validation/v1', verdict: 'PASS', planDigest: verified.planDigest,
    prior: verified.plan.prior,
    bootstrapDigests: verified.plan.bootstrapPaths.map(({ path, outputDigest }) => ({ path, digest: outputDigest })),
    reviews: [
      { reviewer: 'Claude Code Fable', sessionId: fableSession, verdict: 'ACCEPT' },
      { reviewer: 'AGY Gemini Pro', sessionId: geminiSession, verdict: 'ACCEPT' },
    ],
  }
  const temporary = `${validationPath}.tmp`
  writeFileSync(temporary, canonicalBytes(result))
  renameSync(temporary, validationPath)
  return { ...result, validationDigest: sha256(canonicalBytes(result)) }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const value = process.argv.includes('--record')
    ? recordValidation({ fableSession: process.argv[process.argv.indexOf('--fable-session') + 1], geminiSession: process.argv[process.argv.indexOf('--gemini-session') + 1] })
    : verifyS2Plan({ baseline: process.argv.includes('--baseline'), requireValidation: process.argv.includes('--validated') })
  process.stdout.write(`${JSON.stringify({ ...value, plan: undefined })}\n`)
}

export const repositoryPath = (path, repositoryRoot = defaultRoot) => relative(repositoryRoot, path).replaceAll('\\', '/')
