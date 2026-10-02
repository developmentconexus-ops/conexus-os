import { createHash } from 'node:crypto'
import { FileType } from 'e2b'
import type { CommandResult, EntryInfo, Sandbox } from 'e2b'
import { CHECK_AGENT_IDENTITY, CHECK_COMMAND_TIMEOUT_MS, CHECK_NODE_PATH, CHECK_SCRIPT_PATH, parseCheckReport, redactEvidence } from './application-check.js'
import type { CheckReport } from './application-check.js'
import { CURRENT_TEMPLATE_PIN } from '../platform/application-template-pins.js'
import type { SANDBOX_AGENT_USER } from './sandbox.js'

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
  mediaType: string
  bytes: Uint8Array
  sha256: string
}>

type CompiledApplicationThumbnail = Readonly<{ mediaType: 'image/png'; bytes: Uint8Array }>

export type CompiledApplication = Readonly<{
  projectId: string
  sourceRevision: string
  templateRef: string
  recipeSha256: string
  files: readonly CompiledApplicationFile[]
  executionId: string
  thumbnail?: CompiledApplicationThumbnail
}>

const hasControlCharacter = (value: string): boolean => [...value].some((character) => {
  const codePoint = character.codePointAt(0) ?? 0
  return codePoint <= 0x1f || codePoint === 0x7f
})

const safeRelativePath = (path: string): boolean => path.length > 0 && path.length <= 4096 &&
  !hasControlCharacter(path) && !path.startsWith('/') && !path.includes('\\') &&
  path.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..')

const mediaTypeForPath = (path: string): string => {
  const extension = path.slice(path.lastIndexOf('.')).toLowerCase()
  const mediaTypes: Readonly<Record<string, string>> = {
    '.avif': 'image/avif',
    '.cjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.otf': 'font/otf',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.wasm': 'application/wasm',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  }
  const mediaType = mediaTypes[extension]
  if (!mediaType) throw new Error('APPLICATION_COMPILER_OUTPUT_MEDIA_TYPE_REFUSED')
  return mediaType
}

// Where the check wrote the build and who reads it: the Hub reads as root what the agent's user wrote.
type BuildPlace = Readonly<{ out: string; user?: CheckUser }>
const distRoot = (place: BuildPlace): string => place.out

const outputPath = (place: BuildPlace, path: string): string => {
  const prefix = `${distRoot(place)}/`
  if (!path.startsWith(prefix)) throw new Error('APPLICATION_COMPILER_OUTPUT_PATH_REFUSED')
  const relative = path.slice(prefix.length)
  if (!safeRelativePath(relative) || relative.split('/').length > MAX_OUTPUT_DEPTH) throw new Error('APPLICATION_COMPILER_OUTPUT_PATH_REFUSED')
  return relative
}

const cancellation = (): Error => new Error('APPLICATION_COMPILER_CANCELLED')

const assertNotAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) throw cancellation()
}

const requestOptions = (signal: AbortSignal | undefined, place?: BuildPlace): Readonly<{ requestTimeoutMs: number; signal?: AbortSignal; user?: CheckUser }> => ({
  requestTimeoutMs: REQUEST_TIMEOUT_MS,
  ...(signal ? { signal } : {}),
  ...(place?.user ? { user: place.user } : {}),
})

