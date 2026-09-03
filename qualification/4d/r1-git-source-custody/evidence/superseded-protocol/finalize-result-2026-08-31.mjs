import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PRODUCT_CENSUS_KIND,
  PROTECTED_PRODUCT_ROOTS,
  canonicalJson,
} from './product-census.mjs'

const SCRIPT_PATH = fileURLToPath(import.meta.url)

export const FINAL_RESULT_KIND = 'conexus.r1c14.git-source-custody-results/v2'
export const REQUIRED_CLEANUP_FLAGS = Object.freeze([
  'temporaryRootRemoved',
  'serverStopped',
  'secretCanaryAbsent',
  'requestLogSecretAbsent',
])

const compareCodeUnits = (left, right) => left < right ? -1 : left > right ? 1 : 0
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const asBytes = value => Buffer.from(canonicalJson(value), 'utf8')

const fail = (code, detail = '') => {
  throw new Error(`${code}${detail ? `:${detail}` : ''}`)
}

const readJson = path => {
  if (typeof path !== 'string' || path.length === 0) fail('R1C14_FINALIZER_INPUT_PATH_MISSING')
  const absolutePath = resolve(path)
  let bytes
  try {
    bytes = readFileSync(absolutePath)
  } catch {
    fail('R1C14_FINALIZER_INPUT_MISSING')
  }
  try {
    return { value: JSON.parse(bytes), bytes }
  } catch {
    fail('R1C14_FINALIZER_JSON_INVALID')
  }
}

const assertArray = (value, code) => {
  if (!Array.isArray(value)) fail(code)
  return value
}

const extractRecords = census => {
  const records = census?.files ?? census?.entries ?? census?.records
  assertArray(records, 'R1C14_FINALIZER_CENSUS_FILES_INVALID')
  return records.map(record => {
    const path = record?.path ?? record?.relativePath
    const digest = record?.sha256 ?? record?.fileSha256 ?? record?.digest
    if (typeof path !== 'string' || !path || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) {
      fail('R1C14_FINALIZER_CENSUS_RECORD_INVALID')
    }
    if (
      path.startsWith('/') || path.startsWith('../') || path.includes('/../') || path.includes('\\')
      || path.split('/').some(segment => segment === '.' || segment === '..')
    ) {
      fail('R1C14_FINALIZER_CENSUS_PATH_INVALID')
    }
    return { path: path.normalize('NFC'), digest }
  })
}

const normalizeCensus = value => {
  if (value?.kind && value.kind !== PRODUCT_CENSUS_KIND) fail('R1C14_FINALIZER_CENSUS_KIND_INVALID')
  if (value?.roots) {
    assertArray(value.roots, 'R1C14_FINALIZER_CENSUS_ROOTS_INVALID')
    const roots = value.roots
    const expected = PROTECTED_PRODUCT_ROOTS
    if (JSON.stringify(roots) !== JSON.stringify(expected)) fail('R1C14_FINALIZER_CENSUS_ROOTS_INVALID')
  }
  const files = extractRecords(value)
  const paths = files.map(({ path }) => path)
  const sorted = paths.slice().sort(compareCodeUnits)
  if (JSON.stringify(paths) !== JSON.stringify(sorted)) fail('R1C14_FINALIZER_CENSUS_ORDER_INVALID')
  if (new Set(paths).size !== paths.length) fail('R1C14_FINALIZER_CENSUS_DUPLICATE_PATH')
  for (const path of paths) {
    if (!PROTECTED_PRODUCT_ROOTS.some(root => path.startsWith(`${root}/`))) {
      fail('R1C14_FINALIZER_CENSUS_SCOPE_INVALID')
    }
  }
  const computed = sha256(asBytes(files))
  const supplied = [value.sha256, value.censusSha256, value.censusHash, value.digest]
    .filter(value => value !== undefined)
  if (supplied.some(value => typeof value !== 'string' || value !== computed)) {
    fail('R1C14_FINALIZER_CENSUS_HASH_INVALID')
  }
  if (supplied.length === 0) fail('R1C14_FINALIZER_CENSUS_HASH_MISSING')
  return { records: files, digest: computed }
}

