import { existsSync, lstatSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalBytes, sha256, treeDigest, verifyS2Plan } from './check-r1-s2-migration.mjs'

const root = resolve(import.meta.dirname, '..')
const phases = ['S2-P0', 'S2-P1', 'S2-P2', 'S2-P3', 'S2-P4', 'S2-P5']
const absolute = (path) => resolve(root, ...path.split('/'))
const digest = (path) => sha256(readFileSync(absolute(path)))
const fail = (code, detail = '') => { throw new Error(`${code}${detail ? `:${detail}` : ''}`) }
const currentFile = (path) => {
  const target = absolute(path)
  if (!existsSync(target) || !lstatSync(target).isFile() || lstatSync(target).isSymbolicLink()) fail('S2_PART_PATH_REFUSED', path)
  return { path, digest: digest(path) }
}
const parseProofs = (values) => values.map((value) => {
  const match = /^([A-Z0-9:_-]+)=([a-f0-9]{64})$/.exec(value)
  if (!match) fail('S2_PART_PROOF_REFUSED', value)
  return { id: match[1], protocolDigest: match[2], verdict: 'PASS' }
}).sort((a, b) => a.id.localeCompare(b.id))

const withoutEnvelope = (record) => {
  const value = structuredClone(record)
  delete value.planDigest
  delete value.validationDigest
  delete value.previousPartPassDigest
  return value
}
const acceptedReviews = (reviews) => {
  const expected = ['Claude Code Fable', 'AGY Gemini Pro']
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  return reviews?.length === 2 && reviews.every(({ reviewer, sessionId, verdict }, index) =>
    reviewer === expected[index] && uuid.test(sessionId ?? '') && verdict === 'ACCEPT') &&
    reviews[0].sessionId !== reviews[1].sessionId
}

export const latestAffectedPaths = (records) => {
  const latest = new Map()
  for (const record of records) {
    const seen = new Set()
    for (const affected of record.affectedPaths) {
      if (seen.has(affected.path)) fail('S2_PART_AFFECTED_PATH_DUPLICATE', affected.path)
      seen.add(affected.path)
      latest.set(affected.path, affected)
    }
  }
  return [...latest.values()]
}

