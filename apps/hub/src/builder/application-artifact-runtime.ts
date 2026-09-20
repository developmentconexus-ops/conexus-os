import { createHash } from 'node:crypto'
import { FileType } from 'e2b'
import type { CommandResult, EntryInfo, Sandbox } from 'e2b'

export const TEMPLATE_REF = '537fnzf4c16x9d7oz21k:392ec729-82d7-4f25-bbf0-cc09361611fe'
export const RECIPE_SHA256 = '6834ca0434e1e6a597340d22d5c1692339a4fc4860948ff834b9851e61406edc'
const DIST_ROOT = '/workspace/dist'
const BUILD_COMMAND = 'node /opt/conexus/compiler/node_modules/vite/bin/vite.js build --config /opt/conexus/compiler/vite.config.mjs --configLoader native'
const MAX_FILES = 256
const MAX_TOTAL_BYTES = 12 * 1024 * 1024
const MAX_LIST_ENTRIES = MAX_FILES * 8
const MAX_OUTPUT_DEPTH = MAX_FILES
const BUILD_TIMEOUT_MS = 120_000
const REQUEST_TIMEOUT_MS = 30_000

export type CompiledApplicationFile = Readonly<{
  path: string
  mediaType: string
  bytes: Uint8Array
  sha256: string
}>

export type CompiledApplication = Readonly<{
  projectId: string
  sourceRevision: string
  templateRef: string
  recipeSha256: string
  files: readonly CompiledApplicationFile[]
  executionId: string
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

const outputPath = (path: string): string => {
  const prefix = `${DIST_ROOT}/`
  if (!path.startsWith(prefix)) throw new Error('APPLICATION_COMPILER_OUTPUT_PATH_REFUSED')
  const relative = path.slice(prefix.length)
  if (!safeRelativePath(relative) || relative.split('/').length > MAX_OUTPUT_DEPTH) throw new Error('APPLICATION_COMPILER_OUTPUT_PATH_REFUSED')
  return relative
}

const cancellation = (): Error => new Error('APPLICATION_COMPILER_CANCELLED')

const assertNotAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) throw cancellation()
}

const requestOptions = (signal: AbortSignal | undefined): Readonly<{ requestTimeoutMs: number; signal?: AbortSignal }> => signal
  ? { requestTimeoutMs: REQUEST_TIMEOUT_MS, signal }
  : { requestTimeoutMs: REQUEST_TIMEOUT_MS }

const readBoundedOutput = async (sandbox: Sandbox, entry: EntryInfo, signal: AbortSignal | undefined): Promise<Uint8Array> => {
  const stream = await sandbox.files.read(entry.path, { format: 'stream', ...requestOptions(signal) })
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

const collectOutput = async (sandbox: Sandbox, signal: AbortSignal | undefined): Promise<readonly CompiledApplicationFile[]> => {
  assertNotAborted(signal)
  const entries = await sandbox.files.list(DIST_ROOT, { depth: MAX_FILES, ...requestOptions(signal) })
  if (entries.length > MAX_LIST_ENTRIES) throw new Error('APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED')
  const files = new Map<string, EntryInfo>()
  let listedTotalBytes = 0
  for (const entry of entries) {
    if (entry.path === DIST_ROOT && entry.type === FileType.DIR) continue
    const path = outputPath(entry.path)
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
    const bytes = await readBoundedOutput(sandbox, entry, signal)
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

/** Builds an application tree already checked out inside `sandbox`, sharing the agent sandbox instead of a second one. */
export const buildApplicationInSandbox = async (
  sandbox: Sandbox,
  input: Readonly<{ appRoot: string; signal?: AbortSignal }>,
): Promise<readonly CompiledApplicationFile[]> => {
  assertNotAborted(input.signal)
  const dependencyLink = await sandbox.commands.run(`ln -sfn /opt/conexus/compiler/node_modules ${input.appRoot}/node_modules`, {
    cwd: '/workspace', timeoutMs: 10_000, ...requestOptions(input.signal),
  })
  if (dependencyLink.exitCode !== 0) throw new Error('APPLICATION_COMPILER_WORKSPACE_REFUSED')
  assertNotAborted(input.signal)
  let result: CommandResult
  try {
    result = await sandbox.commands.run(BUILD_COMMAND, {
      cwd: input.appRoot, timeoutMs: BUILD_TIMEOUT_MS, envs: { CONEXUS_COMPILE_ROOT: input.appRoot },
      ...(input.signal ? { signal: input.signal } : {}),
    })
  } catch (error) {
    if (input.signal?.aborted) throw error
    throw new Error('APPLICATION_COMPILATION_FAILED', { cause: error })
  }
  if (result.exitCode !== 0) throw new Error('APPLICATION_COMPILATION_FAILED')
  assertNotAborted(input.signal)
  const output = await collectOutput(sandbox, input.signal)
  assertNotAborted(input.signal)
  return output
}
