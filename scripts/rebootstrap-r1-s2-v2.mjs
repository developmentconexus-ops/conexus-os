import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalBytes, sha256, treeDigest, verifyS2Plan } from './check-r1-s2-migration.mjs'

const root = resolve(import.meta.dirname, '..')
const absolute = (path) => resolve(root, ...path.split('/'))
const fail = (code, detail = '') => { throw new Error(`${code}${detail ? `:${detail}` : ''}`) }
const digest = (path) => sha256(readFileSync(absolute(path)))
const phases = ['S2-P0', 'S2-P1', 'S2-P2', 'S2-P3', 'S2-P4']
const envelopeFields = ['planDigest', 'validationDigest', 'previousPartPassDigest']
const correctedBootstrapPaths = [
  'packages/profile-compiler/schemas/s2-workspace-foundation-migration.schema.json',
  'scripts/check-r1-s2-migration.mjs',
  'scripts/record-r1-s2-part-pass.mjs',
]
const authorizedReissueSessions = {
  fable: 'b7ea0a6d-1d04-4dd2-9a7e-462c9ee9c257',
  gemini: '8ccc7b09-0b3f-4b56-a084-b6d024aa6447',
}
const archive = {
  plan: 'docs/evidence/4f/s2-p0-reopen-v1/plan.json',
  validation: 'docs/evidence/4f/s2-p0-reopen-v1/validation.json',
  bootstrap: 'docs/evidence/4f/s2-p0-reopen-v1/bootstrap-sources.json',
  passes: Object.fromEntries(phases.map((part) => [part, `docs/evidence/4f/s2-p0-reopen-v1/${part.slice(3).toLowerCase()}-pass.json`])),
}
const evidencePath = 'docs/evidence/4f/4f-r1-s2-p0-closed-path-reopen.md'
const translatorPath = 'scripts/rebootstrap-r1-s2-v2.mjs'
const extraSourcePaths = [archive.plan, archive.validation, ...Object.values(archive.passes), archive.bootstrap, evidencePath, translatorPath].sort()
const expectedArchiveDigests = new Map([
  [archive.plan, '980790152d983621e78690265d7345531396702f5b64049eac111adf0de97e11'],
  [archive.validation, 'e7332714d2a414396ebb7845307056432322274abed41b1d2a1eb4f38973f405'],
  [archive.passes['S2-P0'], '61512d399523266fa36964d04e724b082a1d681439f869e98c00a4043bde8618'],
  [archive.passes['S2-P1'], '7ad337d036a547cb4024739cf5f05e9f88a920f2bc5678335551c687ec8fc26c'],
  [archive.passes['S2-P2'], '80ef42bc89f4e97d931f24ee5d92687fd60f2abc963da65900bfcd09aaa27d89'],
  [archive.passes['S2-P3'], 'be2957335d46b81e4dbdf97e2473e07dfb49379e8b9ace3acc04707a13786ca7'],
  [archive.passes['S2-P4'], '3ec04c1f60bfc121cad751ca014da60c081d9d8f93200f47576d32d118a787cf'],
  [archive.bootstrap, 'b769c272944934ee35d40a133afa7930d2f70c6db3be3e343028cbc288828076'],
])

const readCanonicalJson = (path) => {
  const bytes = readFileSync(absolute(path))
  const value = JSON.parse(bytes)
  if (!canonicalBytes(value).equals(bytes)) fail('S2_REISSUE_ARCHIVE_NOT_CANONICAL', path)
  return { bytes, value }
}
const clone = (value) => structuredClone(value)
const withoutEnvelope = (record) => {
  const value = clone(record)
  for (const field of envelopeFields) delete value[field]
  return value
}
const actualExactDigest = (path) => existsSync(absolute(path)) ? digest(path) : null

