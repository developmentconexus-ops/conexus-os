import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalBytes, sha256 } from '../packages/canonical-json/src/index.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')
export const R2_PROJECT_BINDING_OWNERSHIP_INPUT_PATH = 'profiles/r1/v1/r2-project-binding-ownership.json'
export const R2_PROJECT_BINDING_OWNERSHIP_GENERATOR_PATH = 'scripts/generate-r2-project-binding-ownership.mjs'
export const R2_PROJECT_BINDING_OWNERSHIP_OUTPUT_PATH = 'apps/hub/src/generated/r2-project-binding-ownership.ts'
export const R2_PROJECT_BINDING_OWNERSHIP_RECEIPT_PATH = 'runtime/r1/.conexus/r2-project-binding-ownership-receipt.json'

const expectedEntries = Object.freeze([
  Object.freeze({
    class: 'APP-OWNED',
    ownerRef: 'Project APP',
    path: '.conexus/brain/realization.json',
    version: 'v1',
  }),
  Object.freeze({
    class: 'PLATFORM-CONTRACT',
    ownerRef: 'PRJ-11/12',
    path: '.conexus/project/brain-binding.json',
    version: 'v1',
  }),
  Object.freeze({
    class: 'PLATFORM-CONTRACT',
    ownerRef: 'PRJ-14/15',
    path: '.conexus/project/connection-bindings.json',
    version: 'v1',
  }),
])

const PROFILE_KIND = 'conexus.r2-project-binding-ownership-profile/v1'
const PROJECTION_KIND = 'conexus.r2-project-binding-ownership/v1'
const RECEIPT_KIND = 'conexus.r2-project-binding-ownership-receipt/v1'
const DIGEST = /^[a-f0-9]{64}$/

const readRequired = (root, path, code) => {
  const absolute = resolve(root, path)
  try {
    const stat = lstatSync(absolute)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(code)
    return readFileSync(absolute)
  } catch (error) {
    if (error?.message === code) throw error
    throw new Error(code, { cause: error })
  }
}

const ownKeys = (value) => Object.keys(value).sort().join(',')
const expectedEntryKeys = ownKeys(expectedEntries[0])

const parseInput = (bytes) => {
  let input
  try {
    input = JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    throw new Error('R2_PROJECT_BINDING_OWNERSHIP_INPUT_PARSE', { cause: error })
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) || ownKeys(input) !== 'entries,kind' || input.kind !== PROFILE_KIND) {
    throw new Error('R2_PROJECT_BINDING_OWNERSHIP_INPUT_SHAPE_REFUSED')
  }
  if (!Array.isArray(input.entries) || input.entries.length !== expectedEntries.length) {
    throw new Error('R2_PROJECT_BINDING_OWNERSHIP_INPUT_ENTRIES_REFUSED')
  }

  const seen = new Set()
  const entries = input.entries.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || ownKeys(entry) !== expectedEntryKeys) {
      throw new Error(`R2_PROJECT_BINDING_OWNERSHIP_INPUT_ENTRY_SHAPE_REFUSED_${index}`)
    }
    const expected = expectedEntries.find((candidate) => candidate.path === entry.path)
    if (!expected || seen.has(entry.path)) throw new Error(`R2_PROJECT_BINDING_OWNERSHIP_INPUT_ENTRY_REFUSED_${index}`)
    seen.add(entry.path)
    if (entry.class !== expected.class) throw new Error(`R2_PROJECT_BINDING_OWNERSHIP_INPUT_CLASS_REFUSED_${entry.path}`)
    if (entry.version !== expected.version || entry.ownerRef !== expected.ownerRef) {
      throw new Error(`R2_PROJECT_BINDING_OWNERSHIP_INPUT_OWNER_REFUSED_${entry.path}`)
    }
    return Object.freeze({ ...expected })
  })
  if (seen.size !== expectedEntries.length) throw new Error('R2_PROJECT_BINDING_OWNERSHIP_INPUT_ENTRIES_REFUSED')
  return Object.freeze({
    kind: input.kind,
    entries: Object.freeze(entries.sort((left, right) => left.path.localeCompare(right.path, 'en'))),
  })
}

export function buildR2ProjectBindingOwnership(root = repositoryRoot) {
  const inputBytes = readRequired(root, R2_PROJECT_BINDING_OWNERSHIP_INPUT_PATH, 'R2_PROJECT_BINDING_OWNERSHIP_INPUT_MISSING')
  const input = parseInput(inputBytes)
  return Object.freeze({
    kind: PROJECTION_KIND,
    inputDigest: sha256(canonicalBytes(input)),
    entries: input.entries,
  })
}

export function renderR2ProjectBindingOwnership(root = repositoryRoot) {
  const projection = buildR2ProjectBindingOwnership(root)
  return [
    '// GENERATED from profiles/r1/v1/r2-project-binding-ownership.json by scripts/generate-r2-project-binding-ownership.mjs. Do not edit.',
    `export const R2_PROJECT_BINDING_OWNERSHIP = Object.freeze(${JSON.stringify(projection, null, 2)} as const)`,
    '',
  ].join('\n')
}

