import { createHash } from 'node:crypto'
import { FileType, Sandbox } from 'e2b'
import type { CommandResult, EntryInfo, SandboxOpts } from 'e2b'

const TEMPLATE_REF = 'xdli9puqp1nepk4ht6lw:8a1e3885-c6d7-4b06-aea6-860632f407e6'
const RECIPE_SHA256 = '32230b4ba0b72625474b7f722e2294a256f9ab2f7c1c9b1eb107f38770edbe97'
const APP_ROOT = '/workspace/app'
const DIST_ROOT = '/workspace/dist'
const BUILD_COMMAND = 'node /opt/conexus/compiler/node_modules/vite/bin/vite.js build --config /opt/conexus/compiler/vite.config.mjs --configLoader native'
const MAX_FILES = 256
const MAX_FILE_BYTES = 1024 * 1024
const MAX_TOTAL_BYTES = 12 * 1024 * 1024
const MAX_LIST_ENTRIES = MAX_FILES * 8
const MAX_OUTPUT_DEPTH = MAX_FILES
const SANDBOX_TIMEOUT_MS = 180_000
const BUILD_TIMEOUT_MS = 120_000
const REQUEST_TIMEOUT_MS = 30_000

export type ApplicationCompilerInput = Readonly<{
  projectId: string
  changeId: string
  sourceRevision: string
  files: readonly Readonly<{ path: string; content: string }>[]
  signal?: AbortSignal
}>

export type CompiledApplicationFile = Readonly<{
  path: string
  mediaType: string
  bytes: Uint8Array
  sha256: string
}>

export type CompiledApplication = Readonly<{
  projectId: string
  changeId: string
  sourceRevision: string
  templateRef: string
  recipeSha256: string
  files: readonly CompiledApplicationFile[]
}>

export type ApplicationCompilerRuntime = Readonly<{
  kind: 'REMOTE_E2B'
  compile(input: ApplicationCompilerInput): Promise<CompiledApplication>
}>

export type E2BApplicationCompilerConfig = Readonly<{
  apiKey: string
  onSandboxCreated?: (sandboxId: string) => void
}>

const sourceRevisionPattern = /^[0-9a-f]{40}$/i
const hasControlCharacter = (value: string): boolean => [...value].some((character) => {
  const codePoint = character.codePointAt(0) ?? 0
  return codePoint <= 0x1f || codePoint === 0x7f
})
const safeIdentity = (value: string): boolean => typeof value === 'string' && value.length > 0 && value.length <= 256 &&
  !hasControlCharacter(value) && !value.includes('/') && !value.includes('\\')

const safeRelativePath = (path: string): boolean => path.length > 0 && path.length <= 4096 &&
  !hasControlCharacter(path) && !path.startsWith('/') && !path.includes('\\') &&
  path.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..')

const isForbiddenSourcePath = (path: string): boolean => {
  const parts = path.split('/')
  const basename = parts.at(-1) ?? ''
  return parts.some((part) => part === '.git' || part === 'node_modules' || part === '.env' || part.startsWith('.env.')) ||
    /^(?:vite|postcss)\.config(?:\.[^/]*)?$/.test(basename)
}

const isValidUtf8Text = (content: string): boolean => {
  if (content.includes('\u0000')) return false
  const bytes = Buffer.from(content, 'utf8')
  return bytes.toString('utf8') === content
}

const inputFiles = (input: ApplicationCompilerInput): readonly Readonly<{ path: string; content: string; bytes: Buffer }>[] => {
  if (!input || typeof input !== 'object' || !safeIdentity(input.projectId) || !safeIdentity(input.changeId) || !sourceRevisionPattern.test(input.sourceRevision) ||
    !Array.isArray(input.files) || input.files.length === 0 || input.files.length > MAX_FILES) {
    throw new Error('APPLICATION_COMPILER_INPUT_REFUSED')
  }

  const paths = new Set<string>()
  let totalBytes = 0
  const files: Array<Readonly<{ path: string; content: string; bytes: Buffer }>> = []
  for (const file of input.files) {
    if (!file || typeof file.path !== 'string' || typeof file.content !== 'string' ||
      !safeRelativePath(file.path) || isForbiddenSourcePath(file.path) || paths.has(file.path) ||
      !isValidUtf8Text(file.content)) throw new Error('APPLICATION_COMPILER_INPUT_REFUSED')
    const bytes = Buffer.from(file.content, 'utf8')
    if (bytes.byteLength > MAX_FILE_BYTES || totalBytes + bytes.byteLength > MAX_TOTAL_BYTES) {
      throw new Error('APPLICATION_COMPILER_INPUT_LIMIT_REFUSED')
    }
    paths.add(file.path)
    totalBytes += bytes.byteLength
    files.push(Object.freeze({ path: file.path, content: file.content, bytes }))
  }
  if (!paths.has('index.html')) throw new Error('APPLICATION_COMPILER_ENTRYPOINT_REFUSED')
  return Object.freeze(files)
}

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

