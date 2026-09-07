import {
  BRAIN_REALIZATION_PATH,
  parseBrainRealization,
  parseBrainRealizationManifest,
  validateBrainSource,
  type BrainRealization,
  type ParsedBrainRealization,
  type ParsedBrainRealizationManifest,
} from '../../../../packages/brain-contract/src/index.mjs'
import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import type { ProjectSourceSnapshot, ProjectSourcePath } from './project-mastra.js'

export { BRAIN_REALIZATION_PATH, parseBrainRealization, parseBrainRealizationManifest }
export type { BrainRealization, ParsedBrainRealization, ParsedBrainRealizationManifest }

const digest = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)

export type VerifiedBrainRealizationSource = ParsedBrainRealization & Readonly<{
  sourceRevision: string
  manifestDigest: string
  sourceFiles: readonly Readonly<{ path: string; digest: string; byteLength: number }>[]
}>

export type VerifiedBrainRealizationManifestSource = ParsedBrainRealizationManifest & Readonly<{
  sourceRevision: string
  manifestDigest: string
  sourceFiles: readonly Readonly<{ path: string; digest: string; byteLength: number }>[]
}>

/** Reads only trusted Project source authority; no Brain payload or caller digest participates. */
export const readProjectBrainRealizationManifest = async ({ source, expectedSourceRevision }: Readonly<{
  source: ProjectSourceSnapshot
  expectedSourceRevision: string
}>): Promise<VerifiedBrainRealizationManifestSource> => {
  const failSource = (): never => { throw new Error('PROJECT_BRAIN_SOURCE_REFUSED') }
  const checkRevision = () => {
    if (!/^[0-9a-f]{40}$/.test(expectedSourceRevision) || source.sourceRevision !== expectedSourceRevision) {
      throw new Error('PROJECT_BRAIN_SOURCE_STALE')
    }
  }
  checkRevision()
  const entries = new Map<string, ProjectSourcePath>()
  for (const entry of await source.listPaths()) {
    if (!entry || typeof entry.path !== 'string' || entries.has(entry.path) || !digest(entry.digest) ||
      !Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0) return failSource()
    entries.set(entry.path, Object.freeze({ ...entry }))
  }
  const manifestEntry = entries.get(BRAIN_REALIZATION_PATH)
  if (manifestEntry?.ownershipClass !== 'APP-OWNED' || manifestEntry.byteLength > 262_144) return failSource()
  const readManifest = async () => {
    checkRevision()
    const files = await source.readBatch([BRAIN_REALIZATION_PATH])
    if (files.length !== 1) return failSource()
    const file = files[0]
    if (!file || file.path !== BRAIN_REALIZATION_PATH || typeof file.utf8Bytes !== 'string' ||
      file.digest !== manifestEntry.digest || Buffer.byteLength(file.utf8Bytes, 'utf8') !== manifestEntry.byteLength ||
      sha256(Buffer.from(file.utf8Bytes, 'utf8')) !== manifestEntry.digest) return failSource()
    checkRevision()
    return file.utf8Bytes
  }
  const text = await readManifest()
  let input: unknown
  try { input = JSON.parse(text) } catch { return failSource() }
  const parsed = parseBrainRealizationManifest(input)
  const sourceFiles = parsed.manifest.sourceInputs.map((reference) => {
    const file = entries.get(reference.path)
    if (file?.ownershipClass !== 'APP-OWNED' || file.digest !== reference.digest) return failSource()
    return Object.freeze({ path: file.path, digest: file.digest, byteLength: file.byteLength })
  })
  // Production readBatch rechecks main against the frozen source OID, even
  // when listPaths has cached the immutable tree's raw-blob digests.
  if (await readManifest() !== text) return failSource()
  return Object.freeze({ ...parsed, sourceRevision: expectedSourceRevision,
    manifestDigest: manifestEntry.digest, sourceFiles: Object.freeze(sourceFiles) })
}

/** The snapshot is a trusted Project capability, never supplied by a Product request. */
export const readProjectBrainRealization = async ({ source, expectedSourceRevision, brainSource }: Readonly<{
  source: ProjectSourceSnapshot
  expectedSourceRevision: string
  brainSource: unknown
}>): Promise<VerifiedBrainRealizationSource> => {
  const failSource = (): never => { throw new Error('PROJECT_BRAIN_SOURCE_REFUSED') }
  let capturedBrain: unknown
  try {
    const validatedBrain = validateBrainSource(brainSource)
    if (validatedBrain.schemaVersion !== 'conexus-brain/v2') return failSource()
    capturedBrain = JSON.parse(canonicalBytes(validatedBrain).toString('utf8'))
  } catch { return failSource() }
  const verified = await readProjectBrainRealizationManifest({ source, expectedSourceRevision })
  const parsed = parseBrainRealization(verified.manifest, capturedBrain)
  return Object.freeze({ ...parsed, sourceRevision: verified.sourceRevision,
    manifestDigest: verified.manifestDigest, sourceFiles: verified.sourceFiles })
}
