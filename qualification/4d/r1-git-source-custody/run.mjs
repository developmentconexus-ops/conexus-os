import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import { validateBuildMetadata } from './build-metadata.mjs'

const qualificationRoot = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(qualificationRoot, '../../..')
const expectedCheckIds = [
  'PIN', 'PIN_NEGATIVE', 'BUILD_OPTIONS', 'NEW', 'CAS', 'ISOLATION',
  'EXISTING_GIT', 'PROTOCOL', 'REDIRECT', 'MISSING_REF', 'PARTIAL',
  'CREDENTIAL_CONFIG', 'REQUEST_TARGET_NEGATIVE', 'SECRET_SCAN_NEGATIVE',
  'BUNDLE_NEW', 'CORRUPT_BUNDLE', 'BUNDLE_EXISTING_GIT',
]

const fail = message => { throw new Error(message) }
const args = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index]
  const value = process.argv[index + 1]
  if (!key?.startsWith('--') || value === undefined) fail('R1C14_RUNNER_ARGUMENT_REFUSED')
  args.set(key.slice(2), value)
}
const required = name => {
  const value = args.get(name)
  if (!value) fail(`R1C14_RUNNER_${name.toUpperCase().replaceAll('-', '_')}_MISSING`)
  return value
}
const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
    stdio: options.capture === false ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  })
  if (result.error || result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    fail(options.failure ?? `R1C14_RUNNER_COMMAND_FAILED:${command}`)
  }
  return (result.stdout ?? '').trim()
}

const waitForDocker = () => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8' })
    if (!result.error && result.status === 0) return
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000)
  }
  fail('R1C14_DOCKER_NOT_READY')
}

if (process.platform !== 'linux' || process.arch !== 'x64') fail('R1C14_RUNNER_PLATFORM_REFUSED')
const pin = JSON.parse(readFileSync(resolve(required('pin')), 'utf8'))
if (pin.kind !== 'conexus.r1c14.git-source-custody-native-readmission-pin/v1') fail('R1C14_RUNNER_PIN_KIND_REFUSED')
if (process.version !== pin.hostRuntime?.node) fail('R1C14_HOST_NODE_PIN_MISMATCH')
waitForDocker()

const finalEvidenceRoot = resolve(qualificationRoot, required('evidence-directory'))
const evidenceRelative = relative(resolve(qualificationRoot, 'evidence'), finalEvidenceRoot)
if (evidenceRelative.startsWith('..') || isAbsolute(evidenceRelative) || evidenceRelative === '') fail('R1C14_RUNNER_EVIDENCE_ROOT_REFUSED')
if (existsSync(finalEvidenceRoot)) fail('R1C14_RUNNER_EVIDENCE_EXISTS')
const evidenceRoot = `${finalEvidenceRoot}.tmp-${process.pid}-${randomUUID()}`
const workRootInput = required('work-root')
if (!isAbsolute(workRootInput)) fail('R1C14_RUNNER_WORK_ROOT_REFUSED')
const workRoot = resolve(workRootInput)
if (workRoot.startsWith(`${repositoryRoot}/`) || existsSync(workRoot)) fail('R1C14_RUNNER_WORK_ROOT_REFUSED')

const image = pin.image.tag
const index = run('docker', ['image', 'inspect', image, '--format', '{{.Id}}'], { failure: 'R1C14_IMAGE_INSPECT_FAILED' })
const manifest = run('docker', ['image', 'inspect', '--platform', 'linux/amd64', image, '--format', '{{.Id}}'], { failure: 'R1C14_MANIFEST_INSPECT_FAILED' })
const rootfs = run('docker', ['image', 'inspect', '--platform', 'linux/amd64', image, '--format', '{{json .RootFS.Layers}}'], { failure: 'R1C14_ROOTFS_INSPECT_FAILED' })
if (index !== pin.image.ociIndexDigest) fail('R1C14_IMAGE_INDEX_PIN_MISMATCH')
if (manifest !== pin.image.linuxAmd64ManifestDigest) fail('R1C14_IMAGE_MANIFEST_PIN_MISMATCH')
if (rootfs !== JSON.stringify(pin.image.rootfsLayers)) fail('R1C14_ROOTFS_LAYERS_PIN_MISMATCH')
const immutableImage = index

