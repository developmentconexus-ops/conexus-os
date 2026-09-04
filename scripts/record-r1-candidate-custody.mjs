import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const profilePath = resolve(root, 'profiles/r1/v1/rc01-candidate-custody.json')
const profile = JSON.parse(readFileSync(profilePath, 'utf8'))
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const json = value => `${JSON.stringify(value, null, 2)}\n`
const outputPaths = new Set([
  profile.candidateInventory,
  profile.ownershipManifest,
  profile.generationReceipt,
])

const git = (args, options = {}) => execFileSync('git', args, { cwd: root, ...options })
const decode = buffer => buffer.toString('utf8')

function diffEntries(mode) {
  const args = mode === 'index'
    ? ['diff', '--cached', '--name-status', '-z', profile.baseCommit]
    : ['diff', '--name-status', '-z', profile.baseCommit, profile.candidateCommit]
  const parts = decode(git(args)).split('\0').filter(Boolean)
  const entries = []
  for (let index = 0; index < parts.length;) {
    const status = parts[index++]
    let path = parts[index++]
    if (status.startsWith('R') || status.startsWith('C')) path = parts[index++]
    entries.push({ path: path.replaceAll('\\', '/'), status: status[0] })
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path))
}

function committedBytes(entries) {
  const paths = entries.filter(({ status }) => status !== 'D').map(({ path }) => path)
  const input = `${paths.map(path => `${profile.candidateCommit}:${path}`).join('\n')}\n`
  const output = git(['cat-file', '--batch'], { input, maxBuffer: 128 * 1024 * 1024 })
  const byPath = new Map()
  let cursor = 0
  for (const path of paths) {
    const headerEnd = output.indexOf(0x0a, cursor)
    if (headerEnd < 0) throw new Error(`RC01_CANDIDATE_BLOB_HEADER_MISSING:${path}`)
    const header = output.subarray(cursor, headerEnd).toString('utf8')
    if (header.endsWith(' missing')) throw new Error(`RC01_CANDIDATE_BLOB_MISSING:${path}`)
    const size = Number(header.split(' ').at(-1))
    if (!Number.isSafeInteger(size)) throw new Error(`RC01_CANDIDATE_BLOB_SIZE_INVALID:${path}`)
    const start = headerEnd + 1
    const end = start + size
    byPath.set(path, output.subarray(start, end))
    cursor = end + 1
  }
  return byPath
}

function bytesFor(path, mode, committed) {
  return mode === 'index' ? git(['show', `:${path}`]) : committed.get(path)
}

function classification(path) {
  if (path.startsWith('.wireframe-preview/')) return 'LOCAL_OR_UNOWNED_STATE'
  if (/(^|\/)4d-rb-|(^|\/)rb-c0|rb-c1-live-probe/.test(path)) return 'RB_C0_FROZEN_FUTURE_PLANNING'
  if (
    ['AGENTS.md', 'PRODUCT.md', 'docs/roadmap.md', 'docs/index.md'].includes(path)
    || path.startsWith('docs/product/')
    || path.startsWith('docs/architecture/')
    || path.startsWith('docs/decisions/')
    || path.startsWith('docs/development/')
    || path.startsWith('docs/phases/')
    || path.startsWith('docs/reference/')
    || path.startsWith('.agents/skills/')
  ) return 'R1_AUTHORITY_OR_STATUS_PROJECTION'
  if (path.includes('/generated/') || path.startsWith('apps/hub/public/') || path.endsWith('/atlas.sum')) return 'GENERATED'
  if (path.startsWith('apps/')) return 'R1_PRODUCT_IMPLEMENTATION'
  if (path.startsWith('runtime/') || path.startsWith('qualification/')) return 'R1_DURABLE_EVIDENCE'
  if (path.startsWith('docs/evidence/')) {
    return /(brief|handoff|round|candidate|proposal|stage-packet|review-result)/i.test(path)
      ? 'INTERMEDIATE_HISTORY'
      : 'R1_DURABLE_EVIDENCE'
  }
  if (
    path.startsWith('contracts/')
    || path.startsWith('packages/')
    || path.startsWith('profiles/')
    || path.startsWith('scripts/')
    || path.startsWith('tests/')
    || path.startsWith('.github/')
    || ['.nvmrc', 'package.json', 'package-lock.json', 'biome.json', 'tsconfig.base.json'].includes(path)
  ) return 'PLATFORM_CONTRACT'
  return 'UNKNOWN'
}

function sourceOwnership(path) {
  if (path.includes('/generated/') || path.startsWith('apps/hub/public/') || path.endsWith('/atlas.sum')) return 'GENERATED'
  if (path.includes('/app-owned/')) return 'APP-OWNED'
  return 'PLATFORM-CONTRACT'
}

function countBy(values, key) {
  return values.reduce((counts, value) => {
    const name = value[key]
    counts[name] = (counts[name] ?? 0) + 1
    return counts
  }, {})
}

