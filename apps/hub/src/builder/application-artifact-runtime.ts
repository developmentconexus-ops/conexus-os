import { createHash } from 'node:crypto'
import { FileType } from 'e2b'
import type { CommandResult, EntryInfo, Sandbox } from 'e2b'

export const TEMPLATE_REF = '537fnzf4c16x9d7oz21k:0f44de30-d856-40d1-b6b3-54a8bbf2f440'
export const RECIPE_SHA256 = 'df2e896284661a4402158d6e694493332df57de4b56f4c565e5b6ed19bfabde4'
const DEFAULT_WORK_ROOT = '/workspace'
export const BUILD_COMMAND ='node /opt/conexus/compiler/node_modules/vite/bin/vite.js build --config /opt/conexus/compiler/vite.config.mjs --configLoader native'
const MAX_FILES = 256
const MAX_TOTAL_BYTES = 12 * 1024 * 1024
const MAX_LIST_ENTRIES = MAX_FILES * 8
const MAX_OUTPUT_DEPTH = MAX_FILES
const BUILD_TIMEOUT_MS = 120_000
const REQUEST_TIMEOUT_MS = 30_000
const SMOKE_PORT = 41200
const SMOKE_DEVTOOLS_PORT = 41201
const SMOKE_ROOT_ID = 'root'
const SMOKE_BUDGET_MS = 20_000
// E2B's own command timeout is the hard backstop; this is slack for the shell/node startup the
// script's internal budget does not cover, so the command-level bound still fires before it would
// ever look like a hang to the caller.
const SMOKE_TIMEOUT_MS = SMOKE_BUDGET_MS + 10_000
const SMOKE_SCRIPT_FILE = '.conexus-smoke.mjs'
const SMOKE_HEREDOC = 'CONEXUS_SMOKE_SCRIPT_EOF'

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

// Where a build writes and who it runs as: the compile, its output, the smoke script and its
// browser profile all live under workRoot.
type BuildPlace = Readonly<{ workRoot: string; user?: 'root' }>
const distRoot = (place: BuildPlace): string => `${place.workRoot}/dist`

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