export const readProductCensus = path => normalizeCensus(readJson(path).value)

const censusEquality = (left, right) => (
  left.digest === right.digest && canonicalJson(left.records) === canonicalJson(right.records)
)

const parseCheckIds = value => {
  let ids = value
  if (value && !Array.isArray(value) && typeof value === 'object') {
    ids = value.checkIds ?? value.expectedCheckIds ?? value.ids ?? value.checks
  }
  assertArray(ids, 'R1C14_FINALIZER_EXPECTED_CHECK_IDS_INVALID')
  ids = ids.map(value => typeof value === 'string' ? value : value?.id ?? value?.checkId)
  if (ids.some(id => typeof id !== 'string' || id.length === 0)) fail('R1C14_FINALIZER_EXPECTED_CHECK_IDS_INVALID')
  const sorted = ids.slice().sort(compareCodeUnits)
  if (new Set(ids).size !== ids.length || sorted.length === 0) fail('R1C14_FINALIZER_EXPECTED_CHECK_IDS_INVALID')
  return sorted
}

const readExpectedCheckIds = source => {
  if (source === undefined || source === null || source === '') fail('R1C14_FINALIZER_EXPECTED_CHECK_IDS_MISSING')
  if (Array.isArray(source) || (typeof source === 'object' && source !== null)) return parseCheckIds(source)
  let value = source
  const text = String(source)
  if (!text.trim().startsWith('[') && !text.trim().startsWith('{') && existsSync(resolve(text))) {
    try {
      value = JSON.parse(readFileSync(resolve(text), 'utf8'))
    } catch {
      fail('R1C14_FINALIZER_EXPECTED_CHECK_IDS_INVALID')
    }
  } else if (typeof source === 'string') {
    try {
      value = JSON.parse(source)
    } catch {
      fail('R1C14_FINALIZER_EXPECTED_CHECK_IDS_INVALID')
    }
  }
  return parseCheckIds(value)
}

const expectedCheckIdSource = value => value
  ?? process.env.R1C14_EXPECTED_CHECK_IDS
  ?? process.env.R1C14_EXPECTED_CHECK_IDS_JSON
  ?? process.env.R1C14_EXPECTED_CHECK_IDS_PATH
  ?? process.env.R1C14_EXPECTED_CHECK_IDS_FILE
  ?? process.env.R1C14_EXPECTED_CHECKS
  ?? process.env.EXPECTED_CHECK_IDS_JSON

const candidateChecks = candidate => {
  const checks = candidate?.checks ?? candidate?.proofs ?? candidate?.checkResults
  assertArray(checks, 'R1C14_FINALIZER_CANDIDATE_CHECKS_INVALID')
  return checks.map(check => {
    const id = typeof check === 'string' ? check : check?.id ?? check?.checkId
    if (typeof id !== 'string' || id.length === 0) fail('R1C14_FINALIZER_CANDIDATE_CHECK_ID_INVALID')
    if (typeof check === 'object' && check !== null) {
      for (const verdictKey of ['verdict', 'result']) {
        if (verdictKey in check && check[verdictKey] !== 'PASS') fail('R1C14_FINALIZER_CANDIDATE_CHECK_FAILED')
      }
    }
    return id
  })
}

const assertExactCheckSet = (candidate, expected) => {
  const ids = candidateChecks(candidate)
  const sorted = ids.slice().sort(compareCodeUnits)
  if (new Set(ids).size !== ids.length || JSON.stringify(sorted) !== JSON.stringify(expected)) {
    fail('R1C14_FINALIZER_CHECK_CENSUS_MISMATCH')
  }
  return sorted
}

