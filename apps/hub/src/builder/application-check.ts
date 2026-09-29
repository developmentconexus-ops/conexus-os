import { z } from 'zod'
import { previewContentSecurityPolicy } from '../platform/application-csp.js'
import { appPathClassifierSource } from '../mar/app-path.js'
import { admitManifest } from '../app-runner/server-manifest.js'

/**
 * The Conexus check: one Hub owned script, `/opt/conexus/check.mjs`, that the Builder's tool, source
 * admission and the Preview build all run. It builds the application tree it is pointed at and
 * prints one {@link CheckReport}. No step reads a file the candidate could have written as an
 * instruction: the steps, their limits, the TypeScript options and the browser harness are all here.
 */
export const CHECK_SCRIPT_PATH = '/opt/conexus/check.mjs'
export const CHECK_NODE_PATH = '/usr/local/bin/node'
/** The template's unprivileged user. Every step that runs application code runs as it. */
export const CHECK_AGENT_IDENTITY = '1500:1500'

const CHECK_STEP_IDS: readonly CheckStepId[] = ['generate', 'typecheck', 'build', 'server', 'boot']

const problemSchema = z.object({
  file: z.string().exactOptional(), line: z.number().exactOptional(), column: z.number().exactOptional(), code: z.string().exactOptional(), message: z.string(),
}).readonly()
const stepIdSchema = z.enum(['generate', 'typecheck', 'build', 'server', 'boot'])
type CheckStepId = z.infer<typeof stepIdSchema>

/** The `conexus_check` tool's output: the report exactly as the check printed it. */
export const checkReportSchema = z.object({
  ok: z.boolean(),
  steps: z.array(z.discriminatedUnion('status', [
    z.object({ step: stepIdSchema, status: z.literal('passed'), durationMs: z.number() }).readonly(),
    z.object({ step: stepIdSchema, status: z.literal('failed'), durationMs: z.number(), problems: z.array(problemSchema).readonly(), dropped: z.number().exactOptional() }).readonly(),
    z.object({ step: stepIdSchema, status: z.literal('skipped'), reason: z.string() }).readonly(),
  ])).readonly(),
  facts: z.object({ operations: z.number(), migrations: z.number(), jsGzipBytes: z.number() }).readonly(),
}).readonly()

export type CheckReport = z.infer<typeof checkReportSchema>
export type CheckStep = CheckReport['steps'][number]
export type Problem = z.infer<typeof problemSchema>
/** `generate`, `typecheck`, `build` and `server` refuse the source; `boot` is recorded and never refuses it. */
const BLOCKING_STEPS: ReadonlySet<CheckStepId> = new Set(['generate', 'typecheck', 'build', 'server'])

const CHECK_LIMITS = Object.freeze({
  stepMs: Object.freeze({ generate: 10_000, typecheck: 60_000, build: 60_000, server: 60_000, boot: 45_000 }),
  problemsPerStep: 50,
  messageChars: 2_000,
})

// Longest the whole check can run, and what the command that starts it waits for.
export const CHECK_COMMAND_TIMEOUT_MS = Object.values(CHECK_LIMITS.stepMs).reduce((sum, ms) => sum + ms, 0) + 30_000

/**
 * Output that can carry a Git header or a token from whatever produced it, and goes to a log or a
 * prompt. Self contained: the check script embeds this function's source.
 */
export const redactEvidence = (text: string): string => text
  .replace(/(authorization:\s*)(?:(?:basic|bearer|token)\s+)?\S+/gi, '$1[redacted]')
  .replace(/x-access-token:[^@\s]+/gi, 'x-access-token:[redacted]')
  .replace(/\bgh[pousr]_[A-Za-z0-9_]+/g, '[redacted]')

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const parseProblem = (value: unknown): Problem => {
  if (!isRecord(value) || typeof value.message !== 'string') throw new Error('APPLICATION_CHECK_REPORT_UNREADABLE')
  const { file, line, column, code, message } = value
  if ((file !== undefined && typeof file !== 'string') || (code !== undefined && typeof code !== 'string') ||
    (line !== undefined && !isCount(line)) || (column !== undefined && !isCount(column))) throw new Error('APPLICATION_CHECK_REPORT_UNREADABLE')
  return Object.freeze({
    ...(file !== undefined ? { file } : {}), ...(line !== undefined ? { line } : {}), ...(column !== undefined ? { column } : {}),
    ...(code !== undefined ? { code } : {}), message,
  })
}

