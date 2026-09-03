import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateBuildMetadata } from '../qualification/4d/r1-git-source-custody/build-metadata.mjs'
import { buildReviewPrompt } from './conexus-review.mjs'

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const defaultManifestPath = resolve(
  repositoryRoot,
  'docs/evidence/4d/4d-r1-foundation-pin-manifest-r1c14-native-successor.json',
)
export const receiptRepositoryPathForManifest = (manifest) => `${dirname(manifest.evidence.resultPath)}/generation-receipt.json`
export const defaultReceiptRepositoryPath = receiptRepositoryPathForManifest(JSON.parse(readFileSync(defaultManifestPath, 'utf8')))
export const defaultReceiptPath = resolve(repositoryRoot, defaultReceiptRepositoryPath)

export const requiredRepositoryCustodyPaths = Object.freeze([
  '.github/workflows/verify.yml',
  'docs/index.md',
  'docs/roadmap.md',
  'package.json',
  'tests/repository/import-law.test.mjs',
])

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const fail = (code, detail = '') => { throw new Error(`${code}${detail ? `:${detail}` : ''}`) }

const repositoryFile = (root, repositoryPath) => {
  if (typeof repositoryPath !== 'string' || !repositoryPath || repositoryPath.includes('\\')) {
    fail('R1C14_NATIVE_PATH_REFUSED', String(repositoryPath))
  }
  const absolute = resolve(root, repositoryPath)
  const remainder = relative(root, absolute)
  if (remainder === '..' || remainder.startsWith('../') || resolve(root, remainder) !== absolute) {
    fail('R1C14_NATIVE_PATH_REFUSED', repositoryPath)
  }
  const stat = lstatSync(absolute)
  if (!stat.isFile() || stat.isSymbolicLink()) fail('R1C14_NATIVE_FILE_REFUSED', repositoryPath)
  if (realpathSync(absolute) !== absolute) fail('R1C14_NATIVE_FILE_REFUSED', repositoryPath)
  return absolute
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const digestAt = (root, path) => sha256(readFileSync(repositoryFile(root, path)))
export const assertRepositoryDigest = (root, path, expected) => {
  const actual = digestAt(root, path)
  if (actual !== expected) fail('R1C14_NATIVE_DIGEST_MISMATCH', `${path}:${expected}:${actual}`)
}
const same = (actual, expected, code) => {
  if (actual !== expected) fail(code, `${JSON.stringify(expected)}:${JSON.stringify(actual)}`)
}
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  }
  return value
}
const sameJson = (actual, expected, code) => same(JSON.stringify(canonical(actual)), JSON.stringify(canonical(expected)), code)

const reviewLaneRequirements = Object.freeze({
  opus: Object.freeze({ executable: 'claude', model: 'opus', effort: 'xhigh', mode: 'plan' }),
  gemini: Object.freeze({ executable: 'agy', model: 'gemini-3.1-pro-high', effort: 'high', mode: 'plan' }),
})

const protectedClaims = Object.freeze([
  'EXACT_OCI_IDENTITY_NO_SUBSTITUTION',
  'FALSE_PASS_RESISTANCE',
  'QUALIFICATION_RUN_PRODUCT_DELTA',
  'SECRET_NON_DISCLOSURE',
  'HISTORICAL_EVIDENCE_PRESERVATION',
  'DECIDING_REVIEW_INTEGRITY',
])

const blockerCensus = Object.freeze([
  'EXACT_IDENTITY_SUBSTITUTION',
  'FALSE_PASS_ROUTE',
  'QUALIFICATION_RUN_PRODUCT_DELTA_FALSE',
  'SECRET_DISCLOSURE',
  'HISTORICAL_EVIDENCE_LOSS_OR_FALSE_CURRENT_AUTHORITY',
  'DECIDING_REVIEW_INTEGRITY_FAILURE',
])

const expectedReviewArgs = (lane, prompt) => lane === 'opus'
  ? [
      '-p', prompt,
      '--model', 'opus',
      '--effort', 'xhigh',
      '--permission-mode', 'plan',
      '--disallowed-tools', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit',
      '--output-format', 'json',
    ]
  : [
      '-p', prompt,
      '--model', 'gemini-3.1-pro-high',
      '--effort', 'high',
      '--mode', 'plan',
      '--sandbox',
      '--output-format', 'json',
    ]

