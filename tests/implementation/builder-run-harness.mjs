// The run harness: a real Conexus Git and a sandbox that is a directory on this machine, around the
// real service and run, with the agent's session the test's own unless it brings one.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createReadStream, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { Readable } from 'node:stream'
import { createWorkspaceTools, LocalFilesystem, Workspace } from '@mastra/core/workspace'
import { hubModuleUrl } from './hub-build.mjs'

export const { Failure } = await import(hubModuleUrl('platform/failure.js'))
const { logger } = await import(hubModuleUrl('platform/logger.js'))

export const endLines = []
export const failureLines = (code) => endLines.filter((line) => line.message === code)
for (const level of ['info', 'warn', 'error']) {
  const write = logger[level].bind(logger)
  logger[level] = (fields, message) => { if (typeof message === 'string') endLines.push({ level, message, fields }); return write(fields, message) }
}

const built = hubModuleUrl
const { createBuilderService } = await import(built('builder/service.js'))
const { createMirrorFeed } = await import(built('builder/run/mirror.js'))
export const { sweepIdleMachines } = await import(built('builder/idle-machine-sweep.js'))
const { createConexusGit } = await import(built('builder/conexus-git.js'))
const { loadCheckBundle } = await import(built('builder/check-delivery.js'))
const { createProjectSourceReads } = await import(built('builder/source.js'))
export const { conexusInstructions } = await import(built('builder/harness/prompt.js'))
export const { RequestContext } = await import('@mastra/core/request-context')

export const runId = '11111111-1111-4111-8111-111111111111'
export const projectId = '22222222-2222-4222-8222-222222222222'
export const accountId = '33333333-3333-4333-8333-333333333333'
export const conversationId = '44444444-4444-4444-8444-444444444444'
export const AGENTS_MD = '# Project knowledge\n\nA base app.\n'
export const CONNECTOR_BRIEF_UNBOUND = 'No Conexão is bound to this Project, so it reads no external system. When a request needs data from one, '
  + 'change no files: name the system, tell the person a Conexão for it can be added in Integrações, and stop.'
export const CONNECTOR_BRIEF_UNAVAILABLE = 'The Conexões bound to this Project could not be read in this run. Do not call `connector_fetch` or `connectors.fetch`; '
  + 'when the request needs data from an external system, change no files, tell the person it is unavailable right now and that they can ask again later, and stop.'
export const STARTER = [
  { path: 'AGENTS.md', content: AGENTS_MD },
  { path: 'app/index.html', content: '<h1>base</h1>\n' },
]
export const BASE_FILES = ['AGENTS.md', 'app/index.html']
const MODEL_ACCOUNT = '55555555-5555-4555-8555-555555555555'
export const GIT_ENV = { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' }
export const completed = (summary = 'Pronto.') => ({ reason: 'complete', userMessageId: 'user-message', summary })
export const listFiles = (root) => readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile()).map((entry) => relative(root, join(entry.parentPath, entry.name))).sort()

export const CHECK_BUNDLE = loadCheckBundle()
const STEP_ORDER = ['generate', 'typecheck', 'build', 'server', 'boot']
const REPORT_ARTIFACT = { templateRef: 'template:pin', files: [{ path: 'index.html', bytes: 8, sha256: 'f'.repeat(64) }] }
export const PASSING_REPORT = {
  ok: true,
  checkSha256: CHECK_BUNDLE.sha256,
  steps: STEP_ORDER.map((step) => ({ step, status: 'passed', durationMs: 1 })),
  artifact: REPORT_ARTIFACT,
}
const FAILURE_CODES = { generate: 'MANIFEST_REFUSED', typecheck: 'TYPECHECK_ERRORS', build: 'BUILD_FAILED', server: 'SERVER_BUNDLE_REFUSED' }
export const failedReport = (step, problems) => {
  const failedAt = STEP_ORDER.indexOf(step)
  const ok = step === 'boot'
  return {
    ok,
    checkSha256: CHECK_BUNDLE.sha256,
    steps: STEP_ORDER.map((id, index) => index < failedAt ? { step: id, status: 'passed', durationMs: 1 }
      : index === failedAt ? { step: id, status: 'failed', code: FAILURE_CODES[id] ?? problems[0].code, durationMs: 1, problems }
        : { step: id, status: 'skipped', code: 'AFTER_BLOCKING_FAILURE', reason: `after failed ${step}` }),
    artifact: ok ? REPORT_ARTIFACT : null,
  }
}

