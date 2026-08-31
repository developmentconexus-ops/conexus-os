import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, posix, relative, resolve } from 'node:path'
import { canonicalBytes, sha256 } from './admission.mjs'

export class CompilerError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'CompilerError'
    this.code = code
  }
}

const fail = (code, message) => { throw new CompilerError(code, message) }
const RECEIPT = '.conexus-generation-receipt.json'
const LOCK = '.conexus-generation.lock'
const TEMP_PREFIX = '.conexus-tmp-'
const protectedClass = value => value === 'GENERATED' || value === 'PLATFORM-CONTRACT'
const compareCodeUnits = (a, b) => a < b ? -1 : a > b ? 1 : 0

export const normalizeTarget = value => {
  if (typeof value !== 'string' || !value || value.includes('\\')) fail('UNSAFE_PATH', `invalid path ${value}`)
  if (posix.isAbsolute(value)) fail('UNSAFE_PATH', `absolute path ${value}`)
  const normalized = posix.normalize(value)
  if (normalized !== value || normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    fail('UNSAFE_PATH', `traversal/non-canonical path ${value}`)
  }
  const unicode = normalized.normalize('NFC')
  const segments = unicode.split('/')
  const windowsReserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i
  for (const segment of segments) {
    if (!segment || /[\u0000-\u001f\u007f<>:"|?*]/.test(segment) || /[. ]$/.test(segment) || windowsReserved.test(segment)) {
      fail('UNSAFE_PATH', `cross-platform unsafe path ${value}`)
    }
  }
  return unicode
}

const collisionKey = path => path.normalize('NFC').toLowerCase()

const render = (spec, input) => {
  if (spec.render === 'STATIC') return Buffer.from(spec.content, 'utf8')
  if (spec.render === 'CANONICAL_JSON') {
    if (!(spec.inputKey in input)) fail('MISSING_INPUT', `missing ${spec.inputKey}`)
    return Buffer.concat([canonicalBytes(input[spec.inputKey]), Buffer.from('\n')])
  }
  if (spec.render === 'TOKEN_TEXT') {
    const output = spec.segments.map(segment => {
      if ('literal' in segment) return segment.literal
      if (!(segment.inputKey in input)) fail('MISSING_INPUT', `missing ${segment.inputKey}`)
      const value = input[segment.inputKey]
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
        fail('NON_SCALAR_TOKEN', `token ${segment.inputKey} is not scalar`)
      }
      return JSON.stringify(value)
    }).join('')
    return Buffer.from(output, 'utf8')
  }
  fail('UNKNOWN_RENDER', `unknown render ${spec.render}`)
}

export const compileFixture = ({ profileAdmission, inputAdmission }) => {
  const profile = profileAdmission.value
  const input = inputAdmission.value
  const entries = []
  const collisions = new Map()
  for (const output of profile.outputs) {
    const path = normalizeTarget(output.path)
    const key = collisionKey(path)
    if (collisions.has(key)) fail('PATH_COLLISION', `${path} collides with ${collisions.get(key)}`)
    collisions.set(key, path)
    const bytes = render(output, input)
    entries.push({
      path,
      class: output.class,
      bytes,
      outputDigest: sha256(bytes),
      sourceRef: `${profile.profileId}@${profile.profileVersion}#${output.id}`,
    })
  }
  entries.sort((a, b) => compareCodeUnits(a.path, b.path))
  const manifest = {
    kind: 'conexus.project-ownership-manifest/v1',
    entries: entries.map(({ bytes: _bytes, ...entry }) => ({ ...entry, updateLaw: entry.class === 'APP-OWNED' ? 'SEED_ONCE_PRESERVE' : 'EXACT_PROTECTED' })),
  }
  const manifestBytes = canonicalBytes(manifest)
  const treeIdentity = entries.map(entry => ({ path: entry.path, class: entry.class, outputDigest: entry.outputDigest }))
  return {
    kind: 'conexus.profile-compiler-output/v1',
    profileDigest: profileAdmission.digest,
    inputDigest: inputAdmission.digest,
    canonicalInputSetDigest: sha256(canonicalBytes({ profileDigest: profileAdmission.digest, inputDigest: inputAdmission.digest })),
    entries,
    manifest,
    manifestDigest: sha256(manifestBytes),
    treeDigest: sha256(canonicalBytes(treeIdentity)),
  }
}