export const verifyIndependentReviewLanes = ({ root, lanes, brief, briefSha256, candidateResultPath, candidateResultSha256 }) => {
  if (!Array.isArray(lanes) || lanes.length !== 2) fail('R1C14_NATIVE_REVIEW_LANE_CENSUS')
  const seen = new Set()
  for (const lane of lanes) {
    const required = reviewLaneRequirements[lane?.lane]
    if (!required || seen.has(lane.lane)) fail('R1C14_NATIVE_REVIEW_LANE_IDENTITY', JSON.stringify(lane))
    seen.add(lane.lane)
    for (const [key, expected] of Object.entries(required)) same(lane[key], expected, 'R1C14_NATIVE_REVIEW_LANE_SHAPE')
    if (
      lane.readOnly !== true ||
      typeof lane.cliVersion !== 'string' ||
      !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(lane.cliVersion) ||
      typeof lane.sessionOrConversation !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(lane.sessionOrConversation) ||
      typeof lane.reviewerOutputPath !== 'string' ||
      !/^[a-f0-9]{64}$/.test(lane.reviewerOutputSha256 ?? '') ||
      typeof lane.rawVerdict !== 'string' ||
      !lane.rawVerdict.trim()
    ) fail('R1C14_NATIVE_REVIEW_LANE_SHAPE', JSON.stringify(lane))
    if (lane.lane === 'gemini' && lane.sandbox !== true) fail('R1C14_NATIVE_REVIEW_LANE_SANDBOX')
    same(dirname(lane.reviewerOutputPath), `${dirname(candidateResultPath)}/review`, 'R1C14_NATIVE_REVIEW_OUTPUT_DIRECTORY')
    assertRepositoryDigest(root, lane.reviewerOutputPath, lane.reviewerOutputSha256)
    const wrapper = readJson(repositoryFile(root, lane.reviewerOutputPath))
    same(wrapper.schema, 'conexus.review-run/v1', 'R1C14_NATIVE_REVIEW_OUTPUT_SCHEMA')
    if (typeof wrapper.repositoryRoot !== 'string' || !isAbsolute(wrapper.repositoryRoot)) {
      fail('R1C14_NATIVE_REVIEW_OUTPUT_ROOT', JSON.stringify(wrapper.repositoryRoot))
    }
    same(wrapper.brief, brief, 'R1C14_NATIVE_REVIEW_OUTPUT_BRIEF')
    same(wrapper.briefSha256, briefSha256, 'R1C14_NATIVE_REVIEW_OUTPUT_BRIEF_DIGEST')
    same(wrapper.candidateResult, candidateResultPath, 'R1C14_NATIVE_REVIEW_OUTPUT_RESULT')
    same(wrapper.candidateResultSha256, candidateResultSha256, 'R1C14_NATIVE_REVIEW_OUTPUT_RESULT_DIGEST')
    same(wrapper.lane, lane.lane, 'R1C14_NATIVE_REVIEW_OUTPUT_LANE')
    same(wrapper.mode, 'execute', 'R1C14_NATIVE_REVIEW_OUTPUT_MODE')
    same(wrapper.dryRun, false, 'R1C14_NATIVE_REVIEW_OUTPUT_MODE')
    if (!Array.isArray(wrapper.lanes) || wrapper.lanes.length !== 1) fail('R1C14_NATIVE_REVIEW_OUTPUT_CENSUS')
    const rawLane = wrapper.lanes[0]
    for (const key of ['lane', 'executable', 'model', 'effort', 'mode']) {
      same(rawLane[key], lane[key], 'R1C14_NATIVE_REVIEW_OUTPUT_IDENTITY')
    }
    same(rawLane.sessionOrConversation, lane.sessionOrConversation, 'R1C14_NATIVE_REVIEW_OUTPUT_SESSION')
    same(rawLane.version, lane.cliVersion, 'R1C14_NATIVE_REVIEW_OUTPUT_VERSION')
    same(rawLane.verdictRaw, lane.rawVerdict, 'R1C14_NATIVE_REVIEW_OUTPUT_VERDICT')
    same(rawLane.exitCode, 0, 'R1C14_NATIVE_REVIEW_OUTPUT_EXIT')
    same(rawLane.signal, null, 'R1C14_NATIVE_REVIEW_OUTPUT_SIGNAL')
    if (typeof rawLane.verdictRaw !== 'string' || !rawLane.verdictRaw.trim()) {
      fail('R1C14_NATIVE_REVIEW_OUTPUT_VERDICT_EMPTY', lane.lane)
    }
    if (!Array.isArray(rawLane.args)) fail('R1C14_NATIVE_REVIEW_OUTPUT_ARGUMENTS')
    const expectedPrompt = buildReviewPrompt({ repositoryRoot: wrapper.repositoryRoot, briefRelative: brief })
    const expectedArgs = expectedReviewArgs(lane.lane, expectedPrompt)
    same(JSON.stringify(rawLane.args), JSON.stringify(expectedArgs), 'R1C14_NATIVE_REVIEW_OUTPUT_READ_ONLY')
    if (lane.lane === 'gemini') {
      if (typeof lane.supportingArtifactPath !== 'string' || !/^[a-f0-9]{64}$/.test(lane.supportingArtifactSha256 ?? '')) {
        fail('R1C14_NATIVE_REVIEW_SUPPORTING_ARTIFACT', JSON.stringify(lane))
      }
      same(dirname(lane.supportingArtifactPath), dirname(lane.reviewerOutputPath), 'R1C14_NATIVE_REVIEW_SUPPORTING_ARTIFACT_DIRECTORY')
      assertRepositoryDigest(root, lane.supportingArtifactPath, lane.supportingArtifactSha256)
    }
  }
  same(JSON.stringify([...seen].sort()), JSON.stringify(Object.keys(reviewLaneRequirements).sort()), 'R1C14_NATIVE_REVIEW_LANE_CENSUS')
  return seen
}

