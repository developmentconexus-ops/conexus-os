import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, posix, relative, resolve } from 'node:path'
import { canonicalBytes, sha256 } from '../../canonical-json/src/index.mjs'

const RECEIPT = '.conexus/generation-receipt.json'
const LOCK = '.conexus/generation.lock'
const PENDING_PLANS = '.conexus/pending-plans'
const INTERNAL_PREFIX = '.conexus/'
const compareCodeUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const protectedClass = (value) => value === 'GENERATED' || value === 'PLATFORM-CONTRACT'

export class CompilerError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'CompilerError'
    this.code = code
  }
}

const fail = (code, message) => {
  throw new CompilerError(code, message)
}

export const normalizeTarget = (value) => {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0')) fail('UNSAFE_PATH', `invalid path ${value}`)
  if (posix.isAbsolute(value)) fail('UNSAFE_PATH', `absolute path ${value}`)
  const normalized = posix.normalize(value).normalize('NFC')
  if (normalized !== value || normalized === '.' || normalized.startsWith('../') || normalized.startsWith(INTERNAL_PREFIX)) fail('UNSAFE_PATH', `unsafe path ${value}`)
  for (const segment of normalized.split('/')) {
    if (!segment || segment.endsWith('.') || segment.endsWith(' ') || segment.includes(':')) fail('UNSAFE_PATH', `unsafe segment ${segment}`)
  }
  return normalized
}

const renderOperationModule = (wireProjection) => {
  const operations = wireProjection.operations
  const lines = [
    '// GENERATED from exact admitted Conexus R1 wire authority. Do not edit.',
    `export const R1_WIRE_DIGEST = ${JSON.stringify(wireProjection.digest)}`,
    'export const R1_OPERATIONS = Object.freeze([',
    ...operations.map((operation) => `  Object.freeze(${JSON.stringify(operation)}),`),
    '])',
    '',
  ]
  return Buffer.from(lines.join('\n'), 'utf8')
}

const render = (output, input) => {
  if (output.render === 'STATIC') return Buffer.from(output.content, 'utf8')
  const value = input[output.inputKey]
  if (value === undefined) fail('MISSING_INPUT', `missing input ${output.inputKey}`)
  if (output.render === 'CANONICAL_JSON') return Buffer.concat([canonicalBytes(value), Buffer.from('\n')])
  if (output.render === 'R1_OPERATION_MODULE') return renderOperationModule(value)
  fail('UNKNOWN_RENDER', `unsupported render ${output.render}`)
}

export const compileProfile = ({ profileAdmission, inputAdmission }) => {
  const profile = profileAdmission.value
  const input = inputAdmission.value
  if (profile.generatorProtocolVersion !== 'ConexusProfileCompiler/v1') fail('UNSUPPORTED_PROTOCOL', 'unsupported generator protocol')
  if (
    input.profileRef.profileId !== profile.profileId ||
    input.profileRef.profileVersion !== profile.profileVersion ||
    input.profileRef.profileDigest !== profileAdmission.digest ||
    input.profileRef.generatorProtocolVersion !== profile.generatorProtocolVersion
  ) fail('PROFILE_IDENTITY_MISMATCH', 'input profile tuple does not identify admitted profile bytes')

  const seen = new Map()
  const outputIds = new Set()
  const entries = profile.outputs.map((output) => {
    if (outputIds.has(output.id)) fail('DUPLICATE_OUTPUT_ID', `duplicate output id ${output.id}`)
    outputIds.add(output.id)
    const path = normalizeTarget(output.path)
    const collisionKey = path.normalize('NFC').toLowerCase()
    if (seen.has(collisionKey)) fail('PATH_COLLISION', `${path} collides with ${seen.get(collisionKey)}`)
    seen.set(collisionKey, path)
    const bytes = render(output, input)
    return Object.freeze({
      path,
      class: output.class,
      sourceRef: `${profile.profileId}@${profile.profileVersion}#${output.id}`,
      sourceDigest: profileAdmission.digest,
      outputDigest: sha256(bytes),
      updateLaw: output.class === 'APP-OWNED' ? 'PRESERVE' : 'EXACT_REPLACE_AFTER_PRIOR_DIGEST',
      bytes,
    })
  }).sort((a, b) => compareCodeUnits(a.path, b.path))

  const manifest = {
    kind: 'conexus.project-ownership-manifest/v1',
    entries: entries.map(({ bytes: _bytes, ...entry }) => entry),
  }
  const manifestDigest = sha256(canonicalBytes(manifest))
  const treeDigest = sha256(canonicalBytes(entries.map(({ bytes: _bytes, path, class: ownerClass, outputDigest }) => ({ path, class: ownerClass, outputDigest }))))
  return Object.freeze({
    profileDigest: profileAdmission.digest,
    inputDigest: inputAdmission.digest,
    manifest,
    manifestDigest,
    treeDigest,
    entries,
  })
}