const buildReceipt = (root, outputBytes) => ({
  kind: RECEIPT_KIND,
  inputDigest: buildR2ProjectBindingOwnership(root).inputDigest,
  generatorDigest: sha256(readRequired(root, R2_PROJECT_BINDING_OWNERSHIP_GENERATOR_PATH, 'R2_PROJECT_BINDING_OWNERSHIP_GENERATOR_MISSING')),
  outputDigest: sha256(outputBytes),
})

const renderReceipt = (receipt) => `${JSON.stringify(receipt, null, 2)}\n`

export function buildR2ProjectBindingOwnershipReceipt(root = repositoryRoot) {
  return buildReceipt(root, Buffer.from(renderR2ProjectBindingOwnership(root), 'utf8'))
}

export function renderR2ProjectBindingOwnershipReceipt(root = repositoryRoot) {
  return renderReceipt(buildR2ProjectBindingOwnershipReceipt(root))
}

export function checkR2ProjectBindingOwnership(root = repositoryRoot) {
  const projection = buildR2ProjectBindingOwnership(root)
  const expectedOutput = renderR2ProjectBindingOwnership(root)
  const outputBytes = readRequired(root, R2_PROJECT_BINDING_OWNERSHIP_OUTPUT_PATH, 'R2_PROJECT_BINDING_OWNERSHIP_OUTPUT_MISSING')
  if (!outputBytes.equals(Buffer.from(expectedOutput, 'utf8'))) throw new Error('R2_PROJECT_BINDING_OWNERSHIP_GENERATED_DRIFT')

  const expectedReceipt = buildReceipt(root, outputBytes)
  const receiptBytes = readRequired(root, R2_PROJECT_BINDING_OWNERSHIP_RECEIPT_PATH, 'R2_PROJECT_BINDING_OWNERSHIP_RECEIPT_MISSING')
  let receipt
  try {
    receipt = JSON.parse(receiptBytes.toString('utf8'))
  } catch (error) {
    throw new Error('R2_PROJECT_BINDING_OWNERSHIP_RECEIPT_PARSE', { cause: error })
  }
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || ownKeys(receipt) !== 'generatorDigest,inputDigest,kind,outputDigest' ||
      receipt.kind !== RECEIPT_KIND || !DIGEST.test(receipt.inputDigest ?? '') || !DIGEST.test(receipt.generatorDigest ?? '') || !DIGEST.test(receipt.outputDigest ?? '')) {
    throw new Error('R2_PROJECT_BINDING_OWNERSHIP_RECEIPT_SHAPE_REFUSED')
  }
  if (!canonicalBytes(receipt).equals(canonicalBytes(expectedReceipt))) throw new Error('R2_PROJECT_BINDING_OWNERSHIP_RECEIPT_DRIFT')
  return projection
}

const publish = (root = repositoryRoot) => {
  const output = renderR2ProjectBindingOwnership(root)
  const outputBytes = Buffer.from(output, 'utf8')
  const receipt = renderReceipt(buildReceipt(root, outputBytes))
  const publications = [
    { path: resolve(root, R2_PROJECT_BINDING_OWNERSHIP_OUTPUT_PATH), bytes: outputBytes },
    { path: resolve(root, R2_PROJECT_BINDING_OWNERSHIP_RECEIPT_PATH), bytes: Buffer.from(receipt, 'utf8') },
  ]
  // Keep the staging directory under the supplied root: repositories may live
  // on a filesystem where /tmp and the checkout are not rename-compatible.
  const temporaryRoot = mkdtempSync(resolve(root, '.conexus-r2-project-binding-ownership-'))
  const staged = []
  try {
    for (const publication of publications) {
      mkdirSync(dirname(publication.path), { recursive: true })
      const stagedPath = resolve(temporaryRoot, `${staged.length}.staged`)
      writeFileSync(stagedPath, publication.bytes, { flag: 'wx', mode: 0o600 })
      staged.push({ ...publication, stagedPath, backupPath: resolve(temporaryRoot, `${staged.length}.backup`), replaced: false, installed: false })
    }
    for (const publication of staged) {
      if (existsSync(publication.path)) {
        renameSync(publication.path, publication.backupPath)
        publication.replaced = true
      }
      renameSync(publication.stagedPath, publication.path)
      publication.installed = true
    }
    for (const publication of staged) if (publication.replaced) unlinkSync(publication.backupPath)
  } catch (error) {
    for (const publication of [...staged].reverse()) {
      if (publication.installed && existsSync(publication.path)) unlinkSync(publication.path)
      if (publication.replaced && existsSync(publication.backupPath)) renameSync(publication.backupPath, publication.path)
    }
    throw error
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
  return { projection: buildR2ProjectBindingOwnership(root), receipt: buildReceipt(root, outputBytes) }
}

function main() {
  if (process.argv.includes('--check')) {
    const projection = checkR2ProjectBindingOwnership()
    process.stdout.write(`${JSON.stringify({ verification: 'PASS', entries: projection.entries.length })}\n`)
    return
  }
  const result = publish()
  process.stdout.write(`${JSON.stringify({ verification: 'PUBLISHED', entries: result.projection.entries.length, receipt: result.receipt })}\n`)
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) main()
