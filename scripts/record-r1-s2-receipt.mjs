import { existsSync, lstatSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalBytes, sha256, verifyS2Plan } from './check-r1-s2-migration.mjs'

const root = resolve(import.meta.dirname, '..')
const phases = ['S2-P0', 'S2-P1', 'S2-P2', 'S2-P3', 'S2-P4', 'S2-P5']
const conformancePath = 'runtime/r1/.conexus/s2-conformance-result.json'
const manifestPath = 'runtime/r1/.conexus/s2-ownership-manifest.json'
const receiptPath = 'runtime/r1/.conexus/s2-generation-receipt.json'
const absolute = (path) => resolve(root, ...path.split('/'))
const digest = (path) => sha256(readFileSync(absolute(path)))
const fail = (code, detail = '') => { throw new Error(`${code}${detail ? `:${detail}` : ''}`) }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const walk = (base, output = []) => {
  if (!existsSync(absolute(base))) return output
  for (const name of readdirSync(absolute(base)).sort()) {
    const path = `${base}/${name}`
    const stat = lstatSync(absolute(path))
    if (stat.isSymbolicLink()) fail('S2_RECEIPT_SYMLINK_REFUSED', path)
    if (stat.isDirectory()) walk(path, output)
    else if (stat.isFile() && !path.endsWith('.tmp')) output.push(path)
  }
  return output
}
const atomicWrite = (path, value) => { const temporary = `${absolute(path)}.tmp`; writeFileSync(temporary, canonicalBytes(value)); renameSync(temporary, absolute(path)) }
const classMap = (plan) => {
  const map = new Map()
  const register = (path, ownerClass) => {
    const existing = map.get(path)
    if (existing && existing !== ownerClass) fail('S2_RECEIPT_CLASS_OVERLAP', path)
    map.set(path, ownerClass)
  }
  for (const entry of JSON.parse(readFileSync(absolute('runtime/r1/.conexus/a0-ownership-manifest.json'))).entries) register(entry.path, entry.class)
  for (const collection of [plan.bootstrapPaths, plan.changedPaths, plan.addedPaths, plan.adoptedExistingPaths, plan.protectedExistingPaths]) {
    for (const entry of collection) register(entry.path, entry.class)
  }
  for (const entry of plan.controlArtifacts) register(entry.path, 'PLATFORM-CONTRACT')
  for (const entry of plan.sourceRefs) register(entry.path, 'PLATFORM-CONTRACT')
  return map
}
const manifestClass = (plan, classes, path) => {
  const generatedMatches = plan.generatedRoots.filter(({ root: base }) => path.startsWith(`${base}/`))
  if (generatedMatches.length > 1) fail('S2_RECEIPT_GENERATED_ROOT_OVERLAP', path)
  const exact = classes.get(path)
  if (generatedMatches.length === 1) {
    if (exact && exact !== 'GENERATED') fail('S2_RECEIPT_CLASS_OVERLAP', path)
    return 'GENERATED'
  }
  return exact ?? (path.startsWith('docs/') ? 'PLATFORM-CONTRACT' : null)
}
const partChain = (planDigest, validationDigest) => {
  let previous = null
  return phases.map((part) => {
    const path = `runtime/r1/.conexus/${part.toLowerCase()}-pass.json`
    if (!existsSync(absolute(path))) fail('S2_RECEIPT_PART_MISSING', part)
    const bytes = readFileSync(absolute(path)); const record = JSON.parse(bytes)
    if (record.kind !== 'conexus.r1-s2-part-pass/v1' || record.part !== part || record.verdict !== 'PASS' || record.planDigest !== planDigest || record.validationDigest !== validationDigest || record.previousPartPassDigest !== previous) fail('S2_RECEIPT_PART_CHAIN_REFUSED', part)
    previous = sha256(bytes)
    return { part, digest: previous, record }
  })
}
const parseProofs = (values, required) => {
  const proofs = values.map((value) => {
    const match = /^([A-Z0-9:_-]+)=([a-f0-9]{64})$/.exec(value)
    if (!match) fail('S2_RECEIPT_PROOF_REFUSED', value)
    return { id: match[1], protocolDigest: match[2], verdict: 'PASS' }
  }).sort((a, b) => a.id.localeCompare(b.id))
  if (new Set(proofs.map(({ id }) => id)).size !== proofs.length || JSON.stringify(proofs.map(({ id }) => id)) !== JSON.stringify(required.slice().sort())) fail('S2_RECEIPT_PROOF_CENSUS_REFUSED')
  return proofs
}
const operationsCensus = () => {
  const extract = (path, type) => {
    const source = readFileSync(absolute(path), 'utf8')
    const declaration = new RegExp(`export type ${type} = ([^\\n]+)`).exec(source)?.[1] ?? ''
    return [...declaration.matchAll(/'([^']+)'/g)].map((match) => match[1])
  }
  const census = [...extract('apps/hub/src/generated/s1-routes.ts', 'S1OwnerId'), ...extract('apps/hub/src/generated/s2-routes.ts', 'S2OwnerId')]
  if (JSON.stringify(census) !== JSON.stringify(['IAM-01', 'IAM-02', 'IAM-03', 'WS-01', 'WS-02'])) fail('S2_RECEIPT_OPERATION_CENSUS_REFUSED')
  return census
}
export const buildManifest = (plan) => {
  const classes = classMap(plan)
  const paths = new Set()
  for (const base of plan.custodyRoots) for (const path of walk(base)) paths.add(path)
  for (const entry of plan.sourceRefs) paths.add(entry.path)
  for (const collection of [plan.bootstrapPaths, plan.changedPaths, plan.addedPaths, plan.adoptedExistingPaths, plan.protectedExistingPaths, plan.controlArtifacts]) {
    for (const entry of collection) if (existsSync(absolute(entry.path))) paths.add(entry.path)
  }
  for (const entry of plan.generatedRoots) for (const path of walk(entry.root)) paths.add(path)
  const excluded = (path) => path === manifestPath || path === receiptPath || path.startsWith('runtime/r1/.conexus/s2-')
  const entries = [...paths].filter((path) => !excluded(path)).sort().map((path) => {
    const ownerClass = manifestClass(plan, classes, path)
    if (!ownerClass) fail('S2_RECEIPT_UNCLASSIFIED', path)
    return { path, class: ownerClass, outputDigest: digest(path) }
  })
  if (entries.some(({ class: ownerClass }) => ownerClass === 'APP-OWNED')) fail('S2_RECEIPT_APP_OWNED_NONZERO')
  return { kind: 'conexus.r1-s2-ownership-manifest/v1', entries }
}
export const recordConformance = ({ proofs, fableSession, geminiSession }) => {
  if (existsSync(absolute(conformancePath)) || existsSync(absolute(manifestPath)) || existsSync(absolute(receiptPath))) fail('S2_RECEIPT_PREMATURE_ARTIFACT')
  const verified = verifyS2Plan({ currentPart: 'S2-P5', requireValidation: true })
  if (!uuid.test(fableSession ?? '') || !uuid.test(geminiSession ?? '') || fableSession === geminiSession) fail('S2_RECEIPT_REVIEW_REFUSED')
  const parsedProofs = parseProofs(proofs, verified.plan.parts.find(({ id }) => id === 'S2-P5').requiredProofs)
  const manifest = buildManifest(verified.plan)
  const result = {
    kind: 'conexus.r1-s2-conformance-result/v1', verdict: 'PASS', planDigest: verified.planDigest,
    validationDigest: verified.validationDigest, manifestDigest: sha256(canonicalBytes(manifest)), proofs: parsedProofs,
    expectedProductDelta: verified.plan.expectedProductDelta,
    reviews: [{ reviewer: 'Claude Code Fable', sessionId: fableSession, verdict: 'ACCEPT' }, { reviewer: 'AGY Gemini Pro', sessionId: geminiSession, verdict: 'ACCEPT' }],
  }
  atomicWrite(conformancePath, result)
  return result
}
export const publishReceipt = () => {
  if (!existsSync(absolute(conformancePath)) || existsSync(absolute(manifestPath)) || existsSync(absolute(receiptPath))) fail('S2_RECEIPT_PUBLICATION_ORDER_REFUSED')
  const verified = verifyS2Plan({ currentPart: 'S2-P5', requireValidation: true })
  const conformance = JSON.parse(readFileSync(absolute(conformancePath)))
  const parts = partChain(verified.planDigest, verified.validationDigest)
  const manifest = buildManifest(verified.plan)
  const manifestDigest = sha256(canonicalBytes(manifest))
  if (conformance.manifestDigest !== manifestDigest || JSON.stringify(conformance.expectedProductDelta) !== JSON.stringify(verified.plan.expectedProductDelta)) fail('S2_RECEIPT_CONFORMANCE_DRIFT')
  atomicWrite(manifestPath, manifest)
  const receipt = {
    kind: 'conexus.r1-s2-generation-receipt/v1', verdict: 'PASS', previousReceiptDigest: verified.plan.prior.a0ReceiptDigest,
    migrationPlanDigest: verified.planDigest, planValidationDigest: verified.validationDigest,
    partPassDigests: parts.map(({ part, digest: partDigest }) => ({ part, digest: partDigest })), finalPartPassDigest: parts.at(-1).digest,
    conformanceResultDigest: digest(conformancePath), manifestDigest, ownedTreeDigest: sha256(canonicalBytes(manifest.entries)),
    operationsCensus: operationsCensus(), expectedProductDelta: verified.plan.expectedProductDelta, classCounts: {
      'APP-OWNED': 0, 'GENERATED': manifest.entries.filter(({ class: value }) => value === 'GENERATED').length,
      'PLATFORM-CONTRACT': manifest.entries.filter(({ class: value }) => value === 'PLATFORM-CONTRACT').length,
    }, unresolvedConflicts: 0, reviews: conformance.reviews,
  }
  atomicWrite(receiptPath, receipt)
  return { ...receipt, receiptDigest: digest(receiptPath) }
}
export const checkReceipt = () => {
  const verified = verifyS2Plan({ currentPart: 'S2-P5', requireValidation: true })
  const receipt = JSON.parse(readFileSync(absolute(receiptPath)))
  const manifest = buildManifest(verified.plan)
  if (receipt.kind !== 'conexus.r1-s2-generation-receipt/v1' || receipt.previousReceiptDigest !== verified.plan.prior.a0ReceiptDigest || receipt.manifestDigest !== sha256(canonicalBytes(manifest))) fail('S2_RECEIPT_DRIFT')
  return { verdict: 'PASS', receiptDigest: digest(receiptPath), manifestDigest: receipt.manifestDigest }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const valueFor = (name) => process.argv[process.argv.indexOf(name) + 1]
  const proofs = process.argv.flatMap((value, index) => value === '--proof' ? [process.argv[index + 1]] : [])
  const value = process.argv.includes('--conformance') ? recordConformance({ proofs, fableSession: valueFor('--fable-session'), geminiSession: valueFor('--gemini-session') })
    : process.argv.includes('--publish') ? publishReceipt() : checkReceipt()
  process.stdout.write(`${JSON.stringify(value)}\n`)
}