const readBoundedOutput = async (sandbox: Sandbox, place: BuildPlace, entry: EntryInfo, signal: AbortSignal | undefined): Promise<Uint8Array> => {
  const stream = await sandbox.files.read(entry.path, { format: 'stream', ...requestOptions(signal, place) })
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      assertNotAborted(signal)
      const next = await reader.read()
      if (next.done) break
      if (!(next.value instanceof Uint8Array) || next.value.byteLength > MAX_TOTAL_BYTES ||
        totalBytes + next.value.byteLength > MAX_TOTAL_BYTES || totalBytes + next.value.byteLength > entry.size) {
        await reader.cancel().catch(() => undefined)
        throw new Error('APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED')
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
  if (totalBytes !== entry.size) throw new Error('APPLICATION_COMPILER_OUTPUT_SIZE_REFUSED')
  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

const collectOutput = async (sandbox: Sandbox, place: BuildPlace, signal: AbortSignal | undefined): Promise<readonly CompiledApplicationFile[]> => {
  assertNotAborted(signal)
  const entries = await sandbox.files.list(distRoot(place), { depth: MAX_FILES, ...requestOptions(signal, place) })
  if (entries.length > MAX_LIST_ENTRIES) throw new Error('APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED')
  const files = new Map<string, EntryInfo>()
  let listedTotalBytes = 0
  for (const entry of entries) {
    if (entry.path === distRoot(place) && entry.type === FileType.DIR) continue
    const path = outputPath(place, entry.path)
    if (entry.type === FileType.DIR) continue
    if (entry.type !== FileType.FILE) throw new Error(entry.type === FileType.SYMLINK
      ? 'APPLICATION_COMPILER_OUTPUT_SYMLINK_REFUSED'
      : 'APPLICATION_COMPILER_OUTPUT_NON_REGULAR_REFUSED')
    if (files.has(path) || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > MAX_TOTAL_BYTES) {
      throw new Error('APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED')
    }
    listedTotalBytes += entry.size
    if (listedTotalBytes > MAX_TOTAL_BYTES) throw new Error('APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED')
    mediaTypeForPath(path)
    files.set(path, entry)
    if (files.size > MAX_FILES) throw new Error('APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED')
  }
  if (!files.has('index.html')) throw new Error('APPLICATION_COMPILER_OUTPUT_ENTRYPOINT_REFUSED')

  let totalBytes = 0
  const output: CompiledApplicationFile[] = []
  for (const path of [...files.keys()].sort()) {
    assertNotAborted(signal)
    const entry = files.get(path)
    if (!entry) throw new Error('APPLICATION_COMPILER_OUTPUT_PATH_REFUSED')
    const bytes = await readBoundedOutput(sandbox, place, entry, signal)
    assertNotAborted(signal)
    if (bytes.byteLength > MAX_TOTAL_BYTES || totalBytes + bytes.byteLength > MAX_TOTAL_BYTES) {
      throw new Error('APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED')
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

const readThumbnail = async (sandbox: Sandbox, place: BuildPlace, path: string, signal: AbortSignal | undefined): Promise<CompiledApplicationThumbnail | null> => {
  try {
    const bytes = await sandbox.files.read(path, { format: 'bytes', ...requestOptions(signal, place) })
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

/**
 * Runs the Hub's own `check.mjs` on the tree at `root` inside `sandbox` and, when the source passed,
 * reads the build it left in `out`. The script is the one placed at run start; nothing of the tree
 * is ever run as an instruction, and every step that executes application code runs as the agent's
 * user even when this command runs as root.
 */
export const checkApplicationInSandbox = async (
  sandbox: Sandbox,
  input: Readonly<{ root: string; out: string; collect: boolean; thumbnail?: string; user?: CheckUser; signal?: AbortSignal }>,
): Promise<ApplicationCheckRun> => {
  if (!SAFE_ABSOLUTE_PATH.test(input.root) || !SAFE_ABSOLUTE_PATH.test(input.out) || (input.thumbnail !== undefined && !SAFE_ABSOLUTE_PATH.test(input.thumbnail))) throw new Error('APPLICATION_COMPILER_WORKSPACE_REFUSED')
  const place: BuildPlace = { out: input.out, ...(input.user ? { user: input.user } : {}) }
  assertNotAborted(input.signal)
  let result: CommandResult
  try {
    result = await sandbox.commands.run(
      `${CHECK_NODE_PATH} ${CHECK_SCRIPT_PATH} --root '${input.root}' --out '${input.out}'${input.thumbnail ? ` --thumbnail '${input.thumbnail}'` : ''} --as ${CHECK_AGENT_IDENTITY}`,
      { cwd: '/', timeoutMs: CHECK_COMMAND_TIMEOUT_MS, ...(input.signal ? { signal: input.signal } : {}), ...(place.user ? { user: place.user } : {}) },
    )
  } catch (error) {
    if (input.signal?.aborted) throw cancellation()
    // A script that exits non-zero is raised by E2B as an error that still carries what it printed.
    const raised = error as Partial<CommandResult>
    if (typeof raised?.stdout !== 'string' || typeof raised.exitCode !== 'number') throw new Error('APPLICATION_CHECK_UNREADABLE', { cause: error })
    result = { stdout: raised.stdout, stderr: raised.stderr ?? '', exitCode: raised.exitCode } as CommandResult
  }
  assertNotAborted(input.signal)
  if (result.exitCode !== 0) throw new Error('APPLICATION_CHECK_UNREADABLE', { cause: { exitCode: result.exitCode, stderr: redactEvidence(result.stderr.slice(-2_000)) } })
  const report = parseCheckReport(result.stdout)
  const files = input.collect && report.ok ? await collectOutput(sandbox, place, input.signal) : null
  assertNotAborted(input.signal)
  const thumbnail = files && input.thumbnail ? await readThumbnail(sandbox, place, input.thumbnail, input.signal) : null
  return Object.freeze({ report, files, thumbnail })
}
