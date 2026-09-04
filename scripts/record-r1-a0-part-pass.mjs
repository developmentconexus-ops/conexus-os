import { existsSync, lstatSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalBytes, sha256 } from './check-r1-a0-bootstrap.mjs'
import { validateMigrationPlan } from './check-r1-a0-migration.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')
const planPath = resolve(repositoryRoot, 'profiles/r1/v1/a0-code-architecture-migration.json')
const validationPath = resolve(repositoryRoot, 'runtime/r1/.conexus/a0-migration-plan-validation.json')
const parts = ['A0-P1', 'A0-P2', 'A0-P3', 'A0-P4', 'A0-P5']
const requiredByPart = {
  'A0-P1': ['A0:FOUNDATION-PIN', 'A0:HUB-TYPECHECK', 'A0:MIGRATION-CUSTODY', 'A0:OPENID-DECLARATION', 'A0:OPENID-RED', 'A0:WEB-TYPECHECK', 'G0:VERIFY', 'S1:HTTP'],
  'A0-P2': ['G0:VERIFY', 'S1:HTTP'],
  'A0-P3': ['A0:HUB-TYPECHECK', 'S1:HTTP', 'S1:POSTGRES'],
  'A0-P4': ['A0:BIOME', 'A0:IMPORT-LAW', 'A0:WEB-TYPECHECK', 'REPOSITORY:VERIFY'],
  'A0-P5': ['A0:BIOME', 'A0:HUB-TYPECHECK', 'A0:IMPORT-LAW', 'A0:MIGRATION-CUSTODY', 'A0:OPENID-DECLARATION', 'A0:OPENID-RED', 'A0:WEB-TYPECHECK', 'G0:VERIFY', 'REPOSITORY:NPM-CI', 'REPOSITORY:VERIFY', 'S1:HTTP', 'S1:LIVE', 'S1:POSTGRES'],
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const fileDigest = (path) => sha256(readFileSync(resolve(repositoryRoot, ...path.split('/'))))
const currentPath = (path) => {
  const absolute = resolve(repositoryRoot, ...path.split('/'))
  if (!existsSync(absolute) || !lstatSync(absolute).isFile() || lstatSync(absolute).isSymbolicLink()) throw new Error(`A0_PART_PATH_REFUSED:${path}`)
  return { path, digest: sha256(readFileSync(absolute)) }
}

const parseProofs = (values) => {
  const proofs = values.map((value) => {
    const match = /^([A-Z0-9:_-]+)=([a-f0-9]{64})$/.exec(value)
    if (!match) throw new Error(`A0_PART_PROOF_REFUSED:${value}`)
    return { id: match[1], protocolDigest: match[2], verdict: 'PASS' }
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  if (new Set(proofs.map(({ id }) => id)).size !== proofs.length) throw new Error('A0_PART_PROOF_DUPLICATE')
  return proofs
}

export const recordPartPass = ({ part, fableSession, geminiSession, proofValues }) => {
  if (!parts.includes(part)) throw new Error('A0_PART_REFUSED')
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  if (!uuid.test(fableSession ?? '') || !uuid.test(geminiSession ?? '')) throw new Error('A0_PART_REVIEW_SESSION_REFUSED')
  if (fableSession === geminiSession) throw new Error('A0_PART_REVIEW_SESSIONS_NOT_DISTINCT')
  const finalPath = resolve(repositoryRoot, `runtime/r1/.conexus/${part.toLowerCase()}-pass.json`)
  if (existsSync(finalPath)) throw new Error(`A0_PART_PASS_EXISTS:${part}`)

  const migration = validateMigrationPlan({ requireBaseline: false, currentPart: part })
  const plan = readJson(planPath)
  const validationDigest = sha256(readFileSync(validationPath))
  if (migration.validationDigest !== validationDigest) throw new Error('A0_PART_VALIDATION_MISMATCH')
  const proofs = parseProofs(proofValues)
  const required = requiredByPart[part]
  if (JSON.stringify(proofs.map(({ id }) => id)) !== JSON.stringify([...required].sort())) throw new Error(`A0_PART_PROOF_CENSUS_REFUSED:${part}`)

  const affected = []
  const ownsWindow = (entry) => entry.mutationWindows?.includes(part)
  for (const entry of plan.oldToNew.filter(ownsWindow)) {
    if (existsSync(resolve(repositoryRoot, ...entry.oldPath.split('/')))) throw new Error(`A0_PART_OLD_PATH_SURVIVES:${entry.oldPath}`)
    affected.push({ path: entry.oldPath, digest: null })
    affected.push(currentPath(entry.newPath))
  }
  for (const entry of plan.changedPaths.filter(ownsWindow)) affected.push(currentPath(entry.path))
  for (const entry of plan.adoptedExistingPaths.filter(ownsWindow)) affected.push(currentPath(entry.path))
  for (const entry of plan.addedPaths.filter(ownsWindow)) affected.push(currentPath(entry.path))
  for (const entry of plan.removedPaths.filter(ownsWindow)) {
    const finalWindow = Math.max(...entry.mutationWindows.map((window) => parts.indexOf(window))) === parts.indexOf(part)
    if (finalWindow && existsSync(resolve(repositoryRoot, ...entry.path.split('/')))) throw new Error(`A0_PART_REMOVED_PATH_SURVIVES:${entry.path}`)
    if (finalWindow) affected.push({ path: entry.path, digest: null })
    if (!finalWindow) affected.push(currentPath(entry.path))
  }
  affected.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)

  const index = parts.indexOf(part)
  let previousPartPassDigest = null
  if (index > 0) {
    const priorRecords = []
    for (let priorIndex = 0; priorIndex < index; priorIndex += 1) {
      const priorPart = parts[priorIndex]
      const priorPath = resolve(repositoryRoot, `runtime/r1/.conexus/${priorPart.toLowerCase()}-pass.json`)
      if (!existsSync(priorPath)) throw new Error(`A0_PREVIOUS_PART_PASS_MISSING:${priorPart}`)
      const bytes = readFileSync(priorPath)
      const priorRecord = JSON.parse(bytes)
      const expectedPreviousDigest = priorIndex === 0 ? null : priorRecords[priorIndex - 1].digest
      if (
        priorRecord.kind !== 'conexus.r1-a0-part-pass/v1' ||
        priorRecord.part !== priorPart ||
        priorRecord.verdict !== 'PASS' ||
        priorRecord.validationDigest !== validationDigest ||
        priorRecord.previousPartPassDigest !== expectedPreviousDigest
      ) throw new Error('A0_PREVIOUS_PART_PASS_SUBJECT_MISMATCH')
      priorRecords.push({ record: priorRecord, digest: sha256(bytes) })
    }
    previousPartPassDigest = priorRecords.at(-1).digest
    const windowMap = new Map()
    for (const entry of plan.oldToNew) {
      windowMap.set(entry.oldPath, entry.mutationWindows)
      windowMap.set(entry.newPath, entry.mutationWindows)
    }
    for (const entries of [plan.changedPaths, plan.adoptedExistingPaths, plan.addedPaths, plan.removedPaths]) for (const entry of entries) windowMap.set(entry.path, entry.mutationWindows)
    for (let priorIndex = 0; priorIndex < index; priorIndex += 1) {
      const priorRecord = priorRecords[priorIndex].record
      for (const entry of priorRecord.affectedPaths) {
        const hasCurrentWindow = (windowMap.get(entry.path) ?? []).includes(part)
        if (hasCurrentWindow) continue
        const path = resolve(repositoryRoot, ...entry.path.split('/'))
        const actual = existsSync(path) ? sha256(readFileSync(path)) : null
        if (actual !== entry.digest) throw new Error(`A0_PART_CLOSED_PATH_DRIFT:${entry.path}`)
      }
    }
  }
  const lock = readJson(resolve(repositoryRoot, 'package-lock.json'))
  const dependencies = plan.dependencyTargets.map((target) => {
    const locked = lock.packages?.[`node_modules/${target.name}`]
    if (!locked || locked.version !== target.version || locked.integrity !== target.integrity) throw new Error(`A0_PART_DEPENDENCY_MISMATCH:${target.name}`)
    return target
  })
  const record = {
    kind: 'conexus.r1-a0-part-pass/v1',
    part,
    verdict: 'PASS',
    planDigest: migration.planDigest,
    validationDigest,
    previousPartPassDigest,
    affectedPaths: affected,
    affectedPathsDigest: sha256(canonicalBytes(affected)),
    dependencies,
    proofs,
    reviews: [
      { reviewer: 'Claude Code Fable', sessionId: fableSession, verdict: 'ACCEPT' },
      { reviewer: 'AGY Gemini Pro', sessionId: geminiSession, verdict: 'ACCEPT' },
    ],
  }
  const temporary = `${finalPath}.tmp`
  writeFileSync(temporary, canonicalBytes(record))
  renameSync(temporary, finalPath)
  return { ...record, partPassDigest: fileDigest(`runtime/r1/.conexus/${part.toLowerCase()}-pass.json`) }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const valueFor = (name) => process.argv[process.argv.indexOf(name) + 1]
  const proofValues = process.argv.flatMap((value, index) => value === '--proof' ? [process.argv[index + 1]] : [])
  process.stdout.write(`${JSON.stringify(recordPartPass({
    part: valueFor('--part'),
    fableSession: valueFor('--fable-session'),
    geminiSession: valueFor('--gemini-session'),
    proofValues,
  }))}\n`)
}