const parseStep = (value: unknown): CheckStep => {
  if (!isRecord(value) || !CHECK_STEP_IDS.includes(value.step as CheckStepId)) throw new Error('APPLICATION_CHECK_REPORT_UNREADABLE')
  const step = value.step as CheckStepId
  if (value.status === 'passed' && isCount(value.durationMs)) return Object.freeze({ step, status: 'passed', durationMs: value.durationMs })
  if (value.status === 'skipped' && typeof value.reason === 'string') return Object.freeze({ step, status: 'skipped', reason: value.reason })
  if (value.status === 'failed' && isCount(value.durationMs) && Array.isArray(value.problems) && (value.dropped === undefined || isCount(value.dropped))) {
    return Object.freeze({
      step, status: 'failed', durationMs: value.durationMs, problems: Object.freeze(value.problems.map(parseProblem)),
      ...(value.dropped !== undefined ? { dropped: value.dropped } : {}),
    })
  }
  throw new Error('APPLICATION_CHECK_REPORT_UNREADABLE')
}

/** The report is the last line the script printed; anything else it wrote before is not the report. */
export const parseCheckReport = (stdout: string): CheckReport => {
  let value: unknown
  try {
    value = JSON.parse(stdout.trim().split('\n').pop() ?? '')
  } catch {
    throw new Error('APPLICATION_CHECK_REPORT_UNREADABLE')
  }
  if (!isRecord(value) || typeof value.ok !== 'boolean' || !Array.isArray(value.steps) || !isRecord(value.facts)) throw new Error('APPLICATION_CHECK_REPORT_UNREADABLE')
  const { operations, migrations, jsGzipBytes } = value.facts
  if (!isCount(operations) || !isCount(migrations) || !isCount(jsGzipBytes)) throw new Error('APPLICATION_CHECK_REPORT_UNREADABLE')
  const steps = value.steps.map(parseStep)
  const blockingPassed = steps.filter((step) => BLOCKING_STEPS.has(step.step)).every((step) => step.status === 'passed')
  if (value.ok !== blockingPassed) throw new Error('APPLICATION_CHECK_REPORT_UNREADABLE')
  return Object.freeze({ ok: value.ok, steps: Object.freeze(steps), facts: Object.freeze({ operations, migrations, jsGzipBytes }) })
}

const problemLine = ({ file, line, column, code, message }: Problem): string => {
  const place = file ? `${file}${line ? `:${line}${column ? `:${column}` : ''}` : ''}: ` : ''
  return `${place}${code ? `${code} ` : ''}${message}`
}

/** What the next turn reads about a failed step: each problem as the check reported it, with the count it had to drop. */
export const failedStepEvidence = (step: Extract<CheckStep, { status: 'failed' }>): string =>
  [`${step.step} failed:`, ...step.problems.map(problemLine), ...(step.dropped ? [`(${step.dropped} more problems not shown)`] : [])].join('\n')

/** One line for the Hub log: each step, how it ended and how long it took. */
export const checkSummary = (report: CheckReport): string =>
  report.steps.map((step) => `${step.step}=${step.status === 'skipped' ? `skipped(${step.reason})` : `${step.status}:${step.durationMs}ms`}`).join(' ')

/** The step that refused the source, or null when every blocking step passed. */
export const refusingStep = (report: CheckReport): Extract<CheckStep, { status: 'failed' }> | null =>
  report.steps.find((step): step is Extract<CheckStep, { status: 'failed' }> => step.status === 'failed' && BLOCKING_STEPS.has(step.step)) ?? null

