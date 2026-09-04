import { createHash } from 'node:crypto'

export const EXPECTED_MATERIALS = Object.freeze([
  Object.freeze({
    uri: 'pkg:docker/docker/dockerfile@1.7',
    sha256: 'a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e',
  }),
  Object.freeze({
    uri: 'pkg:docker/node?digest=sha256:be23f54a88d34e8824c741b19b91064094f92c1c97b194144bfc8b50d67258e2&platform=linux%2Famd64',
    sha256: 'be23f54a88d34e8824c741b19b91064094f92c1c97b194144bfc8b50d67258e2',
  }),
  Object.freeze({
    uri: 'https://keyserver.ubuntu.com/pks/lookup?op=get&search=0xE1F036B1FEE7221FC778ECEFB0B5E88696AFE6CB',
    sha256: 'fd2809d850e844b614ac60f13ded554c55d9052e5c799a5814abcba2a68a063c',
  }),
  Object.freeze({
    uri: 'https://www.kernel.org/pub/software/scm/git/git-2.55.0.tar.sign',
    sha256: '8673501946204c38ebfed09603c1f3a041ed8d12b31f0aa06a474d41e359e254',
  }),
  Object.freeze({
    uri: 'https://www.kernel.org/pub/software/scm/git/git-2.55.0.tar.xz',
    sha256: '457fdb04dc8728e007d4688695e6912e6f680727920f2a40bf11eacc17505357',
  }),
])

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const fail = (code, detail = '') => { throw new Error(`${code}${detail ? `:${detail}` : ''}`) }
const materialKey = ({ uri, sha256: digest }) => `${uri}\0${digest}`

const dockerfileLogicalLines = (bytes) => {
  const lines = bytes.toString('utf8').replaceAll('\r\n', '\n').split('\n')
  const logical = []
  let current = ''
  for (const raw of lines) {
    const continued = /\\\s*$/.test(raw)
    const fragment = raw.replace(/\\\s*$/, '').trim()
    current = `${current}${current && fragment ? ' ' : ''}${fragment}`
    if (!continued) {
      if (current && !current.startsWith('#')) logical.push(current)
      current = ''
    }
  }
  if (current) fail('R1C14_METADATA_DOCKERFILE_CONTINUATION_INVALID')
  return logical
}

export const assertNoUnattestedContextConsumption = (dockerfileBytes) => {
  for (const line of dockerfileLogicalLines(Buffer.from(dockerfileBytes))) {
    const [rawInstruction, ...tokens] = line.split(/\s+/)
    const instruction = rawInstruction.toUpperCase()
    if (instruction === 'COPY') fail('R1C14_METADATA_CONTEXT_CONSUMPTION_REFUSED', 'COPY')
    if (instruction === 'ADD') {
      const operands = tokens.filter((token) => !token.startsWith('--'))
      if (operands.length !== 2 || !/^https?:\/\//i.test(operands[0])) {
        fail('R1C14_METADATA_CONTEXT_CONSUMPTION_REFUSED', 'ADD')
      }
    }
    if (instruction === 'RUN' && tokens.some((token) => token.startsWith('--mount=') && /(?:^|,)type=bind(?:,|$)/.test(token.slice('--mount='.length)))) {
      fail('R1C14_METADATA_CONTEXT_CONSUMPTION_REFUSED', 'RUN_BIND_MOUNT')
    }
  }
}

const hasFalseVcsIdentity = (value) => {
  if (Array.isArray(value)) return value.some(hasFalseVcsIdentity)
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, child]) => (
    key === 'vcs:revision' || key === 'vcs:source' || hasFalseVcsIdentity(child)
  ))
}

export function validateBuildMetadata({ metadata, dockerfileBytes, expectedImageIndex }) {
  if (hasFalseVcsIdentity(metadata)) fail('R1C14_METADATA_FALSE_VCS_IDENTITY')
  if (metadata?.['containerimage.digest'] !== expectedImageIndex) fail('R1C14_METADATA_IMAGE_DIGEST_MISMATCH')

  const provenance = metadata?.['buildx.build.provenance']
  const source = provenance?.metadata?.['https://mobyproject.org/buildkit@v1#metadata']?.source
  const dockerfile = source?.infos?.find(({ filename, language }) => filename === 'Dockerfile' && language === 'Dockerfile')
  if (!dockerfile || typeof dockerfile.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(dockerfile.data)) {
    fail('R1C14_METADATA_DOCKERFILE_MISSING')
  }
  const embeddedBytes = Buffer.from(dockerfile.data, 'base64')
  if (embeddedBytes.toString('base64') !== dockerfile.data || !embeddedBytes.equals(Buffer.from(dockerfileBytes))) {
    fail('R1C14_METADATA_DOCKERFILE_MISMATCH')
  }
  assertNoUnattestedContextConsumption(embeddedBytes)

  if (!Array.isArray(provenance.materials)) fail('R1C14_METADATA_MATERIALS_MISSING')
  const actualMaterials = provenance.materials.map(({ uri, digest }) => {
    if (typeof uri !== 'string' || !digest || typeof digest.sha256 !== 'string') fail('R1C14_METADATA_MATERIAL_INVALID')
    return { uri, sha256: digest.sha256 }
  })
  const actualKeys = actualMaterials.map(materialKey).sort()
  const expectedKeys = EXPECTED_MATERIALS.map(materialKey).sort()
  if (new Set(actualKeys).size !== actualKeys.length || JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    fail('R1C14_METADATA_MATERIALS_MISMATCH')
  }

  const byUri = Object.fromEntries(actualMaterials.map((entry) => [entry.uri, entry.sha256]))
  return {
    dockerfileSha256: sha256(embeddedBytes),
    dockerfileFrontendSha256: byUri['pkg:docker/docker/dockerfile@1.7'],
    baseImageSha256: byUri[EXPECTED_MATERIALS[1].uri],
    releaseKeySha256: byUri[EXPECTED_MATERIALS[2].uri],
    signatureSha256: byUri[EXPECTED_MATERIALS[3].uri],
    archiveSha256: byUri[EXPECTED_MATERIALS[4].uri],
  }
}
