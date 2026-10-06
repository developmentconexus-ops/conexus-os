import { createHash } from 'node:crypto'
import { FileType } from 'e2b'
import type { CommandResult, EntryInfo, Sandbox } from 'e2b'
import { mediaTypeOfPath, type MediaType } from '../../../../packages/contract/dist/index.js'
import { checkCommand, readCheckReport } from './application-check.js'
import type { CheckBundle } from './check-delivery.js'
import type { Caller } from './check/command.js'
import { redactEvidence } from './check/problems.js'
import { type ArtifactManifest, CHECK_COMMAND_TIMEOUT_MS, type CheckReport, safeRelativePath } from './check/report.js'
import { CURRENT_TEMPLATE_PIN } from '../platform/application-template-pins.js'
import { SANDBOX_AGENT_USER } from './sandbox.js'
import { fieldOf } from '../platform/field-of.js'
import { Failure } from '../platform/failure.js'

/** Who runs the check's command: root for the Hub's own runs, the agent's user for the Builder's tool. */
type CheckUser = 'root' | typeof SANDBOX_AGENT_USER

export const TEMPLATE_REF = CURRENT_TEMPLATE_PIN.templateRef
export const RECIPE_SHA256 = CURRENT_TEMPLATE_PIN.recipeSha256
const MAX_FILES = 256
const MAX_TOTAL_BYTES = 12 * 1024 * 1024
const MAX_LIST_ENTRIES = MAX_FILES * 8
const MAX_OUTPUT_DEPTH = MAX_FILES
const REQUEST_TIMEOUT_MS = 30_000
const SAFE_ABSOLUTE_PATH = /^\/[A-Za-z0-9_./-]+$/

type CompiledApplicationFile = Readonly<{
  path: string
  mediaType: MediaType
  bytes: Uint8Array
  sha256: string
}>

/** A by-product of the check, retained beside the compiled application and never part of it. */
export type CompiledApplicationThumbnail = Readonly<{ mediaType: 'image/png'; bytes: Uint8Array }>

export type CompiledApplication = Readonly<{
  projectId: string
  sourceRevision: string
  templateRef: string
  recipeSha256: string
  files: readonly CompiledApplicationFile[]
  executionId: string
}>

const mediaTypeForPath = (path: string): MediaType => {
  const mediaType = mediaTypeOfPath(path)
  if (!mediaType) throw new Failure('APPLICATION_COMPILER_OUTPUT_MEDIA_TYPE_REFUSED')
  return mediaType
}

// Where the check wrote the build and who reads it: the Hub reads as root what the agent's user wrote.
type BuildPlace = Readonly<{ out: string; user: CheckUser }>
const distRoot = (place: BuildPlace): string => place.out

const outputPath = (place: BuildPlace, path: string): string => {
  const prefix = `${distRoot(place)}/`
  if (!path.startsWith(prefix)) throw new Failure('APPLICATION_COMPILER_OUTPUT_PATH_REFUSED')
  const relative = path.slice(prefix.length)
  if (!safeRelativePath(relative) || relative.split('/').length > MAX_OUTPUT_DEPTH) throw new Failure('APPLICATION_COMPILER_OUTPUT_PATH_REFUSED')
  return relative
}

const requestOptions = (place: BuildPlace): Readonly<{ requestTimeoutMs: number; user: CheckUser }> => ({
  requestTimeoutMs: REQUEST_TIMEOUT_MS,
  user: place.user,
})

