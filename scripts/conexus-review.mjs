import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

const repositoryRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'))

const laneDefinitions = Object.freeze({
  opus: Object.freeze({
    executable: process.env.CONEXUS_REVIEW_CLAUDE_BIN || 'claude',
    expectedVersion: '2.1.220-compatible',
    versionPattern: /\b2\.1\.220\b/,
    model: 'fable',
    effort: 'xhigh',
    mode: 'plan',
    sandbox: false,
    sessionFlag: '--resume',
  }),
  gemini: Object.freeze({
    executable: process.env.CONEXUS_REVIEW_AGY_BIN || 'agy',
    expectedVersion: '1.1.22-compatible',
    versionPattern: /\b1\.1\.22\b/,
    model: 'gemini-3.1-pro-high',
    effort: 'high',
    mode: 'plan',
    sandbox: true,
    sessionFlag: '--conversation',
  }),
})

const laneNames = Object.freeze(['opus', 'gemini'])
const maxCaptureBytes = 8 * 1024 * 1024
const findingClasses = Object.freeze([
  'METHOD FINDING',
  'PRODUCT / PLAN GAP',
  'LOCAL EXECUTION GAP',
  'NO FINDING',
])

const usage = [
  'Usage: node scripts/conexus-review.mjs --brief <file> [options]',
  '',
  'Options:',
  '  --lane opus|gemini|both  Review lane(s); default: both',
  '  --dry-run                Print planned invocations; default',
  '  --execute                Invoke the selected reviewer CLI explicitly',
  '  --session <id>           Resume Claude Code session (opus only)',
  '  --conversation <id>      Resume AGY conversation (gemini only)',
  '  --claude-model <alias>   Claude alias: fable (default) or opus',
  '  --json                   Emit one machine-readable result object',
  '  --output-dir <directory> Write execute results outside this repository',
  '  --candidate-result <file> Bind output to exact candidate-result bytes',
  '  --help                   Show this help',
].join('\n')

const fail = (message) => {
  throw new Error(`conexus-review: ${message}`)
}

const valueFor = (argv, index, flag) => {
  const value = argv[index + 1]
  if (!value || value.startsWith('-')) fail(`${flag} requires a value`)
  return value
}

const splitEquals = (argument) => {
  const equals = argument.indexOf('=')
  return equals === -1 ? [argument, undefined] : [argument.slice(0, equals), argument.slice(equals + 1)]
}

