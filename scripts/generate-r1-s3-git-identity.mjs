import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(import.meta.dirname, '..')
const targetPath = resolve(repositoryRoot, 'apps/hub/src/generated/r1c14-git-identity.ts')

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

export function buildR1S3GitIdentity(root = repositoryRoot) {
  const manifestBytes = readFileSync(resolve(root, 'docs/evidence/4d/4d-r1-foundation-pin-manifest-r1c14-native-successor.json'))
  const receiptBytes = readFileSync(resolve(root, 'qualification/4d/r1-git-source-custody/evidence/native-readmission-linux-2026-09-01-v14/generation-receipt.json'))
  const manifest = JSON.parse(manifestBytes)
  const receipt = JSON.parse(receiptBytes)

  if (manifest.verdict !== 'PASS') throw new Error('S3_GIT_MANIFEST_NOT_PASS')
  if (receipt.proof?.productDelta !== 0 || receipt.proof?.secretContaminatedFileCount !== 0) {
    throw new Error('S3_GIT_RECEIPT_PROTECTED_PROPERTY_FAILED')
  }

  const manifestSha256 = sha256(manifestBytes)
  if (receipt.outputs?.manifestSha256 !== manifestSha256) throw new Error('S3_GIT_RECEIPT_MANIFEST_DIGEST_MISMATCH')
  if (receipt.outputs?.resultSha256 !== manifest.evidence?.resultSha256) throw new Error('S3_GIT_RESULT_DIGEST_MISMATCH')

  const exactIdentity = {
    ociIndexDigest: manifest.image?.ociIndexDigest,
    linuxAmd64ManifestDigest: manifest.image?.linuxAmd64ManifestDigest,
    gitExecutablePath: manifest.git?.executablePath,
    gitExecutableSha256: manifest.git?.executableSha256,
    gitVersion: manifest.git?.version,
  }
  if (JSON.stringify(receipt.exactIdentity) !== JSON.stringify({
    gitExecutableSha256: exactIdentity.gitExecutableSha256,
    linuxAmd64ManifestDigest: exactIdentity.linuxAmd64ManifestDigest,
    ociIndexDigest: exactIdentity.ociIndexDigest,
  })) throw new Error('S3_GIT_RECEIPT_IDENTITY_MISMATCH')

  const forbidden = manifest.imageIdentityRoles?.forbiddenForS3Binding
  if (!Array.isArray(forbidden) || forbidden.length !== 5 || !forbidden.includes('host Git')) {
    throw new Error('S3_GIT_FORBIDDEN_IDENTITY_CENSUS')
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(exactIdentity.ociIndexDigest) ||
      !/^sha256:[0-9a-f]{64}$/.test(exactIdentity.linuxAmd64ManifestDigest) ||
      !/^[0-9a-f]{64}$/.test(exactIdentity.gitExecutableSha256) ||
      !/^\/[A-Za-z0-9._/-]+$/.test(exactIdentity.gitExecutablePath) ||
      !/^\d+\.\d+\.\d+$/.test(exactIdentity.gitVersion)) {
    throw new Error('S3_GIT_IDENTITY_FORMAT')
  }

  return Object.freeze({
    ...exactIdentity,
    forbiddenBindingIdentities: Object.freeze([...forbidden]),
    manifestSha256,
    nativeReceiptSha256: sha256(receiptBytes),
    qualificationResultSha256: manifest.evidence.resultSha256,
  })
}

export function renderR1S3GitIdentity(identity) {
  return [
    '// GENERATED from the closed R1C-14 native-successor manifest and receipt by scripts/generate-r1-s3-git-identity.mjs. Do not edit.',
    `export const R1C14_GIT_IDENTITY = Object.freeze(${JSON.stringify(identity, null, 2)} as const)`,
    '',
  ].join('\n')
}

export function checkR1S3GitIdentity(root = repositoryRoot) {
  const expected = renderR1S3GitIdentity(buildR1S3GitIdentity(root))
  const actual = readFileSync(resolve(root, 'apps/hub/src/generated/r1c14-git-identity.ts'), 'utf8')
  if (actual !== expected) throw new Error('S3_GIT_GENERATED_IDENTITY_DRIFT')
  return buildR1S3GitIdentity(root)
}

function publish() {
  const output = renderR1S3GitIdentity(buildR1S3GitIdentity())
  mkdirSync(dirname(targetPath), { recursive: true })
  const temporaryPath = `${targetPath}.${process.pid}.tmp`
  try {
    writeFileSync(temporaryPath, output, { encoding: 'utf8', mode: 0o600 })
    renameSync(temporaryPath, targetPath)
  } catch (error) {
    try { unlinkSync(temporaryPath) } catch {}
    throw error
  }
  process.stdout.write(`${JSON.stringify({ target: 'apps/hub/src/generated/r1c14-git-identity.ts', identity: buildR1S3GitIdentity() })}\n`)
}

function main() {
  if (process.argv.includes('--check')) {
    const identity = checkR1S3GitIdentity()
    process.stdout.write(`${JSON.stringify({ verdict: 'PASS', identity })}\n`)
    return
  }
  publish()
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) main()
