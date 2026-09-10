import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import test from 'node:test'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const script = resolve(repositoryRoot, 'scripts/conexus-review.mjs')
const brief = 'docs/evidence/4f/4f-r1-independent-global-review-brief.md'

const run = (...args) => spawnSync(process.execPath, [script, ...args], {
  cwd: repositoryRoot,
  encoding: 'utf8',
  windowsHide: true,
})

const jsonRun = (...args) => {
  const result = run(...args, '--json')
  const output = `${result.stdout}\n${result.stderr}`
  return { ...result, output, body: JSON.parse(result.stdout) }
}

test('review wrapper exists and requires an explicit brief', () => {
  assert.equal(existsSync(script), true)
  const result = run('--lane', 'both')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /--brief <file> is required/)
})

test('default is a two-lane dry-run and emits no provider output', () => {
  const result = jsonRun('--brief', brief)
  assert.equal(result.status, 0, result.output)
  assert.equal(result.body.mode, 'dry-run')
  assert.equal(result.body.dryRun, true)
  assert.match(result.body.briefSha256, /^[a-f0-9]{64}$/)
  assert.equal(result.body.candidateResult, null)
  assert.equal(result.body.candidateResultSha256, null)
  assert.deepEqual(result.body.lanes.map(({ lane }) => lane), ['opus', 'gemini'])
  assert.equal(result.body.lanes[0].model, 'fable')
  assert.equal(result.body.lanes[0].effort, 'xhigh')
  assert.equal(result.body.lanes[0].mode, 'plan')
  assert.equal(result.body.lanes[0].sandbox, false)
  assert.equal(result.body.lanes[1].model, 'gemini-3.1-pro-high')
  assert.equal(result.body.lanes[1].effort, 'high')
  assert.equal(result.body.lanes[1].mode, 'plan')
  assert.equal(result.body.lanes[1].sandbox, true)
  assert.match(result.body.lanes[0].args.join(' '), /--permission-mode plan/)
  assert.match(result.body.lanes[0].args.join(' '), /--disallowed-tools .*Write.*Edit.*MultiEdit.*NotebookEdit/)
  assert.match(result.body.lanes[0].args.join(' '), /--output-format stream-json --verbose --include-partial-messages/)
  assert.match(result.body.lanes[1].args.join(' '), /--mode plan .*--sandbox .*--output-format json/)
  assert.match(result.body.lanes[1].args[1], /AGY HEADLESS READ-ONLY CONSTRAINTS:/)
  assert.match(result.body.lanes[1].args[1], /Never call run_command/)
  assert.doesNotMatch(result.body.lanes[0].args[1], /AGY HEADLESS READ-ONLY CONSTRAINTS:/)
  assert.doesNotMatch(result.output, /REVISE|ACCEPT|CONVERGENCE|GLOBAL_MAXIMUM/)
})

test('lane selection and continuity identifiers are represented without executing', () => {
  const result = jsonRun('--brief', brief, '--lane', 'opus', '--session', 'session-123')
  assert.equal(result.status, 0, result.output)
  assert.equal(result.body.lanes.length, 1)
  assert.equal(result.body.lanes[0].sessionOrConversation, 'session-123')
  assert.deepEqual(result.body.lanes[0].args.slice(-2), ['--resume', 'session-123'])

  const gemini = jsonRun('--brief', brief, '--lane=gemini', '--conversation', 'conversation-123')
  assert.equal(gemini.status, 0, gemini.output)
  assert.equal(gemini.body.lanes[0].sessionOrConversation, 'conversation-123')
  assert.deepEqual(gemini.body.lanes[0].args.slice(-2), ['--conversation', 'conversation-123'])
})

test('operator can select the bounded Opus fallback without changing the Fable default', () => {
  const fallback = jsonRun('--brief', brief, '--lane', 'opus', '--claude-model', 'opus')
  assert.equal(fallback.status, 0, fallback.output)
  assert.equal(fallback.body.lanes[0].model, 'opus')
  assert.match(fallback.body.lanes[0].args.join(' '), /--model opus/)

  const invalid = run('--brief', brief, '--lane', 'opus', '--claude-model', 'sonnet')
  assert.notEqual(invalid.status, 0)
  assert.match(invalid.stderr, /invalid --claude-model/)

  const wrongLane = run('--brief', brief, '--lane', 'gemini', '--claude-model', 'opus')
  assert.notEqual(wrongLane.status, 0)
  assert.match(wrongLane.stderr, /only valid for --lane opus or both/)
})

test('bounded review profiles reduce Opus effort without weakening lane selection', () => {
  const result = jsonRun('--brief', brief, '--lane', 'opus', '--profile', 'delta')
  assert.equal(result.status, 0, result.output)
  assert.equal(result.body.profile, 'delta')
  assert.equal(result.body.lanes[0].effort, 'high')
  assert.match(result.body.lanes[0].args.join(' '), /--effort high/)
  assert.match(result.body.lanes[0].args[1], /bounded delta\/focused review/)
})