function build(mode) {
  const prechange = JSON.parse(readFileSync(resolve(root, profile.preChangeInventory), 'utf8'))
  const changed = diffEntries(mode)
  const committed = mode === 'commit' ? committedBytes(changed) : null
  const candidateEntries = changed
    .filter(({ path }) => !outputPaths.has(path))
    .map(({ path, status }) => {
      const semanticClass = classification(path)
      if (semanticClass === 'UNKNOWN') throw new Error(`RC01_UNKNOWN_CLASSIFICATION:${path}`)
      if (status === 'D') return { path, status, classification: semanticClass, sourceOwnership: sourceOwnership(path), size: 0, sha256: null }
      const bytes = bytesFor(path, mode, committed)
      return { path, status, classification: semanticClass, sourceOwnership: sourceOwnership(path), size: bytes.length, sha256: sha256(bytes) }
    })
  const candidatePaths = new Set(candidateEntries.map(({ path }) => path))
  const explicitlyExcluded = new Set(profile.excludedPreChangePaths)
  const prechangeEntries = prechange.entries.map(entry => {
    const included = candidatePaths.has(entry.path)
    if (!included && !explicitlyExcluded.has(entry.path)) throw new Error(`RC01_UNCLASSIFIED_EXCLUSION:${entry.path}`)
    if (included && explicitlyExcluded.has(entry.path)) throw new Error(`RC01_EXCLUDED_PATH_STAGED:${entry.path}`)
    return {
      path: entry.path,
      originalState: entry.state,
      size: entry.size,
      sha256: entry.sha256,
      classification: entry.classification,
      disposition: included ? 'INCLUDED' : 'EXCLUDED_PRESERVED_ORIGINAL_WORKTREE',
    }
  })
  for (const path of explicitlyExcluded) {
    if (!prechangeEntries.some(entry => entry.path === path)) throw new Error(`RC01_EXCLUSION_NOT_IN_PRECHANGE_INVENTORY:${path}`)
  }
  const subjectTreeDigest = sha256(json(candidateEntries))
  const inventory = {
    kind: 'conexus.rc01-candidate-inventory/v1',
    baseCommit: profile.baseCommit,
    preChangeHead: profile.preChangeHead,
    subjectTreeDigest,
    summary: {
      candidatePathCount: candidateEntries.length,
      candidateClassCounts: countBy(candidateEntries, 'classification'),
      preChangePathCount: prechangeEntries.length,
      includedPreChangePathCount: prechangeEntries.filter(entry => entry.disposition === 'INCLUDED').length,
      excludedPreservedPathCount: prechangeEntries.filter(entry => entry.disposition !== 'INCLUDED').length,
    },
    candidateEntries,
    prechangeEntries,
  }
  const manifestEntries = candidateEntries
    .filter(entry => entry.status !== 'D')
    .map(entry => ({ class: entry.sourceOwnership, outputDigest: entry.sha256, path: entry.path, size: entry.size }))
  const manifest = {
    kind: 'conexus.rc01-ownership-manifest/v1',
    baseCommit: profile.baseCommit,
    subjectTreeDigest,
    classCounts: countBy(manifestEntries, 'class'),
    entries: manifestEntries,
  }
  const inventoryBytes = json(inventory)
  const manifestBytes = json(manifest)
  const receipt = {
    kind: 'conexus.rc01-generation-receipt/v1',
    verdict: 'CANDIDATE_REPRODUCIBLE',
    baseCommit: profile.baseCommit,
    preChangeHead: profile.preChangeHead,
    subjectTreeDigest,
    candidateInventoryDigest: sha256(inventoryBytes),
    ownershipManifestDigest: sha256(manifestBytes),
    ownershipClassCounts: manifest.classCounts,
    operationsCensus: profile.operations,
    rbC0Frozen: true,
    laterTranchesStarted: [],
    appOwnedMutations: manifest.classCounts['APP-OWNED'] ?? 0,
    generatedOutputs: manifestEntries.filter(entry => entry.class === 'GENERATED'),
    noParallelDtoEvidence: [
      'canonical Product OpenAPI remains the wire authority',
      'generated R1 route/client projections are reproduced by admitted generators',
      'tests/repository/import-law.test.mjs forbids generated-to-owner and owner-to-owner drift',
      'scripts/check-project-operation-declarations.mjs preserves the exact 13-operation projection',
    ],
    externalProofNotClaimed: ['provider', 'Keycloak', 'Sankhya', 'E2B'],
    outputIdentities: {
      candidateInventory: { path: profile.candidateInventory, sha256: sha256(inventoryBytes) },
      ownershipManifest: { path: profile.ownershipManifest, sha256: sha256(manifestBytes) },
    },
  }
  return new Map([
    [profile.candidateInventory, inventoryBytes],
    [profile.ownershipManifest, manifestBytes],
    [profile.generationReceipt, json(receipt)],
  ])
}

function writeOutputs(outputs) {
  for (const [path, bytes] of outputs) {
    const absolute = resolve(root, path)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, bytes)
  }
}

function checkOutputs(outputs) {
  for (const [path, expected] of outputs) {
    const absolute = resolve(root, path)
    if (!existsSync(absolute)) throw new Error(`RC01_OUTPUT_MISSING:${path}`)
    const actual = readFileSync(absolute, 'utf8')
    if (actual !== expected) throw new Error(`RC01_OUTPUT_DRIFT:${path}`)
  }
}

const check = process.argv.includes('--check')
const mode = process.argv.includes('--index') ? 'index' : 'commit'
const outputs = build(mode)
if (check) checkOutputs(outputs)
else writeOutputs(outputs)
console.log(`RC01 custody ${check ? 'check' : 'record'} passed (${mode}; outputs=${outputs.size}).`)
