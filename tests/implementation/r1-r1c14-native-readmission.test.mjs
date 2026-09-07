import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  defaultManifestPath,
  repositoryRoot,
  assertRepositoryDigest,
  receiptRepositoryPathForManifest,
  verifyNativeReadmission,
  verifyDeclaredTransitions,
  verifyHistoricalEvidence,
  verifyReviewAdjudication,
  verifyIndependentReviewLanes,
  verifyRepositoryCustody,
  verifySupersessionChain,
} from '../../scripts/check-r1c14-native-readmission.mjs'
import { assertNoUnattestedContextConsumption, validateBuildMetadata } from '../../qualification/4d/r1-git-source-custody/build-metadata.mjs'
import { buildReceipt, canonicalBytes } from '../../scripts/record-r1c14-native-readmission-receipt.mjs'
import { buildReviewPrompt } from '../../scripts/conexus-review.mjs'

const qualificationRoot = resolve(repositoryRoot, 'qualification/4d/r1-git-source-custody')

test('R1C-14 native successor envelope is internally bound', () => {
  const verified = verifyNativeReadmission()
  assert.equal(verified.verification, 'PASS')
  assert.equal(verified.checks, 17)
  assert.match(verified.imageIndexDigest, /^sha256:[a-f0-9]{64}$/)
})

test('R1C-14 native successor refuses protected-claim or blocker-census expansion', () => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'conexus-r1c14-census-'))
  try {
    const manifest = JSON.parse(readFileSync(defaultManifestPath, 'utf8'))
    manifest.review.blockerCensus.push('RECOVERY_FRAMEWORK_HARDENING')
    const manifestPath = resolve(temporary, 'manifest.json')
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`)
    assert.throws(
      () => verifyNativeReadmission({ manifestPath }),
      /R1C14_NATIVE_BLOCKER_CENSUS/,
    )
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('R1C-14 native receipt refuses publication before gate closure', () => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'conexus-r1c14-open-gate-'))
  try {
    const manifest = JSON.parse(readFileSync(defaultManifestPath, 'utf8'))
    manifest.verdict = 'CANDIDATE'
    manifest.review = { ...manifest.review, status: 'PENDING_INDEPENDENT_CONVERGENCE' }
    const manifestPath = resolve(temporary, 'manifest.json')
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`)
    assert.throws(() => buildReceipt({ manifestPath }), /R1C14_NATIVE_RECEIPT_GATE_NOT_CLOSED/)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('R1C-14 native successor refuses an incomplete independent review census', () => {
  assert.throws(
    () => verifyIndependentReviewLanes({ root: repositoryRoot, brief: 'brief.md', lanes: [{ lane: 'opus' }] }),
    /R1C14_NATIVE_REVIEW_LANE_CENSUS/,
  )
})

test('R1C-14 native successor refuses review outputs from a stale candidate', () => {
  const laneFrom = (lane, reviewerOutputPath) => {
    const bytes = readFileSync(resolve(repositoryRoot, reviewerOutputPath))
    const wrapper = JSON.parse(bytes)
    const raw = wrapper.lanes[0]
    return {
      lane,
      executable: raw.executable,
      model: raw.model,
      effort: raw.effort,
      mode: raw.mode,
      readOnly: true,
      ...(lane === 'gemini' ? { sandbox: true } : {}),
      cliVersion: raw.version,
      sessionOrConversation: raw.sessionOrConversation,
      reviewerOutputPath,
      reviewerOutputSha256: createHash('sha256').update(bytes).digest('hex'),
      rawVerdict: raw.verdictRaw,
    }
  }
  const lanes = [
    laneFrom('opus', 'qualification/4d/r1-git-source-custody/evidence/native-readmission-linux-2026-09-01-v12/review/opus-review-result.json'),
    laneFrom('gemini', 'qualification/4d/r1-git-source-custody/evidence/native-readmission-linux-2026-09-01-v12/review/gemini-review-result.json'),
  ]
  assert.throws(
    () => verifyIndependentReviewLanes({
      root: repositoryRoot,
      brief: 'docs/evidence/4d/4d-r1-r1c14-native-readmission-review-brief.md',
      briefSha256: '0'.repeat(64),
      candidateResultPath: 'qualification/4d/r1-git-source-custody/evidence/native-readmission-linux-2026-09-01-v13/results.json',
      candidateResultSha256: '1'.repeat(64),
      lanes,
    }),
    /R1C14_NATIVE_REVIEW_OUTPUT_DIRECTORY/,
  )
})