/** Parse wrapper options without consulting either reviewer CLI. */
export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    brief: undefined,
    lane: 'both',
    execute: false,
    dryRun: true,
    dryRunExplicit: false,
    json: false,
    outputDir: undefined,
    candidateResult: undefined,
    session: undefined,
    conversation: undefined,
    claudeModel: undefined,
    help: false,
    laneExplicit: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const [flag, inlineValue] = splitEquals(argv[index])
    switch (flag) {
      case '--brief': {
        if (options.brief !== undefined) fail('duplicate --brief')
        options.brief = inlineValue ?? valueFor(argv, index++, flag)
        break
      }
      case '--lane': {
        if (options.laneExplicit) fail('duplicate --lane')
        options.lane = inlineValue ?? valueFor(argv, index++, flag)
        options.laneExplicit = true
        break
      }
      case '--dry-run':
        if (options.execute || options.dryRunExplicit) fail('--dry-run and --execute are mutually exclusive')
        options.dryRunExplicit = true
        options.dryRun = true
        break
      case '--execute':
        if (options.dryRunExplicit || options.execute) fail('--dry-run and --execute are mutually exclusive')
        options.execute = true
        options.dryRun = false
        break
      case '--json':
        if (options.json) fail('duplicate --json')
        options.json = true
        break
      case '--output-dir':
        if (options.outputDir !== undefined) fail('duplicate --output-dir')
        options.outputDir = inlineValue ?? valueFor(argv, index++, flag)
        break
      case '--candidate-result':
        if (options.candidateResult !== undefined) fail('duplicate --candidate-result')
        options.candidateResult = inlineValue ?? valueFor(argv, index++, flag)
        break
      case '--session':
        if (options.session !== undefined) fail('duplicate --session')
        options.session = inlineValue ?? valueFor(argv, index++, flag)
        break
      case '--conversation':
        if (options.conversation !== undefined) fail('duplicate --conversation')
        options.conversation = inlineValue ?? valueFor(argv, index++, flag)
        break
      case '--claude-model':
        if (options.claudeModel !== undefined) fail('duplicate --claude-model')
        options.claudeModel = inlineValue ?? valueFor(argv, index++, flag)
        break
      case '--help':
        options.help = true
        break
      default:
        fail(`unknown option ${argv[index]}`)
    }
  }

  if (options.help) return options
  if (!options.brief) fail('--brief <file> is required')
  if (!['opus', 'gemini', 'both'].includes(options.lane)) {
    fail(`invalid --lane ${JSON.stringify(options.lane)}; expected opus, gemini, or both`)
  }
  if (options.session !== undefined && options.lane === 'gemini') {
    fail('--session is only valid for --lane opus or both')
  }
  if (options.conversation !== undefined && options.lane === 'opus') {
    fail('--conversation is only valid for --lane gemini or both')
  }
  if (options.claudeModel !== undefined && !['fable', 'opus'].includes(options.claudeModel)) {
    fail(`invalid --claude-model ${JSON.stringify(options.claudeModel)}; expected fable or opus`)
  }
  if (options.claudeModel !== undefined && options.lane === 'gemini') {
    fail('--claude-model is only valid for --lane opus or both')
  }
  for (const [name, value] of [['--session', options.session], ['--conversation', options.conversation]]) {
    if (value !== undefined && (!value.trim() || value.includes('\0') || /\s/.test(value))) {
      fail(`${name} must be a non-empty identifier without whitespace`)
    }
  }
  return options
}

const inside = (candidate, root) => {
  const remainder = relative(root, candidate)
  return remainder === '' || (remainder !== '..' && !remainder.startsWith(`..${sep}`) && !isAbsolute(remainder))
}