export const verifyRepositoryCustody = ({ root, entries, verifyCurrent = true }) => {
  if (!Array.isArray(entries) || entries.length === 0) fail('R1C14_NATIVE_CUSTODY_EMPTY')
  const seen = new Set()
  for (const entry of entries) {
    if (entry?.class !== 'PLATFORM-CONTRACT' || typeof entry.path !== 'string' || !/^[a-f0-9]{64}$/.test(entry.outputDigest ?? '')) {
      fail('R1C14_NATIVE_CUSTODY_ENTRY_REFUSED', JSON.stringify(entry))
    }
    if (seen.has(entry.path)) fail('R1C14_NATIVE_CUSTODY_DUPLICATE', entry.path)
    seen.add(entry.path)
    if (verifyCurrent) assertRepositoryDigest(root, entry.path, entry.outputDigest)
  }
  for (const path of requiredRepositoryCustodyPaths) {
    if (!seen.has(path)) fail('R1C14_NATIVE_CUSTODY_REQUIRED_PATH_MISSING', path)
  }
  return seen
}

export const verifyDeclaredTransitions = ({ priorEntries, custodyEntries, transitions }) => {
  if (!Array.isArray(priorEntries) || !Array.isArray(custodyEntries) || !Array.isArray(transitions)) {
    fail('R1C14_NATIVE_TRANSITIONS_REFUSED')
  }
  const prior = new Map(priorEntries.map((entry) => [entry.path, entry]))
  const current = new Map(custodyEntries.map((entry) => [entry.path, entry]))
  const expected = new Set()
  for (const entry of priorEntries) {
    if (entry?.class !== 'PLATFORM-CONTRACT') continue
    const currentEntry = current.get(entry.path)
    if (!currentEntry) fail('R1C14_NATIVE_INHERITED_CUSTODY_MISSING', entry.path)
    if (currentEntry.class !== 'PLATFORM-CONTRACT') fail('R1C14_NATIVE_INHERITED_CUSTODY_CLASS', entry.path)
    if (currentEntry.outputDigest !== entry.outputDigest) expected.add(entry.path)
  }
  const seen = new Set()
  for (const transition of transitions) {
    if (
      transition?.class !== 'PLATFORM-CONTRACT' ||
      typeof transition.path !== 'string' ||
      !/^[a-f0-9]{64}$/.test(transition.priorDigest ?? '') ||
      !/^[a-f0-9]{64}$/.test(transition.outputDigest ?? '') ||
      typeof transition.reason !== 'string' ||
      !transition.reason
    ) fail('R1C14_NATIVE_TRANSITION_ENTRY_REFUSED', JSON.stringify(transition))
    if (seen.has(transition.path)) fail('R1C14_NATIVE_TRANSITION_DUPLICATE', transition.path)
    seen.add(transition.path)
    same(prior.get(transition.path)?.outputDigest, transition.priorDigest, 'R1C14_NATIVE_TRANSITION_PRIOR')
    same(current.get(transition.path)?.outputDigest, transition.outputDigest, 'R1C14_NATIVE_TRANSITION_OUTPUT')
  }
  same(JSON.stringify([...seen].sort()), JSON.stringify([...expected].sort()), 'R1C14_NATIVE_TRANSITION_CENSUS')
}

export const verifyHistoricalEvidence = ({ root, manifest, predecessor }) => {
  const historical = manifest.historicalEvidence
  if (!historical || typeof historical !== 'object') fail('R1C14_NATIVE_HISTORICAL_EVIDENCE_MISSING')
  const expected = [
    ['generationReceipt', 'qualification/4d/r1-git-source-custody/evidence/generation-receipt.json', historical.generationReceipt?.sha256],
  ]
  for (const [key, path, digest] of expected) {
    same(historical[key]?.path, path, 'R1C14_NATIVE_HISTORICAL_EVIDENCE_PATH')
    same(historical[key]?.sha256, digest, 'R1C14_NATIVE_HISTORICAL_EVIDENCE_IDENTITY')
    if (!/^[a-f0-9]{64}$/.test(digest ?? '')) fail('R1C14_NATIVE_HISTORICAL_EVIDENCE_DIGEST', key)
    assertRepositoryDigest(root, path, digest)
  }
  assertRepositoryDigest(root, predecessor.evidence.resultPath, predecessor.evidence.resultSha256)
  assertRepositoryDigest(root, `${dirname(predecessor.evidence.resultPath)}/build-metadata.json`, predecessor.image.buildMetadataSha256)
  const receipt = readJson(repositoryFile(root, historical.generationReceipt.path))
  same(receipt.kind, 'conexus.r1c14.git-source-custody-generation-receipt/v1', 'R1C14_NATIVE_HISTORICAL_RECEIPT_KIND')
  same(receipt.gate, 'R1C-14 GIT_SOURCE_CUSTODY', 'R1C14_NATIVE_HISTORICAL_RECEIPT_GATE')
  same(receipt.verdict, 'PASS', 'R1C14_NATIVE_HISTORICAL_RECEIPT_VERDICT')
  same(receipt.outputs?.resultSha256, predecessor.evidence.resultSha256, 'R1C14_NATIVE_HISTORICAL_RECEIPT_RESULT')
  same(receipt.outputs?.buildMetadataSha256, predecessor.image.buildMetadataSha256, 'R1C14_NATIVE_HISTORICAL_RECEIPT_METADATA')
  same(receipt.outputs?.pinManifestSuccessorSha256, manifest.predecessor.sha256, 'R1C14_NATIVE_HISTORICAL_RECEIPT_SUCCESSOR')
}

