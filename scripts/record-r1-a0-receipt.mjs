import assert from 'node:assert/strict'
import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalBytes, sha256, verifyBootstrap } from './check-r1-a0-bootstrap.mjs'

const defaultRoot = resolve(import.meta.dirname, '..')
const parts = ['A0-P1', 'A0-P2', 'A0-P3', 'A0-P4', 'A0-P5']
const controlNames = new Set([
  'a0-migration-plan-validation.json',
  'a0-conformance-result.json',
  'a0-ownership-manifest.json',
  'a0-generation-receipt.json',
  ...parts.map((part) => `${part.toLowerCase()}-pass.json`),
])
const supplementalPaths = [
  '.github/workflows/verify.yml',
  'docs/evidence/4f/4f-r1-a0-p4-ci-wiring-correction.md',
]
const receiptPath = 'runtime/r1/.conexus/a0-generation-receipt.json'
const manifestPath = 'runtime/r1/.conexus/a0-ownership-manifest.json'
const conformancePath = 'runtime/r1/.conexus/a0-conformance-result.json'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const fail = (code, detail = '') => { throw new Error(`${code}${detail ? `:${detail}` : ''}`) }
const absolute = (root, path) => resolve(root, ...path.split('/'))
const readJson = (root, path) => JSON.parse(readFileSync(absolute(root, path), 'utf8'))
const digest = (root, path) => sha256(readFileSync(absolute(root, path)))
const requireFile = (root, path, code = 'A0_RECEIPT_PATH_REFUSED') => {
  const target = absolute(root, path)
  if (!existsSync(target) || !lstatSync(target).isFile() || lstatSync(target).isSymbolicLink()) fail(code, path)
  return target
}
const atomicWrite = (root, path, value) => {
  const target = absolute(root, path)
  const temporary = `${target}.tmp`
  if (existsSync(temporary)) fail('A0_RECEIPT_TEMPORARY_EXISTS', path)
  writeFileSync(temporary, canonicalBytes(value), { flag: 'wx' })
  renameSync(temporary, target)
}

export const parseProofs = (values, requiredIds) => {
  const proofs = values.map((value) => {
    const match = /^([A-Z0-9:_-]+)=([a-f0-9]{64})$/.exec(value)
    if (!match) fail('A0_RECEIPT_PROOF_REFUSED', value)
    return { id: match[1], protocolDigest: match[2], verdict: 'PASS' }
  }).sort((a, b) => a.id.localeCompare(b.id))
  if (new Set(proofs.map(({ id }) => id)).size !== proofs.length) fail('A0_RECEIPT_PROOF_DUPLICATE')
  if (JSON.stringify(proofs.map(({ id }) => id)) !== JSON.stringify([...requiredIds].sort())) fail('A0_RECEIPT_CONFORMANCE_CENSUS_REFUSED')
  return proofs
}

const walkFiles = (root, relativePath, output) => {
  const target = absolute(root, relativePath)
  if (!existsSync(target)) return
  const stat = lstatSync(target)
  if (stat.isSymbolicLink()) fail('A0_RECEIPT_SYMLINK_REFUSED', relativePath)
  if (stat.isFile()) {
    output.push(relativePath)
    return
  }
  if (!stat.isDirectory()) fail('A0_RECEIPT_ENTRY_REFUSED', relativePath)
  for (const name of readdirSync(target).sort()) walkFiles(root, `${relativePath}/${name}`, output)
}

const classMap = (plan) => {
  const map = new Map()
  const add = (path, ownerClass = 'PLATFORM-CONTRACT') => {
    if (map.has(path) && map.get(path) !== ownerClass) fail('A0_RECEIPT_CLASS_COLLISION', path)
    map.set(path, ownerClass)
  }
  for (const entry of plan.oldToNew) {
    add(entry.oldPath, entry.oldClass)
    add(entry.newPath, entry.newClass)
  }
  for (const collection of [plan.changedPaths, plan.adoptedExistingPaths, plan.addedPaths, plan.removedPaths, plan.unchangedProtected, plan.bootstrapPaths]) {
    for (const entry of collection) add(entry.path, entry.class)
  }
  for (const entry of plan.priorToolingPaths) add(entry.path)
  for (const entry of plan.controlArtifacts) add(entry.path)
  for (const path of supplementalPaths) add(path)
  return map
}

const excludedControl = (path) => {
  if (!path.startsWith('runtime/r1/.conexus/')) return false
  const name = path.slice('runtime/r1/.conexus/'.length)
  return name.endsWith('.tmp') || controlNames.has(name)
}