const realOrResolved = (path) => {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

/** Validate repository custody and return the canonical brief/output paths. */
export function validateConfig(options, root = repositoryRoot) {
  if (!options || options.help) return options
  const canonicalRoot = realpathSync(root)
  const briefAbsolute = realOrResolved(resolve(process.cwd(), options.brief))
  if (briefAbsolute === canonicalRoot) {
    fail('--brief must point to a regular file')
  }
  if (!existsSync(briefAbsolute) || !statSync(briefAbsolute).isFile()) {
    fail(`brief file does not exist or is not a regular file: ${options.brief}`)
  }
  const briefText = readFileSync(briefAbsolute, 'utf8')
  if (!briefText.trim()) fail('--brief file must not be empty')
  const briefSha256 = createHash('sha256').update(readFileSync(briefAbsolute)).digest('hex')

  let candidateResultAbsolute
  let candidateResultRelative
  let candidateResultSha256
  if (options.candidateResult !== undefined) {
    if (options.session !== undefined || options.conversation !== undefined) {
      fail('candidate-bound review requires a fresh session/conversation')
    }
    const selectedLanes = options.lane === 'both' ? laneNames : [options.lane]
    for (const lane of selectedLanes) {
      const requiredExecutable = lane === 'opus' ? 'claude' : 'agy'
      if (laneDefinitions[lane].executable !== requiredExecutable) {
        fail(`candidate-bound ${lane} review requires the canonical ${requiredExecutable} executable`)
      }
    }
    candidateResultAbsolute = realOrResolved(resolve(process.cwd(), options.candidateResult))
    if (!inside(candidateResultAbsolute, canonicalRoot) || candidateResultAbsolute === canonicalRoot) {
      fail('--candidate-result must point to a file inside the repository')
    }
    if (!existsSync(candidateResultAbsolute) || !statSync(candidateResultAbsolute).isFile()) {
      fail(`candidate result does not exist or is not a regular file: ${options.candidateResult}`)
    }
    candidateResultRelative = relative(canonicalRoot, candidateResultAbsolute).split(sep).join('/')
    candidateResultSha256 = createHash('sha256').update(readFileSync(candidateResultAbsolute)).digest('hex')
  }

  let outputAbsolute
  if (options.outputDir !== undefined) {
    outputAbsolute = realOrResolved(resolve(process.cwd(), options.outputDir))
    if (inside(outputAbsolute, canonicalRoot)) {
      fail('--output-dir must be outside the repository to preserve repository state')
    }
  }
  return {
    ...options,
    repositoryRoot: canonicalRoot,
    briefAbsolute,
    briefRelative: relative(canonicalRoot, briefAbsolute).split(sep).join('/'),
    briefText,
    briefSha256,
    candidateResultAbsolute,
    candidateResultRelative,
    candidateResultSha256,
    outputAbsolute,
  }
}

/** Build the neutral handoff sent independently to either reviewer. */
export function buildReviewPrompt({ repositoryRoot: root = repositoryRoot, briefRelative }) {
  const classes = findingClasses.map((value) => `- ${value}`).join('\n')
  return [
    'Act as an independent, neutral whole/global reviewer of the current Conexus OS repository.',
    `Repository root: ${root}`,
    `Exact review brief: ${briefRelative}`,
    '',
    'Reconstruct repository-current authority yourself before judging anything. Start with',
    'AGENTS.md, docs/roadmap.md, docs/index.md, docs/development/engineering-method.md,',
    'docs/development/repository-method.md, and docs/development/blueprint-harness-design.md',
    'sections 10.4–10.6; then read the exact brief and only the routed evidence it names.',
    'Treat the brief as orientation and attack framing, not as authority or proof.',
    '',
    'Attack the complete named subject adversarially: inspect hidden coupling, duplicate or',
    'missing authority, false completeness, over-stopping, under-stopping, weak falsifiers,',
    'security/trust-boundary mistakes, recovery/concurrency gaps, and avoidable complexity.',
    'Preserve accepted upstream meaning unless current evidence actually falsifies it.',
    '',
    'Do not edit files, install dependencies, call Conexus/Product providers, run production',
    'effects, push, create a PR, merge, or ask another reviewer. Use only read-only inspection.',
    'Do not create a Docker builder or build, pull, tag, load, push or remove an image. If a',
    'diagnostic is not admitted read-only, keep it as an unknown instead of requesting it.',
    '',
    'Return a self-contained independent report. Classify every concrete finding using exactly',
    classes,
    'For every material finding include: evidence/reproducible observation; failure mode;',
    'why it is material; smallest real owner/stage; protected property or target invariant;',
    'whether current work must stop; what must be re-evaluated; and what must not be reopened.',
    'Keep unknowns as unknowns and distinguish evidence from inference.',
    '',
    'Do not target, assume, imply, or borrow a preferred verdict. Do not compare your result',
    'with another lane and do not claim convergence, consensus, or a Global Maximum. If you',
    'include a conclusion, emit only your own evidence-based raw line as `VERDICT = ...`.',
    'Reviewer output is Evidence, not authority; the Lead/operator adjudicates it later.',
  ].join('\n')
}

/** Keep AGY headless review on native workspace reads that require no approval. */
export function buildLaneReviewPrompt(lane, options) {
  const prompt = buildReviewPrompt(options)
  if (lane !== 'gemini') return prompt
  return [
    prompt,
    '',
    'AGY HEADLESS READ-ONLY CONSTRAINTS:',
    `- Inspect only the exact workspace root ${options.repositoryRoot}. Do not search or read its parent or sibling directories.`,
    '- Use only native read-only repository tools: view_file, grep_search, list_dir, and find_by_name scoped to that exact root.',
    '- Never call run_command, command_status, send_command_input, write/edit tools, browser/web tools, or subagents.',
    '- The exact commit/base and changed-path orientation are in the brief. If native reads cannot establish a claim, report it as an unknown; do not request permission or substitute a command.',
  ].join('\n')
}

const shellWriteTools = Object.freeze(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

/** Return one argv vector; this function never invokes a reviewer. */
export function buildLaneInvocation(lane, { prompt, session, conversation, claudeModel }) {
  const definition = laneDefinitions[lane]
  if (!definition) fail(`unknown lane ${lane}`)
  const identity = lane === 'opus' ? session : conversation
  const model = lane === 'opus' && claudeModel ? claudeModel : definition.model
  const args = ['-p', prompt, '--model', model, '--effort', definition.effort]
  if (lane === 'opus') {
    args.push('--permission-mode', definition.mode, '--disallowed-tools', ...shellWriteTools)
    args.push('--output-format', 'stream-json', '--verbose', '--include-partial-messages')
  } else {
    args.push('--mode', definition.mode, '--sandbox')
    args.push('--output-format', 'json')
  }
  if (identity !== undefined) args.push(definition.sessionFlag, identity)
  return {
    lane,
    executable: definition.executable,
    args,
    expectedVersion: definition.expectedVersion,
    model,
    effort: definition.effort,
    mode: definition.mode,
    sandbox: definition.sandbox,
    sessionOrConversation: identity ?? null,
  }
}

const lanesFor = (lane) => lane === 'both' ? laneNames : [lane]

const appendBounded = (current, chunk, currentBytes, label) => {
  const chunkBytes = Buffer.byteLength(chunk)
  if (currentBytes + chunkBytes > maxCaptureBytes) {
    fail(`${label} exceeded the ${maxCaptureBytes}-byte capture limit`)
  }
  return { value: current + chunk, bytes: currentBytes + chunkBytes }
}

const writeProgress = (label, text) => {
  if (!text) return
  process.stderr.write(`[${label}] ${text}`)
}

const progressFromClaudeEvent = (event, label) => {
  if (event?.type === 'system' && event.subtype === 'init') {
    writeProgress(label, `started session ${event.session_id ?? 'unknown'}\n`)
    return
  }
  if (event?.type === 'stream_event') {
    const streamEvent = event.event
    if (streamEvent?.type === 'content_block_start' && streamEvent.content_block?.type === 'tool_use') {
      writeProgress(label, `tool ${streamEvent.content_block.name ?? 'unknown'}\n`)
      return
    }
    if (streamEvent?.type === 'content_block_start' && streamEvent.content_block?.type === 'text') {
      writeProgress(label, 'response\n')
      return
    }
    if (streamEvent?.type === 'content_block_delta' && streamEvent.delta?.type === 'text_delta') {
      process.stderr.write(streamEvent.delta.text)
    }
    return
  }
  if (event?.type === 'result') {
    writeProgress(label, `\ncompleted with ${event.subtype ?? 'unknown'}\n`)
  }
}

const spawnCapture = (
  command,
  args,
  { cwd, input, env = process.env, streamJson = false, progressLabel = command } = {},
) => new Promise((resolvePromise, reject) => {
  const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  let stdoutBytes = 0
  let stderrBytes = 0
  let streamBuffer = ''
  let streamBufferBytes = 0
  let finalStreamEvent
  let settled = false

  const stopWith = (error) => {
    if (settled) return
    settled = true
    child.kill('SIGTERM')
    reject(error)
  }

  const acceptStreamLine = (line) => {
    if (!line.trim()) return
    let event
    try {
      event = JSON.parse(line)
    } catch {
      fail('Claude stream emitted a non-JSON line')
    }
    progressFromClaudeEvent(event, progressLabel)
    if (event?.type === 'result') finalStreamEvent = event
  }

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    try {
      if (!streamJson) {
        const next = appendBounded(stdout, chunk, stdoutBytes, `${progressLabel} stdout`)
        stdout = next.value
        stdoutBytes = next.bytes
        return
      }
      const next = appendBounded(streamBuffer, chunk, streamBufferBytes, `${progressLabel} stream line`)
      streamBuffer = next.value
      streamBufferBytes = next.bytes
      let newline = streamBuffer.indexOf('\n')
      while (newline !== -1) {
        acceptStreamLine(streamBuffer.slice(0, newline))
        streamBuffer = streamBuffer.slice(newline + 1)
        streamBufferBytes = Buffer.byteLength(streamBuffer)
        newline = streamBuffer.indexOf('\n')
      }
    } catch (error) {
      stopWith(error)
    }
  })
  child.stderr.on('data', (chunk) => {
    try {
      const next = appendBounded(stderr, chunk, stderrBytes, `${progressLabel} stderr`)
      stderr = next.value
      stderrBytes = next.bytes
      writeProgress(progressLabel, chunk)
    } catch (error) {
      stopWith(error)
    }
  })
  child.once('error', stopWith)
  child.once('close', (code, signal) => {
    if (settled) return
    try {
      if (streamJson && streamBuffer.trim()) acceptStreamLine(streamBuffer)
      if (streamJson) {
        if (!finalStreamEvent) fail('Claude stream ended without a final result event')
        stdout = JSON.stringify(finalStreamEvent)
      }
      settled = true
      resolvePromise({ code, signal, stdout, stderr })
    } catch (error) {
      stopWith(error)
    }
  })
  if (input !== undefined) child.stdin.end(input)
  else child.stdin.end()
})