let completed = false
let workRootCreated = false
let primaryFailure = null
let cleanupFailure = null
try {
mkdirSync(evidenceRoot, { recursive: false, mode: 0o700 })
mkdirSync(workRoot, { recursive: false, mode: 0o700 })
workRootCreated = true
const metadataPath = resolve(evidenceRoot, 'build-metadata.json')
copyFileSync(resolve(required('build-metadata')), metadataPath)
const metadataSha = createHash('sha256').update(readFileSync(metadataPath)).digest('hex')
if (metadataSha !== pin.image.buildMetadataSha256) fail('R1C14_METADATA_PIN_MISMATCH')
const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
const attestedBuild = validateBuildMetadata({
  metadata,
  dockerfileBytes: readFileSync(resolve(qualificationRoot, 'Dockerfile')),
  expectedImageIndex: pin.image.ociIndexDigest,
})

const candidatePath = resolve(evidenceRoot, 'candidate-results.json')
const resultPath = resolve(evidenceRoot, 'results.json')
const preCensusPath = resolve(evidenceRoot, 'product-census-before.json')
const postCensusPath = resolve(evidenceRoot, 'product-census-after.json')

  run(process.execPath, [resolve(qualificationRoot, 'product-census.mjs'), '--root', repositoryRoot, '--output', preCensusPath], { failure: 'R1C14_PRE_CENSUS_FAILED' })
  const admissionTap = `${run('docker', ['run', '--rm', '--network', 'none', '--platform', 'linux/amd64', '--entrypoint', 'node', '--volume', `${qualificationRoot}:/qualification:ro`, immutableImage, '--test', '--test-reporter=tap', '/qualification/admission.test.mjs'], { failure: 'R1C14_ADMISSION_TEST_FAILED' })}\n`
  if (!/^1\.\.12$/m.test(admissionTap) || !/^# pass 12$/m.test(admissionTap) || !/^# fail 0$/m.test(admissionTap)) fail('R1C14_ADMISSION_TEST_RESULT_REFUSED')
  const admissionTestPath = resolve(evidenceRoot, 'admission-test.tap')
  writeFileSync(admissionTestPath, admissionTap, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  const admissionTestSha = createHash('sha256').update(admissionTap).digest('hex')
  const syntheticSecret = `R1C14_SYNTHETIC_${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`
  writeFileSync(resolve(workRoot, 'synthetic-secret'), syntheticSecret, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  const environment = {
    R1C14_IMAGE_ID: pin.image.ociIndexDigest,
    R1C14_IMAGE_MANIFEST_DIGEST: pin.image.linuxAmd64ManifestDigest,
    R1C14_BUILD_METADATA_SHA256: pin.image.buildMetadataSha256,
    R1C14_BUILD_RECIPE_SHA256: attestedBuild.dockerfileSha256,
    R1C14_ATTESTED_ARCHIVE_SHA256: attestedBuild.archiveSha256,
    R1C14_ATTESTED_SIGNATURE_SHA256: attestedBuild.signatureSha256,
    R1C14_ATTESTED_RELEASE_KEY_SHA256: attestedBuild.releaseKeySha256,
    R1C14_EXPECTED_GIT_SHA256: pin.git.executableSha256,
    R1C14_ROOTFS_LAYERS: rootfs,
    R1C14_EXPECTED_ROOTFS_CLOSURE: pin.image.rootfsClosureSha256,
    R1C14_EXPECTED_DEPENDENCY_CLOSURE: pin.image.dependencyClosureSha256,
    R1C14_SYNTHETIC_SECRET_FILE: '/work/synthetic-secret',
    R1C14_S2_RECEIPT_SHA256: pin.predecessors.s2GenerationReceiptSha256,
    R1C14_S2_MANIFEST_SHA256: pin.predecessors.s2OwnershipManifestSha256,
    R1C14_OBSERVED_ON: pin.observedOn,
    R1C14_HOST_NODE_VERSION: process.version,
    R1C14_ADMISSION_TEST_SHA256: admissionTestSha,
    R1C14_WORK_ROOT: '/work/r1c14',
    R1C14_CANDIDATE_PATH: '/evidence/candidate-results.json',
  }
  const dockerEnvironment = Object.entries(environment).flatMap(([key, value]) => ['--env', `${key}=${value}`])
  run('docker', ['run', '--rm', '--network', 'none', '--platform', 'linux/amd64', '--entrypoint', 'node', ...dockerEnvironment, '--volume', `${qualificationRoot}:/qualification:ro`, '--volume', `${evidenceRoot}:/evidence`, '--volume', `${workRoot}:/work`, immutableImage, '/qualification/probe.mjs'], { capture: false, failure: 'R1C14_PROBE_FAILED' })
  run(process.execPath, [resolve(qualificationRoot, 'product-census.mjs'), '--root', repositoryRoot, '--output', postCensusPath], { failure: 'R1C14_POST_CENSUS_FAILED' })
  run(process.execPath, [resolve(qualificationRoot, 'finalize-result.mjs'), '--candidate', candidatePath, '--final', resultPath, '--pre-census', preCensusPath, '--post-census', postCensusPath, '--expected-check-ids', JSON.stringify(expectedCheckIds)], { env: { ...process.env, R1C14_SYNTHETIC_SECRET: syntheticSecret }, failure: 'R1C14_FINALIZATION_FAILED' })
  if (readdirSync(workRoot).length !== 0) fail('R1C14_WORK_ROOT_NOT_EMPTY')
  renameSync(evidenceRoot, finalEvidenceRoot)
  completed = true
  process.stdout.write(`${JSON.stringify({ evidenceRoot: finalEvidenceRoot, imageIndexDigest: index, linuxAmd64ManifestDigest: manifest, verdict: 'PASS' })}\n`)
} catch (error) {
  primaryFailure = error
} finally {
  if (!completed) {
    try { rmSync(evidenceRoot, { recursive: true, force: true }) } catch (error) { cleanupFailure = error }
  }
  if (workRootCreated) {
    try { rmSync(workRoot, { recursive: true, force: true }) } catch (error) { cleanupFailure ??= error }
  }
}
if (primaryFailure) {
  if (cleanupFailure) primaryFailure.cause = cleanupFailure
  throw primaryFailure
}
if (cleanupFailure) throw cleanupFailure