export const buildManifest = ({ root = defaultRoot, plan }) => {
  const paths = []
  for (const base of plan.custodyScope.recursiveRoots) walkFiles(root, base, paths)
  for (const path of plan.custodyScope.exactFiles) if (existsSync(absolute(root, path))) paths.push(path)
  paths.push(...supplementalPaths)
  const classes = classMap(plan)
  const entries = [...new Set(paths)].filter((path) => !excludedControl(path)).sort().map((path) => {
    requireFile(root, path)
    const ownerClass = classes.get(path)
    if (!ownerClass) fail('A0_RECEIPT_UNCLASSIFIED_PATH', path)
    return { path, class: ownerClass, outputDigest: digest(root, path) }
  })
  if (entries.some((entry) => entry.class === 'APP-OWNED')) fail('A0_RECEIPT_APP_OWNED_NONZERO')
  return { kind: 'conexus.r1-a0-ownership-manifest/v1', entries }
}

export const verifyPartChain = ({ root = defaultRoot, plan, validationDigest, through = 'A0-P5' }) => {
  const records = []
  const last = parts.indexOf(through)
  for (let index = 0; index <= last; index += 1) {
    const part = parts[index]
    const path = `runtime/r1/.conexus/${part.toLowerCase()}-pass.json`
    requireFile(root, path, 'A0_RECEIPT_PART_MISSING')
    const bytes = readFileSync(absolute(root, path))
    const record = JSON.parse(bytes)
    const expectedPrevious = index === 0 ? null : records[index - 1].digest
    if (record.kind !== 'conexus.r1-a0-part-pass/v1' || record.part !== part || record.verdict !== 'PASS' ||
        record.planDigest !== sha256(readFileSync(absolute(root, 'profiles/r1/v1/a0-code-architecture-migration.json'))) ||
        record.validationDigest !== validationDigest || record.previousPartPassDigest !== expectedPrevious) {
      fail('A0_RECEIPT_PART_CHAIN_BROKEN', part)
    }
    const ownsWindow = (entry) => entry.mutationWindows?.includes(part)
    const expectedPaths = []
    for (const entry of plan.oldToNew.filter(ownsWindow)) expectedPaths.push(entry.oldPath, entry.newPath)
    for (const collection of [plan.changedPaths, plan.adoptedExistingPaths, plan.addedPaths]) {
      for (const entry of collection.filter(ownsWindow)) expectedPaths.push(entry.path)
    }
    for (const entry of plan.removedPaths.filter(ownsWindow)) expectedPaths.push(entry.path)
    const actualPaths = (record.affectedPaths ?? []).map(({ path: affectedPath }) => affectedPath).sort()
    if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths.sort())) fail('A0_RECEIPT_PART_CENSUS_REFUSED', part)
    for (const affected of record.affectedPaths ?? []) {
      const target = absolute(root, affected.path)
      const actual = existsSync(target) ? sha256(readFileSync(target)) : null
      const laterWindow = [...plan.oldToNew, ...plan.changedPaths, ...plan.adoptedExistingPaths, ...plan.addedPaths, ...plan.removedPaths]
        .find((entry) => entry.path === affected.path || entry.oldPath === affected.path || entry.newPath === affected.path)?.mutationWindows
        ?.some((window) => parts.indexOf(window) > index)
      if (!laterWindow && actual !== affected.digest) fail('A0_RECEIPT_CLOSED_PATH_DRIFT', affected.path)
    }
    records.push({ part, digest: sha256(bytes), record })
  }
  return records
}

const verifyClosure = ({ root, plan }) => {
  for (const entry of plan.oldToNew) {
    if (existsSync(absolute(root, entry.oldPath))) fail('A0_RECEIPT_CLOSURE_REFUSED', entry.oldPath)
    requireFile(root, entry.newPath, 'A0_RECEIPT_CLOSURE_REFUSED')
  }
  for (const entry of plan.removedPaths) if (existsSync(absolute(root, entry.path))) fail('A0_RECEIPT_CLOSURE_REFUSED', entry.path)
  for (const entry of [...plan.changedPaths, ...plan.adoptedExistingPaths, ...plan.addedPaths, ...plan.unchangedProtected, ...plan.bootstrapPaths]) {
    requireFile(root, entry.path, 'A0_RECEIPT_CLOSURE_REFUSED')
  }
}