test('R1C-14 native successor binds current review bytes and fires on digest or read-only argv drift', () => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'conexus-r1c14-review-binding-'))
  const observedRepositoryRoot = '/mnt/c/observed/conexus-os'
  const brief = 'docs/review-brief.md'
  const candidateResultPath = 'qualification/4d/r1-git-source-custody/evidence/native-readmission-linux-2026-09-01-v14/results.json'
  try {
    mkdirSync(resolve(temporary, 'docs'), { recursive: true })
    mkdirSync(resolve(temporary, candidateResultPath, '..', 'review'), { recursive: true })
    writeFileSync(resolve(temporary, brief), 'review subject\n')
    writeFileSync(resolve(temporary, candidateResultPath), '{"verdict":"PASS"}\n')
    const briefSha256 = createHash('sha256').update(readFileSync(resolve(temporary, brief))).digest('hex')
    const candidateResultSha256 = createHash('sha256').update(readFileSync(resolve(temporary, candidateResultPath))).digest('hex')
    const source = {
      opus: 'qualification/4d/r1-git-source-custody/evidence/native-readmission-linux-2026-09-01-v13/review/opus-review-result.json',
      gemini: 'qualification/4d/r1-git-source-custody/evidence/native-readmission-linux-2026-09-01-v13/review/gemini-review-result.json',
    }
    const lanes = Object.entries(source).map(([lane, sourcePath]) => {
      const wrapper = JSON.parse(readFileSync(resolve(repositoryRoot, sourcePath), 'utf8'))
      wrapper.repositoryRoot = observedRepositoryRoot
      wrapper.brief = brief
      wrapper.briefSha256 = briefSha256
      wrapper.candidateResult = candidateResultPath
      wrapper.candidateResultSha256 = candidateResultSha256
      const historicalArgs = [...wrapper.lanes[0].args]
      const promptIndex = historicalArgs.indexOf('-p')
      assert.notEqual(promptIndex, -1)
      historicalArgs[promptIndex + 1] = buildReviewPrompt({ repositoryRoot: observedRepositoryRoot, briefRelative: brief })
      wrapper.lanes[0].args = historicalArgs
      const reviewerOutputPath = `${candidateResultPath.replace(/\/results\.json$/, '')}/review/${lane}-review-result.json`
      const bytes = `${JSON.stringify(wrapper, null, 2)}\n`
      writeFileSync(resolve(temporary, reviewerOutputPath), bytes)
      const raw = wrapper.lanes[0]
      const binding = {
        lane,
        executable: raw.executable,
        model: raw.model,
        effort: raw.effort,
        mode: raw.mode,
        readOnly: true,
        ...(lane === 'gemini' ? { sandbox: true } : {}),
        cliVersion: raw.version,
        sessionOrConversation: raw.sessionOrConversation,
        reviewerOutputPath,
        reviewerOutputSha256: createHash('sha256').update(bytes).digest('hex'),
        rawVerdict: raw.verdictRaw,
      }
      if (lane === 'gemini') {
        binding.supportingArtifactPath = `${candidateResultPath.replace(/\/results\.json$/, '')}/review/gemini-final-review-report.md`
        writeFileSync(resolve(temporary, binding.supportingArtifactPath), 'retained Gemini report\n')
        binding.supportingArtifactSha256 = createHash('sha256')
          .update(readFileSync(resolve(temporary, binding.supportingArtifactPath)))
          .digest('hex')
      }
      return binding
    })
    const input = { root: temporary, lanes, brief, briefSha256, candidateResultPath, candidateResultSha256 }
    verifyIndependentReviewLanes(input)

    const opusPath = resolve(temporary, lanes[0].reviewerOutputPath)
    const opus = JSON.parse(readFileSync(opusPath, 'utf8'))
    opus.lanes[0].exitCode = 1
    let bytes = `${JSON.stringify(opus, null, 2)}\n`
    writeFileSync(opusPath, bytes)
    lanes[0].reviewerOutputSha256 = createHash('sha256').update(bytes).digest('hex')
    assert.throws(() => verifyIndependentReviewLanes(input), /R1C14_NATIVE_REVIEW_OUTPUT_EXIT/)

    opus.lanes[0].exitCode = 0
    lanes[0].rawVerdict = ''
    assert.throws(() => verifyIndependentReviewLanes(input), /R1C14_NATIVE_REVIEW_LANE_SHAPE/)
    lanes[0].rawVerdict = opus.lanes[0].verdictRaw

    opus.candidateResultSha256 = '0'.repeat(64)
    bytes = `${JSON.stringify(opus, null, 2)}\n`
    writeFileSync(opusPath, bytes)
    lanes[0].reviewerOutputSha256 = createHash('sha256').update(bytes).digest('hex')
    assert.throws(() => verifyIndependentReviewLanes(input), /R1C14_NATIVE_REVIEW_OUTPUT_RESULT_DIGEST/)

    opus.candidateResultSha256 = candidateResultSha256
    const permissionMode = opus.lanes[0].args.indexOf('--permission-mode')
    opus.lanes[0].args[permissionMode + 1] = 'acceptEdits'
    bytes = `${JSON.stringify(opus, null, 2)}\n`
    writeFileSync(opusPath, bytes)
    lanes[0].reviewerOutputSha256 = createHash('sha256').update(bytes).digest('hex')
    assert.throws(() => verifyIndependentReviewLanes(input), /R1C14_NATIVE_REVIEW_OUTPUT_READ_ONLY/)

    opus.lanes[0].args[permissionMode + 1] = 'plan'
    opus.lanes[0].args.push('--permission-mode', 'acceptEdits')
    bytes = `${JSON.stringify(opus, null, 2)}\n`
    writeFileSync(opusPath, bytes)
    lanes[0].reviewerOutputSha256 = createHash('sha256').update(bytes).digest('hex')
    assert.throws(() => verifyIndependentReviewLanes(input), /R1C14_NATIVE_REVIEW_OUTPUT_READ_ONLY/)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('R1C-14 native receipt path is derived from the current candidate', () => {
  const manifest = JSON.parse(readFileSync(defaultManifestPath, 'utf8'))
  assert.equal(
    receiptRepositoryPathForManifest(manifest),
    manifest.evidence.resultPath.replace(/results\.json$/, 'generation-receipt.json'),
  )
})

test('R1C-14 native successor accepts canonical receipt key ordering', () => {
  const manifest = JSON.parse(readFileSync(defaultManifestPath, 'utf8'))
  const receiptPath = manifest.evidence.resultPath.replace(/results\.json$/, `.canonical-test-${process.pid}.json`)
  const absolute = resolve(repositoryRoot, receiptPath)
  try {
    // This control tests serialization of the admitted receipt, not publication
    // of a new historical receipt against the current development worktree.
    const admittedReceipt = JSON.parse(readFileSync(resolve(repositoryRoot, manifest.review.receipt), 'utf8'))
    writeFileSync(absolute, canonicalBytes(admittedReceipt))
    assert.equal(verifyNativeReadmission({ receiptPathOverride: receiptPath }).verification, 'PASS')
  } finally {
    rmSync(absolute, { force: true })
  }
})

test('R1C-14 native successor refuses an orphan retained candidate', () => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'conexus-r1c14-supersession-'))
  const qualification = resolve(temporary, 'qualification/4d/r1-git-source-custody')
  try {
    const evidence = resolve(qualification, 'evidence')
    mkdirSync(resolve(evidence, 'native-readmission-linux-2026-09-01-v1'), { recursive: true })
    mkdirSync(resolve(evidence, 'native-readmission-linux-2026-09-01-v2'), { recursive: true })
    mkdirSync(resolve(evidence, 'superseded-candidates'), { recursive: true })
    const recordPath = 'qualification/4d/r1-git-source-custody/evidence/superseded-candidates/native-readmission-linux-2026-09-01-v0.json'
    writeFileSync(resolve(temporary, recordPath), `${JSON.stringify({
      kind: 'conexus.r1c14.native-readmission-supersession/v1',
      disposition: 'SUPERSEDED_NOT_AUTHORITY',
      superseded: {
        evidenceDirectory: 'evidence/native-readmission-linux-2026-09-01-v0',
        resultSha256: '0'.repeat(64),
        candidateSha256: '1'.repeat(64),
        retained: false,
      },
      successor: {
        evidenceDirectory: 'evidence/native-readmission-linux-2026-09-01-v2',
        resultSha256: '2'.repeat(64),
        candidateSha256: '3'.repeat(64),
      },
    })}\n`)
    assert.throws(
      () => verifySupersessionChain({
        root: temporary,
        currentEvidenceDirectory: 'evidence/native-readmission-linux-2026-09-01-v2',
        currentResultSha256: '2'.repeat(64),
        currentCandidateSha256: '3'.repeat(64),
        entryPath: recordPath,
      }),
      /R1C14_NATIVE_SUPERSESSION_ORPHAN/,
    )
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('R1C-14 native successor refuses a partial promoted-candidate directory', () => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'conexus-r1c14-partial-supersession-'))
  const qualification = resolve(temporary, 'qualification/4d/r1-git-source-custody')
  try {
    const evidence = resolve(qualification, 'evidence')
    mkdirSync(resolve(evidence, 'native-readmission-linux-2026-09-01-v2'), { recursive: true })
    mkdirSync(resolve(evidence, 'native-readmission-linux-2026-09-01-v3.tmp-123-uuid'), { recursive: true })
    mkdirSync(resolve(evidence, 'superseded-candidates'), { recursive: true })
    const recordPath = 'qualification/4d/r1-git-source-custody/evidence/superseded-candidates/native-readmission-linux-2026-09-01-v0.json'
    writeFileSync(resolve(temporary, recordPath), `${JSON.stringify({
      kind: 'conexus.r1c14.native-readmission-supersession/v1',
      disposition: 'SUPERSEDED_NOT_AUTHORITY',
      superseded: {
        evidenceDirectory: 'evidence/native-readmission-linux-2026-09-01-v0',
        resultSha256: '0'.repeat(64),
        candidateSha256: '1'.repeat(64),
        retained: false,
      },
      successor: {
        evidenceDirectory: 'evidence/native-readmission-linux-2026-09-01-v2',
        resultSha256: '2'.repeat(64),
        candidateSha256: '3'.repeat(64),
      },
    })}\n`)
    assert.throws(
      () => verifySupersessionChain({
        root: temporary,
        currentEvidenceDirectory: 'evidence/native-readmission-linux-2026-09-01-v2',
        currentResultSha256: '2'.repeat(64),
        currentCandidateSha256: '3'.repeat(64),
        entryPath: recordPath,
      }),
      /R1C14_NATIVE_SUPERSESSION_PARTIAL_DIRECTORY/,
    )
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('R1C-14 native successor refuses a forged result digest', () => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'conexus-r1c14-native-'))
  try {
    const manifest = JSON.parse(readFileSync(defaultManifestPath, 'utf8'))
    manifest.evidence.resultSha256 = '0'.repeat(64)
    const forged = resolve(temporary, 'manifest.json')
    writeFileSync(forged, `${JSON.stringify(manifest)}\n`)
    assert.throws(
      () => verifyNativeReadmission({ root: repositoryRoot, manifestPath: forged }),
      /R1C14_NATIVE_DIGEST_MISMATCH/,
    )
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('R1C-14 native successor refuses physical build metadata outside its pin', () => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'conexus-r1c14-metadata-'))
  try {
    mkdirSync(resolve(temporary, 'evidence'))
    writeFileSync(resolve(temporary, 'evidence/build-metadata.json'), '{}\n')
    assert.throws(
      () => assertRepositoryDigest(temporary, 'evidence/build-metadata.json', '0'.repeat(64)),
      /R1C14_NATIVE_DIGEST_MISMATCH/,
    )
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('R1C-14 native successor refuses an intermediate symlink in a custody path', () => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'conexus-r1c14-symlink-'))
  try {
    const target = resolve(temporary, 'target')
    mkdirSync(target)
    writeFileSync(resolve(target, 'value.json'), '{}\n')
    symlinkSync(target, resolve(temporary, 'linked'), 'dir')
    assert.throws(
      () => assertRepositoryDigest(temporary, 'linked/value.json', createHash('sha256').update('{}\n').digest('hex')),
      /R1C14_NATIVE_FILE_REFUSED/,
    )
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('R1C-14 native successor refuses the retained false VCS identity', () => {
  const rejected = JSON.parse(readFileSync(resolve(
    qualificationRoot,
    'evidence/native-readmission-rejections/first-vcs-hint-build-metadata.json',
  )))
  assert.throws(
    () => validateBuildMetadata({
      metadata: rejected,
      dockerfileBytes: readFileSync(resolve(qualificationRoot, 'Dockerfile')),
      expectedImageIndex: rejected['containerimage.digest'],
    }),
    /R1C14_METADATA_FALSE_VCS_IDENTITY/,
  )
})

test('R1C-14 native successor refuses a recipe not bound by pinned build metadata', () => {
  const manifest = JSON.parse(readFileSync(defaultManifestPath, 'utf8'))
  const metadata = JSON.parse(readFileSync(resolve(
    repositoryRoot,
    manifest.evidence.resultPath.replace(/results\.json$/, 'build-metadata.json'),
  )))
  assert.throws(
    () => validateBuildMetadata({
      metadata,
      dockerfileBytes: Buffer.from('FROM scratch\n'),
      expectedImageIndex: metadata['containerimage.digest'],
    }),
    /R1C14_METADATA_DOCKERFILE_MISMATCH/,
  )
})

test('R1C-14 native successor refuses a material not bound by pinned build metadata', () => {
  const manifest = JSON.parse(readFileSync(defaultManifestPath, 'utf8'))
  const metadata = JSON.parse(readFileSync(resolve(
    repositoryRoot,
    manifest.evidence.resultPath.replace(/results\.json$/, 'build-metadata.json'),
  )))
  metadata['buildx.build.provenance'].materials[4].digest.sha256 = '0'.repeat(64)
  assert.throws(
    () => validateBuildMetadata({
      metadata,
      dockerfileBytes: readFileSync(resolve(qualificationRoot, 'Dockerfile')),
      expectedImageIndex: metadata['containerimage.digest'],
    }),
    /R1C14_METADATA_MATERIALS_MISMATCH/,
  )
})

test('R1C-14 native successor refuses unattested build-context consumption', () => {
  for (const recipe of [
    'FROM scratch\nCOPY . /context\n',
    'FROM scratch\nADD local.tar /context\n',
    'FROM scratch\nRUN --mount=type=bind,target=/context true\n',
  ]) {
    assert.throws(
      () => assertNoUnattestedContextConsumption(Buffer.from(recipe)),
      /R1C14_METADATA_CONTEXT_CONSUMPTION_REFUSED/,
    )
  }
})

test('R1C-14 native successor refuses repository custody drift', () => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'conexus-r1c14-custody-'))
  try {
    for (const path of ['.github/workflows/verify.yml', 'docs/index.md', 'docs/roadmap.md', 'package.json', 'tests/repository/import-law.test.mjs']) {
      mkdirSync(resolve(temporary, path, '..'), { recursive: true })
      writeFileSync(resolve(temporary, path), `${path}\n`)
    }
    const entries = ['.github/workflows/verify.yml', 'docs/index.md', 'docs/roadmap.md', 'package.json', 'tests/repository/import-law.test.mjs'].map((path) => ({
      class: 'PLATFORM-CONTRACT', path, outputDigest: '0'.repeat(64),
    }))
    assert.throws(
      () => verifyRepositoryCustody({ root: temporary, entries }),
      /R1C14_NATIVE_DIGEST_MISMATCH/,
    )
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('R1C-14 native successor refuses duplicate repository custody', () => {
  const path = '.github/workflows/verify.yml'
  const outputDigest = createHash('sha256').update(readFileSync(resolve(repositoryRoot, path))).digest('hex')
  const entries = [
    { class: 'PLATFORM-CONTRACT', path, outputDigest },
    { class: 'PLATFORM-CONTRACT', path, outputDigest },
  ]
  assert.throws(() => verifyRepositoryCustody({ root: repositoryRoot, entries }), /R1C14_NATIVE_CUSTODY_DUPLICATE/)
})

test('R1C-14 native successor refuses a missing required custody path', () => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'conexus-r1c14-custody-floor-'))
  try {
    const paths = ['.github/workflows/verify.yml', 'docs/index.md', 'docs/roadmap.md', 'package.json']
    const entries = paths.map((path) => {
      mkdirSync(resolve(temporary, path, '..'), { recursive: true })
      writeFileSync(resolve(temporary, path), `${path}\n`)
      return {
        class: 'PLATFORM-CONTRACT',
        path,
        outputDigest: createHash('sha256').update(readFileSync(resolve(temporary, path))).digest('hex'),
      }
    })
    assert.throws(
      () => verifyRepositoryCustody({ root: temporary, entries }),
      /R1C14_NATIVE_CUSTODY_REQUIRED_PATH_MISSING:tests\/repository\/import-law\.test\.mjs/,
    )
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('R1C-14 native successor refuses an undeclared prior transition', () => {
  const path = '.github/workflows/verify.yml'
  const priorEntries = [{ class: 'PLATFORM-CONTRACT', path, outputDigest: '1'.repeat(64) }]
  const custodyEntries = [{ class: 'PLATFORM-CONTRACT', path, outputDigest: '2'.repeat(64) }]
  const transitions = [{ class: 'PLATFORM-CONTRACT', path, priorDigest: '0'.repeat(64), outputDigest: '2'.repeat(64), reason: 'TEST' }]
  assert.throws(
    () => verifyDeclaredTransitions({ priorEntries, custodyEntries, transitions }),
    /R1C14_NATIVE_TRANSITION_PRIOR/,
  )
})

test('R1C-14 native successor derives every changed inherited Platform transition', () => {
  const priorEntries = [
    { class: 'PLATFORM-CONTRACT', path: 'a', outputDigest: '1'.repeat(64) },
    { class: 'PLATFORM-CONTRACT', path: 'b', outputDigest: '2'.repeat(64) },
    { class: 'GENERATED', path: 'generated', outputDigest: '3'.repeat(64) },
  ]
  const custodyEntries = [
    { class: 'PLATFORM-CONTRACT', path: 'a', outputDigest: '4'.repeat(64) },
    { class: 'PLATFORM-CONTRACT', path: 'b', outputDigest: '2'.repeat(64) },
  ]
  assert.throws(
    () => verifyDeclaredTransitions({ priorEntries, custodyEntries, transitions: [] }),
    /R1C14_NATIVE_TRANSITION_CENSUS/,
  )
  assert.doesNotThrow(() => verifyDeclaredTransitions({
    priorEntries,
    custodyEntries,
    transitions: [{
      class: 'PLATFORM-CONTRACT',
      path: 'a',
      priorDigest: '1'.repeat(64),
      outputDigest: '4'.repeat(64),
      reason: 'TEST',
    }],
  }))
})

test('R1C-14 native successor refuses a missing inherited Platform custody entry', () => {
  const priorEntries = [{ class: 'PLATFORM-CONTRACT', path: 'a', outputDigest: '1'.repeat(64) }]
  assert.throws(
    () => verifyDeclaredTransitions({ priorEntries, custodyEntries: [], transitions: [] }),
    /R1C14_NATIVE_INHERITED_CUSTODY_MISSING:a/,
  )
})

test('R1C-14 native successor refuses a transition for unchanged inherited custody', () => {
  const entry = { class: 'PLATFORM-CONTRACT', path: 'a', outputDigest: '1'.repeat(64) }
  assert.throws(
    () => verifyDeclaredTransitions({
      priorEntries: [entry],
      custodyEntries: [entry],
      transitions: [{ ...entry, priorDigest: entry.outputDigest, reason: 'TEST' }],
    }),
    /R1C14_NATIVE_TRANSITION_CENSUS/,
  )
})

test('R1C-14 native successor binds historical result, metadata, and receipt bytes', () => {
  const manifest = JSON.parse(readFileSync(defaultManifestPath, 'utf8'))
  const predecessor = JSON.parse(readFileSync(resolve(repositoryRoot, manifest.predecessor.path), 'utf8'))
  assert.doesNotThrow(() => verifyHistoricalEvidence({ root: repositoryRoot, manifest, predecessor }))
  manifest.historicalEvidence.generationReceipt.sha256 = '0'.repeat(64)
  assert.throws(
    () => verifyHistoricalEvidence({ root: repositoryRoot, manifest, predecessor }),
    /R1C14_NATIVE_DIGEST_MISMATCH/,
  )
})

test('R1C-14 native successor refuses a semantically mismatched historical receipt', () => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'conexus-r1c14-historical-'))
  try {
    const evidence = resolve(temporary, 'qualification/4d/r1-git-source-custody/evidence')
    mkdirSync(evidence, { recursive: true })
    const result = Buffer.from('historical-result\n')
    const metadata = Buffer.from('historical-metadata\n')
    writeFileSync(resolve(evidence, 'results.json'), result)
    writeFileSync(resolve(evidence, 'build-metadata.json'), metadata)
    const predecessor = {
      evidence: { resultPath: 'qualification/4d/r1-git-source-custody/evidence/results.json', resultSha256: createHash('sha256').update(result).digest('hex') },
      image: { buildMetadataSha256: createHash('sha256').update(metadata).digest('hex') },
    }
    const receipt = {
      kind: 'conexus.r1c14.git-source-custody-generation-receipt/v1',
      gate: 'R1C-14 GIT_SOURCE_CUSTODY',
      verdict: 'PASS',
      outputs: { resultSha256: '0'.repeat(64), buildMetadataSha256: predecessor.image.buildMetadataSha256, pinManifestSuccessorSha256: '1'.repeat(64) },
    }
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt)}\n`)
    writeFileSync(resolve(evidence, 'generation-receipt.json'), receiptBytes)
    const manifest = {
      predecessor: { sha256: '1'.repeat(64) },
      historicalEvidence: { generationReceipt: { path: 'qualification/4d/r1-git-source-custody/evidence/generation-receipt.json', sha256: createHash('sha256').update(receiptBytes).digest('hex') } },
    }
    assert.throws(
      () => verifyHistoricalEvidence({ root: temporary, manifest, predecessor }),
      /R1C14_NATIVE_HISTORICAL_RECEIPT_RESULT/,
    )
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('R1C-14 native successor derives unresolved material findings and qualifies safe deferral', () => {
  const corrected = { id: 'F1', material: true, disposition: 'CORRECTED', correctionEvidence: ['test:F1'] }
  const deferred = { id: 'F2', material: true, disposition: 'DEFER_SAFE', whySafe: 'outside this gate', revisitTrigger: 'before publication', laterOwner: 'operator' }
  assert.equal(verifyReviewAdjudication({ findings: [corrected, deferred], unresolvedMaterialFindings: 0 }), 0)
  assert.throws(
    () => verifyReviewAdjudication({ findings: [{ id: 'F2', material: true, disposition: 'DEFER_SAFE' }], unresolvedMaterialFindings: 0 }),
    /R1C14_NATIVE_REVIEW_ADJUDICATION_DEFER/,
  )
  assert.throws(
    () => verifyReviewAdjudication({ findings: [{ id: 'F3', material: true, disposition: 'NO_FINDING' }], unresolvedMaterialFindings: 0 }),
    /R1C14_NATIVE_REVIEW_ADJUDICATION_NO_FINDING_MATERIAL/,
  )
})
