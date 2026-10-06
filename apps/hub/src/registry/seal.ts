import { createHash } from 'node:crypto'
import { canonicalBytes } from '../../../../packages/canonical-json/src/index.mjs'
import { APPLICATION_MAX_FILES, APPLICATION_MAX_TOTAL_BYTES, ApplicationFilePath, ArtifactDigest, Sha256, mediaTypeOfPath, type BuilderRunId, type MediaType, type ProjectId, type SourceRevision } from '../../../../packages/contract/dist/index.js'
import { CURRENT_TEMPLATE_PIN } from '../platform/application-template-pins.js'
import { Failure } from '../platform/failure.js'
import { SealedApplication } from '../platform/sealed-application.js'

const THUMBNAIL_MAX_BYTES = 512_000
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]
const ENTRY_PATH = 'index.html'

type FileInput = Readonly<{ path: string; mediaType: string; bytes: Uint8Array; sha256: string }>
type SealOutcome = Readonly<{
  compiledApplication: Readonly<{ projectId: ProjectId; executionId: BuilderRunId; sourceRevision: SourceRevision; templateRef: string; recipeSha256: string; files: readonly FileInput[] }>
  thumbnail: Readonly<{ bytes: Uint8Array }> | null
}>
type SealRun = Readonly<{ projectId: ProjectId; builderRunId: BuilderRunId; sourceRevision: SourceRevision }>

type PayloadFile = Readonly<{ path: ApplicationFilePath; mediaType: MediaType; byteLength: number; sha256: Sha256; base64: string }>
type Thumbnail = Readonly<{ bytes: Uint8Array; sha256: Sha256 }>

/** What `retain` writes: the canonical JSON of the payload, its digest and the thumbnail, kept out of sight of every caller. */
type Contents = Readonly<{ payloadJson: string; thumbnail: Thumbnail | null }>
const contents = new WeakMap<SealedApplication, Contents>()

class SealedBuild extends SealedApplication {}

function refused(): never {
  throw new Failure('APPLICATION_ARTIFACT_INPUT_REFUSED')
}

function sealFile(file: FileInput): PayloadFile {
  const path = ApplicationFilePath.safeParse(file.path)
  const mediaType = mediaTypeOfPath(file.path)
  if (!path.success || mediaType === null || mediaType !== file.mediaType) return refused()
  const sha256 = createHash('sha256').update(file.bytes).digest('hex')
  if (sha256 !== file.sha256) return refused()
  return { path: path.data, mediaType, byteLength: file.bytes.byteLength, sha256: Sha256.parse(sha256), base64: Buffer.from(file.bytes).toString('base64') }
}

function sealFiles(files: readonly FileInput[]): readonly PayloadFile[] {
  if (files.length < 1 || files.length > APPLICATION_MAX_FILES) return refused()
  const sealed = files.map(sealFile).sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
  const total = sealed.reduce((sum, file) => sum + file.byteLength, 0)
  const paths = new Set(sealed.map((file) => file.path))
  if (paths.size !== sealed.length || !paths.has(ApplicationFilePath.parse(ENTRY_PATH)) || total > APPLICATION_MAX_TOTAL_BYTES) return refused()
  return sealed
}

function sealThumbnail(thumbnail: SealOutcome['thumbnail']): Thumbnail | null {
  if (thumbnail === null) return null
  const { bytes } = thumbnail
  if (bytes.byteLength === 0 || bytes.byteLength > THUMBNAIL_MAX_BYTES || !PNG_MAGIC.every((value, index) => bytes[index] === value)) return null
  return { bytes, sha256: Sha256.parse(createHash('sha256').update(bytes).digest('hex')) }
}

/**
 * Checks the compiled build against the run it came from and the template pin, then builds the
 * payload and hashes its canonical JSON. Pure: a refusal throws before the runner is called.
 */
export function seal({ compiledApplication, thumbnail }: SealOutcome, run: SealRun): SealedApplication {
  const { projectId, executionId, sourceRevision, templateRef, recipeSha256, files } = compiledApplication
  if (projectId !== run.projectId || executionId !== run.builderRunId || sourceRevision !== run.sourceRevision
    || templateRef !== CURRENT_TEMPLATE_PIN.templateRef || recipeSha256 !== CURRENT_TEMPLATE_PIN.recipeSha256) return refused()
  const payload = {
    format: 'application-payload-v1',
    profile: CURRENT_TEMPLATE_PIN.profile,
    templateRef,
    recipeSha256,
    entryPath: ENTRY_PATH,
    files: sealFiles(files),
  }
  const bytes = canonicalBytes(payload)
  const sealed = new SealedBuild(run.projectId, run.sourceRevision, ArtifactDigest.parse(createHash('sha256').update(bytes).digest('hex')))
  contents.set(sealed, { payloadJson: bytes.toString('utf8'), thumbnail: sealThumbnail(thumbnail) })
  return sealed
}

export function contentsOf(sealed: SealedApplication): Contents {
  const found = contents.get(sealed)
  if (found === undefined) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'SEALED_APPLICATION_NOT_SEALED' } })
  return found
}