// A run against a real Conexus Git and a sandbox that is a directory on this machine: every path the
// runtime names under /workspace, /var/lib or /opt lands under the harness's
// own `vm` directory, and the agent user's `kill -KILL -1` is recorded, never run. It is the
// conversation's one VM: every turn reaches the same directory until `loseVm` replaces it.
export const harness = async (t, { turn, build, report, onCheck, repairs = [], skipGate = false, starter, agentUser = 'conexus-agent', onStart, onCommand, lostAdvances = 0, close, applicationServer, openConnectorRun, openError, onHoldOpen, corruptSeed = false, beforeFastForward, afterFastForward, beforeAcceptSnapshot, modelAccount = MODEL_ACCOUNT, starterFiles = STARTER, mirrorDebounceMs = 0, questionWaitMs = 60_000, answers = [], session, onWaitingWrite, persisted, openSandbox, claim, candidateRefusal } = {}) => {
  endLines.splice(0)
  const scratch = mkdtempSync(join(tmpdir(), 'conexus-runtime-'))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const vm = join(scratch, 'vm')
  for (const directory of ['workspace', 'opt/conexus', 'tmp']) mkdirSync(join(vm, directory), { recursive: true })
  const conexusGit = createConexusGit({ root: join(scratch, 'git'), starter: starterFiles })
  const base = await conexusGit.ensureRepository(projectId)
  const bare = join(scratch, 'git', `${projectId}.git`)
  const inBare = (...args) => spawnSync('git', ['--git-dir', bare, ...args], { encoding: 'utf8', env: GIT_ENV }).stdout.trim()
  // A commit on top of the base that no run made, for a writer that moves `main` behind the run's back.
  const outside = () => inBare('commit-tree', `${base}^{tree}`, '-p', base, '-m', 'outside')
  const moveMain = (revision) => inBare('update-ref', 'refs/heads/main', revision)
  const git = {
    ...conexusGit,
    acceptSnapshot: async (...args) => {
      await beforeAcceptSnapshot?.()
      return conexusGit.acceptSnapshot(...args)
    },
    fastForwardMain: async (...args) => {
      await beforeFastForward?.({ moveMain, outside })
      const moved = await conexusGit.fastForwardMain(...args)
      await afterFastForward?.()
      return moved
    },
  }
  const local = (text) => text.replaceAll('/workspace', `${vm}/workspace`).replaceAll('/var/lib/', `${vm}/var/lib/`).replaceAll('/opt/conexus', `${vm}/opt/conexus`)

  const shell = (command, args, cwd) => {
    const ran = spawnSync(command, args, { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: scratch, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } })
    return { exitCode: ran.status ?? 1, success: ran.status === 0, stdout: ran.stdout ?? '', stderr: ran.stderr ?? '' }
  }
  const events = []
  // Each run the Hub published into the conversation's session, as the browser's stream hears it.
  const publishedRuns = []
  // The service, for an answer the person gives while the run waits.
  const context = {}
  const calls = []
  const diagnostics = []
  const logs = []
  // The run's BUILDER_RUN_TIMING lines, kept apart from the lines that say what happened.
  const timings = []
  // The BUILDER_SANDBOX_EGRESS* lines, and the VM's two recorders: `pending` holds what the
  // processes would have written since the last poll, and the files are what the Hub reads back.
  const egressLogs = []
  const egress = { running: false, installs: 0, starts: 0, pollError: false, pollHangs: false, pending: { tcp: [], dns: [] }, files: new Map() }
  const egressAppend = (name, rows) => {
    if (rows.length === 0) return
    const path = `/var/log/conexus-egress/${name}.jsonl`
    egress.files.set(path, Buffer.concat([egress.files.get(path) ?? Buffer.alloc(0), Buffer.from(rows.map((row) => `${typeof row === 'string' ? row : JSON.stringify(row)}\n`).join(''))]))
  }
  const egressRoot = async (script) => {
    if (script.includes('--once')) {
      if (egress.pollHangs) return new Promise(() => {})
      if (egress.pollError) return { exitCode: 1, success: false, stdout: '', stderr: 'poller failed' }
      egressAppend('tcp', egress.pending.tcp.splice(0))
      egressAppend('dns', egress.pending.dns.splice(0))
      return { exitCode: 0, success: true, stdout: '', stderr: '' }
    }
    if (script.includes('setsid')) { egress.starts += 1; egress.running = true; return { exitCode: 0, success: true, stdout: '', stderr: '' } }
    return { exitCode: egress.running ? 0 : 1, success: egress.running, stdout: '', stderr: '' }
  }
  const invocations = []
  const rootInvocations = []
  // Each check the Hub ran on a candidate, with the tree it was handed and where `main` stood.
  const checks = []
  const agentChecks = []
  // What the gate told the agent at each "done" that went back to it.
  const feedbacks = []
  const idled = []
  const killed = []
  // What the service read and recorded of the conversation's sandbox.
  const sandboxRefs = []
  let recordedSandbox = null
  // What the run put in its session's request context.
  const sessionContext = new Map()
  // What the service recorded of the conversation's session.
  const sessions = []
  const checkout = join(vm, 'workspace/repo')
  const workspace = new Workspace({ id: 'run-workspace', filesystem: new LocalFilesystem({ basePath: checkout }) })
  const sandbox = {
    sandboxId: 'sbx-1',
    workspace,
    mirrorFeed: createMirrorFeed(workspace),
    idle: async () => { events.push('idle'); idled.push(sandbox.sandboxId) },
    kill: async () => { events.push('kill'); killed.push(sandbox.sandboxId) },
    holdOpen: async (onLapse) => { events.push('hold-open'); await onHoldOpen?.(onLapse); return () => { events.push('release') } },
    start: async () => { events.push('start'); onStart?.(sandbox) },
    writeFiles: async () => {},
    runAsRoot: async (script, env) => {
      if (script.includes('conexus-egress')) return egressRoot(script)
      events.push(['root', script])
      rootInvocations.push({ script, env })
      const mapped = local(script)
      for (const [, target] of mapped.matchAll(/rm -rf '([^']+)'/g)) assert.ok(target.startsWith(vm), `root removes only under the harness: ${target}`)
      return shell('sh', ['-c', mapped], vm)
    },
    writeRootFile: async (path, bytes) => {
      if (path.startsWith('/usr/local/lib/conexus-egress/')) { egress.installs += 1; return }
      if (path.startsWith('/var/log/conexus-egress/')) { egress.files.set(path, Buffer.from(bytes)); return }
      events.push(['rootFile', path])
      mkdirSync(dirname(local(path)), { recursive: true })
      writeFileSync(local(path), corruptSeed && path.endsWith('.bundle') ? Buffer.from('not a bundle') : bytes)
    },
    readAgentFileStream: async (path) => Readable.toWeb(createReadStream(local(path))),
    readAgentFile: async (path) => {
      if (!path.startsWith('/var/log/conexus-egress/')) return readFileSync(local(path))
      const held = egress.files.get(path)
      if (!held) throw new Error(`ENOENT: ${path}`)
      return held
    },
    readAgentFileIfPresent: async (path) => egress.files.get(path) ?? null,
    executeCommand: async (command, args = [], options = {}) => {
      const line = [command, ...args].join(' ')
      onCommand?.(sandbox, line)
      events.push(line)
      invocations.push({ argv: [command, ...args], env: options.env })
      if (line === 'id -un') return { exitCode: 0, success: true, stdout: `${agentUser}\n`, stderr: '' }
      if (line.startsWith('sh -c kill -KILL -1')) return { exitCode: 0, success: true, stdout: '', stderr: '' }
      return shell(command, args.map(local), local(options.cwd ?? '/workspace'))
    },
    runCheck: async ({ root, out, collect, caller }) => {
      if (caller === 'tool') {
        agentChecks.push({ root, out, collect })
        return { report: PASSING_REPORT, files: null }
      }
      events.push('check')
      checks.push({ root, out, files: listFiles(local(root)), index: readFileSync(join(local(root), 'app/index.html'), 'utf8'), main: await conexusGit.readMain(projectId) })
      await onCheck?.(sandbox, checks.length)
      const reported = typeof report === 'function' ? report(checks.length - 1) : report ?? PASSING_REPORT
      const files = build ? await build() : [{ path: 'index.html', mediaType: 'text/html', sha256: 'f'.repeat(64), bytes: 'PGh0bWw+' }]
      return { report: reported, files: reported.ok ? files : null }
    },
  }
  // A write the way the agent makes one: the workspace's write tool, with whatever hooks the run set on it.
  const writeThroughTool = async (path, content) => {
    const tools = await createWorkspaceTools(sandbox.workspace)
    const written = await tools.mastra_workspace_write_file.execute({ path, content, overwrite: true }, {})
    assert.match(String(written), /^Wrote /, `the write tool wrote ${path}`)
  }
  const ports = {
    openSandbox: async (ref) => { events.push(['sandbox', ref.conversationId]); sandboxRefs.push(ref); return openSandbox ? openSandbox(ref) : sandbox },
    check: CHECK_BUNDLE,
    checkModel: async ({ builderRunId, accountId: payer }) => {
      events.push(['model-check', builderRunId, payer])
      if (!modelAccount) throw new Failure('BUILDER_MODEL_NOT_SELECTED')
    },
    openSession: async (input) => {
      events.push(['open', input.conversationId, input.builderRunId])
      if (openError) throw openError
      if (session) return session(input)
      input.bindContext({ setRaw: (key, value) => sessionContext.set(key, value) })
      // The turn as Mastra runs it: each time the agent says it is done the gate answers, and a red
      // check sends it back to work on the next scripted repair.
      const drive = async (signal, resume) => {
        // The controller resolves the run's tools at each agent call, as Mastra does.
        const tools = service.runTools(input.conversationId, input.builderRunId)
        const finish = async () => {
          const feedback = await tools.gate.finish()
          if (feedback !== null) feedbacks.push(feedback)
          return feedback
        }
        const context = { signal, sandbox, checkout, runCheck: tools.check, write: writeThroughTool, bare: inBare, mirror, finish, resume }
        let ended
        if (turn) ended = await turn(context)
        else {
          writeFileSync(join(checkout, 'app/index.html'), '<h1>UNIT1</h1>\n')
          ended = completed()
        }
        if (ended.reason !== 'complete' || skipGate) return ended
        const queue = [...repairs]
        for (;;) {
          if (await finish() === null || tools.gate.gaveUp()) return ended
          await queue.shift()?.(context)
        }
      }
      // The person's answers, each one offered to the run once it waits on its question.
      const pending = new Set()
      return {
        takeStep: async (step, signal) => {
          events.push(step.kind === 'SEND' ? 'turn' : ['answer', step.toolCallId])
          if (step.kind === 'ANSWER') pending.delete(step.toolCallId)
          const ended = await drive(signal, step.kind === 'ANSWER' ? { toolCallId: step.toolCallId, resumeData: step.resumeData } : undefined)
          if (ended.reason === 'suspended') pending.add(ended.toolCallId ?? 'c1')
          return ended
        },
        pendingCalls: () => [...pending],
        untilQuestionStored: async () => { events.push('stored') },
        endQuestions: async () => { events.push('end-questions'); pending.clear() },
        release: async () => { events.push('session-release'); if (close) await close() },
      }
    },
    git,
    mirrorDebounceMs,
    materializeStarter: async () => { events.push('starter'); await starter?.() },
    ...(openConnectorRun ? { openConnectorRun } : {}),
    readProjectName: async () => 'Compras',
    log: (code, fields = {}) => { if (code === 'BUILDER_RUN_TIMING') timings.push(fields)
      else (code.startsWith('BUILDER_SANDBOX_EGRESS') ? egressLogs : logs).push([code, ...Object.values(fields)].join(':')) },
  }
  const claimed = { builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'PREPARING', baseSourceRevision: base, resultSourceRevision: null, resultKind: null, failureCode: null }
  // The one run's row as the database holds it.
  const row = { running: true, candidate: null, result: null }
  const store = {
    ownerId: '0f000000-0000-4000-8000-0000000000aa',
    createBuilderRun: async (input) => {
      calls.push(['create'])
      claimed.baseSourceRevision = await input.readBase()
      return { ...claimed, state: 'QUEUED', phase: null }
    },
    admitSourceRevision: async () => true,
    admitBuilder: async () => {},
    claimBuilderRun: async () => { await claim?.(); return claimed },
    setBuilderRunPhase: async (_id, phase) => {
      calls.push(['phase', phase])
      if (phase === 'WAITING' && onWaitingWrite && await onWaitingWrite(context.service) === 'REFUSE') return null
      // The person acts once the browser shows the question.
      const reply = phase === 'WAITING' ? answers.shift() : undefined
      if (reply) setTimeout(() => { void reply(context.service) }, 0)
      return { ...claimed, phase }
    },
    recordBuilderRunCandidate: async ({ sourceRevision }) => {
      if (candidateRefusal) throw candidateRefusal
      calls.push(['candidate', sourceRevision])
      row.candidate = sourceRevision
    },
    bindBuilderRunMessage: async ({ messageId }) => { calls.push(['message', messageId]) },
    bindBuilderRunSandbox: async (_id, sandboxId) => { calls.push(['sandbox', sandboxId]) },
    readConversationSandbox: async () => recordedSandbox,
    recordConversationSandbox: async ({ providerSandboxId }) => { recordedSandbox = providerSandboxId },
    settleBuilderRun: async () => { calls.push(['settle', 'RESPONSE_ONLY']); row.running = false },
    advanceBuilderRunSource: async (_id, revision) => {
      if (lostAdvances-- > 0) {
        calls.push(['advanceLost', revision])
        throw new Error('Connection terminated unexpectedly')
      }
      calls.push(['advance', revision])
      row.result = revision
    },
    settleBuilderRunBuild: async (input) => { calls.push(['settleBuild', input.sourceRevision, input.failureCode ?? null]); row.running = false },
    readLatestCodeChangingBuilderRun: async () => null,
    readBuilderRun: async () => (persisted ? persisted(claimed) : claimed),
    endUnclaimedBuilderRun: async (_id, ending) => { calls.push(['endUnclaimed', ending.kind, ending.code]); row.running = false },
    failBuilderRun: async (_id, code) => { calls.push(['fail', code]); row.running = false },
    interruptBuilderRun: async (_id, reason) => { calls.push(['interrupt', reason]); row.running = false },
    requestBuilderRunCancellation: async () => ({ ...claimed, cancellationRequested: true }),
    recordConversationSession: async (input) => { sessions.push(input) },
    // A run this Hub lists as live is never taken over; one with a candidate that it does not list is stale.
    renewRunLease: async (_owner, liveIds) => row.running && row.candidate && !liveIds.includes(runId)
      ? [{ builderRunId: runId, projectId, conversationId, candidateRevision: row.candidate, resultSourceRevision: row.result, previousOwnerId: null }]
      : [],
    close: async () => {},
  }
  const service = createBuilderService({
    store,
    ...(applicationServer ? { applicationServer } : {}),
    applicationArtifacts: {
      retainApplication: async ({ compiled }) => ({
        artifactRevisionId: 'artifact-1', artifactDigest: 'g'.repeat(64),
        projectId: compiled.projectId, sourceRevision: compiled.sourceRevision,
        profile: 'REACT_VITE_V2', templateRef: compiled.templateRef, recipeSha256: compiled.recipeSha256,
        entryPath: 'index.html', files: [],
      }),
    },
    runs: {
      ports,
      git,
      conversations: {
        ownerOf: async () => 'PROJECT',
      },
      source: createProjectSourceReads({ git }),
      appendDiagnostic: async (input) => { diagnostics.push({ ...input, from: 'service' }) },
      publishRun: async (published) => { publishedRuns.push(published) },
      questionWaitMs,
    },
  })
  context.service = service
  const start = (content = 'Mostre UNIT1-nonce', idempotencyKey = 'key') => service.sendBuilderMessage({ accountId, projectId, conversationId, idempotencyKey, content })
  // The same run row started once more on the same sandbox, as the next run of the conversation would.
  const again = async (content, idempotencyKey) => {
    await new Promise((wake) => { setTimeout(wake, 20) })
    Object.assign(row, { running: true, candidate: null, result: null })
    return start(content, idempotencyKey)
  }
  // E2B lost the conversation's VM between turns: the next start gets a new one with no checkout.
  const loseVm = (sandboxId) => {
    rmSync(checkout, { recursive: true, force: true })
    sandbox.sandboxId = sandboxId
  }
  const main = () => conexusGit.readMain(projectId)
  const MIRROR = `refs/conexus/conversations/${conversationId}`
  // The conversation's mirror head, and the files it holds, as the Conexus Git has them.
  const mirror = () => inBare('rev-parse', '--verify', '--quiet', MIRROR) || null
  const mirrorFiles = () => inBare('ls-tree', '-r', '--name-only', MIRROR).split('\n').filter(Boolean)
  // The candidate the run offered, as the Conexus Git holds it under the run's own ref.
  const result = () => inBare('rev-parse', '--verify', '--quiet', `refs/conexus/runs/${runId}`) || null
  const commands = () => events.filter((event) => typeof event === 'string')
  // The run's own ending, or the lease's: a lease pass settles what this Hub no longer lists.
  const settled = async () => {
    for (let attempt = 0; row.running && attempt < 400; attempt++) {
      await service.renewLease(new AbortController().signal)
      if (row.running) await new Promise((wake) => { setTimeout(wake, 5) })
    }
    return !row.running
  }
  // The run's last write and its exit, however long the run waits.
  const untilEnded = async () => {
    while (row.running || service.runOpen(conversationId)) await new Promise((wake) => { setTimeout(wake, 50) })
  }
  return { publishedRuns, untilEnded, mirror, mirrorFiles, sessions, MIRROR, inBare, agentChecks, base, again, events, invocations, rootInvocations, calls, diagnostics, logs, timings, egress, egressLogs, service, start, main, result, commands, checks, feedbacks, settled, sessionContext, checkout, outside, moveMain, idled, killed, sandboxRefs, loseVm, bare, vm }
}