export const verifyReviewAdjudication = (adjudication) => {
  if (!Array.isArray(adjudication.findings)) fail('R1C14_NATIVE_REVIEW_ADJUDICATION_FINDINGS')
  const seen = new Set()
  let unresolvedMaterialFindings = 0
  for (const finding of adjudication.findings) {
    if (
      typeof finding?.id !== 'string' || !finding.id || seen.has(finding.id) ||
      typeof finding.material !== 'boolean' ||
      !['CORRECTED', 'NO_FINDING', 'DEFER_SAFE'].includes(finding.disposition)
    ) fail('R1C14_NATIVE_REVIEW_ADJUDICATION_FINDING_SHAPE', JSON.stringify(finding))
    seen.add(finding.id)
    if (finding.disposition === 'NO_FINDING' && finding.material) {
      fail('R1C14_NATIVE_REVIEW_ADJUDICATION_NO_FINDING_MATERIAL', finding.id)
    }
    if (finding.disposition === 'CORRECTED' && (!Array.isArray(finding.correctionEvidence) || finding.correctionEvidence.length === 0)) {
      fail('R1C14_NATIVE_REVIEW_ADJUDICATION_CORRECTION_EVIDENCE', finding.id)
    }
    if (finding.disposition === 'DEFER_SAFE') {
      for (const key of ['whySafe', 'revisitTrigger', 'laterOwner']) {
        if (typeof finding[key] !== 'string' || !finding[key].trim()) fail('R1C14_NATIVE_REVIEW_ADJUDICATION_DEFER', `${finding.id}:${key}`)
      }
    }
    if (finding.material && !['CORRECTED', 'DEFER_SAFE'].includes(finding.disposition)) unresolvedMaterialFindings += 1
  }
  same(adjudication.unresolvedMaterialFindings, unresolvedMaterialFindings, 'R1C14_NATIVE_REVIEW_ADJUDICATION_UNRESOLVED')
  return unresolvedMaterialFindings
}

export const verifySupersessionChain = ({ root, currentEvidenceDirectory, currentResultSha256, currentCandidateSha256, entryPath }) => {
  const qualificationPrefix = 'qualification/4d/r1-git-source-custody/'
  const evidenceRoot = resolve(root, `${qualificationPrefix}evidence`)
  if (!currentEvidenceDirectory.startsWith('evidence/native-readmission-linux-')) {
    fail('R1C14_NATIVE_SUPERSESSION_CURRENT_REFUSED', currentEvidenceDirectory)
  }
  let recordPath = entryPath
  let expectedSuccessor = {
    evidenceDirectory: currentEvidenceDirectory,
    resultSha256: currentResultSha256,
    candidateSha256: currentCandidateSha256,
  }
  const seenDirectories = new Map()
  const seenRecords = new Set()
  while (recordPath) {
    if (seenRecords.has(recordPath)) fail('R1C14_NATIVE_SUPERSESSION_CYCLE', recordPath)
    seenRecords.add(recordPath)
    const record = readJson(repositoryFile(root, recordPath))
    same(record.kind, 'conexus.r1c14.native-readmission-supersession/v1', 'R1C14_NATIVE_SUPERSESSION_KIND')
    same(record.disposition, 'SUPERSEDED_NOT_AUTHORITY', 'R1C14_NATIVE_SUPERSESSION_DISPOSITION')
    same(record.successor?.evidenceDirectory, expectedSuccessor.evidenceDirectory, 'R1C14_NATIVE_SUPERSESSION_SUCCESSOR_DIRECTORY')
    same(record.successor?.resultSha256, expectedSuccessor.resultSha256, 'R1C14_NATIVE_SUPERSESSION_SUCCESSOR_RESULT')
    same(record.successor?.candidateSha256, expectedSuccessor.candidateSha256, 'R1C14_NATIVE_SUPERSESSION_SUCCESSOR_CANDIDATE')
    const superseded = record.superseded
    if (
      typeof superseded?.evidenceDirectory !== 'string' ||
      !/^evidence\/native-readmission-linux-[0-9-]+-v\d+$/.test(superseded.evidenceDirectory) ||
      !/^[a-f0-9]{64}$/.test(superseded.resultSha256 ?? '') ||
      !/^[a-f0-9]{64}$/.test(superseded.candidateSha256 ?? '') ||
      typeof superseded.retained !== 'boolean' ||
      seenDirectories.has(superseded.evidenceDirectory)
    ) fail('R1C14_NATIVE_SUPERSESSION_ENTRY_REFUSED', JSON.stringify(superseded))
    seenDirectories.set(superseded.evidenceDirectory, superseded.retained)
    const supersededAbsolute = resolve(root, `${qualificationPrefix}${superseded.evidenceDirectory}`)
    if (superseded.retained) {
      if (!existsSync(supersededAbsolute) || !lstatSync(supersededAbsolute).isDirectory()) fail('R1C14_NATIVE_SUPERSESSION_RETAINED_MISSING', superseded.evidenceDirectory)
      assertRepositoryDigest(root, `${qualificationPrefix}${superseded.evidenceDirectory}/results.json`, superseded.resultSha256)
      assertRepositoryDigest(root, `${qualificationPrefix}${superseded.evidenceDirectory}/candidate-results.json`, superseded.candidateSha256)
    } else if (existsSync(supersededAbsolute)) {
      fail('R1C14_NATIVE_SUPERSESSION_REMOVED_PRESENT', superseded.evidenceDirectory)
    }
    expectedSuccessor = superseded
    if (record.predecessorSupersession) {
      const predecessorPath = `${qualificationPrefix}${record.predecessorSupersession.path}`
      assertRepositoryDigest(root, predecessorPath, record.predecessorSupersession.sha256)
      recordPath = predecessorPath
    } else {
      recordPath = null
    }
  }
  const currentDirectoryName = currentEvidenceDirectory.slice('evidence/'.length)
  for (const entry of readdirSync(evidenceRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && /^native-readmission-linux-[0-9-]+-v\d+\.tmp-/.test(entry.name)) {
      fail('R1C14_NATIVE_SUPERSESSION_PARTIAL_DIRECTORY', `evidence/${entry.name}`)
    }
    if (!entry.isDirectory() || !/^native-readmission-linux-[0-9-]+-v\d+$/.test(entry.name) || entry.name === currentDirectoryName) continue
    const evidenceDirectory = `evidence/${entry.name}`
    if (seenDirectories.get(evidenceDirectory) !== true) fail('R1C14_NATIVE_SUPERSESSION_ORPHAN', evidenceDirectory)
  }
}