const walk = (root, directory = root, records = []) => {
  if (!existsSync(directory)) return records
  for (const name of readdirSync(directory).sort(compareCodeUnits)) {
    const absolute = resolve(directory, name)
    const stat = lstatSync(absolute)
    const path = relative(root, absolute).replaceAll('\\', '/').normalize('NFC')
    if (path === '.conexus' || path.startsWith(INTERNAL_PREFIX)) continue
    if (stat.isSymbolicLink()) fail('SYMLINK_REFUSED', `symbolic link ${path}`)
    if (stat.isDirectory()) walk(root, absolute, records)
    else if (stat.isFile()) records.push({ path, digest: sha256(readFileSync(absolute)) })
    else fail('UNSUPPORTED_ENTRY', `unsupported filesystem entry ${path}`)
  }
  return records
}

export const censusTree = (root) => {
  const records = walk(root).sort((a, b) => compareCodeUnits(a.path, b.path))
  return { records, digest: sha256(canonicalBytes(records)) }
}

const readReceipt = (root) => {
  const path = resolve(root, RECEIPT)
  if (!existsSync(path)) return { receipt: null, digest: null }
  const receipt = JSON.parse(readFileSync(path, 'utf8'))
  return { receipt, digest: sha256(canonicalBytes(receipt)) }
}

const validatePlanDigest = (plan) => {
  const { planDigest, ...body } = plan
  if (sha256(canonicalBytes(body)) !== planDigest) fail('PLAN_DIGEST_MISMATCH', 'plan bytes do not match digest')
}

const pendingPlanPath = (root, planDigest) => resolve(root, `${PENDING_PLANS}/${planDigest}.json`)

const readPendingPlans = (root) => {
  const directory = resolve(root, PENDING_PLANS)
  if (!existsSync(directory)) return []
  return readdirSync(directory).sort(compareCodeUnits).map((name) => {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) fail('PENDING_PLAN_INVALID', `invalid pending plan name ${name}`)
    const plan = JSON.parse(readFileSync(resolve(directory, name), 'utf8'))
    validatePlanDigest(plan)
    if (`${plan.planDigest}.json` !== name) fail('PENDING_PLAN_INVALID', `pending plan name/digest mismatch ${name}`)
    return plan
  })
}

const censusMatchesRecoverablePlan = (census, plan) => {
  const current = new Map(census.records.map((record) => [record.path, record.digest]))
  const expected = new Map(plan.expectedRecords.map((record) => [record.path, record.digest]))
  const operations = new Map(plan.operations.map((operation) => [operation.path, operation]))
  const allowedPaths = new Set([...expected.keys(), ...operations.keys()])
  if ([...current.keys()].some((path) => !allowedPaths.has(path))) return false
  for (const [path, digest] of current) {
    const operation = operations.get(path)
    if (operation && (digest === operation.expectedPriorDigest || digest === operation.outputDigest)) continue
    if (digest !== expected.get(path)) return false
  }
  for (const [path, operation] of operations) {
    const digest = current.get(path)
    if (operation.action === 'ADD' && digest !== undefined && digest !== operation.outputDigest) return false
    if (operation.action !== 'ADD' && digest === undefined) return false
  }
  return true
}

const recoverPendingPlan = ({ root, compiled, census, active }) => {
  const pending = readPendingPlans(root)
  if (pending.length === 0) return null
  if (pending.length !== 1) fail('MULTIPLE_PENDING_PLANS', 'more than one pending generation plan exists')
  const [plan] = pending
  if (
    active.receipt?.planDigest === plan.planDigest &&
    active.receipt.profileDigest === compiled.profileDigest &&
    active.receipt.inputDigest === compiled.inputDigest &&
    active.receipt.manifestDigest === compiled.manifestDigest
  ) {
    const current = new Map(census.records.map((record) => [record.path, record.digest]))
    for (const entry of active.receipt.entries) {
      if (protectedClass(entry.class) && current.get(entry.path) !== entry.outputDigest) fail('PROTECTED_DRIFT', `protected path drift ${entry.path}`)
    }
    rmSync(pendingPlanPath(root, plan.planDigest), { force: true })
    return null
  }
  if (
    plan.profileDigest !== compiled.profileDigest ||
    plan.inputDigest !== compiled.inputDigest ||
    plan.manifestDigest !== compiled.manifestDigest ||
    plan.treeDigest !== compiled.treeDigest ||
    plan.expectedActiveReceiptDigest !== active.digest
  ) fail('PENDING_PLAN_CONFLICT', 'pending generation plan does not match the requested compilation')
  if (!censusMatchesRecoverablePlan(census, plan)) fail('PENDING_PLAN_DIVERGED', 'tree is neither the before nor after state of the pending plan')
  return Object.freeze(plan)
}