const rawJson = (text) => {
  try {
    return JSON.parse(text.trim())
  } catch {
    return undefined
  }
}

const valueAt = (object, ...paths) => {
  for (const path of paths) {
    let cursor = object
    for (const key of path.split('.')) cursor = cursor && typeof cursor === 'object' ? cursor[key] : undefined
    if (cursor !== undefined && cursor !== null) return cursor
  }
  return undefined
}

/** Preserve a model-reported verdict without normalizing or adjudicating it. */
export function captureRawVerdict(stdout, parsed = rawJson(stdout)) {
  const structured = valueAt(parsed, 'verdict', 'result.verdict', 'result.output.verdict')
  if (structured !== undefined) return structured
  const response = valueAt(parsed, 'response', 'result.response', 'result', 'output')
  const source = typeof response === 'string' ? response : stdout
  const match = source.match(/^\s*VERDICT\s*=\s*(.+?)\s*$/im)
  return match ? match[1] : null
}

const captureIdentity = (lane, parsed, requested) => {
  const key = lane === 'opus'
    ? valueAt(parsed, 'session_id', 'sessionId', 'result.session_id', 'result.sessionId')
    : valueAt(parsed, 'conversation_id', 'conversationId', 'result.conversation_id', 'result.conversationId')
  return key ?? requested ?? null
}