const validatePlanDelta = (priorPlan, currentPlan) => {
  const normalized = clone(currentPlan)
  for (const entry of [...normalized.changedPaths, ...normalized.addedPaths]) delete entry.currentDigest
  for (const entry of normalized.generatedRoots) delete entry.currentTreeDigest
  for (const entry of normalized.bootstrapPaths) {
    const previous = priorPlan.bootstrapPaths.find(({ path }) => path === entry.path)
    if (!previous) fail('S2_REISSUE_BOOTSTRAP_SCOPE', entry.path)
    if (correctedBootstrapPaths.includes(entry.path)) entry.outputDigest = previous.outputDigest
    else if (entry.outputDigest !== previous.outputDigest) fail('S2_REISSUE_BOOTSTRAP_DRIFT', entry.path)
  }
  const previousSourcePaths = new Set(priorPlan.sourceRefs.map(({ path }) => path))
  const extras = currentPlan.sourceRefs.map(({ path }) => path).filter((path) => !previousSourcePaths.has(path)).sort()
  if (JSON.stringify(extras) !== JSON.stringify(extraSourcePaths)) fail('S2_REISSUE_SOURCE_SCOPE')
  for (const previous of priorPlan.sourceRefs) {
    const current = currentPlan.sourceRefs.find(({ path }) => path === previous.path)
    if (!current || current.digest !== previous.digest) fail('S2_REISSUE_SOURCE_DRIFT', previous.path)
  }
  normalized.sourceRefs = clone(priorPlan.sourceRefs)
  if (!canonicalBytes(normalized).equals(canonicalBytes(priorPlan))) fail('S2_REISSUE_PLAN_DELTA_REFUSED')
}

const validatePriorChain = (priorPlan, priorPlanDigest, priorValidation, priorValidationDigest, priorPasses) => {
  if (priorValidation.kind !== 'conexus.r1-s2-migration-plan-validation/v1' || priorValidation.verdict !== 'PASS' ||
      priorValidation.planDigest !== priorPlanDigest) fail('S2_REISSUE_VALIDATION_REFUSED')
  const acceptedReviews = (reviews) => {
    const expected = ['Claude Code Fable', 'AGY Gemini Pro']
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    return reviews?.length === 2 && reviews.every(({ reviewer, sessionId, verdict }, index) =>
      reviewer === expected[index] && uuid.test(sessionId ?? '') && verdict === 'ACCEPT') &&
      reviews[0].sessionId !== reviews[1].sessionId
  }
  if (!acceptedReviews(priorValidation.reviews) ||
      canonicalBytes(priorValidation.prior).toString() !== canonicalBytes(priorPlan.prior).toString()) fail('S2_REISSUE_VALIDATION_REFUSED')
  let previous = null
  for (const part of phases) {
    const record = priorPasses.get(part)
    const expectedPaths = [
      ...priorPlan.changedPaths.filter(({ mutationWindows }) => mutationWindows.includes(part)).map(({ path }) => path),
      ...priorPlan.addedPaths.filter(({ mutationWindows }) => mutationWindows.includes(part)).map(({ path }) => path),
      ...priorPlan.generatedRoots.filter(({ mutationWindows }) => mutationWindows.includes(part)).map(({ root: base }) => `${base}/**`),
    ].sort()
    if (record.kind !== 'conexus.r1-s2-part-pass/v1' || record.part !== part || record.verdict !== 'PASS' ||
        record.planDigest !== priorPlanDigest || record.validationDigest !== priorValidationDigest ||
        record.previousPartPassDigest !== previous ||
        record.affectedPathsDigest !== sha256(canonicalBytes(record.affectedPaths)) ||
        JSON.stringify(record.affectedPaths.map(({ path }) => path).sort()) !== JSON.stringify(expectedPaths) ||
        !acceptedReviews(record.reviews)) fail('S2_REISSUE_PART_REFUSED', part)
    const required = priorPlan.parts.find(({ id }) => id === part).requiredProofs.slice().sort()
    if (JSON.stringify(record.proofs.map(({ id }) => id).sort()) !== JSON.stringify(required)) fail('S2_REISSUE_PROOF_CENSUS', part)
    previous = sha256(canonicalBytes(record))
  }
}

const validateBootstrapArchive = (priorPlan) => {
  const bundle = readCanonicalJson(archive.bootstrap).value
  if (bundle.kind !== 'conexus.r1-s2-p0-reopen-bootstrap-archive/v1' ||
      JSON.stringify(bundle.entries.map(({ path }) => path).sort()) !== JSON.stringify(correctedBootstrapPaths.slice().sort())) {
    fail('S2_REISSUE_BOOTSTRAP_ARCHIVE_REFUSED')
  }
  for (const entry of bundle.entries) {
    const bytes = Buffer.from(entry.base64, 'base64')
    const previous = priorPlan.bootstrapPaths.find(({ path }) => path === entry.path)
    if (!previous || sha256(bytes) !== entry.digest || previous.outputDigest !== entry.digest) fail('S2_REISSUE_BOOTSTRAP_ARCHIVE_DRIFT', entry.path)
  }
}

