import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalBytes, sha256, treeDigest, verifyS2Plan } from './check-r1-s2-migration.mjs'

const root = resolve(import.meta.dirname, '..')
const absolute = (path) => resolve(root, ...path.split('/'))
const fail = (code, detail = '') => { throw new Error(`${code}${detail ? `:${detail}` : ''}`) }
const digest = (path) => sha256(readFileSync(absolute(path)))
const priorPhases = ['S2-P0', 'S2-P1', 'S2-P2', 'S2-P3', 'S2-P4']
const translatedPhases = priorPhases
const envelopeFields = ['planDigest', 'validationDigest', 'previousPartPassDigest']
const correctedBootstrapPaths = [
  'scripts/record-r1-s2-receipt.mjs',
]
const authorizedReissueSessions = {
  fable: 'b7ea0a6d-1d04-4dd2-9a7e-462c9ee9c257',
  gemini: '8ccc7b09-0b3f-4b56-a084-b6d024aa6447',
}
const archive = {
  bundle: 'docs/evidence/4f/s2-source-ref-reopen-v3/lineage-bundle.json',
  passes: Object.fromEntries(priorPhases.map((part) => [part, `docs/evidence/4f/s2-source-ref-reopen-v3/${part.toLowerCase()}-pass.json`])),
}
const evidencePath = 'docs/evidence/4f/4f-r1-s2-p5-source-ref-classification-reopen.md'
const translatorPath = 'scripts/rebootstrap-r1-s2-v4.mjs'
const extraSourcePaths = [...Object.values(archive.passes), archive.bundle, evidencePath, translatorPath].sort()
const expectedArchiveDigests = new Map([
  [archive.passes['S2-P0'], '702c27c47edf994808c450b036c4c74f1ad715b954746e24de1125c34d358ed2'],
  [archive.passes['S2-P1'], '9630f398f26db51c11ded6310be7dba9de9e914e79aa848f7ef2ebd68798b919'],
  [archive.passes['S2-P2'], '16588b5a86f1e2122e5584ad8479f68c48ade02fbb2fe093fc56b17f4ba74051'],
  [archive.passes['S2-P3'], '7878a5df842abfaa30278c9a0a611c956679197c0c8633d61289995b0804a853'],
  [archive.passes['S2-P4'], '4a706353f1192d4018a534ae0822ea9c7a041b4b3cca80fe00027410eebbeaae'],
  [archive.bundle, 'b281cdaf90cf44a6ad509f80653b3dc05c9aa2d53d264d99b4ffb1f69471abd6'],
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
  for (const part of priorPhases) {
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

const readLineageBundle = () => {
  const bundle = readCanonicalJson(archive.bundle).value
  const expectedPaths = [
    'profiles/r1/v1/s2-workspace-foundation-migration.json',
    'runtime/r1/.conexus/s2-migration-plan-validation.json',
    'runtime/r1/.conexus/s2-p0-pass.json',
    'runtime/r1/.conexus/s2-p1-pass.json',
    'runtime/r1/.conexus/s2-p2-pass.json',
    'runtime/r1/.conexus/s2-p3-pass.json',
    'runtime/r1/.conexus/s2-p4-pass.json',
    'scripts/record-r1-s2-receipt.mjs',
  ].sort()
  if (bundle.kind !== 'conexus.r1-s2-source-ref-reopen-v3-archive/v1' ||
      JSON.stringify(bundle.entries.map(({ path }) => path).sort()) !== JSON.stringify(expectedPaths)) {
    fail('S2_REISSUE_LINEAGE_ARCHIVE_REFUSED')
  }
  const entries = new Map()
  for (const entry of bundle.entries) {
    const bytes = Buffer.from(entry.base64, 'base64')
    if (sha256(bytes) !== entry.digest) fail('S2_REISSUE_LINEAGE_ARCHIVE_DRIFT', entry.path)
    entries.set(entry.path, { bytes, value: entry.path.endsWith('.json') ? JSON.parse(bytes) : null, digest: entry.digest })
  }
  return entries
}

const validateBootstrapArchive = (priorPlan, entries) => {
  for (const path of correctedBootstrapPaths) {
    const previous = priorPlan.bootstrapPaths.find((entry) => entry.path === path)
    const archived = entries.get(path)
    if (!previous || !archived || previous.outputDigest !== archived.digest) fail('S2_REISSUE_BOOTSTRAP_ARCHIVE_DRIFT', path)
  }
}

const validateAdoptedTree = (plan, priorPasses) => {
  const latest = new Map()
  for (const part of priorPhases) for (const affected of priorPasses.get(part).affectedPaths) latest.set(affected.path, affected.digest)
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
  for (const part of translatedPhases) {
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
  ...priorPhases.map((part) => `runtime/r1/.conexus/${part.toLowerCase()}-pass.json`),
]
const sidecar = (path, suffix) => `docs/evidence/4f/s2-source-ref-reopen-v3/transaction-${basename(path)}${suffix}`
const recoverInterruptedTranslation = ({ checkOnly }) => {
  for (const path of recoveryPaths) {
    const temporary = sidecar(path, '.v4.tmp')
    const backup = sidecar(path, '.v3.bak')
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
const beginTranslation = (values, removals) => {
  const allPaths = [...values.map(([path]) => path), ...removals]
  for (const path of allPaths) if (!existsSync(absolute(path))) fail('S2_REISSUE_LIVE_PART_MISSING', path)
  for (const [path, value] of values) durableWrite(sidecar(path, '.v4.tmp'), canonicalBytes(value))
  try {
    for (const path of allPaths) renameSync(absolute(path), absolute(sidecar(path, '.v3.bak')))
    for (const [path] of values) renameSync(absolute(sidecar(path, '.v4.tmp')), absolute(path))
  } catch (error) {
    for (const path of allPaths) {
      const temporary = sidecar(path, '.v4.tmp')
      const backup = sidecar(path, '.v3.bak')
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
      for (const path of allPaths) rmSync(absolute(sidecar(path, '.v3.bak')))
    },
    rollback: () => {
      for (const path of allPaths) {
        if (existsSync(absolute(path))) rmSync(absolute(path))
        renameSync(absolute(sidecar(path, '.v3.bak')), absolute(path))
      }
    },
  }
}

export const rebootstrapS2V4 = ({ fableSession, geminiSession, checkOnly = false }) => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  if (!uuid.test(fableSession ?? '') || !uuid.test(geminiSession ?? '') || fableSession === geminiSession ||
      fableSession !== authorizedReissueSessions.fable || geminiSession !== authorizedReissueSessions.gemini) fail('S2_REISSUE_REVIEW_REFUSED')
  recoverInterruptedTranslation({ checkOnly })
  for (const [path, expected] of expectedArchiveDigests) if (digest(path) !== expected) fail('S2_REISSUE_ARCHIVE_DIGEST_REFUSED', path)
  const lineage = readLineageBundle()
  const priorPlanArchive = lineage.get('profiles/r1/v1/s2-workspace-foundation-migration.json')
  const priorValidationArchive = lineage.get('runtime/r1/.conexus/s2-migration-plan-validation.json')
  if (!priorPlanArchive || !priorValidationArchive ||
      !canonicalBytes(priorPlanArchive.value).equals(priorPlanArchive.bytes) ||
      !canonicalBytes(priorValidationArchive.value).equals(priorValidationArchive.bytes)) fail('S2_REISSUE_LINEAGE_JSON_REFUSED')
  const priorPasses = new Map(priorPhases.map((part) => [part, readCanonicalJson(archive.passes[part]).value]))
  const priorPlanDigest = sha256(priorPlanArchive.bytes)
  const priorValidationDigest = sha256(priorValidationArchive.bytes)
  if (digest('runtime/r1/.conexus/s2-migration-plan-validation.json') !== priorValidationDigest) fail('S2_REISSUE_LIVE_VALIDATION_DRIFT')
  for (const part of priorPhases) {
    if (digest(`runtime/r1/.conexus/${part.toLowerCase()}-pass.json`) !== digest(archive.passes[part])) fail('S2_REISSUE_LIVE_PART_DRIFT', part)
  }
  if (existsSync(absolute('runtime/r1/.conexus/s2-p5-pass.json'))) fail('S2_REISSUE_PREMATURE_P5')
  for (const path of [
    'runtime/r1/.conexus/s2-conformance-result.json',
    'runtime/r1/.conexus/s2-ownership-manifest.json',
    'runtime/r1/.conexus/s2-generation-receipt.json',
  ]) if (existsSync(absolute(path))) fail('S2_REISSUE_PREMATURE_TERMINAL_ARTIFACT', path)
  const currentPlan = readCanonicalJson('profiles/r1/v1/s2-workspace-foundation-migration.json')
  validatePlanDelta(priorPlanArchive.value, currentPlan.value)
  validatePriorChain(priorPlanArchive.value, priorPlanDigest, priorValidationArchive.value, priorValidationDigest, priorPasses)
  validateBootstrapArchive(priorPlanArchive.value, lineage)
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
      kind: 'conexus.r1-s2-source-ref-reissue/v1',
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
      translatedParts: translatedPhases,
    }
  }
  const replacements = [
    ['runtime/r1/.conexus/s2-migration-plan-validation.json', validation],
    ...translatedPhases.map((part) => [`runtime/r1/.conexus/${part.toLowerCase()}-pass.json`, translated.get(part)]),
  ]
  const transaction = beginTranslation(replacements, [])
  try {
    const verified = verifyS2Plan({ currentPart: 'S2-P4', requireValidation: true })
    if (verified.planDigest !== planDigest || verified.validationDigest !== validationDigest || !verified.adopting) fail('S2_REISSUE_POSTCHECK_REFUSED')
    if (existsSync(absolute('runtime/r1/.conexus/s2-p5-pass.json'))) fail('S2_REISSUE_PREMATURE_P5')
    for (const part of translatedPhases) {
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
    translatedParts: translatedPhases,
  }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const valueFor = (name) => process.argv[process.argv.indexOf(name) + 1]
  process.stdout.write(`${JSON.stringify(rebootstrapS2V4({
    fableSession: valueFor('--fable-session'),
    geminiSession: valueFor('--gemini-session'),
    checkOnly: process.argv.includes('--check'),
  }))}\n`)
}