const cleanupFailure = (error: unknown, original: unknown): Error => {
  if (original instanceof Error) return new AggregateError([original, error], 'APPLICATION_COMPILER_CLEANUP_FAILED')
  return new Error('APPLICATION_COMPILER_CLEANUP_FAILED', { cause: error })
}

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

export const createE2BApplicationCompiler = (
  config: E2BApplicationCompilerConfig,
): ApplicationCompilerRuntime => {
  if (!config || typeof config.apiKey !== 'string' || config.apiKey.length === 0 ||
    (config.onSandboxCreated !== undefined && typeof config.onSandboxCreated !== 'function')) {
    throw new Error('APPLICATION_COMPILER_CONFIG_REFUSED')
  }

  return Object.freeze({
    kind: 'REMOTE_E2B' as const,
    compile: async (input: ApplicationCompilerInput): Promise<CompiledApplication> => {
      const files = inputFiles(input)
      assertNotAborted(input.signal)
      let sandbox: Sandbox | undefined
      let originalError: unknown
      let compiled: CompiledApplication | undefined
      try {
        const sandboxOptions = {
          apiKey: config.apiKey,
          timeoutMs: SANDBOX_TIMEOUT_MS,
          secure: true,
          allowInternetAccess: false,
          network: { denyOut: ({ allTraffic }) => [allTraffic] },
          envs: {},
          lifecycle: { onTimeout: 'kill' },
          metadata: { purpose: 'conexus-builder-application-compiler' },
          requestTimeoutMs: REQUEST_TIMEOUT_MS,
        } satisfies SandboxOpts
        sandbox = await Sandbox.create(TEMPLATE_REF, sandboxOptions)
        if (!sandbox.sandboxId) throw new Error('APPLICATION_COMPILER_SANDBOX_REFUSED')
        config.onSandboxCreated?.(sandbox.sandboxId)
        assertNotAborted(input.signal)
        await sandbox.files.write(files.map((file) => ({ path: `${APP_ROOT}/${file.path}`, data: file.content })), requestOptions(input.signal))
        assertNotAborted(input.signal)
        const dependencyLink = await sandbox.commands.run('ln -s /opt/conexus/compiler/node_modules /workspace/app/node_modules', {
          cwd: '/workspace', timeoutMs: 10_000, ...requestOptions(input.signal),
        })
        if (dependencyLink.exitCode !== 0) throw new Error('APPLICATION_COMPILER_WORKSPACE_REFUSED')
        assertNotAborted(input.signal)
        let result: CommandResult
        try {
          result = await sandbox.commands.run(BUILD_COMMAND, {
            cwd: APP_ROOT, timeoutMs: BUILD_TIMEOUT_MS, ...(input.signal ? { signal: input.signal } : {}),
          })
        } catch (error) {
          if (input.signal?.aborted) throw error
          throw new Error('APPLICATION_COMPILATION_FAILED', { cause: error })
        }
        if (result.exitCode !== 0) throw new Error('APPLICATION_COMPILATION_FAILED')
        assertNotAborted(input.signal)
        const output = await collectOutput(sandbox, input.signal)
        assertNotAborted(input.signal)
        compiled = Object.freeze({
          projectId: input.projectId,
          changeId: input.changeId,
          sourceRevision: input.sourceRevision,
          templateRef: TEMPLATE_REF,
          recipeSha256: RECIPE_SHA256,
          files: output,
        })
      } catch (error) {
        originalError = input.signal?.aborted ? cancellation() : error
      }
      let cleanupError: unknown
      if (sandbox) {
        try {
          const killed = await sandbox.kill({ requestTimeoutMs: REQUEST_TIMEOUT_MS })
          if (!killed) cleanupError = new Error('Sandbox was not running')
        } catch (error) {
          cleanupError = error
        }
      }
      if (cleanupError) throw cleanupFailure(cleanupError, originalError)
      assertNotAborted(input.signal)
      if (originalError) throw originalError
      if (!compiled) throw new Error('APPLICATION_COMPILER_RESULT_REFUSED')
      return compiled
    },
  })
}