export const planGeneration = ({ root, compiled }) => {
  const census = censusTree(root)
  const active = readReceipt(root)
  const recovery = recoverPendingPlan({ root, compiled, census, active })
  if (recovery) return recovery
  const current = new Map(census.records.map((record) => [record.path, record]))
  const prior = new Map((active.receipt?.entries ?? []).map((entry) => [entry.path, entry]))
  const operations = []

  for (const entry of compiled.entries) {
    const existing = current.get(entry.path)
    const old = prior.get(entry.path)
    if (old && old.class !== entry.class) fail('UNSAFE_CLASS_TRANSITION', `ownership class changed for ${entry.path}`)
    if (entry.class === 'APP-OWNED') {
      operations.push({ path: entry.path, class: entry.class, action: existing ? 'PRESERVE' : 'ADD', expectedPriorDigest: existing?.digest ?? null, outputDigest: entry.outputDigest })
      continue
    }
    if (existing && !old) fail('PROTECTED_COLLISION', `unowned protected path ${entry.path}`)
    if (existing && old && existing.digest !== old.outputDigest) fail('PROTECTED_DRIFT', `protected path drift ${entry.path}`)
    operations.push({ path: entry.path, class: entry.class, action: existing?.digest === entry.outputDigest ? 'NOOP' : existing ? 'REPLACE' : 'ADD', expectedPriorDigest: existing?.digest ?? null, outputDigest: entry.outputDigest })
  }

  for (const [path, old] of prior) {
    if (compiled.entries.some((entry) => entry.path === path)) continue
    if (old.class === 'APP-OWNED') continue
    const existing = current.get(path)
    if (existing && existing.digest !== old.outputDigest) fail('PROTECTED_DRIFT', `removed protected path drift ${path}`)
    fail('PROTECTED_REMOVAL_REQUIRES_MIGRATION', `protected removal requires migration ${path}`)
  }

  const body = {
    kind: 'conexus.project-generation-plan/v1',
    profileDigest: compiled.profileDigest,
    inputDigest: compiled.inputDigest,
    manifestDigest: compiled.manifestDigest,
    treeDigest: compiled.treeDigest,
    expectedCensusDigest: census.digest,
    expectedRecords: census.records,
    expectedActiveReceiptDigest: active.digest,
    operations,
  }
  return Object.freeze({ ...body, planDigest: sha256(canonicalBytes(body)) })
}