const readBoundedOutput = async (sandbox: Sandbox, place: BuildPlace, entry: EntryInfo): Promise<Uint8Array> => {
  const stream = await sandbox.files.read(entry.path, { format: 'stream', ...requestOptions(place) })
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      if (!(next.value instanceof Uint8Array) || next.value.byteLength > MAX_TOTAL_BYTES ||
        totalBytes + next.value.byteLength > MAX_TOTAL_BYTES || totalBytes + next.value.byteLength > entry.size) {
        await reader.cancel().catch(() => undefined)
        throw new Failure('APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED')
      }
      chunks.push(next.value)
      totalBytes += next.value.byteLength
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
  if (totalBytes !== entry.size) throw new Failure('APPLICATION_COMPILER_OUTPUT_SIZE_REFUSED')
  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

const collectOutput = async (sandbox: Sandbox, place: BuildPlace): Promise<readonly CompiledApplicationFile[]> => {
  const entries = await sandbox.files.list(distRoot(place), { depth: MAX_FILES, ...requestOptions(place) })
  if (entries.length > MAX_LIST_ENTRIES) throw new Failure('APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED')
  const files = new Map<string, EntryInfo>()
  let listedTotalBytes = 0
  for (const entry of entries) {
    if (entry.path === distRoot(place) && entry.type === FileType.DIR) continue
    const path = outputPath(place, entry.path)
    if (entry.type === FileType.DIR) continue
    if (entry.type !== FileType.FILE) throw new Failure(entry.type === FileType.SYMLINK
      ? 'APPLICATION_COMPILER_OUTPUT_SYMLINK_REFUSED'
      : 'APPLICATION_COMPILER_OUTPUT_NON_REGULAR_REFUSED')
    if (files.has(path) || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > MAX_TOTAL_BYTES) {
      throw new Failure('APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED')
    }
    listedTotalBytes += entry.size
    if (listedTotalBytes > MAX_TOTAL_BYTES) throw new Failure('APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED')
    mediaTypeForPath(path)
    files.set(path, entry)
    if (files.size > MAX_FILES) throw new Failure('APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED')
  }
  if (!files.has('index.html')) throw new Failure('APPLICATION_COMPILER_OUTPUT_ENTRYPOINT_REFUSED')

  let totalBytes = 0
  const output: CompiledApplicationFile[] = []
  for (const path of [...files.keys()].sort()) {
    const entry = files.get(path)
    if (!entry) throw new Failure('APPLICATION_COMPILER_OUTPUT_PATH_REFUSED')
    const bytes = await readBoundedOutput(sandbox, place, entry)
    if (bytes.byteLength > MAX_TOTAL_BYTES || totalBytes + bytes.byteLength > MAX_TOTAL_BYTES) {
      throw new Failure('APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED')
    }
    const ownedBytes = new Uint8Array(bytes)
    output.push(Object.freeze({
      path,
      mediaType: mediaTypeForPath(path),
      bytes: ownedBytes,
      sha256: createHash('sha256').update(ownedBytes).digest('hex'),
    }))
    totalBytes += ownedBytes.byteLength
  }
  return Object.freeze(output)
}

const THUMBNAIL_MAX_BYTES = 512_000
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

const readThumbnail = async (sandbox: Sandbox, place: BuildPlace, path: string): Promise<CompiledApplicationThumbnail | null> => {
  try {
    const bytes = await sandbox.files.read(path, { format: 'bytes', ...requestOptions(place) })
    if (bytes.byteLength === 0 || bytes.byteLength > THUMBNAIL_MAX_BYTES || !PNG_MAGIC.every((value, index) => bytes[index] === value)) return null
    return Object.freeze({ mediaType: 'image/png' as const, bytes: new Uint8Array(bytes) })
  } catch {
    return null
  }
}

export type ApplicationCheckRun = Readonly<{
  report: CheckReport
  /** The build's files, read only when the check passed its blocking steps and `collect` was asked for. */
  files: readonly CompiledApplicationFile[] | null
  /** The picture the boot step took of the rendered page, when the build was collected and one was taken. */
  thumbnail: CompiledApplicationThumbnail | null
}>

/** Who runs the check's command: the gate as root, the agent's own tool as the agent's user. */
const userOf = (caller: Caller): CheckUser => (caller === 'gate' ? 'root' : SANDBOX_AGENT_USER)

/** What the Hub collected is what the check listed: the same paths, each with the same size and sha256, no file more or less. */
const matchesManifest = (files: readonly CompiledApplicationFile[], manifest: ArtifactManifest): boolean => {
  const listed = new Map(manifest.files.map((file) => [file.path, file]))
  return files.length === listed.size && files.every((file) => {
    const claimed = listed.get(file.path)
    return claimed !== undefined && claimed.bytes === file.bytes.byteLength && claimed.sha256 === file.sha256
  })
}

/**
 * Runs the check this Hub sent to the VM, by the path of its own hash, on the tree at `root` and,
 * when the source passed, reads the build it left in `out`. Nothing of the tree is ever run as an
 * instruction, and every step that executes application code runs as the agent's user even when
 * this command runs as root. What comes back is read in a fixed order: a report that is no JSON,
 * one that breaks the schema, one from another bundle, one whose manifest the collected files do
 * not match. Each refuses, and nothing is admitted.
 */
export const checkApplicationInSandbox = async (
  sandbox: Sandbox,
  input: Readonly<{ check: CheckBundle; caller: Caller; root: string; out: string; collect: boolean; thumbnail?: string }>,
): Promise<ApplicationCheckRun> => {
  if (!SAFE_ABSOLUTE_PATH.test(input.root) || !SAFE_ABSOLUTE_PATH.test(input.out) || (input.thumbnail !== undefined && !SAFE_ABSOLUTE_PATH.test(input.thumbnail))) throw new Failure('APPLICATION_COMPILER_WORKSPACE_REFUSED')
  const place: BuildPlace = { out: input.out, user: userOf(input.caller) }
  let result: CommandResult
  try {
    result = await sandbox.commands.run(
      checkCommand({ sha256: input.check.sha256, caller: input.caller, root: input.root, out: input.out, ...(input.thumbnail ? { thumbnail: input.thumbnail } : {}) }),
      { cwd: '/', timeoutMs: CHECK_COMMAND_TIMEOUT_MS, user: place.user },
    )
  } catch (error) {
    // A script that exits non-zero is raised by E2B as an error that still carries what it printed.
    const stdout = fieldOf(error, 'stdout')
    const stderr = fieldOf(error, 'stderr')
    const exitCode = fieldOf(error, 'exitCode')
    if (typeof stdout !== 'string' || typeof exitCode !== 'number') throw new Failure('APPLICATION_CHECK_UNREADABLE', { cause: error })
    result = { stdout, stderr: typeof stderr === 'string' ? stderr : '', exitCode }
  }
  if (result.exitCode !== 0) throw new Failure('APPLICATION_CHECK_UNREADABLE', { cause: { exitCode: result.exitCode, stderr: redactEvidence(result.stderr.slice(-2_000)) } })
  const report = readCheckReport(result.stdout)
  if (report.checkSha256 !== input.check.sha256) throw new Failure('BUILDER_CHECK_IDENTITY_MISMATCH', { cause: { reported: report.checkSha256, expected: input.check.sha256 } })
  if (report.artifact && report.artifact.templateRef !== TEMPLATE_REF) throw new Failure('APPLICATION_CHECK_UNREADABLE', { cause: { templateRef: report.artifact.templateRef } })
  const files = input.collect && report.ok ? await collectOutput(sandbox, place) : null
  if (files && report.artifact && !matchesManifest(files, report.artifact)) throw new Failure('APPLICATION_CHECK_UNREADABLE', { cause: 'the collected files are not the artifact the check listed' })
  const thumbnail = files && input.thumbnail ? await readThumbnail(sandbox, place, input.thumbnail) : null
  return Object.freeze({ report, files, thumbnail })
}