const operationsCensus = (root) => {
  const source = readFileSync(absolute(root, 'apps/hub/src/generated/s1-routes.ts'), 'utf8')
  const declaration = /export type S1OwnerId = ([^\n]+)/.exec(source)?.[1] ?? ''
  const census = [...declaration.matchAll(/'([^']+)'/g)].map((match) => match[1])
  if (JSON.stringify(census) !== JSON.stringify(['IAM-01', 'IAM-02', 'IAM-03'])) fail('A0_RECEIPT_PRODUCT_DELTA_REFUSED')
  return census
}

const classCounts = (manifest) => Object.fromEntries(['APP-OWNED', 'GENERATED', 'PLATFORM-CONTRACT'].map((ownerClass) => [
  ownerClass,
  manifest.entries.filter((entry) => entry.class === ownerClass).length,
]))

const routeProjectionDigest = (root) => {
  const source = readFileSync(absolute(root, 'apps/hub/src/generated/s1-routes.ts'), 'utf8')
  const value = /S1_ROUTE_PROJECTION_DIGEST = "([a-f0-9]{64})"/.exec(source)?.[1]
  if (!value) fail('A0_RECEIPT_ROUTE_PROJECTION_REFUSED')
  return value
}

const verifyReviews = (fableSession, geminiSession) => {
  if (!uuid.test(fableSession ?? '') || !uuid.test(geminiSession ?? '') || fableSession === geminiSession) fail('A0_RECEIPT_REVIEW_REFUSED')
  return [
    { reviewer: 'Claude Code Fable', sessionId: fableSession, verdict: 'ACCEPT' },
    { reviewer: 'AGY Gemini Pro', sessionId: geminiSession, verdict: 'ACCEPT' },
  ]
}

const requireRuntime = ({ platform = process.platform, architecture = process.arch, node = process.versions.node } = {}) => {
  if (platform !== 'linux' || architecture !== 'x64' || node !== '24.20.0') fail('A0_RECEIPT_RUNTIME_REFUSED')
}

const baseState = ({ root = defaultRoot }) => {
  const verified = verifyBootstrap({ root, planPath: absolute(root, 'profiles/r1/v1/a0-code-architecture-migration.json'), requireBaseline: false, verifyPriorTooling: false, requireValidation: true })
  verifyClosure({ root, plan: verified.plan })
  const manifest = buildManifest({ root, plan: verified.plan })
  const manifestDigest = sha256(canonicalBytes(manifest))
  const openApiDigest = digest(root, 'contracts/api/product/openapi.yaml')
  const expectedOpenApi = verified.plan.unchangedProtected.find((entry) => entry.path === 'contracts/api/product/openapi.yaml')?.digest
  if (openApiDigest !== expectedOpenApi) fail('A0_RECEIPT_PRODUCT_DELTA_REFUSED')
  const historicalS1 = readJson(root, 'runtime/r1/.conexus/s1-generation-receipt.json')
  if (historicalS1.productOpenApiDigest !== openApiDigest || historicalS1.routeProjectionDigest !== routeProjectionDigest(root)) {
    fail('A0_RECEIPT_PRODUCT_DELTA_REFUSED')
  }
  const supplements = supplementalPaths.map((path) => ({ path, digest: digest(root, path) }))
  return { verified, manifest, manifestDigest, openApiDigest, supplements }
}

export const recordConformance = ({ root = defaultRoot, proofValues, fableSession, geminiSession }) => {
  for (const path of [conformancePath, manifestPath, receiptPath, 'runtime/r1/.conexus/a0-p5-pass.json']) {
    if (existsSync(absolute(root, path))) fail('A0_RECEIPT_PREMATURE_ARTIFACT', path)
  }
  requireRuntime()
  const { verified, manifestDigest, supplements } = baseState({ root })
  const proofs = parseProofs(proofValues, verified.plan.requiredConformanceIds)
  const reviews = verifyReviews(fableSession, geminiSession)
  const priorParts = verifyPartChain({ root, plan: verified.plan, validationDigest: verified.validationDigest, through: 'A0-P4' })
  const result = {
    kind: 'conexus.r1-a0-conformance-result/v1',
    verdict: 'PASS',
    runtime: { os: 'linux', arch: 'x64', node: '24.20.0', npm: '12.0.2' },
    planDigest: verified.planDigest,
    validationDigest: verified.validationDigest,
    manifestDigest,
    packageJsonDigest: digest(root, 'package.json'),
    packageLockDigest: digest(root, 'package-lock.json'),
    prior: verified.plan.prior,
    priorPartPassDigests: priorParts.map(({ part, digest: partDigest }) => ({ part, digest: partDigest })),
    proofs,
    supplementalPaths: supplements,
    reviews,
  }
  atomicWrite(root, conformancePath, result)
  return { ...result, conformanceResultDigest: digest(root, conformancePath) }
}

