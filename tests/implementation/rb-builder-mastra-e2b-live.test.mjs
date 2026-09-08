import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import test from 'node:test'

import { readBuilderE2BApiKey } from '../../scripts/rb-builder-e2b-template.mjs'

const live = process.env.CONEXUS_RB_BUILDER_LIVE === 'true'
const repositoryRoot = resolve(import.meta.dirname, '../..')

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

test('RB live Mastra worker produces initial and bounded-correction E2B candidates', {
  skip: live ? false : 'requires explicit CONEXUS_RB_BUILDER_LIVE=true authority and live model/E2B configuration',
  timeout: 15 * 60_000,
}, async () => {
  const templateRef = process.env.CONEXUS_BUILDER_E2B_TEMPLATE_ID
  const catalogFile = process.env.CONEXUS_PROJECT_MODEL_CATALOG_FILE
  const slotsFile = process.env.CONEXUS_GIT_EXTERNAL_FILE_SLOTS_FILE
  const admissionId = process.env.CONEXUS_BUILDER_MODEL_ADMISSION_ID
  if (!templateRef || !/^[a-z0-9]+:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(templateRef) ||
    !catalogFile || !slotsFile || !admissionId) throw new Error('CONEXUS_RB_BUILDER_LIVE_CONFIG_REFUSED')

  const apiKey = readBuilderE2BApiKey(process.env.CONEXUS_BUILDER_E2B_API_KEY_FILE)
  const proofRoot = mkdtempSync(resolve(tmpdir(), 'conexus-rb-builder-live-'))
  const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/rb-builder-live-build-'))
  const sourceRoot = resolve(proofRoot, 'source')
  const resultRoot = resolve(proofRoot, 'result')
  try {
    const compiled = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
      '--noEmit', 'false', '--outDir', buildRoot,
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
    const built = (path) => pathToFileURL(resolve(buildRoot, path)).href
    const { resolveProjectModelAdmission } = await import(built('project/module.js'))
    const { createMastraE2BCodingWorkerRuntime } = await import(built('builder/runtime.js'))

    const admission = resolveProjectModelAdmission({
      catalogFile,
      credentialSlotsFile: slotsFile,
      admissionId,
      requiredCapabilities: ['BUILDER_CODING'],
    })
    assert.equal(admission.admissionId, admissionId)
    assert.equal(admission.providerId, 'anthropic')

    git(proofRoot, 'init', '--initial-branch=main', sourceRoot)
    git(sourceRoot, 'config', 'user.name', 'Conexus Proof')
    git(sourceRoot, 'config', 'user.email', 'proof@conexus.invalid')
    writeFileSync(resolve(sourceRoot, 'README.md'), '# Governed Builder proof\n')
    git(sourceRoot, 'add', 'README.md')
    git(sourceRoot, 'commit', '-m', 'Exact accepted base')
    const baseSourceRevision = git(sourceRoot, 'rev-parse', 'HEAD')
    const sourceBundlePath = resolve(proofRoot, 'source.bundle')
    git(sourceRoot, 'bundle', 'create', sourceBundlePath, 'refs/heads/main')

    let boundSandboxId
    const runtime = createMastraE2BCodingWorkerRuntime({
      apiKey,
      templateId: templateRef,
      model: admission.model,
      modelIdentity: {
        admissionId: admission.admissionId,
        providerId: admission.providerId,
        modelId: admission.modelId,
      },
      validateModelCredential: admission.validateCredential,
      timeoutMs: 12 * 60_000,
    })
    const identity = {
      projectId: randomUUID(),
      changeId: randomUUID(),
      workUnitId: randomUUID(),
      actorRunId: randomUUID(),
      admissionToken: randomUUID(),
    }
    const result = await runtime.execute({
      ...identity,
      intent: 'Create exactly one file named BUILDER_RESULT.txt containing exactly governed-by-conexus followed by a newline. Do not modify any other file.',
      baseSourceRevision,
      sourceBundle: readFileSync(sourceBundlePath),
      bindPhysicalSandbox: async (sandboxId) => { boundSandboxId = sandboxId },
    })

    assert.equal(result.runtimeId, 'mastra-native-e2b-v1')
    assert.equal(result.sandboxId, boundSandboxId)
    assert.equal(result.baseSourceRevision, baseSourceRevision)
    assert.match(result.candidateSourceRevision, /^[0-9a-f]{40}$/)
    assert.notEqual(result.candidateSourceRevision, baseSourceRevision)
    const resultBundlePath = resolve(proofRoot, 'result.bundle')
    writeFileSync(resultBundlePath, result.resultBundle)
    git(proofRoot, 'clone', '--branch', 'conexus-result', resultBundlePath, resultRoot)
    assert.equal(git(resultRoot, 'rev-parse', 'HEAD^'), baseSourceRevision)
    assert.equal(git(resultRoot, 'rev-parse', 'HEAD'), result.candidateSourceRevision)
    assert.equal(git(resultRoot, 'diff', '--name-only', 'HEAD^', 'HEAD'), 'BUILDER_RESULT.txt')
    assert.equal(readFileSync(resolve(resultRoot, 'BUILDER_RESULT.txt'), 'utf8'), 'governed-by-conexus\n')

    git(sourceRoot, 'checkout', '-B', 'failed-candidate', baseSourceRevision)
    writeFileSync(resolve(sourceRoot, 'CORRECTION_RESULT.txt'), 'incomplete\n')
    git(sourceRoot, 'add', 'CORRECTION_RESULT.txt')
    git(sourceRoot, 'commit', '-m', 'Exact rejected candidate fixture')
    const failedCandidate = git(sourceRoot, 'rev-parse', 'HEAD')
    const correctionIdentity = {
      projectId: identity.projectId, changeId: randomUUID(), workUnitId: randomUUID(),
      actorRunId: randomUUID(), admissionToken: randomUUID(),
    }
    const correctionSourceRef = `refs/conexus/changes/${correctionIdentity.changeId}`
    git(sourceRoot, 'update-ref', correctionSourceRef, failedCandidate)
    const failedBundlePath = resolve(proofRoot, 'failed-candidate.bundle')
    git(sourceRoot, 'bundle', 'create', failedBundlePath, correctionSourceRef)
    let correctionSandboxId
    const correction = await runtime.execute({
      ...correctionIdentity,
      intent: 'Make CORRECTION_RESULT.txt contain exactly corrected-by-conexus followed by a newline. Do not modify any other file.',
      baseSourceRevision: failedCandidate,
      correctionFindings: [{ findingId: randomUUID(), findingRevision: randomUUID(), summary: 'CORRECTION_RESULT.txt contains incomplete instead of the required exact corrected-by-conexus line.' }],
      sourceBundle: readFileSync(failedBundlePath),
      bindPhysicalSandbox: async (sandboxId) => { correctionSandboxId = sandboxId },
    })
    assert.equal(correction.sandboxId, correctionSandboxId)
    assert.equal(correction.baseSourceRevision, failedCandidate)
    const correctionBundlePath = resolve(proofRoot, 'correction-result.bundle')
    const correctionRoot = resolve(proofRoot, 'correction-result')
    writeFileSync(correctionBundlePath, correction.resultBundle)
    git(proofRoot, 'clone', '--branch', 'conexus-result', correctionBundlePath, correctionRoot)
    assert.equal(git(correctionRoot, 'rev-parse', 'HEAD^'), failedCandidate)
    assert.equal(git(correctionRoot, 'diff', '--name-only', 'HEAD^', 'HEAD'), 'CORRECTION_RESULT.txt')
    assert.equal(readFileSync(resolve(correctionRoot, 'CORRECTION_RESULT.txt'), 'utf8'), 'corrected-by-conexus\n')
  } finally {
    rmSync(proofRoot, { recursive: true, force: true })
    rmSync(buildRoot, { recursive: true, force: true })
  }
})