/** The `boot` step when it found problems, whatever they were. */
export const failedBootStep = (report: CheckReport): Extract<CheckStep, { status: 'failed' }> | null =>
  report.steps.find((step): step is Extract<CheckStep, { status: 'failed' }> => step.step === 'boot' && step.status === 'failed') ?? null

// A page that threw or drew nothing has no Preview worth opening. The other boot problems (a blocked
// font, a console error, a failed request) are reported and leave the Preview standing.
const UNRENDERED_BOOT_CODES: ReadonlySet<string> = new Set(['BOOT_UNCAUGHT_ERROR', 'BOOT_NO_ROOT_CHILD', 'STEP_TIMEOUT'])

/** The `boot` step when the page did not render, which is the only boot result that withholds the Preview. */
export const unrenderedBootStep = (report: CheckReport): Extract<CheckStep, { status: 'failed' }> | null => {
  const step = failedBootStep(report)
  return step?.problems.some((problem) => problem.code !== undefined && UNRENDERED_BOOT_CODES.has(problem.code)) ? step : null
}

// The boot page is served with the Preview's own policy, so a violation there is a violation in the
// Preview. The frame-ancestors origin only has to be well formed: the page is the top level document.
const BOOT_CONTENT_SECURITY_POLICY = previewContentSecurityPolicy('http://127.0.0.1')

/**
 * The source of `check.mjs`. Written between raw template quotes so its regular expressions keep
 * their backslashes; it holds no backtick and no `${`.
 */