const proofMap = (proofs) => new Map(proofs.map((proof) => [proof.id, proof.protocolDigest]))

export const publishReceipt = ({ root = defaultRoot }) => {
  requireRuntime()
  if (existsSync(absolute(root, receiptPath))) fail('A0_RECEIPT_EXISTS')
  if (existsSync(absolute(root, manifestPath))) fail('A0_RECEIPT_MANIFEST_PREPLANTED')
  requireFile(root, conformancePath, 'A0_RECEIPT_CONFORMANCE_MISSING')
  const conformance = readJson(root, conformancePath)
  const { verified, manifest, manifestDigest, openApiDigest, supplements } = baseState({ root })
  if (conformance.kind !== 'conexus.r1-a0-conformance-result/v1' || conformance.verdict !== 'PASS') fail('A0_RECEIPT_CONFORMANCE_SUBJECT_REFUSED')
  if (conformance.planDigest !== verified.planDigest || conformance.validationDigest !== verified.validationDigest) fail('A0_RECEIPT_CONFORMANCE_AUTHORITY_DRIFT')
  if (!canonicalBytes(conformance.supplementalPaths).equals(canonicalBytes(supplements))) fail('A0_RECEIPT_SUPPLEMENTAL_DRIFT')
  if (conformance.manifestDigest !== manifestDigest) fail('A0_RECEIPT_CONFORMANCE_MANIFEST_DRIFT', `${conformance.manifestDigest}:${manifestDigest}`)
  parseProofs(conformance.proofs.map(({ id, protocolDigest }) => `${id}=${protocolDigest}`), verified.plan.requiredConformanceIds)
  const records = verifyPartChain({ root, plan: verified.plan, validationDigest: verified.validationDigest })
  const finalRecord = records.at(-1).record
  const expectedPartProofs = verified.plan.requiredConformanceIds.filter((id) => id !== 'A0:FOUNDATION-PIN').sort()
  if (JSON.stringify(finalRecord.proofs.map(({ id }) => id).sort()) !== JSON.stringify(expectedPartProofs)) fail('A0_RECEIPT_PART_PROOF_CENSUS_REFUSED')
  const conformanceProofs = proofMap(conformance.proofs)
  for (const proof of finalRecord.proofs) if (conformanceProofs.get(proof.id) !== proof.protocolDigest) fail('A0_RECEIPT_PROOF_DIVERGENCE', proof.id)
  if (JSON.stringify(finalRecord.reviews) !== JSON.stringify(conformance.reviews)) fail('A0_RECEIPT_REVIEW_DIVERGENCE')
  const counts = classCounts(manifest)
  if (counts['APP-OWNED'] !== 0) fail('A0_RECEIPT_APP_OWNED_NONZERO')
  const closureEntries = manifest.entries.filter(({ path }) => path.startsWith('packages/canonical-json/') || path.startsWith('packages/profile-compiler/') || path === 'scripts/generate-r1-g0.mjs')
  const receipt = {
    kind: 'conexus.r1-a0-generation-receipt/v1',
    verdict: 'PASS',
    previousReceiptDigest: verified.plan.prior.s1ReceiptDigest,
    g0ReceiptDigest: verified.plan.prior.g0ReceiptDigest,
    s1ManifestDigest: verified.plan.prior.s1ManifestDigest,
    migrationPlanDigest: verified.planDigest,
    planValidationDigest: verified.validationDigest,
    partPassDigests: records.map(({ part, digest: partDigest }) => ({ part, digest: partDigest })),
    finalPartPassDigest: records.at(-1).digest,
    conformanceResultDigest: digest(root, conformancePath),
    manifestDigest,
    ownedTreeDigest: sha256(canonicalBytes(manifest.entries)),
    packageJsonDigest: digest(root, 'package.json'),
    packageLockDigest: digest(root, 'package-lock.json'),
    foundationPinDigest: digest(root, 'docs/evidence/4d/4d-r1-a0-foundation-pin-manifest.json'),
    compilerClosureDigest: sha256(canonicalBytes(closureEntries)),
    productOpenApiDigest: openApiDigest,
    routeProjectionDigest: routeProjectionDigest(root),
    routeProjectionSourceDigest: digest(root, 'apps/hub/src/generated/s1-routes.ts'),
    operationsCensus: operationsCensus(root),
    proofs: conformance.proofs,
    classCounts: counts,
    unresolvedConflicts: 0,
    supplementalPaths: supplements,
    reviews: conformance.reviews,
  }
  atomicWrite(root, manifestPath, manifest)
  if (digest(root, manifestPath) !== manifestDigest) fail('A0_RECEIPT_MANIFEST_DRIFT')
  atomicWrite(root, receiptPath, receipt)
  return { ...receipt, receiptDigest: digest(root, receiptPath) }
}