test('execute is opt-in and cannot be combined with dry-run', () => {
  const result = run('--brief', brief, '--execute', '--dry-run')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /mutually exclusive/)
})

test('accepts a regular review brief outside the repository', () => {
  const outside = resolve(mkdtempSync(resolve(tmpdir(), 'conexus-review-brief-')), 'brief.md')
  writeFileSync(outside, '# Review brief\n')
  const result = run('--brief', outside, '--lane', 'opus', '--json')
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /"mode": "dry-run"/)
})

test('candidate-bound review records the separate custody attestation digest', () => {
  const candidate = 'docs/evidence/4f/4f-r3-rf05-rf08-candidate-freeze.md'
  const attestation = 'docs/evidence/4f/4f-r3-rf05-rf08-candidate-attestation.json'
  const result = jsonRun('--brief', 'docs/evidence/4f/4f-r3-rf05-rf08-candidate-review-brief.md', '--candidate-result', candidate, '--attestation', attestation, '--lane', 'opus')
  assert.equal(result.status, 0, result.output)
  assert.equal(result.body.attestation, attestation)
  assert.match(result.body.attestationSha256, /^[a-f0-9]{64}$/)
  assert.match(result.body.lanes[0].args[1], /Exact custody attestation:/)
})

test('binds an explicitly selected candidate result by repository path and digest', () => {
  const candidate = 'qualification/4d/r1-git-source-custody/evidence/native-readmission-linux-2026-09-01-v13/results.json'
  const result = jsonRun('--brief', brief, '--candidate-result', candidate, '--lane', 'opus')
  assert.equal(result.status, 0, result.output)
  assert.equal(result.body.candidateResult, candidate)
  assert.match(result.body.candidateResultSha256, /^[a-f0-9]{64}$/)
})

test('candidate-bound review requires fresh context and canonical reviewer executables', () => {
  const candidate = 'qualification/4d/r1-git-source-custody/evidence/native-readmission-linux-2026-09-01-v13/results.json'
  const resumed = run('--brief', brief, '--candidate-result', candidate, '--lane', 'opus', '--session', 'session-123')
  assert.notEqual(resumed.status, 0)
  assert.match(resumed.stderr, /requires a fresh session\/conversation/)

  const overridden = spawnSync(process.execPath, [script, '--brief', brief, '--candidate-result', candidate, '--lane', 'opus'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, CONEXUS_REVIEW_CLAUDE_BIN: '/tmp/not-canonical-claude' },
  })
  assert.notEqual(overridden.status, 0)
  assert.match(overridden.stderr, /requires the canonical claude executable/)
})

test('rejects invalid lanes and lane-specific continuity options', () => {
  const invalidLane = run('--brief', brief, '--lane', 'fable')
  assert.notEqual(invalidLane.status, 0)
  assert.match(invalidLane.stderr, /invalid --lane/)

  const invalidSession = run('--brief', brief, '--lane', 'gemini', '--session', 'forbidden')
  assert.notEqual(invalidSession.status, 0)
  assert.match(invalidSession.stderr, /--session is only valid/)

  const invalidConversation = run('--brief', brief, '--lane', 'opus', '--conversation', 'forbidden')
  assert.notEqual(invalidConversation.status, 0)
  assert.match(invalidConversation.stderr, /--conversation is only valid/)

  const invalidProfile = run('--brief', brief, '--profile', 'quick')
  assert.notEqual(invalidProfile.status, 0)
  assert.match(invalidProfile.stderr, /invalid --profile/)
})