const versionOf = (lane, result) => {
  const definition = laneDefinitions[lane]
  const output = `${result.stdout}\n${result.stderr}`
  if (result.code !== 0) fail(`${lane} --version failed with exit ${result.code ?? 'unknown'}: ${result.stderr.trim()}`)
  const match = output.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/)
  if (!match) fail(`${lane} --version did not return a semantic version`)
  const version = match[0]
  const expectedMajor = Number(definition.expectedVersion.match(/^(\d+)/)?.[1])
  const actualMajor = Number(version.match(/^(\d+)/)?.[1])
  if (!Number.isInteger(actualMajor) || actualMajor !== expectedMajor) {
    fail(`${lane} CLI version ${JSON.stringify(version)} is incompatible with ${definition.expectedVersion}`)
  }
  return version
}

async function executeLane(lane, options, prompt, runProcess = spawnCapture) {
  const invocation = buildLaneInvocation(lane, { ...options, prompt })
  let versionResult
  try {
    versionResult = await runProcess(invocation.executable, ['--version'], { cwd: options.repositoryRoot })
  } catch (error) {
    fail(`unable to invoke ${lane} CLI for version: ${error.message}`)
  }
  const version = versionOf(lane, versionResult)
  let result
  try {
    result = await runProcess(invocation.executable, invocation.args, {
      cwd: options.repositoryRoot,
      streamJson: lane === 'opus',
      progressLabel: lane,
    })
  } catch (error) {
    fail(`unable to invoke ${lane} CLI: ${error.message}`)
  }
  const parsed = rawJson(result.stdout)
  if (result.code !== 0) {
    fail(`${lane} review failed with exit ${result.code ?? 'unknown'}: ${result.stderr.trim()}`)
  }
  if (lane === 'gemini') {
    if (!parsed || typeof parsed !== 'object') fail('gemini review did not return JSON')
    const status = valueAt(parsed, 'status', 'result.status')
    if (status !== 'SUCCESS') fail(`gemini review returned status ${JSON.stringify(status)}`)
    const deniedActions = valueAt(parsed, 'denied_actions', 'result.denied_actions')
    if (Array.isArray(deniedActions) && deniedActions.length > 0) {
      const names = deniedActions.map((entry) => entry?.display_name ?? entry?.action ?? 'unknown')
      fail(`gemini review was permission-denied: ${names.join(', ')}`)
    }
    const response = valueAt(parsed, 'response', 'result.response')
    if (typeof response !== 'string' || !response.trim()) fail('gemini review returned an empty response')
  }
  return {
    ...invocation,
    version,
    sessionOrConversation: captureIdentity(lane, parsed, invocation.sessionOrConversation),
    verdictRaw: captureRawVerdict(result.stdout, parsed),
    exitCode: result.code,
    signal: result.signal ?? null,
    raw: result.stdout,
    stderr: result.stderr,
    parsed,
  }
}

