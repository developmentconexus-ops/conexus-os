import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(import.meta.dirname, '..')
const targetPath = resolve(repositoryRoot, 'apps/hub/src/generated/r1c14-git-identity.ts')

export function buildR1S3GitIdentity(root = repositoryRoot) {
  const manifestBytes = readFileSync(resolve(root, 'docs/evidence/4d/4d-r1-foundation-pin-manifest-r1c14-native-successor.json'))
  const manifest = JSON.parse(manifestBytes)

  const exactIdentity = {
    ociIndexDigest: manifest.image?.ociIndexDigest,
    linuxAmd64ManifestDigest: manifest.image?.linuxAmd64ManifestDigest,
    gitExecutablePath: manifest.git?.executablePath,
    gitExecutableSha256: manifest.git?.executableSha256,
    gitVersion: manifest.git?.version,
  }

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
  })
}

export function renderR1S3GitIdentity(identity) {
  return [
    '// GENERATED from operational Git/image pins by scripts/generate-r1-s3-git-identity.mjs. Historical receipt checks are separate.',
    `export const R1C14_GIT_IDENTITY = Object.freeze(${JSON.stringify(identity, null, 2)} as const)`,
    '',
  ].join('\n')
}

export function checkR1S3GitIdentity(root = repositoryRoot) {
  const identity = buildR1S3GitIdentity(root)
  const expected = renderR1S3GitIdentity(identity)
  const actual = readFileSync(resolve(root, 'apps/hub/src/generated/r1c14-git-identity.ts'), 'utf8')
  if (actual !== expected) throw new Error('S3_GIT_GENERATED_IDENTITY_DRIFT')
  return identity
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