test('does not accidentally invoke a reviewer in dry-run mode', () => {
  const result = execFileSync(process.execPath, [script, '--brief', brief, '--lane', 'opus'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.match(result, /mode = dry-run/)
  assert.match(result, /claude/)
})

test('Claude execution streams progress to stderr while preserving one final wrapper JSON on stdout', async () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'conexus-review-stream-'))
  const fakeClaude = resolve(temporaryRoot, 'claude')
  const outputDir = resolve(temporaryRoot, 'output')
  writeFileSync(fakeClaude, `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  process.stdout.write('2.1.257 (Claude Code)\\n')
} else {
  process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: '11111111-1111-4111-8111-111111111111' }) + '\\n')
  process.stdout.write(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'text', text: '' } } }) + '\\n')
  setTimeout(() => process.stdout.write(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'FIRST_PROGRESS' } } }) + '\\n'), 25)
  setTimeout(() => process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', session_id: '11111111-1111-4111-8111-111111111111', result: 'VERDICT = CLEAR' }) + '\\n'), 200)
}
`, 'utf8')
  chmodSync(fakeClaude, 0o755)

  try {
    const child = spawn(process.execPath, [
      script,
      '--brief', brief,
      '--lane', 'opus',
      '--execute',
      '--json',
      '--output-dir', outputDir,
    ], {
      cwd: repositoryRoot,
      env: { ...process.env, CONEXUS_REVIEW_CLAUDE_BIN: fakeClaude },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let firstProgressAt
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
      if (chunk.includes('FIRST_PROGRESS') && firstProgressAt === undefined) firstProgressAt = Date.now()
    })
    const closedAt = await new Promise((resolvePromise, reject) => {
      child.once('error', reject)
      child.once('close', (code) => code === 0
        ? resolvePromise(Date.now())
        : reject(new Error(`wrapper exited ${code}: ${stderr}`)))
    })

    assert.ok(firstProgressAt < closedAt, 'first progress must arrive before reviewer close')
    assert.match(stderr, /\[opus\] response\nFIRST_PROGRESS/)
    const body = JSON.parse(stdout)
    assert.equal(body.lanes[0].verdictRaw, 'CLEAR')
    assert.equal(body.lanes[0].sessionOrConversation, '11111111-1111-4111-8111-111111111111')
    assert.equal(body.lanes[0].raw.includes('FIRST_PROGRESS'), false)
    assert.deepEqual(JSON.parse(body.lanes[0].raw).type, 'result')
    assert.deepEqual(JSON.parse(readFileSync(body.outputFile, 'utf8')), body)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('missing reviewer verdict produces an incomplete receipt instead of closure', () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'conexus-review-no-verdict-'))
  const fakeClaude = resolve(temporaryRoot, 'claude')
  const outputDir = resolve(temporaryRoot, 'output')
  writeFileSync(fakeClaude, `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  process.stdout.write('2.1.257\\n')
} else {
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', session_id: '33333333-3333-4333-8333-333333333333', result: 'NO FINDING' }) + '\\n')
}
`, 'utf8')
  chmodSync(fakeClaude, 0o755)

  try {
    const result = spawnSync(process.execPath, [
      script, '--brief', brief, '--lane', 'opus', '--execute', '--json', '--output-dir', outputDir,
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, CONEXUS_REVIEW_CLAUDE_BIN: fakeClaude },
    })
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`)
    const body = JSON.parse(result.stdout)
    assert.equal(body.status, 'INCOMPLETE')
    assert.equal(body.lanes[0].status, 'INVALID_OUTPUT')
    assert.match(result.stderr, /omitted the required VERDICT/)
    assert.deepEqual(JSON.parse(readFileSync(body.outputFile, 'utf8')), body)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('review lane timeout fails closed with a bounded receipt', () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'conexus-review-timeout-'))
  const fakeClaude = resolve(temporaryRoot, 'claude')
  writeFileSync(fakeClaude, `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  process.stdout.write('2.1.257\\n')
} else {
  setInterval(() => {}, 1000)
}
`, 'utf8')
  chmodSync(fakeClaude, 0o755)

  try {
    const result = spawnSync(process.execPath, [
      script, '--brief', brief, '--lane', 'opus', '--execute', '--json', '--timeout-ms', '1000',
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, CONEXUS_REVIEW_CLAUDE_BIN: fakeClaude },
    })
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`)
    const body = JSON.parse(result.stdout)
    assert.equal(body.status, 'INCOMPLETE')
    assert.equal(body.lanes[0].status, 'FAILED')
    assert.match(result.stderr, /timed out after 1000ms/)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('AGY execution fails closed on denied actions or empty output', () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'conexus-review-agy-denied-'))
  const fakeAgy = resolve(temporaryRoot, 'agy')
  writeFileSync(fakeAgy, `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  process.stdout.write('1.1.27\\n')
} else {
  process.stdout.write(JSON.stringify({
    conversation_id: '11111111-1111-4111-8111-111111111111',
    status: 'SUCCESS',
    response: '',
    denied_actions: [{ action: 'command', display_name: 'RunCommand' }],
  }) + '\\n')
}
`, 'utf8')
  chmodSync(fakeAgy, 0o755)

  try {
    const result = spawnSync(process.execPath, [
      script,
      '--brief', brief,
      '--lane', 'gemini',
      '--execute',
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, CONEXUS_REVIEW_AGY_BIN: fakeAgy },
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /gemini review was permission-denied: RunCommand/)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('AGY execution preserves a non-empty native-read review', () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'conexus-review-agy-success-'))
  const fakeAgy = resolve(temporaryRoot, 'agy')
  writeFileSync(fakeAgy, `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  process.stdout.write('1.1.27\\n')
} else {
  const prompt = process.argv[process.argv.indexOf('-p') + 1]
  if (!prompt.includes('Never call run_command')) process.exit(9)
  process.stdout.write(JSON.stringify({
    conversation_id: '22222222-2222-4222-8222-222222222222',
    status: 'SUCCESS',
    response: 'NO FINDING\\nVERDICT = CLEAR',
  }) + '\\n')
}
`, 'utf8')
  chmodSync(fakeAgy, 0o755)

  try {
    const result = spawnSync(process.execPath, [
      script,
      '--brief', brief,
      '--lane', 'gemini',
      '--execute',
      '--json',
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, CONEXUS_REVIEW_AGY_BIN: fakeAgy },
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    const body = JSON.parse(result.stdout)
    assert.equal(body.lanes[0].verdictRaw, 'CLEAR')
    assert.match(body.lanes[0].raw, /NO FINDING/)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})