const assertProvisional = candidate => {
  if ('provisional' in candidate && candidate.provisional !== true) fail('R1C14_FINALIZER_CANDIDATE_NOT_PROVISIONAL')
  if ('status' in candidate && candidate.status !== 'PROVISIONAL') fail('R1C14_FINALIZER_CANDIDATE_NOT_PROVISIONAL')
  if ('resultStatus' in candidate && !['PROVISIONAL', 'PASS'].includes(candidate.resultStatus)) fail('R1C14_FINALIZER_CANDIDATE_NOT_PROVISIONAL')
  const provisional = candidate?.provisional === true
    || candidate?.status === 'PROVISIONAL'
    || candidate?.verdict === 'PROVISIONAL'
    || candidate?.resultStatus === 'PROVISIONAL'
  if (!provisional) fail('R1C14_FINALIZER_CANDIDATE_NOT_PROVISIONAL')
  if (candidate?.verdict === 'FAIL' || candidate?.resultStatus === 'FAIL') fail('R1C14_FINALIZER_CANDIDATE_FAILED')
}

const assertCleanup = candidate => {
  const cleanup = candidate?.cleanup
  if (!cleanup || typeof cleanup !== 'object' || Array.isArray(cleanup)) fail('R1C14_FINALIZER_CLEANUP_INVALID')
  if (Object.values(cleanup).some(value => value !== true || typeof value !== 'boolean')) {
    fail('R1C14_FINALIZER_CLEANUP_INCOMPLETE')
  }
  for (const key of REQUIRED_CLEANUP_FLAGS) {
    if (cleanup[key] !== true || typeof cleanup[key] !== 'boolean') fail('R1C14_FINALIZER_CLEANUP_INCOMPLETE')
  }
}

const assertZeroDelta = candidate => {
  for (const key of ['productDelta', 'measuredProductDelta']) {
    if (key in candidate && candidate[key] !== 0) fail('R1C14_FINALIZER_PRODUCT_DELTA_NONZERO')
  }
}

const secretFromEnvironment = () => {
  const values = [
    process.env.R1C14_SYNTHETIC_SECRET,
    process.env.R1C14_SECRET_CANARY,
    process.env.R1C14_SYNTHETIC_SECRET_CANARY,
  ].filter(value => value !== undefined)
  if (values.length !== 1 || !values[0]) fail('R1C14_FINALIZER_SYNTHETIC_SECRET_MISSING')
  return values[0]
}

const assertSecretAbsent = (serialized, secret) => {
  if (serialized.includes(secret)) fail('R1C14_FINALIZER_SECRET_DISCLOSURE')
}

const atomicWrite = (targetPath, bytes) => {
  const absoluteTarget = resolve(targetPath)
  mkdirSync(dirname(absoluteTarget), { recursive: true })
  const temporary = `${absoluteTarget}.tmp-${process.pid}-${randomUUID()}`
  let handle
  try {
    handle = openSync(temporary, 'wx', 0o600)
    writeSync(handle, bytes)
    fsyncSync(handle)
    closeSync(handle)
    handle = undefined
    renameSync(temporary, absoluteTarget)
  } catch (error) {
    if (handle !== undefined) closeSync(handle)
    rmSync(temporary, { force: true })
    throw error
  }
}

const sourceValue = (explicit, ...names) => {
  if (explicit !== undefined) return explicit
  return names.map(name => process.env[name]).find(value => value !== undefined && value !== '')
}

/**
 * Promote a provisional gate result only after the Product boundary remained
 * byte-for-byte unchanged and every expected check/cleanup claim fired.
 */
