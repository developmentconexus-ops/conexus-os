import { createHash } from 'node:crypto'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  defaultManifestPath,
  defaultReceiptPath,
  repositoryRoot,
  requiredRepositoryCustodyPaths,
  verifyNativeReadmission,
  verifyDeclaredTransitions,
  verifyRepositoryCustody,
} from './check-r1c14-native-readmission.mjs'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const digest = (path) => sha256(readFileSync(resolve(repositoryRoot, path)))
const fail = (code, detail = '') => { throw new Error(`${code}${detail ? `:${detail}` : ''}`) }
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  }
  return value
}
export const canonicalBytes = (value) => Buffer.from(`${JSON.stringify(canonical(value))}\n`)

export const closureCustodyPaths = Object.freeze([
  'scripts/check-r1c14-native-readmission.mjs',
  'scripts/record-r1c14-native-readmission-receipt.mjs',
  'tests/implementation/r1-r1c14-native-readmission.test.mjs',
  'tests/implementation/r1-r1c14-finalizer.test.mjs',
  'docs/evidence/4d/4d-r1-r1c14-native-readmission-result.md',
])

const transitionReasons = Object.freeze({
  '.github/workflows/verify.yml': 'R1C14_NATIVE_REQUIRED_CI',
  'apps/hub/src/http/app.ts': 'S5_SAME_ORIGIN_BROWSER_BOUNDARY',
  'apps/hub/src/platform/config.ts': 'S3_P6_PROJECT_READ_CONFIGURATION',
  'apps/hub/src/server.ts': 'S3_P5_PROJECT_COMMAND_COMPOSITION',
  'apps/web/src/app/router.tsx': 'S3_P6_PROJECT_BROWSER_ROUTING',
  'apps/web/src/app/shell.tsx': 'S5_ADAPTIVE_SHELL_FOCUS_BOUNDARY',
  'apps/web/src/features/workspace/components/workspace-create-form.tsx': 'S5_FORM_FOCUS_DOUBLE_COMMAND_BOUNDARY',
  'apps/web/src/routes/index.tsx': 'S5_SERVER_ORIENTED_SHELL_ENTRY',
  'apps/web/src/routes/setup.tsx': 'S5_SETUP_FOCUS_DOUBLE_COMMAND_BOUNDARY',
  'apps/web/src/styles.css': 'S5_RESPONSIVE_FOCUS_REDUCED_MOTION_BOUNDARY',
  'docs/index.md': 'S5_AUTHORITY_ROUTING',
  'docs/roadmap.md': 'S5_AUTHORITY_ROUTING',
  'package.json': 'S5_BROWSER_PROOF_SURFACE',
  'scripts/check-import-law.mjs': 'S3_P5_PROJECT_IMPORT_BOUNDARY',
  'scripts/run-hub-migrations.mjs': 'S3_P6_PROJECT_READ_MIGRATION_CUSTODY',
  'tests/implementation/r1-s2-postgres.test.mjs': 'S3_P1_MIGRATION_REGRESSION_PROOF',
  'tests/repository/import-law.test.mjs': 'R1C14_NATIVE_CI_WIRING_PROOF',
})