const ignoredFromCensus = name => name === LOCK || name === RECEIPT || name.startsWith(TEMP_PREFIX)

export const censusTree = root => {
  const records = []
  const visit = absolute => {
    const stat = lstatSync(absolute)
    const path = relative(root, absolute).replaceAll('\\', '/')
    if (stat.isSymbolicLink()) fail('SYMLINK_REFUSED', `symlink/reparse entry ${path}`)
    if (stat.isDirectory()) {
      for (const child of readdirSync(absolute).sort()) {
        if (!path && ignoredFromCensus(child)) continue
        visit(resolve(absolute, child))
      }
      return
    }
    if (stat.isFile() && path) records.push({ path: path.normalize('NFC'), digest: sha256(readFileSync(absolute)), mode: stat.mode & 0o777 })
  }
  if (existsSync(root)) visit(root)
  records.sort((a, b) => compareCodeUnits(a.path, b.path))
  const collisions = new Map()
  for (const record of records) {
    const key = collisionKey(record.path)
    if (collisions.has(key)) fail('CURRENT_TREE_COLLISION', `${record.path} collides with ${collisions.get(key)}`)
    collisions.set(key, record.path)
  }
  return { records, digest: sha256(canonicalBytes(records)) }
}

const readReceipt = root => {
  const path = resolve(root, RECEIPT)
  if (!existsSync(path)) return { value: null, digest: null }
  const bytes = readFileSync(path)
  return { value: JSON.parse(bytes), digest: sha256(canonicalBytes(JSON.parse(bytes))) }
}

export const planGeneration = ({ root, compiled }) => {
  const census = censusTree(root)
  const current = new Map(census.records.map(record => [record.path, record]))
  const active = readReceipt(root)
  const prior = new Map((active.value?.entries ?? []).map(entry => [entry.path, entry]))
  const staged = new Map(compiled.entries.map(entry => [entry.path, entry]))
  const operations = []

  for (const entry of compiled.entries) {
    const currentEntry = current.get(entry.path)
    const priorEntry = prior.get(entry.path)
    if (!currentEntry) {
      if (priorEntry && protectedClass(entry.class)) fail('PROTECTED_DRIFT', `protected path missing ${entry.path}`)
      operations.push({ action: 'CREATE', path: entry.path, class: entry.class, expectedCurrentDigest: null, outputDigest: entry.outputDigest })
    } else if (entry.class === 'APP-OWNED') {
      operations.push({ action: 'PRESERVE', path: entry.path, class: entry.class, expectedCurrentDigest: currentEntry.digest, outputDigest: currentEntry.digest })
    } else {
      if (!priorEntry) fail('PROTECTED_COLLISION', `unowned current protected target ${entry.path}`)
      if (priorEntry.class !== entry.class) fail('CLASS_TRANSITION', `class transition ${entry.path}`)
      if (currentEntry.digest !== priorEntry.outputDigest) fail('PROTECTED_DRIFT', `protected path edited ${entry.path}`)
      operations.push({
        action: currentEntry.digest === entry.outputDigest ? 'NOOP' : 'REPLACE',
        path: entry.path,
        class: entry.class,
        expectedCurrentDigest: currentEntry.digest,
        outputDigest: entry.outputDigest,
      })
    }
  }
  for (const priorEntry of prior.values()) {
    if (protectedClass(priorEntry.class) && !staged.has(priorEntry.path)) fail('PROTECTED_DELETION', `protected deletion ${priorEntry.path}`)
  }

  const body = {
    kind: 'conexus.generation-plan/v1',
    expectedActiveReceiptDigest: active.digest,
    expectedCensusDigest: census.digest,
    profileDigest: compiled.profileDigest,
    inputDigest: compiled.inputDigest,
    manifestDigest: compiled.manifestDigest,
    treeDigest: compiled.treeDigest,
    operations,
  }
  return { ...body, planDigest: sha256(canonicalBytes(body)) }
}