const validateAdoptedTree = (plan, priorPasses) => {
  const latest = new Map()
  for (const part of phases) for (const affected of priorPasses.get(part).affectedPaths) latest.set(affected.path, affected.digest)
  for (const entry of [...plan.changedPaths, ...plan.addedPaths]) {
    if (!entry.currentDigest || actualExactDigest(entry.path) !== entry.currentDigest) fail('S2_REISSUE_CURRENT_DIGEST_DRIFT', entry.path)
    if (!entry.mutationWindows.includes('S2-P5') && latest.get(entry.path) !== entry.currentDigest) fail('S2_REISSUE_LATEST_OWNER_DRIFT', entry.path)
  }
  for (const entry of plan.generatedRoots) {
    const path = `${entry.root}/**`
    if (!entry.currentTreeDigest || treeDigest(entry.root) !== entry.currentTreeDigest) fail('S2_REISSUE_CURRENT_DIGEST_DRIFT', path)
    if (!entry.mutationWindows.includes('S2-P5') && latest.get(path) !== entry.currentTreeDigest) fail('S2_REISSUE_LATEST_OWNER_DRIFT', path)
  }
}

const translatePasses = (priorPasses, planDigest, validationDigest) => {
  const output = new Map()
  let previous = null
  for (const part of phases) {
    const prior = priorPasses.get(part)
    const translated = { ...prior, planDigest, validationDigest, previousPartPassDigest: previous }
    if (!canonicalBytes(withoutEnvelope(translated)).equals(canonicalBytes(withoutEnvelope(prior)))) fail('S2_REISSUE_ENVELOPE_BREACH', part)
    output.set(part, translated)
    previous = sha256(canonicalBytes(translated))
  }
  return output
}