export const buildReceipt = ({ manifestPath = defaultManifestPath } = {}) => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.verdict !== 'PASS' || manifest.review?.status !== 'CLOSED_INDEPENDENT_CONVERGENCE') {
    fail('R1C14_NATIVE_RECEIPT_GATE_NOT_CLOSED')
  }
  verifyNativeReadmission({ manifestPath, requireReceipt: false })
  const result = JSON.parse(readFileSync(resolve(repositoryRoot, manifest.evidence.resultPath), 'utf8'))
  const s2Manifest = JSON.parse(readFileSync(resolve(repositoryRoot, 'runtime/r1/.conexus/s2-ownership-manifest.json'), 'utf8'))
  const inheritedPaths = s2Manifest.entries
    .filter(({ class: ownershipClass }) => ownershipClass === 'PLATFORM-CONTRACT')
    .map(({ path }) => path)
  const custodyPaths = [...new Set([...inheritedPaths, ...requiredRepositoryCustodyPaths, ...closureCustodyPaths])].sort()
  const repositoryCustody = custodyPaths.map((path) => ({
    class: 'PLATFORM-CONTRACT',
    outputDigest: digest(path),
    path,
  }))
  verifyRepositoryCustody({ root: repositoryRoot, entries: repositoryCustody })
  const prior = new Map(s2Manifest.entries.map((entry) => [entry.path, entry]))
  const current = new Map(repositoryCustody.map((entry) => [entry.path, entry]))
  const changedPaths = inheritedPaths
    .filter((path) => prior.get(path)?.outputDigest !== current.get(path)?.outputDigest)
    .sort()
  for (const path of changedPaths) {
    if (!transitionReasons[path]) fail('R1C14_NATIVE_TRANSITION_REASON_REQUIRED', path)
  }
  const repositoryTransitions = changedPaths.map((path) => ({
    class: 'PLATFORM-CONTRACT',
    outputDigest: current.get(path)?.outputDigest,
    path,
    priorDigest: prior.get(path)?.outputDigest,
    reason: transitionReasons[path],
  }))
  verifyDeclaredTransitions({ priorEntries: s2Manifest.entries, custodyEntries: repositoryCustody, transitions: repositoryTransitions })
  return {
    kind: 'conexus.r1c14.native-readmission-generation-receipt/v1',
    gate: manifest.admittedGate,
    observedOn: '2026-09-01',
    predecessors: {
      historicalReceiptSha256: digest('qualification/4d/r1-git-source-custody/evidence/generation-receipt.json'),
      historicalSuccessorManifestSha256: manifest.predecessor.sha256,
      s2GenerationReceiptSha256: result.predecessors.s2GenerationReceiptSha256,
      s2OwnershipManifestSha256: result.predecessors.s2OwnershipManifestSha256,
    },
    outputs: {
      adjudicationPath: manifest.review.adjudication.path,
      adjudicationSha256: manifest.review.adjudication.sha256,
      manifestSha256: sha256(readFileSync(manifestPath)),
      resultSha256: manifest.evidence.resultSha256,
      reviewBriefSha256: manifest.review.briefSha256,
    },
    exactIdentity: {
      gitExecutableSha256: manifest.git.executableSha256,
      linuxAmd64ManifestDigest: manifest.image.linuxAmd64ManifestDigest,
      ociIndexDigest: manifest.image.ociIndexDigest,
    },
    proof: {
      checksExpected: manifest.evidence.expectedCheckIds.length,
      checksPassed: result.checks.length,
      productCensusSha256: result.productCensusSha256,
      productDelta: result.productDelta,
      secretContaminatedFileCount: result.secretScan.contaminatedFileCount,
      unresolvedConflicts: 0,
    },
    repositorySnapshot: repositoryCustody,
    repositoryTransitions,
    reviews: manifest.review.lanes,
    snapshotMode: 'RECEIPT_TIME_PROVENANCE_NOT_STANDING_GATE',
    durability: 'LOCAL_WORKTREE_PROVENANCE_ONLY_PENDING_OPERATOR_CUSTODY',
    successorMutationLaw: 'EXACT_PRIOR_DIGEST_REQUIRED',
    verdict: 'PASS',
  }
}

export const publishReceipt = () => {
  if (existsSync(defaultReceiptPath)) fail('R1C14_NATIVE_RECEIPT_ALREADY_EXISTS')
  const receipt = buildReceipt()
  const temporary = resolve(dirname(defaultReceiptPath), `.generation-receipt-${process.pid}.tmp`)
  try {
    writeFileSync(temporary, canonicalBytes(receipt), { flag: 'wx' })
    verifyNativeReadmission({ receiptPathOverride: relative(repositoryRoot, temporary).replaceAll('\\', '/') })
    renameSync(temporary, defaultReceiptPath)
  } finally {
    if (existsSync(temporary)) rmSync(temporary)
  }
  verifyNativeReadmission()
  return { ...receipt, receiptSha256: sha256(readFileSync(defaultReceiptPath)) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(process.argv.includes('--publish') ? publishReceipt() : buildReceipt())}\n`)
}