export const applyGenerationPlan = ({ root, compiled, plan, failAfterWrites = null }) => {
  mkdirSync(root, { recursive: true })
  validatePlanDigest(plan)
  const { planDigest } = plan
  const lockPath = resolve(root, LOCK)
  mkdirSync(dirname(lockPath), { recursive: true })
  let lockHandle
  let lockOwned = false
  const temporaryPaths = []
  try {
    try {
      lockHandle = openSync(lockPath, 'wx', 0o600)
      lockOwned = true
    } catch {
      fail('GENERATION_LOCKED', 'generation writer lock is held')
    }
    writeFileSync(lockHandle, `${planDigest}\n`)
    closeSync(lockHandle)
    lockHandle = undefined
    const census = censusTree(root)
    if (census.digest !== plan.expectedCensusDigest && !censusMatchesRecoverablePlan(census, plan)) fail('STALE_PLAN', 'tree changed outside the plan boundary')
    const active = readReceipt(root)
    if (active.digest !== plan.expectedActiveReceiptDigest) fail('STALE_RECEIPT', 'receipt changed after planning')
    if (planGeneration({ root, compiled }).planDigest !== planDigest) fail('STALE_PLAN', 'plan changed under lock')

    if (
      plan.operations.every((operation) => operation.action === 'NOOP') &&
      active.receipt?.profileDigest === compiled.profileDigest &&
      active.receipt?.inputDigest === compiled.inputDigest &&
      active.receipt?.manifestDigest === compiled.manifestDigest
    ) return Object.freeze({ receipt: active.receipt, receiptDigest: active.digest, writes: 0 })

    const pendingPath = pendingPlanPath(root, planDigest)
    mkdirSync(dirname(pendingPath), { recursive: true })
    if (!existsSync(pendingPath)) writeFileSync(pendingPath, canonicalBytes(plan), { flag: 'wx', mode: 0o600 })
    else if (sha256(readFileSync(pendingPath)) !== sha256(canonicalBytes(plan))) fail('PENDING_PLAN_CONFLICT', 'pending plan bytes conflict')

    const byPath = new Map(compiled.entries.map((entry) => [entry.path, entry]))
    let writes = 0
    for (const operation of plan.operations) {
      if (operation.action === 'PRESERVE' || operation.action === 'NOOP') continue
      const entry = byPath.get(operation.path)
      const target = resolve(root, ...operation.path.split('/'))
      mkdirSync(dirname(target), { recursive: true })
      const temporary = `${target}.conexus-tmp-${process.pid}-${writes}`
      temporaryPaths.push(temporary)
      writeFileSync(temporary, entry.bytes, { flag: 'wx', mode: 0o644 })
      renameSync(temporary, target)
      temporaryPaths.pop()
      writes += 1
      if (failAfterWrites !== null && writes >= failAfterWrites) fail('INJECTED_FAILURE', 'injected apply failure')
    }

    const final = new Map(censusTree(root).records.map((record) => [record.path, record]))
    const receipt = {
      kind: 'conexus.project-generation-receipt/v1',
      generatorProtocolVersion: 'ConexusProfileCompiler/v1',
      planDigest,
      profileDigest: compiled.profileDigest,
      inputDigest: compiled.inputDigest,
      manifestDigest: compiled.manifestDigest,
      generatedTreeDigest: sha256(canonicalBytes(compiled.entries.filter((entry) => entry.class === 'GENERATED').map((entry) => ({ path: entry.path, outputDigest: entry.outputDigest })))),
      platformTreeDigest: sha256(canonicalBytes(compiled.entries.filter((entry) => entry.class === 'PLATFORM-CONTRACT').map((entry) => ({ path: entry.path, outputDigest: entry.outputDigest })))),
      preservedAppOwnedPaths: plan.operations.filter((operation) => operation.class === 'APP-OWNED' && operation.action === 'PRESERVE').map((operation) => operation.path),
      unresolvedConflicts: 0,
      entries: compiled.entries.map((entry) => ({ path: entry.path, class: entry.class, sourceRef: entry.sourceRef, sourceDigest: entry.sourceDigest, outputDigest: final.get(entry.path)?.digest ?? entry.outputDigest, updateLaw: entry.updateLaw })),
    }
    const receiptPath = resolve(root, RECEIPT)
    const receiptTemporary = `${receiptPath}.tmp-${process.pid}`
    writeFileSync(receiptTemporary, canonicalBytes(receipt), { flag: 'wx', mode: 0o600 })
    renameSync(receiptTemporary, receiptPath)
    rmSync(pendingPath, { force: true })
    return Object.freeze({ receipt, receiptDigest: sha256(canonicalBytes(receipt)), writes })
  } finally {
    if (lockHandle !== undefined) closeSync(lockHandle)
    for (const path of temporaryPaths) rmSync(path, { force: true })
    if (lockOwned) rmSync(lockPath, { force: true })
  }
}

export const recordGenerationAttempt = ({ root, plan, error }) => {
  const attempt = {
    kind: 'conexus.project-generation-attempt/v1',
    planDigest: plan?.planDigest ?? null,
    refusalClass: error?.code ?? 'UNKNOWN_REFUSAL',
    admitted: false,
  }
  mkdirSync(resolve(root, '.conexus/attempts'), { recursive: true })
  const digest = sha256(canonicalBytes(attempt))
  const path = resolve(root, `.conexus/attempts/${digest}.json`)
  if (!existsSync(path)) writeFileSync(path, canonicalBytes(attempt), { flag: 'wx', mode: 0o600 })
  else if (sha256(readFileSync(path)) !== sha256(canonicalBytes(attempt))) fail('ATTEMPT_EVIDENCE_CONFLICT', 'attempt evidence digest collision')
  return { attempt, digest }
}

export const receiptFileName = RECEIPT