export const applyGenerationPlan = ({ root, compiled, plan, failAfterWrites = null }) => {
  mkdirSync(root, { recursive: true })
  const { planDigest, ...planBody } = plan
  if (sha256(canonicalBytes(planBody)) !== planDigest) fail('PLAN_DIGEST_MISMATCH', 'GenerationPlan bytes do not match its digest')
  if (
    plan.profileDigest !== compiled.profileDigest ||
    plan.inputDigest !== compiled.inputDigest ||
    plan.manifestDigest !== compiled.manifestDigest ||
    plan.treeDigest !== compiled.treeDigest
  ) fail('PLAN_COMPILED_MISMATCH', 'GenerationPlan does not describe the supplied compiled tree')
  const lockPath = resolve(root, LOCK)
  let lockHandle
  let lockOwned = false
  const temporaryPaths = []
  try {
    try {
      lockHandle = openSync(lockPath, 'wx', 0o600)
      lockOwned = true
    } catch { fail('GENERATION_LOCKED', 'generation writer lock is held') }
    writeFileSync(lockHandle, `${JSON.stringify({ planDigest: plan.planDigest, pid: process.pid })}\n`)
    closeSync(lockHandle)
    lockHandle = undefined

    const census = censusTree(root)
    if (census.digest !== plan.expectedCensusDigest) fail('STALE_PLAN', 'current tree changed after planning')
    const active = readReceipt(root)
    if (active.digest !== plan.expectedActiveReceiptDigest) fail('STALE_RECEIPT', 'active receipt changed after planning')
    const underLockPlan = planGeneration({ root, compiled })
    if (underLockPlan.planDigest !== plan.planDigest) fail('STALE_PLAN', 'GenerationPlan changed under the writer lock')
    const staged = new Map(compiled.entries.map(entry => [entry.path, entry]))
    let writes = 0
    for (const operation of plan.operations) {
      if (operation.action === 'PRESERVE' || operation.action === 'NOOP') continue
      const entry = staged.get(operation.path)
      const target = resolve(root, ...operation.path.split('/'))
      mkdirSync(dirname(target), { recursive: true })
      const temporary = resolve(dirname(target), `${TEMP_PREFIX}${basename(target)}-${process.pid}-${writes}`)
      temporaryPaths.push(temporary)
      writeFileSync(temporary, entry.bytes, { flag: 'wx', mode: 0o644 })
      renameSync(temporary, target)
      temporaryPaths.pop()
      writes += 1
      if (failAfterWrites !== null && writes >= failAfterWrites) fail('INJECTED_FAILURE', 'fixture apply failure')
    }

    const finalCensus = censusTree(root)
    const finalMap = new Map(finalCensus.records.map(record => [record.path, record]))
    const receipt = {
      kind: 'conexus.generation-receipt/v1',
      planDigest: plan.planDigest,
      profileDigest: compiled.profileDigest,
      inputDigest: compiled.inputDigest,
      manifestDigest: compiled.manifestDigest,
      treeDigest: compiled.treeDigest,
      entries: compiled.entries.map(entry => ({ path: entry.path, class: entry.class, outputDigest: finalMap.get(entry.path)?.digest ?? entry.outputDigest })),
    }
    const receiptPath = resolve(root, RECEIPT)
    const receiptTemporary = resolve(root, `${TEMP_PREFIX}receipt-${process.pid}`)
    temporaryPaths.push(receiptTemporary)
    writeFileSync(receiptTemporary, canonicalBytes(receipt), { flag: 'wx', mode: 0o644 })
    renameSync(receiptTemporary, receiptPath)
    temporaryPaths.pop()
    return { receipt, receiptDigest: sha256(canonicalBytes(receipt)), writes }
  } finally {
    if (lockHandle !== undefined) closeSync(lockHandle)
    for (const path of temporaryPaths) rmSync(path, { force: true })
    if (lockOwned) rmSync(lockPath, { force: true })
  }
}

export const receiptFileName = RECEIPT
export const lockFileName = LOCK