export const finalizeResult = ({
  candidatePath,
  finalPath,
  preCensusPath,
  postCensusPath,
  expectedCheckIds,
} = {}) => {
  if ([candidatePath, finalPath, preCensusPath, postCensusPath].some(path => typeof path !== 'string' || path.length === 0)) {
    fail('R1C14_FINALIZER_INPUT_PATH_MISSING')
  }
  const candidateInput = readJson(candidatePath)
  const finalAbsolute = resolve(finalPath)
  if (resolve(candidatePath) === finalAbsolute || existsSync(finalAbsolute)) fail('R1C14_FINALIZER_FINAL_PATH_NOT_EMPTY')

  const candidate = candidateInput.value
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) fail('R1C14_FINALIZER_CANDIDATE_INVALID')
  assertProvisional(candidate)
  assertCleanup(candidate)
  assertZeroDelta(candidate)

  const expected = readExpectedCheckIds(expectedCheckIdSource(expectedCheckIds))
  const checkIds = assertExactCheckSet(candidate, expected)
  const preInput = readJson(preCensusPath)
  const postInput = readJson(postCensusPath)
  const pre = normalizeCensus(preInput.value)
  const post = normalizeCensus(postInput.value)
  if (!censusEquality(pre, post)) fail('R1C14_FINALIZER_PRODUCT_CENSUS_CHANGED')

  const secret = secretFromEnvironment()
  assertSecretAbsent(candidateInput.bytes.toString('utf8'), secret)

  const candidateSha256 = sha256(candidateInput.bytes)
  const finalRecord = {
    ...candidate,
    kind: FINAL_RESULT_KIND,
    provisional: false,
    verdict: 'PASS',
    ...(candidate.status !== undefined ? { status: 'FINAL' } : {}),
    ...(candidate.resultStatus !== undefined ? { resultStatus: 'PASS' } : {}),
    measuredProductDelta: 0,
    productDelta: 0,
    productCensusSha256: pre.digest,
    checkIds,
    checks: Array.isArray(candidate.checks)
      ? candidate.checks.slice().sort((left, right) => {
        const leftId = typeof left === 'string' ? left : left.id ?? left.checkId
        const rightId = typeof right === 'string' ? right : right.id ?? right.checkId
        return compareCodeUnits(leftId, rightId)
      })
      : candidate.checks,
    finalization: {
      candidateSha256,
      preCensusSha256: sha256(preInput.bytes),
      postCensusSha256: sha256(postInput.bytes),
      productCensusSha256: pre.digest,
      expectedCheckIds: checkIds,
      protectedProductRoots: [...PROTECTED_PRODUCT_ROOTS],
    },
  }
  const finalBytes = Buffer.from(`${canonicalJson(finalRecord)}\n`, 'utf8')
  assertSecretAbsent(finalBytes.toString('utf8'), secret)
  atomicWrite(finalAbsolute, finalBytes)
  return { ...finalRecord, outputSha256: sha256(finalBytes) }
}

export const finalize = finalizeResult

const valueAfter = (args, names) => {
  for (const name of names) {
    const index = args.indexOf(name)
    if (index >= 0 && index + 1 < args.length && !args[index + 1].startsWith('--')) return args[index + 1]
  }
  return undefined
}

const positionalValues = args => {
  const optionNames = new Set([
    '--candidate', '--candidate-path', '--final', '--final-path', '--output',
    '--pre-census', '--pre-census-path', '--post-census', '--post-census-path',
    '--expected-check-ids', '--expected-checks', '--expected-check-ids-json',
  ])
  const values = []
  for (let index = 0; index < args.length; index += 1) {
    if (optionNames.has(args[index])) {
      index += 1
    } else if (!args[index].startsWith('--')) {
      values.push(args[index])
    }
  }
  return values
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)

if (isEntrypoint) {
  const args = process.argv.slice(2)
  const positional = positionalValues(args)
  const result = finalizeResult({
    candidatePath: sourceValue(valueAfter(args, ['--candidate', '--candidate-path']) ?? positional[0], 'R1C14_CANDIDATE_PATH', 'R1C14_CANDIDATE_RESULT_PATH', 'CANDIDATE_PATH'),
    finalPath: sourceValue(valueAfter(args, ['--final', '--final-path', '--output']) ?? positional[1], 'R1C14_FINAL_PATH', 'R1C14_FINAL_RESULT_PATH', 'FINAL_PATH'),
    preCensusPath: sourceValue(valueAfter(args, ['--pre-census', '--pre-census-path']) ?? positional[2], 'R1C14_PRE_CENSUS_PATH', 'R1C14_PRE_CENSUS_JSON', 'PRE_CENSUS_PATH'),
    postCensusPath: sourceValue(valueAfter(args, ['--post-census', '--post-census-path']) ?? positional[3], 'R1C14_POST_CENSUS_PATH', 'R1C14_POST_CENSUS_JSON', 'POST_CENSUS_PATH'),
    expectedCheckIds: valueAfter(args, ['--expected-check-ids', '--expected-checks', '--expected-check-ids-json']) ?? positional[4],
  })
  process.stdout.write(`${canonicalJson(result)}\n`)
}