const publicInvocation = ({ parsed: _parsed, ...invocation }) => invocation

/** Build a dry-run result or execute explicitly selected lanes. */
export async function runReview(options, { runProcess = spawnCapture } = {}) {
  const validated = validateConfig(options)
  const lanes = lanesFor(validated.lane)
  const laneOptions = (lane) => ({
    prompt: buildLaneReviewPrompt(lane, validated),
    session: validated.session,
    conversation: validated.conversation,
    claudeModel: validated.claudeModel,
  })
  const records = validated.dryRun
    ? lanes.map((lane) => publicInvocation(buildLaneInvocation(lane, laneOptions(lane))))
    : await Promise.all(lanes.map((lane) => executeLane(
        lane,
        validated,
        laneOptions(lane).prompt,
        runProcess,
      )))
  const result = {
    schema: 'conexus.review-run/v1',
    repositoryRoot: validated.repositoryRoot,
    brief: validated.briefRelative,
    briefSha256: validated.briefSha256,
    candidateResult: validated.candidateResultRelative ?? null,
    candidateResultSha256: validated.candidateResultSha256 ?? null,
    lane: validated.lane,
    mode: validated.dryRun ? 'dry-run' : 'execute',
    dryRun: validated.dryRun,
    outputDir: validated.outputAbsolute ?? null,
    lanes: records,
  }
  if (validated.outputAbsolute && !validated.dryRun) {
    mkdirSync(validated.outputAbsolute, { recursive: true })
    const artifactPath = resolve(validated.outputAbsolute, 'conexus-review-result.json')
    result.outputFile = artifactPath
    writeFileSync(artifactPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  }
  return result
}

const commandLine = (record) => `${record.executable} ${record.args.map((value, index) => index === 1 ? '<review-prompt>' : JSON.stringify(value)).join(' ')}`

export async function main(argv = process.argv.slice(2)) {
  let options
  try {
    options = parseArgs(argv)
    if (options.help) {
      process.stdout.write(`${usage}\n`)
      return 0
    }
    const result = await runReview(options)
    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    } else {
      process.stdout.write(`mode = ${result.mode}\nlane = ${result.lane}\nbrief = ${result.brief}\n`)
      for (const record of result.lanes) process.stdout.write(`${record.lane}: ${commandLine(record)}\n`)
      if (result.outputFile) process.stdout.write(`output = ${result.outputFile}\n`)
    }
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (options?.json || argv.includes('--json')) process.stdout.write(`${JSON.stringify({ error: message })}\n`)
    else process.stderr.write(`${message}\n`)
    return 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code })
}