export const checkScriptSource = (): string => String.raw`
import { spawn, spawnSync } from 'node:child_process'
import { chownSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync, chmodSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

const LIMIT_MS = ${JSON.stringify(CHECK_LIMITS.stepMs)}
const MAX_PROBLEMS = ${CHECK_LIMITS.problemsPerStep}
const MAX_MESSAGE = ${CHECK_LIMITS.messageChars}
const BOOT_CSP = ${JSON.stringify(BOOT_CONTENT_SECURITY_POLICY)}
const BLOCKING = new Set(${JSON.stringify([...BLOCKING_STEPS])})
const redact = ${redactEvidence.toString()}
const admitManifest = ${admitManifest.toString()}
${appPathClassifierSource}

const flags = {}
const limitFlags = []
const argv = process.argv.slice(2)
for (let index = 0; index < argv.length; index += 2) {
  if (argv[index] === '--limit') limitFlags.push(argv[index + 1])
  else flags[argv[index]] = argv[index + 1]
}
for (const entry of limitFlags) {
  const [step, ms] = entry.split('=')
  if (step in LIMIT_MS && Number.isInteger(Number(ms))) LIMIT_MS[step] = Number(ms)
}
if (!flags['--root'] || !flags['--out']) {
  process.stderr.write('usage: check.mjs --root <checkout> --out <dist> [--as <uid>:<gid>]\n')
  process.exit(2)
}
const root = resolve(flags['--root'])
const out = resolve(flags['--out'])
const tools = flags['--tools'] ?? '/opt/conexus'
const compiler = join(tools, 'compiler')
const chromiumPath = flags['--chromium'] ?? '/usr/bin/chromium'
const home = flags['--home'] ?? '/home/conexus-agent'
const identity = flags['--as'] ? flags['--as'].split(':').map(Number) : null
const dropTo = identity && process.getuid() !== identity[0] ? { uid: identity[0], gid: identity[1] } : {}
const runsAsRoot = process.getuid() === 0 && dropTo.uid !== undefined
const appRoot = join(root, 'app')
const nodePath = process.execPath

const stepEnvironment = (extra = {}) => ({ PATH: '/usr/local/bin:/usr/bin:/bin', HOME: home, LANG: 'C.UTF-8', ...extra })
const relativize = (text) => text.split(root + sep).join('')
const clip = (text, max) => (text.length > max ? text.slice(0, max - 1) + '…' : text)
const stripAnsi = (text) => text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
const now = () => performance.now()
const millis = (started) => Math.round(now() - started)

const shapeProblem = (problem) => {
  const shaped = {}
  if (problem.file) shaped.file = clip(redact(relativize(String(problem.file))), 500)
  if (Number.isInteger(problem.line) && problem.line >= 0) shaped.line = problem.line
  if (Number.isInteger(problem.column) && problem.column >= 0) shaped.column = problem.column
  if (problem.code) shaped.code = String(problem.code)
  shaped.message = clip(redact(relativize(String(problem.message))), MAX_MESSAGE)
  return shaped
}

// Whatever the agent's user left running goes with the step that started it. Only a check that runs
// as root can say so without killing itself.
const sweepAgentProcesses = () => {
  if (runsAsRoot) spawnSync('/bin/sh', ['-c', 'kill -KILL -1'], { ...dropTo, stdio: 'ignore' })
}
const killGroup = (pid) => { try { process.kill(-pid, 'SIGKILL') } catch {} }

// One child in its own process group with a fixed environment, the agent's identity and a wall
// clock. Past the limit the whole group is killed, so a step cannot leave anything behind.
const runTool = (file, args, { cwd, env, limitMs }) => new Promise((settle) => {
  let stdout = ''
  let stderr = ''
  let timedOut = false
  let done = false
  const child = spawn(file, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'], ...dropTo })
  const keep = (text, chunk) => (text.length > 4_000_000 ? text : text + String(chunk))
  child.stdout.on('data', (chunk) => { stdout = keep(stdout, chunk) })
  child.stderr.on('data', (chunk) => { stderr = keep(stderr, chunk) })
  const finish = (code) => {
    if (done) return
    done = true
    clearTimeout(timer)
    killGroup(child.pid)
    sweepAgentProcesses()
    settle({ code, timedOut, stdout: stripAnsi(stdout), stderr: stripAnsi(stderr) })
  }
  const timer = setTimeout(() => { timedOut = true; killGroup(child.pid) }, limitMs)
  child.once('error', (error) => { stderr += String(error.message); finish(-1) })
  child.once('close', (code) => finish(code ?? -1))
  child.once('exit', (code) => setTimeout(() => finish(code ?? -1), timedOut ? 0 : 200))
})

const timeoutProblem = (id) => ({ code: 'STEP_TIMEOUT', message: id + ' exceeded ' + LIMIT_MS[id] / 1000 + ' s and was stopped' })
const locate = (text) => {
  const found = /(?:^|[\s"'(])((?:app|conexus)\/[\w@./-]+?\.(?:tsx?|jsx?|css|html|mjs|json))(?::(\d+))?(?::(\d+))?/.exec(relativize(text))
  return found ? { file: found[1], ...(found[2] ? { line: Number(found[2]) } : {}), ...(found[3] ? { column: Number(found[3]) } : {}) } : {}
}
const outputProblem = (result, cleaned) => {
  const text = relativize(cleaned).trim() || 'the step exited with code ' + result.code + ' and printed nothing'
  return { ...locate(text), message: text }
}

const MANIFEST_PATH = 'conexus/manifest.json'
const manifestProblem = (message) => ({ problems: [{ file: MANIFEST_PATH, code: 'MANIFEST_REFUSED', message: message.replace(/^MANIFEST_REFUSED: /, '') }] })

// The generated files are written by the check, which may run as root, into a tree the candidate
// laid out. Each folder on the way must be a real folder and the target is replaced, never followed.
const writeGenerated = (relativePath, content) => {
  let current = root
  for (const part of relativePath.split('/').slice(0, -1)) {
    current = join(current, part)
    let entry = null
    try { entry = lstatSync(current) } catch {}
    if (entry === null) {
      mkdirSync(current)
      if (runsAsRoot) chownSync(current, dropTo.uid, dropTo.gid)
    } else if (!entry.isDirectory()) throw new Error(part + ' in ' + relativePath + ' is not a folder')
  }
  const target = join(root, relativePath)
  rmSync(target, { force: true })
  writeFileSync(target, content, { flag: 'wx', mode: 0o644 })
  if (runsAsRoot) chownSync(target, dropTo.uid, dropTo.gid)
}

// Admits the manifest with the runner's own function, then writes the typed client the screens and
// handlers import. A source with no manifest has no server half and nothing to generate.
const runGenerate = async () => {
  const manifestPath = join(root, MANIFEST_PATH)
  let entry
  try { entry = lstatSync(manifestPath) } catch { return { problems: [] } }
  let real
  try { real = realpathSync(manifestPath) } catch { return manifestProblem('cannot be read') }
  if (!entry.isFile() || !real.startsWith(realpathSync(root) + sep) || entry.size > 1_048_576) return manifestProblem('must be a regular file inside the project, under 1 MiB')
  let manifest
  try {
    manifest = admitManifest(JSON.parse(readFileSync(manifestPath, 'utf8')), 'source')
  } catch (error) {
    return manifestProblem(error instanceof SyntaxError ? 'is not valid JSON: ' + error.message : String(error.message))
  }
  let client
  try {
    client = (await import(pathToFileURL(join(compiler, 'generate-client.mjs')).href)).generateClient(manifest)
  } catch (error) {
    return manifestProblem(String(error.message))
  }
  try {
    writeGenerated('app/src/conexus/api.gen.ts', client.apiGen)
    writeGenerated('conexus/types.gen.ts', client.typesGen)
  } catch (error) {
    return { problems: [{ code: 'GENERATE_WRITE_REFUSED', message: String(error.message) }] }
  }
  return { problems: [] }
}

const hasTypeScript = (directory) => {
  try { return readdirSync(directory, { recursive: true }).some((name) => /\.(?:ts|tsx|mts)$/.test(String(name))) } catch { return false }
}
const tscProblems = (result) => {
  const problems = []
  for (const raw of (result.stdout + '\n' + result.stderr).split('\n')) {
    const line = raw.replace(/\r$/, '')
    const located = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line)
    const global = /^error (TS\d+): (.*)$/.exec(line)
    if (located) problems.push({ file: located[1], line: Number(located[2]), column: Number(located[3]), code: located[4], message: located[5] })
    else if (global) problems.push({ code: global[1], message: global[2] })
    else if (/^\s+\S/.test(line) && problems.length > 0) problems[problems.length - 1].message += '\n' + line.trim()
  }
  return problems.length > 0 ? problems : [outputProblem(result, result.stdout + '\n' + result.stderr)]
}

// Two programs, because one cannot give node: to handlers and refuse it to screens: the app project
// (screens) and the server project (handlers, only when conexus/ holds TypeScript). Both share the
// one typecheck budget, so the step never runs past its limit.
const runTypecheck = async () => {
  const { typescriptProjects } = await import(pathToFileURL(join(compiler, 'tsconfig.mjs')).href)
  const projects = typescriptProjects({ compilerRoot: compiler, root })
  const directory = mkdtempSync(join(tmpdir(), 'conexus-typecheck-'))
  try {
    chmodSync(directory, 0o755)
    const deadline = now() + LIMIT_MS.typecheck
    const problems = []
    for (const name of hasTypeScript(join(root, 'conexus')) ? ['app', 'server'] : ['app']) {
      const config = join(directory, 'tsconfig.' + name + '.json')
      writeFileSync(config, JSON.stringify(projects[name]), { mode: 0o644 })
      const result = await runTool(nodePath, [join(compiler, 'node_modules/typescript/bin/tsc'), '-p', config, '--pretty', 'false'], {
        cwd: root, env: stepEnvironment(), limitMs: Math.max(1, deadline - now()),
      })
      if (result.timedOut) return { problems: [...problems, timeoutProblem('typecheck')] }
      if (result.code !== 0) problems.push(...tscProblems(result))
    }
    return { problems }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const runBuild = async () => {
  const result = await runTool(nodePath, [
    join(compiler, 'node_modules/vite/bin/vite.js'), 'build', '--config', join(compiler, 'vite.config.mjs'), '--configLoader', 'native',
    '--outDir', out, '--emptyOutDir',
  ], { cwd: appRoot, env: stepEnvironment({ CONEXUS_COMPILE_ROOT: appRoot }), limitMs: LIMIT_MS.build })
  if (result.timedOut) return { problems: [timeoutProblem('build')] }
  return { problems: result.code === 0 ? [] : [outputProblem(result, result.stderr + '\n' + result.stdout)] }
}

const runServer = async () => {
  const result = await runTool(nodePath, [join(tools, 'server-build.mjs'), root, out], { cwd: root, env: stepEnvironment(), limitMs: LIMIT_MS.server })
  if (result.timedOut) return { problems: [timeoutProblem('server')] }
  if (result.code === 0) return { problems: [] }
  const text = (result.stderr.trim() || result.stdout.trim()).replace(/^conexus server check: /, '')
  return { problems: [outputProblem(result, text)] }
}

const MEDIA_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' }

// The app may call its own API while it mounts. The check has no database, so each declared
// operation answers the value its output schema names first: the lower bound when it has one,
// otherwise 0, an empty string, false, an empty array, or an object with only its required keys.
const stubValue = (schema) => {
  switch (schema?.type) {
    case 'string': return 'x'.repeat(schema.minLength ?? 0)
    case 'integer': case 'number': return schema.minimum ?? 0
    case 'boolean': return false
    case 'array': return []
    case 'object': return Object.fromEntries((schema.required ?? []).map((key) => [key, stubValue(schema.properties?.[key])]))
    default: return null
  }
}

const runBoot = async () => {
  const problems = []
  const seen = new Set()
  const add = (problem) => {
    const key = problem.code + '|' + problem.message
    if (seen.has(key)) return
    seen.add(key)
    problems.push(problem)
  }
  let manifest = null
  try { manifest = JSON.parse(readFileSync(join(out, 'conexus-server', 'manifest.json'), 'utf8')) } catch {}
  const outReal = realpathSync(out)
  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const headers = { 'content-security-policy': BOOT_CSP, 'cache-control': 'no-store' }
      if (url.pathname.startsWith('/__conexus/api/')) {
        const operation = manifest?.operations?.[url.pathname.slice('/__conexus/api/'.length)]
        if (request.method !== 'POST' || !operation) { response.writeHead(404, { ...headers, 'content-type': 'application/json' }); response.end('{"error":{"code":"OPERATION_NOT_FOUND"}}'); return }
        response.writeHead(200, { ...headers, 'content-type': 'application/json' })
        response.end(JSON.stringify(stubValue(operation.output)))
        return
      }
      const isFile = (path) => {
        try {
          const resolved = realpathSync(join(outReal, path))
          return resolved.startsWith(outReal + sep) && lstatSync(resolved).isFile()
        } catch { return false }
      }
      const served = classifyAppPath(request.method, url.pathname, isFile)
      if (served.kind === 'not-found') { response.writeHead(404, headers); response.end(); return }
      const resolved = realpathSync(join(outReal, served.kind === 'file' ? served.path : 'index.html'))
      if (!resolved.startsWith(outReal + sep) || !lstatSync(resolved).isFile()) { response.writeHead(404, headers); response.end(); return }
      response.writeHead(200, { ...headers, 'content-type': MEDIA_TYPES[extname(resolved)] ?? 'application/octet-stream' })
      response.end(request.method === 'HEAD' ? undefined : readFileSync(resolved))
    } catch {
      response.writeHead(404)
      response.end()
    }
  })
  await new Promise((listening, failed) => { server.once('error', failed); server.listen(0, '127.0.0.1', listening) })
  const origin = 'http://127.0.0.1:' + server.address().port
  const profile = mkdtempSync(join(tmpdir(), 'conexus-boot-'))
  if (runsAsRoot) chownSync(profile, dropTo.uid, dropTo.gid)
  let chromium = null
  let socket = null
  let budgetTimer = null
  try {
    const drive = async () => {
      let spawnError = null
      chromium = spawn(chromiumPath, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
        '--user-data-dir=' + profile, 'about:blank',
      ], { detached: true, stdio: 'ignore', env: stepEnvironment(), ...dropTo })
      chromium.once('error', (error) => { spawnError = error })
      let webSocketUrl
      const deadline = now() + 15_000
      let devtoolsPort
      while (!spawnError && now() < deadline && !webSocketUrl) {
        try {
          devtoolsPort ??= Number.parseInt(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0], 10)
          const targets = await (await fetch('http://127.0.0.1:' + devtoolsPort + '/json/list')).json()
          webSocketUrl = targets.find((target) => target.type === 'page')?.webSocketDebuggerUrl
        } catch {}
        if (!webSocketUrl) await new Promise((wait) => setTimeout(wait, 100))
      }
      if (!webSocketUrl) return { skipped: 'BOOT_BROWSER_UNAVAILABLE' }
      socket = new WebSocket(webSocketUrl)
      await new Promise((opened, failed) => {
        socket.addEventListener('open', () => opened(), { once: true })
        socket.addEventListener('error', () => failed(new Error('BOOT_BROWSER_UNAVAILABLE')), { once: true })
      })
      let nextId = 1
      const pending = new Map()
      const send = (method, params = {}) => new Promise((resolveSend, rejectSend) => {
        const id = nextId++
        pending.set(id, { resolveSend, rejectSend })
        socket.send(JSON.stringify({ id, method, params }))
      })
      const requests = new Map()
      let loaded
      const loadFired = new Promise((fired) => { loaded = fired })
      const argumentText = (argument) => (argument?.value !== undefined ? String(argument.value) : (argument?.description ?? argument?.type ?? ''))
      const sameOrigin = (url) => typeof url === 'string' && url.startsWith(origin + '/')
      const pathOf = (url) => url.slice(origin.length)
      const onEvent = (method, params) => {
        if (method === 'Page.loadEventFired') loaded()
        else if (method === 'Fetch.requestPaused') {
          const blocked = !sameOrigin(params.request.url)
          send(blocked ? 'Fetch.failRequest' : 'Fetch.continueRequest', blocked ? { requestId: params.requestId, errorReason: 'BlockedByClient' } : { requestId: params.requestId }).catch(() => {})
        } else if (method === 'Runtime.exceptionThrown') {
          const details = params.exceptionDetails ?? {}
          const text = details.exception?.description ?? (details.exception?.value !== undefined ? String(details.exception.value) : details.text ?? 'uncaught exception')
          add({ code: 'BOOT_UNCAUGHT_ERROR', message: text.split(origin + '/').join(''), ...(sameOrigin(details.url) ? { file: pathOf(details.url).slice(1), line: (details.lineNumber ?? 0) + 1, column: (details.columnNumber ?? 0) + 1 } : {}) })
        } else if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
          add({ code: 'BOOT_CONSOLE_ERROR', message: (params.args ?? []).map(argumentText).join(' ') })
        } else if (method === 'Log.entryAdded' && params.entry?.source === 'security' && /Refused to|violates the following Content Security Policy/.test(params.entry.text)) {
          add({ code: 'BOOT_CSP_VIOLATION', message: String(params.entry.text) })
        } else if (method === 'Network.requestWillBeSent') requests.set(params.requestId, { url: params.request.url, method: params.request.method })
        else if (method === 'Network.responseReceived' && sameOrigin(params.response.url) && params.response.status >= 400 && pathOf(params.response.url) !== '/favicon.ico') {
          add({ code: 'BOOT_REQUEST_FAILED', message: (requests.get(params.requestId)?.method ?? 'GET') + ' ' + pathOf(params.response.url) + ' answered ' + params.response.status })
        } else if (method === 'Network.loadingFailed') {
          const request = requests.get(params.requestId)
          if (request && sameOrigin(request.url) && !params.canceled && pathOf(request.url) !== '/favicon.ico') add({ code: 'BOOT_REQUEST_FAILED', message: request.method + ' ' + pathOf(request.url) + ' failed: ' + params.errorText })
        }
      }
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data)
        if (message.id !== undefined) {
          const waiting = pending.get(message.id)
          pending.delete(message.id)
          if (waiting) message.error ? waiting.rejectSend(new Error(message.error.message)) : waiting.resolveSend(message.result)
          return
        }
        onEvent(message.method, message.params ?? {})
      })
      for (const domain of ['Runtime', 'Page', 'Network', 'Log']) await send(domain + '.enable')
      await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
      await send('Page.navigate', { url: origin + '/' })
      await loadFired
      await new Promise((settle) => setTimeout(settle, 300))
      const evaluated = await send('Runtime.evaluate', { expression: '(() => { const element = document.getElementById("root"); return element ? element.children.length : -1 })()', returnByValue: true })
      if (typeof evaluated?.result?.value !== 'number' || evaluated.result.value <= 0) add({ code: 'BOOT_NO_ROOT_CHILD', message: 'The page loaded but #root has no children: nothing was rendered.' })
      return {}
    }
    const outcome = await Promise.race([
      drive(),
      new Promise((expired) => { budgetTimer = setTimeout(() => expired({ timedOut: true }), LIMIT_MS.boot) }),
    ])
    if (outcome.timedOut) return { problems: [timeoutProblem('boot')] }
    if (outcome.skipped) return { problems: [], skipped: outcome.skipped }
    return { problems }
  } finally {
    clearTimeout(budgetTimer)
    try { socket?.close() } catch {}
    if (chromium?.pid) killGroup(chromium.pid)
    server.close()
    server.closeAllConnections?.()
    rmSync(profile, { recursive: true, force: true })
    sweepAgentProcesses()
  }
}

const readFacts = () => {
  const facts = { operations: 0, migrations: 0, jsGzipBytes: 0 }
  try {
    const manifestPath = join(root, 'conexus', 'manifest.json')
    if (lstatSync(manifestPath).isFile() && lstatSync(manifestPath).size < 1_048_576) facts.operations = Object.keys(JSON.parse(readFileSync(manifestPath, 'utf8')).operations ?? {}).length
  } catch {}
  try {
    facts.migrations = readdirSync(join(root, 'conexus', 'migrations'), { withFileTypes: true }).filter((entry) => entry.isFile()).length
  } catch {}
  try {
    for (const name of readdirSync(out, { recursive: true })) {
      const path = String(name)
      if (path.startsWith('conexus-server') || !/\.m?js$/.test(path)) continue
      const file = join(out, path)
      if (lstatSync(file).isFile()) facts.jsGzipBytes += gzipSync(readFileSync(file)).length
    }
  } catch {}
  return facts
}

const STEPS = [['generate', runGenerate], ['typecheck', runTypecheck], ['build', runBuild], ['server', runServer], ['boot', runBoot]]
const steps = []
let refusedBy = null
try {
  mkdirSync(out, { recursive: true })
  if (runsAsRoot) chownSync(out, dropTo.uid, dropTo.gid)
  rmSync(join(appRoot, 'node_modules'), { recursive: true, force: true })
  symlinkSync(join(compiler, 'node_modules'), join(appRoot, 'node_modules'))
} catch (error) {
  process.stderr.write('check setup failed: ' + String(error?.message ?? error) + '\n')
  process.exit(3)
}
for (const [id, run] of STEPS) {
  if (refusedBy) { steps.push({ step: id, status: 'skipped', reason: 'after failed ' + refusedBy }); continue }
  const started = now()
  let result
  try {
    result = await run()
  } catch (error) {
    result = { problems: [{ code: 'STEP_CRASHED', message: id + ' stopped unexpectedly: ' + String(error?.message ?? error) }] }
  }
  if (result.skipped) steps.push({ step: id, status: 'skipped', reason: result.skipped })
  else if (result.problems.length === 0) steps.push({ step: id, status: 'passed', durationMs: millis(started) })
  else {
    const shaped = result.problems.map(shapeProblem)
    const kept = shaped.slice(0, MAX_PROBLEMS)
    steps.push({ step: id, status: 'failed', durationMs: millis(started), problems: kept, ...(shaped.length > kept.length ? { dropped: shaped.length - kept.length } : {}) })
    if (BLOCKING.has(id)) refusedBy = id
  }
}
process.stdout.write(JSON.stringify({ ok: refusedBy === null, steps, facts: readFacts() }) + '\n', () => process.exit(0))
`