export const checkReceipt = ({ root = defaultRoot }) => {
  requireFile(root, receiptPath, 'A0_RECEIPT_MISSING')
  requireFile(root, manifestPath, 'A0_RECEIPT_MANIFEST_MISSING')
  const receipt = readJson(root, receiptPath)
  const { verified, manifest, manifestDigest, supplements } = baseState({ root })
  if (receipt.kind !== 'conexus.r1-a0-generation-receipt/v1' || receipt.verdict !== 'PASS') fail('A0_RECEIPT_SUBJECT_REFUSED')
  if (digest(root, manifestPath) !== manifestDigest || !canonicalBytes(readJson(root, manifestPath)).equals(canonicalBytes(manifest))) fail('A0_RECEIPT_MANIFEST_DRIFT')
  const records = verifyPartChain({ root, plan: verified.plan, validationDigest: verified.validationDigest })
  if (receipt.finalPartPassDigest !== records.at(-1).digest || receipt.manifestDigest !== manifestDigest ||
      receipt.conformanceResultDigest !== digest(root, conformancePath) || !canonicalBytes(receipt.supplementalPaths).equals(canonicalBytes(supplements))) {
    fail('A0_RECEIPT_BINDING_DRIFT')
  }
  return { verdict: 'PASS', receiptDigest: digest(root, receiptPath), manifestDigest }
}