const observedProtocolDocumentation = new Set([
  'README.md',
  'review-brief.md',
  'evidence/superseded-protocol/README.md',
])

export function verifyNativeReadmission({
  root = repositoryRoot,
  manifestPath = defaultManifestPath,
  receiptPathOverride = null,
  requireReceipt = true,
} = {}) {
  const canonicalRoot = realpathSync(root)
  const manifest = readJson(manifestPath)
  same(manifest.kind, 'conexus.r1-a0-foundation-pin-manifest/v3', 'R1C14_NATIVE_MANIFEST_KIND')
  same(manifest.admittedGate, 'R1C-14 GIT_SOURCE_CUSTODY NATIVE_READMISSION', 'R1C14_NATIVE_GATE')
  if (!['CANDIDATE', 'PASS'].includes(manifest.verdict)) fail('R1C14_NATIVE_MANIFEST_VERDICT')

  assertRepositoryDigest(canonicalRoot, manifest.predecessor.path, manifest.predecessor.sha256)
  const predecessor = readJson(repositoryFile(canonicalRoot, manifest.predecessor.path))
  verifyHistoricalEvidence({ root: canonicalRoot, manifest, predecessor })
  const evidencePairs = [
    ['resultPath', 'resultSha256'],
    ['admissionTestPath', 'admissionTestSha256'],
    ['pinInputPath', 'pinInputSha256'],
    ['negativeControlPath', 'negativeControlSha256'],
    ['supersededControlPath', 'supersededControlSha256'],
    ['supersededCandidatePath', 'supersededCandidateSha256'],
  ]
  for (const [pathKey, digestKey] of evidencePairs) {
    assertRepositoryDigest(canonicalRoot, manifest.evidence[pathKey], manifest.evidence[digestKey])
  }

  const result = readJson(repositoryFile(canonicalRoot, manifest.evidence.resultPath))
  const pin = readJson(repositoryFile(canonicalRoot, manifest.evidence.pinInputPath))
  const negative = readJson(repositoryFile(canonicalRoot, manifest.evidence.negativeControlPath))
  const metadata = readJson(repositoryFile(canonicalRoot, `${dirname(manifest.evidence.resultPath)}/build-metadata.json`))
  assertRepositoryDigest(canonicalRoot, `${dirname(manifest.evidence.resultPath)}/build-metadata.json`, manifest.image.buildMetadataSha256)
  assertRepositoryDigest(canonicalRoot, manifest.review.brief, manifest.review.briefSha256)
  same(JSON.stringify(manifest.review.protectedClaims), JSON.stringify(protectedClaims), 'R1C14_NATIVE_PROTECTED_CLAIMS')
  same(JSON.stringify(manifest.review.blockerCensus), JSON.stringify(blockerCensus), 'R1C14_NATIVE_BLOCKER_CENSUS')
  same(manifest.review.otherFindingsDisposition, 'DEFER_SAFELY', 'R1C14_NATIVE_OTHER_FINDINGS')
  assertRepositoryDigest(canonicalRoot, 'runtime/r1/.conexus/s2-generation-receipt.json', pin.predecessors.s2GenerationReceiptSha256)
  assertRepositoryDigest(canonicalRoot, 'runtime/r1/.conexus/s2-ownership-manifest.json', pin.predecessors.s2OwnershipManifestSha256)

  same(result.verdict, 'PASS', 'R1C14_NATIVE_RESULT_VERDICT')
  same(result.productDelta, 0, 'R1C14_NATIVE_PRODUCT_DELTA')
  same(manifest.productDeltaSemantics, 'QUALIFICATION_RUN_WINDOW_NOT_STANDING_GATE', 'R1C14_NATIVE_PRODUCT_DELTA_SCOPE')
  same(result.checks.length, 17, 'R1C14_NATIVE_CHECK_COUNT')
  const expectedIds = [...manifest.evidence.expectedCheckIds].sort()
  const actualIds = result.checks.map(({ id }) => id).sort()
  same(JSON.stringify(actualIds), JSON.stringify(expectedIds), 'R1C14_NATIVE_CHECK_CENSUS')
  same(result.finalization.preCensusSha256, result.finalization.postCensusSha256, 'R1C14_NATIVE_CENSUS_DELTA')
  same(result.productCensusSha256, manifest.evidence.productCensusSha256, 'R1C14_NATIVE_CENSUS_IDENTITY')
  same(result.secretScan.contaminatedFileCount, 0, 'R1C14_NATIVE_SECRET_CONTAMINATION')
  if (Object.values(result.cleanup).some((value) => value !== true)) fail('R1C14_NATIVE_CLEANUP')

  same(result.provenance.imageIndexDigest, manifest.image.ociIndexDigest, 'R1C14_NATIVE_IMAGE_INDEX')
  same(result.provenance.imageIndexDigest, pin.image.ociIndexDigest, 'R1C14_NATIVE_PIN_INDEX')
  same(manifest.image.linuxAmd64ManifestDigest, pin.image.linuxAmd64ManifestDigest, 'R1C14_NATIVE_PIN_PLATFORM_MANIFEST')
  same(manifest.image.buildMetadataSha256, pin.image.buildMetadataSha256, 'R1C14_NATIVE_PIN_METADATA')
  same(
    manifest.image.buildInvocation,
    `BUILDX_GIT_INFO=0 BUILDX_METADATA_PROVENANCE=max docker buildx build --platform linux/amd64 --provenance=mode=max --metadata-file /home/leandrotheodoro/conexus-r1c14-native-readmission/build-metadata-v3.json --load --tag ${manifest.image.tag} qualification/4d/r1-git-source-custody`,
    'R1C14_NATIVE_BUILD_INVOCATION',
  )
  same(manifest.image.rootfsClosureSha256, pin.image.rootfsClosureSha256, 'R1C14_NATIVE_PIN_ROOTFS')
  same(manifest.image.dependencyClosureSha256, pin.image.dependencyClosureSha256, 'R1C14_NATIVE_PIN_DEPENDENCIES')
  same(JSON.stringify(result.provenance.rootfsLayers), JSON.stringify(pin.image.rootfsLayers), 'R1C14_NATIVE_PIN_ROOTFS_LAYERS')
  same(manifest.git.executableSha256, pin.git.executableSha256, 'R1C14_NATIVE_PIN_GIT_EXECUTABLE')
  same(result.provenance.hostRuntime.node, pin.hostRuntime.node, 'R1C14_NATIVE_PIN_HOST_NODE')
  same(result.predecessors.s2GenerationReceiptSha256, pin.predecessors.s2GenerationReceiptSha256, 'R1C14_NATIVE_PIN_S2_RECEIPT')
  same(result.predecessors.s2OwnershipManifestSha256, pin.predecessors.s2OwnershipManifestSha256, 'R1C14_NATIVE_PIN_S2_MANIFEST')
  same(result.provenance.linuxAmd64ManifestDigest, manifest.image.linuxAmd64ManifestDigest, 'R1C14_NATIVE_PLATFORM_MANIFEST')
  same(result.provenance.rootfsClosureSha256, manifest.image.rootfsClosureSha256, 'R1C14_NATIVE_ROOTFS')
  same(result.provenance.dependencyClosureSha256, manifest.image.dependencyClosureSha256, 'R1C14_NATIVE_DEPENDENCIES')
  same(result.provenance.executable.sha256, manifest.git.executableSha256, 'R1C14_NATIVE_GIT_EXECUTABLE')
  same(result.provenance.buildMetadataSha256, manifest.image.buildMetadataSha256, 'R1C14_NATIVE_METADATA')
  same(result.provenance.admissionTestSha256, manifest.evidence.admissionTestSha256, 'R1C14_NATIVE_ADMISSION_TEST')
  const attestedBuild = validateBuildMetadata({
    metadata,
    dockerfileBytes: readFileSync(repositoryFile(canonicalRoot, 'qualification/4d/r1-git-source-custody/Dockerfile')),
    expectedImageIndex: manifest.image.ociIndexDigest,
  })
  same(attestedBuild.dockerfileSha256, result.provenance.buildRecipeSha256, 'R1C14_NATIVE_RECIPE_ATTESTATION')
  same(attestedBuild.archiveSha256, result.provenance.source.archiveSha256, 'R1C14_NATIVE_ARCHIVE_ATTESTATION')
  same(attestedBuild.signatureSha256, result.provenance.source.signatureSha256, 'R1C14_NATIVE_SIGNATURE_ATTESTATION')
  same(attestedBuild.releaseKeySha256, result.provenance.source.releaseKeySha256, 'R1C14_NATIVE_RELEASE_KEY_ATTESTATION')
  same(result.provenance.source.recordedPrimaryKeyFingerprint, manifest.git.source.recordedPrimaryKeyFingerprint, 'R1C14_NATIVE_RECORDED_PRIMARY_KEY')
  same(result.provenance.source.recordedSigningSubkeyFingerprint, manifest.git.source.recordedSigningSubkeyFingerprint, 'R1C14_NATIVE_RECORDED_SIGNING_SUBKEY')

  same(manifest.imageIdentityRoles.bindingExecutionIdentity, 'image.ociIndexDigest', 'R1C14_NATIVE_BINDING_ROLE')
  for (const forbidden of [
    'image.linuxAmd64ManifestDigest',
    'host Git',
    'sha256:a75b3631df2a6e6bcdf94e4ee511bb81ddbab3f21b391badae9598f3bae1b9d7',
    'sha256:4b52df3b20e6c4654bb8cf4270fbe911cc3b0e8bc738a54fa325496b24e2854a',
    'sha256:44ad647a10c0a9659e3cfebb28e6b384ac8af15ac53fc2d0cd662cd30d7817b0',
  ]) {
    if (!manifest.imageIdentityRoles.forbiddenForS3Binding.includes(forbidden)) fail('R1C14_NATIVE_FORBIDDEN_BINDING', forbidden)
  }

  same(negative.verdict, 'REJECTED', 'R1C14_NATIVE_NEGATIVE_VERDICT')
  same(negative.rejectionBasis, 'OPERATOR_METADATA_INSPECTION', 'R1C14_NATIVE_NEGATIVE_BASIS')
  same(negative.automatedRefusalPrecedence, 'R1C14_METADATA_PIN_MISMATCH', 'R1C14_NATIVE_NEGATIVE_PRECEDENCE')
  same(negative.latentAutomatedControl, 'R1C14_METADATA_FALSE_VCS_IDENTITY', 'R1C14_NATIVE_NEGATIVE_CONTROL')

  for (const [path, expected] of Object.entries(result.protocolDigests)) {
    const repositoryPath = `qualification/4d/r1-git-source-custody/${path}`
    if (observedProtocolDocumentation.has(path)) {
      repositoryFile(canonicalRoot, repositoryPath)
    } else {
      assertRepositoryDigest(canonicalRoot, repositoryPath, expected)
    }
  }
  same(
    JSON.stringify([...observedProtocolDocumentation].sort()),
    JSON.stringify([...manifest.protocolIdentityRoles.existenceOnly].sort()),
    'R1C14_NATIVE_PROTOCOL_OBSERVATION_ROLES',
  )
  same(result.protocolDigests['evidence/superseded-protocol/probe-2026-08-31.mjs'], 'b17815cbf0fbf56ac23ed28258eb0752d1007a6cf97360cc99b4c9cdd92ecb29', 'R1C14_NATIVE_HISTORICAL_PROBE')
  same(result.protocolDigests['evidence/superseded-protocol/run-2026-08-31.ps1'], '3ed7be64cf2321129d42d5d6d171326442e7ade061020ac1cc563535090fd18a', 'R1C14_NATIVE_HISTORICAL_RUNNER')
  same(result.protocolDigests['evidence/superseded-protocol/finalize-result-2026-08-31.mjs'], '1e027acdfa30dde491b4b90711244bf418a9ad87ac6b45ea75bd66b948a363d5', 'R1C14_NATIVE_HISTORICAL_FINALIZER')
  same(result.protocolDigests['evidence/superseded-protocol/product-census-2026-08-31.mjs'], 'df65aaecd78e1a26e9467a7dd4ac6f73533bfbe873cc6262998594b0ba7fd845', 'R1C14_NATIVE_HISTORICAL_PRODUCT_CENSUS')
  same(result.protocolDigests['evidence/superseded-protocol/admission-2026-08-31.mjs'], '4471f25787e1ecdfb59fd88e6f08eabc3c55b2e0837ac8d465109d773613e126', 'R1C14_NATIVE_HISTORICAL_ADMISSION')
  same(result.protocolDigests['evidence/superseded-protocol/admission.test-2026-08-31.mjs'], '665d64734a1f08b6e5e04aa37e1b166762f27bf67592ba2e025bd8f6dddb6556', 'R1C14_NATIVE_HISTORICAL_ADMISSION_TEST')
  same(result.protocolDigests['evidence/superseded-protocol/https-fixture-2026-08-31.mjs'], '6173886d58e5451b2242babd7592ef332ed71b6cff395b21edc1e041ef5c22ee', 'R1C14_NATIVE_HISTORICAL_HTTPS_FIXTURE')
  const currentEvidenceDirectory = dirname(manifest.evidence.resultPath).slice('qualification/4d/r1-git-source-custody/'.length)
  verifySupersessionChain({
    root: canonicalRoot,
    currentEvidenceDirectory,
    currentResultSha256: manifest.evidence.resultSha256,
    currentCandidateSha256: result.finalization.candidateSha256,
    entryPath: manifest.evidence.supersededCandidatePath,
  })

  if (manifest.verdict === 'PASS') {
    same(manifest.review.status, 'CLOSED_INDEPENDENT_CONVERGENCE', 'R1C14_NATIVE_REVIEW_STATUS')
    verifyIndependentReviewLanes({
      root: canonicalRoot,
      lanes: manifest.review.lanes,
      brief: manifest.review.brief,
      briefSha256: manifest.review.briefSha256,
      candidateResultPath: manifest.evidence.resultPath,
      candidateResultSha256: manifest.evidence.resultSha256,
    })
    if (typeof manifest.review.adjudication?.path !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.review.adjudication?.sha256 ?? '')) {
      fail('R1C14_NATIVE_REVIEW_ADJUDICATION_REFUSED')
    }
    assertRepositoryDigest(canonicalRoot, manifest.review.adjudication.path, manifest.review.adjudication.sha256)
    const adjudication = readJson(repositoryFile(canonicalRoot, manifest.review.adjudication.path))
    same(adjudication.kind, 'conexus.r1c14.native-readmission-review-adjudication/v1', 'R1C14_NATIVE_REVIEW_ADJUDICATION_KIND')
    same(adjudication.candidateResultSha256, manifest.evidence.resultSha256, 'R1C14_NATIVE_REVIEW_ADJUDICATION_RESULT')
    same(adjudication.reviewBriefSha256, manifest.review.briefSha256, 'R1C14_NATIVE_REVIEW_ADJUDICATION_BRIEF')
    sameJson(adjudication.lanes, manifest.review.lanes, 'R1C14_NATIVE_REVIEW_ADJUDICATION_LANES')
    same(verifyReviewAdjudication(adjudication), 0, 'R1C14_NATIVE_REVIEW_ADJUDICATION_UNRESOLVED')
    same(adjudication.verdict, 'PASS', 'R1C14_NATIVE_REVIEW_ADJUDICATION_VERDICT')
  }

  if (manifest.verdict === 'PASS' && requireReceipt) {
    same(manifest.review.receipt, receiptRepositoryPathForManifest(manifest), 'R1C14_NATIVE_RECEIPT_PATH')
    const receiptPath = receiptPathOverride ?? manifest.review.receipt
    const receipt = readJson(repositoryFile(canonicalRoot, receiptPath))
    same(receipt.kind, 'conexus.r1c14.native-readmission-generation-receipt/v1', 'R1C14_NATIVE_RECEIPT_KIND')
    same(receipt.gate, manifest.admittedGate, 'R1C14_NATIVE_RECEIPT_GATE')
    same(receipt.verdict, 'PASS', 'R1C14_NATIVE_RECEIPT_VERDICT')
    same(receipt.outputs.manifestSha256, sha256(readFileSync(manifestPath)), 'R1C14_NATIVE_RECEIPT_MANIFEST')
    same(receipt.outputs.resultSha256, manifest.evidence.resultSha256, 'R1C14_NATIVE_RECEIPT_RESULT')
    same(receipt.outputs.reviewBriefSha256, manifest.review.briefSha256, 'R1C14_NATIVE_RECEIPT_BRIEF')
    assertRepositoryDigest(canonicalRoot, receipt.outputs.adjudicationPath, receipt.outputs.adjudicationSha256)
    same(receipt.outputs.adjudicationPath, manifest.review.adjudication.path, 'R1C14_NATIVE_RECEIPT_ADJUDICATION_PATH')
    same(receipt.outputs.adjudicationSha256, manifest.review.adjudication.sha256, 'R1C14_NATIVE_RECEIPT_ADJUDICATION')
    sameJson(receipt.reviews, manifest.review.lanes, 'R1C14_NATIVE_RECEIPT_REVIEWS')
    same(receipt.exactIdentity.ociIndexDigest, manifest.image.ociIndexDigest, 'R1C14_NATIVE_RECEIPT_IMAGE')
    same(receipt.exactIdentity.gitExecutableSha256, manifest.git.executableSha256, 'R1C14_NATIVE_RECEIPT_GIT')
    same(receipt.proof.checksPassed, result.checks.length, 'R1C14_NATIVE_RECEIPT_CHECKS')
    same(receipt.proof.productDelta, result.productDelta, 'R1C14_NATIVE_RECEIPT_PRODUCT_DELTA')
    same(receipt.snapshotMode, 'RECEIPT_TIME_PROVENANCE_NOT_STANDING_GATE', 'R1C14_NATIVE_SNAPSHOT_MODE')
    verifyRepositoryCustody({ root: canonicalRoot, entries: receipt.repositorySnapshot, verifyCurrent: false })
    const s2Manifest = readJson(repositoryFile(canonicalRoot, 'runtime/r1/.conexus/s2-ownership-manifest.json'))
    verifyDeclaredTransitions({
      priorEntries: s2Manifest.entries,
      custodyEntries: receipt.repositorySnapshot,
      transitions: receipt.repositoryTransitions,
    })
    same(receipt.successorMutationLaw, 'EXACT_PRIOR_DIGEST_REQUIRED', 'R1C14_NATIVE_SUCCESSOR_MUTATION_LAW')
  }

  return {
    verification: 'PASS',
    manifestVerdict: manifest.verdict,
    imageIndexDigest: manifest.image.ociIndexDigest,
    resultSha256: manifest.evidence.resultSha256,
    checks: result.checks.length,
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(verifyNativeReadmission())}\n`)
}