export const recordPartPass = ({ part, fableSession, geminiSession, proofValues }) => {
  const index = phases.indexOf(part)
  if (index < 0) fail('S2_PART_REFUSED', part)
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  if (!uuid.test(fableSession ?? '') || !uuid.test(geminiSession ?? '') || fableSession === geminiSession) fail('S2_PART_REVIEW_REFUSED')
  const finalPath = absolute(`runtime/r1/.conexus/${part.toLowerCase()}-pass.json`)
  if (existsSync(finalPath)) fail('S2_PART_EXISTS', part)
  const verified = verifyS2Plan({ currentPart: part, requireValidation: true })
  const required = verified.plan.parts.find(({ id }) => id === part).requiredProofs.slice().sort()
  const proofs = parseProofs(proofValues)
  if (new Set(proofs.map(({ id }) => id)).size !== proofs.length || JSON.stringify(proofs.map(({ id }) => id)) !== JSON.stringify(required)) fail('S2_PART_PROOF_CENSUS_REFUSED', part)
  const archivedPayloads = new Map()
  if (verified.adopting) {
    const validation = JSON.parse(readFileSync(absolute('runtime/r1/.conexus/s2-migration-plan-validation.json')))
    const archivedPlanDigest = validation.reissue?.previousPlanDigest
    if (!/^[a-f0-9]{64}$/.test(archivedPlanDigest ?? '')) fail('S2_PART_ARCHIVE_LINEAGE_REFUSED')
    for (const entry of verified.plan.sourceRefs) {
      try {
        const record = JSON.parse(readFileSync(absolute(entry.path)))
        if (record.kind === 'conexus.r1-s2-part-pass/v1' && record.planDigest === archivedPlanDigest &&
            phases.indexOf(record.part) >= 0 && phases.indexOf(record.part) < index) {
          if (archivedPayloads.has(record.part)) fail('S2_PART_ARCHIVE_DUPLICATE', record.part)
          archivedPayloads.set(record.part, canonicalBytes(withoutEnvelope(record)))
        }
      } catch (error) {
        if (error.message?.startsWith('S2_')) throw error
      }
    }
    if (archivedPayloads.size !== index) fail('S2_PART_ARCHIVE_CENSUS_REFUSED')
  }
  let previousPartPassDigest = null
  if (index > 0) {
    let expectedPrevious = null
    const priorRecords = []
    for (let priorIndex = 0; priorIndex < index; priorIndex += 1) {
      const priorPart = phases[priorIndex]
      const priorPath = `runtime/r1/.conexus/${priorPart.toLowerCase()}-pass.json`
      if (!existsSync(absolute(priorPath))) fail('S2_PREVIOUS_PART_MISSING', priorPath)
      const bytes = readFileSync(absolute(priorPath))
      const priorRecord = JSON.parse(bytes)
      if (priorRecord.kind !== 'conexus.r1-s2-part-pass/v1' || priorRecord.part !== priorPart || priorRecord.verdict !== 'PASS' ||
          priorRecord.planDigest !== verified.planDigest || priorRecord.validationDigest !== verified.validationDigest ||
          priorRecord.previousPartPassDigest !== expectedPrevious) fail('S2_PREVIOUS_PART_SUBJECT_REFUSED', priorPart)
      const priorRequired = verified.plan.parts.find(({ id }) => id === priorPart).requiredProofs.slice().sort()
      const expectedPaths = [
        ...verified.plan.changedPaths.filter(({ mutationWindows }) => mutationWindows.includes(priorPart)).map(({ path }) => path),
        ...verified.plan.addedPaths.filter(({ mutationWindows }) => mutationWindows.includes(priorPart)).map(({ path }) => path),
        ...verified.plan.generatedRoots.filter(({ mutationWindows }) => mutationWindows.includes(priorPart)).map(({ root: base }) => `${base}/**`),
      ].sort()
      if (priorRecord.affectedPathsDigest !== sha256(canonicalBytes(priorRecord.affectedPaths)) ||
          JSON.stringify(priorRecord.affectedPaths.map(({ path }) => path).sort()) !== JSON.stringify(expectedPaths) ||
          JSON.stringify(priorRecord.proofs.map(({ id }) => id).sort()) !== JSON.stringify(priorRequired) ||
          !acceptedReviews(priorRecord.reviews)) fail('S2_PREVIOUS_PART_INTEGRITY_REFUSED', priorPart)
      if (verified.adopting && !canonicalBytes(withoutEnvelope(priorRecord)).equals(archivedPayloads.get(priorPart))) fail('S2_PART_TRANSLATION_DRIFT', priorPart)
      priorRecords.push(priorRecord)
      expectedPrevious = sha256(bytes)
    }
    for (const affected of latestAffectedPaths(priorRecords)) {
      const exactEntry = [...verified.plan.changedPaths, ...verified.plan.addedPaths].find(({ path }) => path === affected.path)
      const generatedEntry = verified.plan.generatedRoots.find(({ root: base }) => `${base}/**` === affected.path)
      const hasCurrentWindow = (exactEntry?.mutationWindows ?? generatedEntry?.mutationWindows ?? []).includes(part)
      if (hasCurrentWindow) continue
      const actual = generatedEntry ? treeDigest(generatedEntry.root) : existsSync(absolute(affected.path)) ? digest(affected.path) : null
      if (actual !== affected.digest) fail('S2_PART_CLOSED_PATH_DRIFT', affected.path)
    }
    previousPartPassDigest = expectedPrevious
  }
  const affectedPaths = []
  for (const collection of [verified.plan.changedPaths, verified.plan.addedPaths]) {
    for (const entry of collection.filter(({ mutationWindows }) => mutationWindows.includes(part))) affectedPaths.push(currentFile(entry.path))
  }
  for (const entry of verified.plan.generatedRoots.filter(({ mutationWindows }) => mutationWindows.includes(part))) {
    affectedPaths.push({ path: `${entry.root}/**`, digest: treeDigest(entry.root) })
  }
  affectedPaths.sort((a, b) => a.path.localeCompare(b.path))
  const record = {
    kind: 'conexus.r1-s2-part-pass/v1', part, verdict: 'PASS', planDigest: verified.planDigest,
    validationDigest: verified.validationDigest, previousPartPassDigest, affectedPaths,
    affectedPathsDigest: sha256(canonicalBytes(affectedPaths)), proofs,
    reviews: [
      { reviewer: 'Claude Code Fable', sessionId: fableSession, verdict: 'ACCEPT' },
      { reviewer: 'AGY Gemini Pro', sessionId: geminiSession, verdict: 'ACCEPT' },
    ],
  }
  const temporary = `${finalPath}.tmp`
  writeFileSync(temporary, canonicalBytes(record))
  renameSync(temporary, finalPath)
  return { ...record, partPassDigest: sha256(canonicalBytes(record)) }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const valueFor = (name) => process.argv[process.argv.indexOf(name) + 1]
  const proofValues = process.argv.flatMap((value, index) => value === '--proof' ? [process.argv[index + 1]] : [])
  process.stdout.write(`${JSON.stringify(recordPartPass({ part: valueFor('--part'), fableSession: valueFor('--fable-session'), geminiSession: valueFor('--gemini-session'), proofValues }))}\n`)
}