const recoveryPaths = [
  'runtime/r1/.conexus/s2-migration-plan-validation.json',
  ...phases.map((part) => `runtime/r1/.conexus/${part.toLowerCase()}-pass.json`),
]
const sidecar = (path, suffix) => `docs/evidence/4f/s2-p0-reopen-v1/transaction-${basename(path)}${suffix}`
const recoverInterruptedTranslation = ({ checkOnly }) => {
  for (const path of recoveryPaths) {
    const temporary = sidecar(path, '.v2.tmp')
    const backup = sidecar(path, '.v1.bak')
    if (checkOnly && (existsSync(absolute(temporary)) || existsSync(absolute(backup)))) fail('S2_REISSUE_RECOVERY_REQUIRED', path)
    if (existsSync(absolute(backup))) {
      if (existsSync(absolute(path))) rmSync(absolute(path))
      renameSync(absolute(backup), absolute(path))
    }
    if (existsSync(absolute(temporary))) rmSync(absolute(temporary))
  }
}
const durableWrite = (path, bytes) => {
  const descriptor = openSync(absolute(path), 'wx')
  try {
    writeFileSync(descriptor, bytes)
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}
const beginTranslation = (values) => {
  for (const [path, value] of values) durableWrite(sidecar(path, '.v2.tmp'), canonicalBytes(value))
  try {
    for (const [path] of values) renameSync(absolute(path), absolute(sidecar(path, '.v1.bak')))
    for (const [path] of values) renameSync(absolute(sidecar(path, '.v2.tmp')), absolute(path))
  } catch (error) {
    for (const [path] of values) {
      const temporary = sidecar(path, '.v2.tmp')
      const backup = sidecar(path, '.v1.bak')
      if (existsSync(absolute(backup))) {
        if (existsSync(absolute(path))) rmSync(absolute(path))
        renameSync(absolute(backup), absolute(path))
      }
      if (existsSync(absolute(temporary))) rmSync(absolute(temporary))
    }
    throw error
  }
  return {
    commit: () => {
      for (const [path] of values) rmSync(absolute(sidecar(path, '.v1.bak')))
    },
    rollback: () => {
      for (const [path] of values) {
        if (existsSync(absolute(path))) rmSync(absolute(path))
        renameSync(absolute(sidecar(path, '.v1.bak')), absolute(path))
      }
    },
  }
}

export const rebootstrapS2V2 = ({ fableSession, geminiSession, checkOnly = false }) => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  if (!uuid.test(fableSession ?? '') || !uuid.test(geminiSession ?? '') || fableSession === geminiSession ||
      fableSession !== authorizedReissueSessions.fable || geminiSession !== authorizedReissueSessions.gemini) fail('S2_REISSUE_REVIEW_REFUSED')
  recoverInterruptedTranslation({ checkOnly })
  for (const [path, expected] of expectedArchiveDigests) if (digest(path) !== expected) fail('S2_REISSUE_ARCHIVE_DIGEST_REFUSED', path)
  const priorPlanArchive = readCanonicalJson(archive.plan)
  const priorValidationArchive = readCanonicalJson(archive.validation)
  const priorPasses = new Map(phases.map((part) => [part, readCanonicalJson(archive.passes[part]).value]))
  const priorPlanDigest = sha256(priorPlanArchive.bytes)
  const priorValidationDigest = sha256(priorValidationArchive.bytes)
  if (digest('runtime/r1/.conexus/s2-migration-plan-validation.json') !== priorValidationDigest) fail('S2_REISSUE_LIVE_VALIDATION_DRIFT')
  for (const part of phases) {
    if (digest(`runtime/r1/.conexus/${part.toLowerCase()}-pass.json`) !== digest(archive.passes[part])) fail('S2_REISSUE_LIVE_PART_DRIFT', part)
  }
  const currentPlan = readCanonicalJson('profiles/r1/v1/s2-workspace-foundation-migration.json')
  validatePlanDelta(priorPlanArchive.value, currentPlan.value)
  validatePriorChain(priorPlanArchive.value, priorPlanDigest, priorValidationArchive.value, priorValidationDigest, priorPasses)
  validateBootstrapArchive(priorPlanArchive.value)
  validateAdoptedTree(currentPlan.value, priorPasses)
  verifyS2Plan({ baseline: true })

  const planDigest = sha256(currentPlan.bytes)
  const validation = {
    kind: 'conexus.r1-s2-migration-plan-validation/v1',
    verdict: 'PASS',
    planDigest,
    prior: currentPlan.value.prior,
    bootstrapDigests: currentPlan.value.bootstrapPaths.map(({ path, outputDigest }) => ({ path, digest: outputDigest })),
    reviews: [
      { reviewer: 'Claude Code Fable', sessionId: fableSession, verdict: 'ACCEPT' },
      { reviewer: 'AGY Gemini Pro', sessionId: geminiSession, verdict: 'ACCEPT' },
    ],
    reissue: {
      kind: 'conexus.r1-s2-p0-reissue/v1',
      previousPlanDigest: priorPlanDigest,
      previousValidationDigest: priorValidationDigest,
      evidencePath,
      translation: 'ENVELOPE_ONLY',
    },
  }
  const validationDigest = sha256(canonicalBytes(validation))
  const translated = translatePasses(priorPasses, planDigest, validationDigest)
  if (checkOnly) {
    return {
      verdict: 'PASS',
      mode: 'CHECK_ONLY',
      previousPlanDigest: priorPlanDigest,
      planDigest,
      previousValidationDigest: priorValidationDigest,
      validationDigest,
      translatedParts: phases,
    }
  }
  const replacements = [
    ['runtime/r1/.conexus/s2-migration-plan-validation.json', validation],
    ...phases.map((part) => [`runtime/r1/.conexus/${part.toLowerCase()}-pass.json`, translated.get(part)]),
  ]
  const transaction = beginTranslation(replacements)
  try {
    const verified = verifyS2Plan({ currentPart: 'S2-P4', requireValidation: true })
    if (verified.planDigest !== planDigest || verified.validationDigest !== validationDigest || !verified.adopting) fail('S2_REISSUE_POSTCHECK_REFUSED')
    for (const part of phases) {
      const current = readCanonicalJson(`runtime/r1/.conexus/${part.toLowerCase()}-pass.json`).value
      if (!canonicalBytes(withoutEnvelope(current)).equals(canonicalBytes(withoutEnvelope(priorPasses.get(part))))) fail('S2_REISSUE_ENVELOPE_BREACH', part)
    }
  } catch (error) {
    transaction.rollback()
    throw error
  }
  transaction.commit()
  return {
    verdict: 'PASS',
    previousPlanDigest: priorPlanDigest,
    planDigest,
    previousValidationDigest: priorValidationDigest,
    validationDigest,
    translatedParts: phases,
  }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const valueFor = (name) => process.argv[process.argv.indexOf(name) + 1]
  process.stdout.write(`${JSON.stringify(rebootstrapS2V2({
    fableSession: valueFor('--fable-session'),
    geminiSession: valueFor('--gemini-session'),
    checkOnly: process.argv.includes('--check'),
  }))}\n`)
}