const requestOptions = (signal: AbortSignal | undefined, place?: BuildPlace): Readonly<{ requestTimeoutMs: number; signal?: AbortSignal; user?: 'root' }> => ({
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

// Serves DIST_ROOT's own bytes over loopback HTTP, drives headless Chromium at it over CDP (Node's
// built-in fetch and WebSocket, no dependency), and prints one JSON verdict line. Nothing here
// touches the served bytes: injecting a readiness beacon into the page would defeat the sha256
// check Conexus runs per request later, and a beacon inside `app/**` would be the agent's own
// claim, not an observation. The verdict is read from outside the page instead, over CDP:
// `Runtime.evaluate` counts the root element's children, `Runtime.exceptionThrown` is Chromium's
// own uncaught-error signal. A second, in-script timer is the first line of defense against a hang
// (chromium/devtools never answering); the caller's own commands.run timeout is the backstop that
// still holds if the script itself wedges.
const smokeScriptSource = (place: BuildPlace): string => `
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { spawn } from 'node:child_process'

const DIST_ROOT = ${JSON.stringify(distRoot(place))}
const PROFILE = ${JSON.stringify(`${place.workRoot}/.conexus-smoke-profile`)}
const PORT = ${SMOKE_PORT}
const DEVTOOLS_PORT = ${SMOKE_DEVTOOLS_PORT}
const ROOT_ID = ${JSON.stringify(SMOKE_ROOT_ID)}
const BUDGET_MS = ${SMOKE_BUDGET_MS}
const MEDIA_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }

let settled = false
const output = (verdict) => {
  if (settled) return
  settled = true
  process.stdout.write(JSON.stringify(verdict))
  process.exit(verdict.ok ? 0 : 1)
}
const timer = setTimeout(() => output({ ok: false, reason: 'APPLICATION_SMOKE_TIMEOUT' }), BUDGET_MS)
timer.unref?.()

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1')
    const relative = requestUrl.pathname === '/' ? 'index.html' : decodeURIComponent(requestUrl.pathname).replace(/^\\/+/, '')
    const resolved = normalize(join(DIST_ROOT, relative))
    if (resolved !== DIST_ROOT && !resolved.startsWith(DIST_ROOT + sep)) { res.writeHead(403); res.end(); return }
    const body = await readFile(resolved)
    res.writeHead(200, { 'content-type': MEDIA_TYPES[extname(resolved)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end()
  }
})

try {
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(PORT, '127.0.0.1', resolveListen)
  })

  const chromium = spawn('chromium', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    \`--remote-debugging-port=\${DEVTOOLS_PORT}\`, '--remote-debugging-address=127.0.0.1',
    \`--user-data-dir=\${PROFILE}\`, 'about:blank',
  ], { stdio: 'ignore' })
  chromium.once('error', () => output({ ok: false, reason: 'APPLICATION_SMOKE_CHROMIUM_UNAVAILABLE' }))

  // Runtime and Page live on a page target. The browser-level endpoint from /json/version answers
  // the handshake and then refuses those domains, so the page target's own socket is the one to use.
  let webSocketDebuggerUrl
  const deadline = Date.now() + BUDGET_MS
  while (Date.now() < deadline && !webSocketDebuggerUrl) {
    try {
      const targets = await (await fetch(\`http://127.0.0.1:\${DEVTOOLS_PORT}/json/list\`)).json()
      webSocketDebuggerUrl = targets.find((target) => target.type === 'page')?.webSocketDebuggerUrl
    } catch {
      // the browser is not listening yet
    }
    if (!webSocketDebuggerUrl) await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  if (!webSocketDebuggerUrl) throw new Error('APPLICATION_SMOKE_DEVTOOLS_UNAVAILABLE')

  const socket = new WebSocket(webSocketDebuggerUrl)
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', () => resolveOpen(), { once: true })
    socket.addEventListener('error', () => rejectOpen(new Error('APPLICATION_SMOKE_CDP_CONNECT_FAILED')), { once: true })
  })

  let nextRequestId = 1
  const pendingRequests = new Map()
  let uncaughtErrorText = null
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id !== undefined && pendingRequests.has(message.id)) {
      const request = pendingRequests.get(message.id)
      pendingRequests.delete(message.id)
      if (message.error) request.reject(new Error(message.error.message))
      else request.resolve(message.result)
      return
    }
    if (message.method === 'Runtime.exceptionThrown' && uncaughtErrorText === null) {
      uncaughtErrorText = message.params?.exceptionDetails?.text ?? 'uncaught exception'
    }
  })
  const send = (method, params = {}) => new Promise((resolveSend, rejectSend) => {
    const id = nextRequestId++
    pendingRequests.set(id, { resolve: resolveSend, reject: rejectSend })
    socket.send(JSON.stringify({ id, method, params }))
  })

  // The load event waits for every subresource, so an app that pulls a web font or a CDN script would
  // tie the smoke to a third-party host being up and fast, and fail a check that only asks whether
  // the app mounts. Anything not served here fails at once instead.
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.method !== 'Fetch.requestPaused') return
    const { requestId, request } = message.params
    const local = new URL(request.url).host === \`127.0.0.1:\${PORT}\`
    socket.send(JSON.stringify(local
      ? { id: nextRequestId++, method: 'Fetch.continueRequest', params: { requestId } }
      : { id: nextRequestId++, method: 'Fetch.failRequest', params: { requestId, errorReason: 'BlockedByClient' } }))
  })

  await send('Runtime.enable')
  await send('Page.enable')
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  const loaded = new Promise((resolveLoad) => {
    const handler = (event) => {
      const message = JSON.parse(event.data)
      if (message.method === 'Page.loadEventFired') { socket.removeEventListener('message', handler); resolveLoad() }
    }
    socket.addEventListener('message', handler)
  })
  await send('Page.navigate', { url: \`http://127.0.0.1:\${PORT}/\` })
  await loaded
  // First paint can still be followed by an effect that mounts or throws a beat later; a fixed
  // settle window catches that without turning the whole smoke into an open-ended wait.
  await new Promise((resolveSettle) => setTimeout(resolveSettle, 250))
  const evaluated = await send('Runtime.evaluate', {
    expression: \`(() => { const el = document.getElementById(\${JSON.stringify(ROOT_ID)}); return el ? el.children.length : -1 })()\`,
    returnByValue: true,
  })
  const childCount = evaluated?.result?.value
  clearTimeout(timer)
  chromium.kill('SIGKILL')
  server.close()
  if (typeof childCount !== 'number' || childCount <= 0) output({ ok: false, reason: 'APPLICATION_SMOKE_NO_ROOT_CHILD' })
  if (uncaughtErrorText !== null) output({ ok: false, reason: 'APPLICATION_SMOKE_UNCAUGHT_ERROR', detail: uncaughtErrorText })
  output({ ok: true, childCount })
} catch (error) {
  clearTimeout(timer)
  server.close()
  output({ ok: false, reason: error instanceof Error ? error.message : 'APPLICATION_SMOKE_FAILED' })
}
`

// The script exits 0 only on its own `ok: true` line, so the exit code is a second, independent
// witness to the same claim; a nonzero exit (killed, crashed before it could print) fails closed
// even if some earlier, unrelated stdout line happened to parse as JSON with `ok: true`.
const parseSmokeVerdict = (result: CommandResult): Readonly<{ ok: boolean; reason?: string }> => {
  try {
    const parsed = JSON.parse(result.stdout.trim().split('\n').pop() ?? '')
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.ok !== 'boolean') throw new Error('unparseable')
    if (result.exitCode !== 0) return { ok: false, reason: parsed.ok ? 'APPLICATION_SMOKE_VERDICT_UNREADABLE' : (parsed.reason ?? 'APPLICATION_SMOKE_FAILED') }
    return parsed
  } catch {
    return { ok: false, reason: 'APPLICATION_SMOKE_VERDICT_UNREADABLE' }
  }
}

/** Serves the compiled output inside `sandbox` and drives headless Chromium at it before the sandbox dies. */
const smokeApplicationInSandbox = async (sandbox: Sandbox, place: BuildPlace, signal: AbortSignal | undefined): Promise<void> => {
  assertNotAborted(signal)
  const script = `${place.workRoot}/${SMOKE_SCRIPT_FILE}`
  const command = [
    `cat > ${script} <<'${SMOKE_HEREDOC}'`,
    smokeScriptSource(place),
    SMOKE_HEREDOC,
    `node ${script}`,
  ].join('\n')
  let result: CommandResult
  try {
    result = await sandbox.commands.run(command, {
      cwd: place.workRoot, timeoutMs: SMOKE_TIMEOUT_MS, ...requestOptions(signal, place),
    })
  } catch (error) {
    if (signal?.aborted) throw cancellation()
    // The script exits non-zero to carry its own refusal, and E2B raises that exit as an error
    // which still carries the verdict it printed. Reading it is what tells the operator which
    // refusal happened instead of a bare smoke failure.
    const raised = error as Partial<CommandResult>
    if (typeof raised?.stdout !== 'string' || typeof raised.exitCode !== 'number') {
      throw new Error('APPLICATION_SMOKE_FAILED', { cause: error })
    }
    result = { stdout: raised.stdout, stderr: raised.stderr ?? '', exitCode: raised.exitCode } as CommandResult
  }
  assertNotAborted(signal)
  const verdict = parseSmokeVerdict(result)
  if (!verdict.ok) throw new Error(verdict.reason ?? 'APPLICATION_SMOKE_FAILED')
}

/** Builds an application tree already inside `sandbox`, sharing the agent sandbox instead of a second one. */
export const buildApplicationInSandbox = async (
  sandbox: Sandbox,
  input: Readonly<{ appRoot: string; workRoot?: string; user?: 'root'; signal?: AbortSignal }>,
): Promise<readonly CompiledApplicationFile[]> => {
  const place: BuildPlace = { workRoot: input.workRoot ?? DEFAULT_WORK_ROOT, ...(input.user ? { user: input.user } : {}) }
  assertNotAborted(input.signal)
  const dependencyLink = await sandbox.commands.run(`ln -sfn /opt/conexus/compiler/node_modules ${input.appRoot}/node_modules`, {
    cwd: place.workRoot, timeoutMs: 10_000, ...requestOptions(input.signal, place),
  })
  if (dependencyLink.exitCode !== 0) throw new Error('APPLICATION_COMPILER_WORKSPACE_REFUSED')
  assertNotAborted(input.signal)
  let result: CommandResult
  try {
    result = await sandbox.commands.run(`${BUILD_COMMAND} --outDir '${distRoot(place)}'`, {
      cwd: input.appRoot, timeoutMs: BUILD_TIMEOUT_MS, envs: { CONEXUS_COMPILE_ROOT: input.appRoot },
      ...(input.signal ? { signal: input.signal } : {}),
      ...(place.user ? { user: place.user } : {}),
    })
  } catch (error) {
    if (input.signal?.aborted) throw error
    throw new Error('APPLICATION_COMPILATION_FAILED', { cause: error })
  }
  if (result.exitCode !== 0) throw new Error('APPLICATION_COMPILATION_FAILED')
  assertNotAborted(input.signal)
  const output = await collectOutput(sandbox, place, input.signal)
  assertNotAborted(input.signal)
  await smokeApplicationInSandbox(sandbox, place, input.signal)
  assertNotAborted(input.signal)
  return output
}