export const runSelfTest = () => {
  requireRuntime()
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'conexus-a0-receipt-red-'))
  const fableSession = '11111111-1111-4111-8111-111111111111'
  const geminiSession = '22222222-2222-4222-8222-222222222222'
  const proofDigest = 'a'.repeat(64)
  let controls = 0
  const fires = (fn, code) => {
    assert.throws(fn, new RegExp(code))
    controls += 1
  }
  try {
    cpSync(defaultRoot, fixtureRoot, {
      recursive: true,
      filter: (source) => !['.git', 'node_modules', '.wireframe-preview'].includes(source.slice(source.lastIndexOf(resolve('/')) + 1)),
    })
    const plan = readJson(fixtureRoot, 'profiles/r1/v1/a0-code-architecture-migration.json')
    const proofValues = plan.requiredConformanceIds.map((id) => `${id}=${proofDigest}`)
    fires(() => parseProofs(proofValues.slice(1), plan.requiredConformanceIds), 'A0_RECEIPT_CONFORMANCE_CENSUS_REFUSED')
    fires(() => parseProofs([...proofValues, proofValues[0]], plan.requiredConformanceIds), 'A0_RECEIPT_PROOF_DUPLICATE')
    fires(() => verifyReviews('bad', 'also-bad'), 'A0_RECEIPT_REVIEW_REFUSED')
    fires(() => requireRuntime({ platform: 'win32', architecture: 'x64', node: '24.20.0' }), 'A0_RECEIPT_RUNTIME_REFUSED')

    const conformance = recordConformance({ root: fixtureRoot, proofValues, fableSession, geminiSession })
    const validationDigest = digest(fixtureRoot, 'runtime/r1/.conexus/a0-migration-plan-validation.json')
    const p4Path = 'runtime/r1/.conexus/a0-p4-pass.json'
    const p4Digest = digest(fixtureRoot, p4Path)
    const p5Affected = ['scripts/record-r1-a0-receipt.mjs', 'tests/implementation/r1-s1-live-runner.sh', 'tests/implementation/r1-s1-qualification-runner.sh']
      .sort().map((path) => ({ path, digest: digest(fixtureRoot, path) }))
    const p5Record = {
      kind: 'conexus.r1-a0-part-pass/v1', part: 'A0-P5', verdict: 'PASS', planDigest: conformance.planDigest,
      validationDigest, previousPartPassDigest: p4Digest, affectedPaths: p5Affected,
      affectedPathsDigest: sha256(canonicalBytes(p5Affected)), dependencies: plan.dependencyTargets,
      proofs: conformance.proofs.filter(({ id }) => id !== 'A0:FOUNDATION-PIN'), reviews: conformance.reviews,
    }
    const p5Path = absolute(fixtureRoot, 'runtime/r1/.conexus/a0-p5-pass.json')
    fires(() => publishReceipt({ root: fixtureRoot }), 'A0_RECEIPT_PART_MISSING')

    const p2Path = absolute(fixtureRoot, 'runtime/r1/.conexus/a0-p2-pass.json')
    const p2Bytes = readFileSync(p2Path)
    const p2 = JSON.parse(p2Bytes)
    writeFileSync(p2Path, canonicalBytes({ ...p2, previousPartPassDigest: proofDigest }))
    fires(() => verifyPartChain({ root: fixtureRoot, plan, validationDigest, through: 'A0-P4' }), 'A0_RECEIPT_PART_CHAIN_BROKEN')
    writeFileSync(p2Path, p2Bytes)

    writeFileSync(p5Path, canonicalBytes({ ...p5Record, affectedPaths: p5Affected.slice(1) }))
    fires(() => publishReceipt({ root: fixtureRoot }), 'A0_RECEIPT_PART_CENSUS_REFUSED')
    writeFileSync(p5Path, canonicalBytes({ ...p5Record, proofs: p5Record.proofs.map((proof, index) => index === 0 ? { ...proof, protocolDigest: 'b'.repeat(64) } : proof) }))
    fires(() => publishReceipt({ root: fixtureRoot }), 'A0_RECEIPT_PROOF_DIVERGENCE')
    writeFileSync(p5Path, canonicalBytes(p5Record))

    const workflowPath = absolute(fixtureRoot, supplementalPaths[0])
    const workflowBytes = readFileSync(workflowPath)
    writeFileSync(workflowPath, Buffer.concat([workflowBytes, Buffer.from('\n')]))
    fires(() => publishReceipt({ root: fixtureRoot }), 'A0_RECEIPT_SUPPLEMENTAL_DRIFT')
    writeFileSync(workflowPath, workflowBytes)

    const removedPath = absolute(fixtureRoot, 'apps/hub/src/app.mjs')
    writeFileSync(removedPath, 'planted\n')
    fires(() => publishReceipt({ root: fixtureRoot }), 'A0_RECEIPT_CLOSURE_REFUSED')
    rmSync(removedPath)

    const routePath = absolute(fixtureRoot, 'apps/hub/src/generated/s1-routes.ts')
    const routeBytes = readFileSync(routePath)
    writeFileSync(routePath, routeBytes.toString('utf8').replace(/S1_ROUTE_PROJECTION_DIGEST = "[a-f0-9]{64}"/, `S1_ROUTE_PROJECTION_DIGEST = "${'b'.repeat(64)}"`))
    fires(() => publishReceipt({ root: fixtureRoot }), 'A0_RECEIPT_PRODUCT_DELTA_REFUSED')
    writeFileSync(routePath, routeBytes)

    const unclassifiedPath = absolute(fixtureRoot, 'apps/hub/unclassified.txt')
    writeFileSync(unclassifiedPath, 'unclassified\n')
    fires(() => buildManifest({ root: fixtureRoot, plan }), 'A0_RECEIPT_UNCLASSIFIED_PATH')
    rmSync(unclassifiedPath)

    publishReceipt({ root: fixtureRoot })
    fires(() => publishReceipt({ root: fixtureRoot }), 'A0_RECEIPT_EXISTS')
    const manifestTarget = absolute(fixtureRoot, manifestPath)
    writeFileSync(manifestTarget, Buffer.concat([readFileSync(manifestTarget), Buffer.from('\n')]))
    fires(() => checkReceipt({ root: fixtureRoot }), 'A0_RECEIPT_MANIFEST_DRIFT')
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
  return { verdict: 'PASS', firingControls: controls }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const valueFor = (name) => process.argv[process.argv.indexOf(name) + 1]
  const proofValues = process.argv.flatMap((value, index) => value === '--proof' ? [process.argv[index + 1]] : [])
  let result
  if (process.argv.includes('--self-test')) result = runSelfTest()
  else if (process.argv.includes('--conformance')) result = recordConformance({ proofValues, fableSession: valueFor('--fable-session'), geminiSession: valueFor('--gemini-session') })
  else if (process.argv.includes('--publish')) result = publishReceipt({})
  else if (process.argv.includes('--check')) result = checkReceipt({})
  else fail('A0_RECEIPT_MODE_REQUIRED')
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
