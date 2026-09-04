import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultPlanPath = resolve(repositoryRoot, 'profiles/r1/v1/a0-code-architecture-migration.json')
const validationPath = resolve(repositoryRoot, 'runtime/r1/.conexus/a0-migration-plan-validation.json')

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

const canonicalValue = (value) => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('A0_CANONICAL_NUMBER_REFUSED')
    return value
  }
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
  }
  throw new Error('A0_CANONICAL_TYPE_REFUSED')
}

export const canonicalBytes = (value) => Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`, 'utf8')

const readJson = (path) => {
  const bytes = readFileSync(path)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error(`A0_JSON_BOM_REFUSED:${path}`)
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}

const absolute = (root, path) => resolve(root, ...path.split('/'))
const digestFile = (root, path) => sha256(readFileSync(absolute(root, path)))
const requireFileDigest = (root, entry, field = 'digest') => {
  const path = absolute(root, entry.path)
  if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error(`A0_REQUIRED_FILE_REFUSED:${entry.path}`)
  const actual = sha256(readFileSync(path))
  if (actual !== entry[field]) throw new Error(`A0_DIGEST_MISMATCH:${entry.path}:${entry[field]}:${actual}`)
}

const requireAbsent = (root, path) => {
  if (existsSync(absolute(root, path))) throw new Error(`A0_PREMATURE_PATH:${path}`)
}

const packageHasDependency = (root, name) => {
  const packageJson = readJson(resolve(root, 'package.json'))
  return Object.hasOwn(packageJson.dependencies ?? {}, name) || Object.hasOwn(packageJson.devDependencies ?? {}, name)
}

const lockHasDependency = (root, name) => {
  const lock = readJson(resolve(root, 'package-lock.json'))
  return Object.hasOwn(lock.packages ?? {}, `node_modules/${name}`)
}

export const verifyBootstrap = ({
  root = repositoryRoot,
  planPath = defaultPlanPath,
  requireBaseline = true,
  verifyPriorTooling = true,
  requireValidation = false,
} = {}) => {
  const planBytes = readFileSync(planPath)
  const plan = readJson(planPath)
  if (plan.kind !== 'conexus.r1-a0-code-architecture-migration/v1') throw new Error('A0_PLAN_KIND_REFUSED')

  for (const entry of plan.sourceRefs) requireFileDigest(root, entry)
  if (verifyPriorTooling) for (const entry of plan.priorToolingPaths) requireFileDigest(root, entry)
  for (const entry of plan.bootstrapPaths) requireFileDigest(root, entry, 'outputDigest')
  for (const entry of plan.unchangedProtected) requireFileDigest(root, entry)

  const priorSubjects = [
    ['runtime/r1/.conexus/s1-generation-receipt.json', plan.prior.s1ReceiptDigest],
    ['runtime/r1/.conexus/s1-ownership-manifest.json', plan.prior.s1ManifestDigest],
    ['runtime/r1/.conexus/generation-receipt.json', plan.prior.g0ReceiptDigest],
  ]
  for (const [path, digest] of priorSubjects) requireFileDigest(root, { path, digest })

  if (requireBaseline) {
    for (const artifact of plan.controlArtifacts) {
      if (artifact.kind !== 'conexus.r1-a0-code-architecture-migration/v1') requireAbsent(root, artifact.path)
    }
    for (const entry of plan.changedPaths) requireFileDigest(root, { path: entry.path, digest: entry.priorDigest })
    for (const entry of plan.removedPaths) requireFileDigest(root, { path: entry.path, digest: entry.priorDigest })
    for (const entry of plan.oldToNew) {
      requireFileDigest(root, { path: entry.oldPath, digest: entry.oldDigest })
      requireAbsent(root, entry.newPath)
    }
    for (const entry of plan.adoptedExistingPaths) requireFileDigest(root, { path: entry.path, digest: entry.preDigest })
    for (const entry of plan.addedPaths) requireAbsent(root, entry.path)
    for (const dependency of plan.dependencyTargets) {
      if (packageHasDependency(root, dependency.name) || lockHasDependency(root, dependency.name)) throw new Error(`A0_DEPENDENCY_ALREADY_PRESENT:${dependency.name}`)
    }
  }

  let validationDigest
  if (requireValidation) {
    const path = resolve(root, 'runtime/r1/.conexus/a0-migration-plan-validation.json')
    const validation = readJson(path)
    if (validation.kind !== 'conexus.r1-a0-migration-plan-validation/v1' || validation.verdict !== 'PASS') throw new Error('A0_VALIDATION_REFUSED')
    if (validation.planDigest !== sha256(planBytes) || JSON.stringify(validation.prior) !== JSON.stringify(plan.prior)) throw new Error('A0_VALIDATION_SUBJECT_MISMATCH')
    if (!canonicalBytes(validation.bootstrapDigests).equals(canonicalBytes(plan.bootstrapPaths.map(({ path: entryPath, outputDigest }) => ({ path: entryPath, digest: outputDigest }))))) throw new Error('A0_VALIDATION_BOOTSTRAP_MISMATCH')
    if (!canonicalBytes(validation.priorToolingDigests).equals(canonicalBytes(plan.priorToolingPaths))) throw new Error('A0_VALIDATION_TOOLING_MISMATCH')
    if (validation.reviews?.length !== 2 || validation.reviews.some(({ verdict }) => verdict !== 'ACCEPT')) throw new Error('A0_VALIDATION_REVIEW_MISMATCH')
    validationDigest = sha256(readFileSync(path))
  }

  return {
    plan,
    planDigest: sha256(planBytes),
    bootstrapDigests: plan.bootstrapPaths.map(({ path, outputDigest }) => ({ path, digest: outputDigest })),
    priorToolingDigests: plan.priorToolingPaths.map(({ path, digest }) => ({ path, digest })),
    validationDigest,
  }
}

export const recordValidation = ({ fableSession, geminiSession }) => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  if (!uuid.test(fableSession ?? '') || !uuid.test(geminiSession ?? '')) throw new Error('A0_REVIEW_SESSION_REFUSED')
  if (fableSession === geminiSession) throw new Error('A0_REVIEW_SESSIONS_NOT_DISTINCT')
  if (existsSync(validationPath)) throw new Error('A0_VALIDATION_EXISTS')
  const verified = verifyBootstrap()
  const result = {
    kind: 'conexus.r1-a0-migration-plan-validation/v1',
    verdict: 'PASS',
    planDigest: verified.planDigest,
    prior: verified.plan.prior,
    bootstrapDigests: verified.bootstrapDigests,
    priorToolingDigests: verified.priorToolingDigests,
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
  const record = process.argv.includes('--record')
  const value = record
    ? recordValidation({
        fableSession: process.argv[process.argv.indexOf('--fable-session') + 1],
        geminiSession: process.argv[process.argv.indexOf('--gemini-session') + 1],
      })
    : { ...verifyBootstrap(), plan: undefined, verdict: 'PASS' }
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

export const toRepositoryPath = (path, root = repositoryRoot) => relative(root, path).replaceAll('\\', '/')
