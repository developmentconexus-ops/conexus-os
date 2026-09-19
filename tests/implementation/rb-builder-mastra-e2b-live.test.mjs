import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import test from 'node:test'
import { AgentController } from '@mastra/core/agent-controller'
import { createCodingAgent } from '@mastra/core/coding-agent'
import { Observability, MastraStorageExporter } from '@mastra/observability'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'

import { readBuilderE2BApiKey } from '../../scripts/builder-e2b-template.mjs'

const live = process.env.CONEXUS_RB_BUILDER_LIVE === 'true'
const repositoryRoot = resolve(import.meta.dirname, '../..')

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

test('RB live Mastra worker produces initial and bounded-correction E2B candidates', {
  skip: live ? false : 'requires explicit CONEXUS_RB_BUILDER_LIVE=true authority and live model/E2B configuration',
  timeout: 15 * 60_000,
}, async () => {
  const templateRef = process.env.CONEXUS_BUILDER_E2B_TEMPLATE_ID
  const catalogFile = process.env.CONEXUS_PROJECT_MODEL_CATALOG_FILE
  const slotsFile = process.env.CONEXUS_GIT_EXTERNAL_FILE_SLOTS_FILE
  const admissionId = process.env.CONEXUS_BUILDER_MODEL_ADMISSION_ID
  if (!templateRef || !/^[a-z0-9]+:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(templateRef) ||
    !catalogFile || !slotsFile || !admissionId) throw new Error('CONEXUS_RB_BUILDER_LIVE_CONFIG_REFUSED')

  const apiKey = readBuilderE2BApiKey(process.env.CONEXUS_BUILDER_E2B_API_KEY_FILE)
  const proofRoot = mkdtempSync(resolve(tmpdir(), 'conexus-rb-builder-live-'))
  const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/rb-builder-live-build-'))
  const sourceRoot = resolve(proofRoot, 'source')
  const resultRoot = resolve(proofRoot, 'result')
  try {
    const compiled = spawnSync(process.execPath, [
      resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
      '--noEmit', 'false', '--outDir', buildRoot,
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
    const built = (path) => pathToFileURL(resolve(buildRoot, path)).href
    const { resolveModelAdmission } = await import(built('model-connection/model-catalog.js'))
    const { BUILDER_TRACE_REQUEST_CONTEXT_KEYS, createMastraE2BCodingWorkerRuntime, resolveBuilderWorkspace } = await import(built('builder/runtime.js'))
    const { BUILDER_BASE_AGENT_INSTRUCTIONS, BUILDER_MODE_DEFINITIONS } = await import(built('builder/application-starter.js'))

    const admission = resolveModelAdmission({
      catalogFile,
      credentialSlotsFile: slotsFile,
      admissionId,
      requiredCapabilities: ['BUILDER_CODING'],
    })
    assert.equal(admission.admissionId, admissionId)
    assert.equal(admission.providerId, 'anthropic')

    git(proofRoot, 'init', '--initial-branch=main', sourceRoot)
    git(sourceRoot, 'config', 'user.name', 'Conexus Proof')
    git(sourceRoot, 'config', 'user.email', 'proof@conexus.invalid')
    writeFileSync(resolve(sourceRoot, 'README.md'), '# Governed Builder proof\n')
    git(sourceRoot, 'add', 'README.md')
    git(sourceRoot, 'commit', '-m', 'Exact accepted base')
    const baseSourceRevision = git(sourceRoot, 'rev-parse', 'HEAD')
    const sourceBundlePath = resolve(proofRoot, 'source.bundle')
    git(sourceRoot, 'bundle', 'create', sourceBundlePath, 'refs/heads/main')

    const storage = new LibSQLStore({ id: `rb-live-${randomUUID()}`, url: `file:${resolve(proofRoot, 'builder-session.db')}` })
    const memory = new Memory({ storage, options: { lastMessages: 20 } })
    const observability = new Observability({
      sensitiveDataFilter: true,
      configs: {
        default: {
          serviceName: 'conexus-builder',
          requestContextKeys: [...BUILDER_TRACE_REQUEST_CONTEXT_KEYS],
          exporters: [new MastraStorageExporter()],
        },
      },
    })
    const agent = createCodingAgent({
      id: `rb-live-agent-${randomUUID()}`,
      name: 'Conexus Coding Worker',
      model: admission.model,
      workspace: resolveBuilderWorkspace,
      editor: false,
      instructions: BUILDER_BASE_AGENT_INSTRUCTIONS,
      tools: {},
    })
    const controller = new AgentController({
      id: `rb-live-controller-${randomUUID()}`,
      storage,
      memory,
      initialState: { yolo: true },
      modes: BUILDER_MODE_DEFINITIONS.map((mode) => ({ ...mode, availableTools: [...mode.availableTools] })),
      defaultModeId: 'build',
      agent,
      workspace: undefined,
      observability,
    })
    const controllerReady = controller.init()
    let queuedObservabilityFlush = Promise.resolve()
    const flushObservability = () => {
      const next = queuedObservabilityFlush.then(() => observability.flush())
      queuedObservabilityFlush = next.catch(() => undefined)
      return next
    }
    let boundSandboxId
    const runtime = createMastraE2BCodingWorkerRuntime({
      apiKey,
      templateId: templateRef,
      model: admission.model,
      modelIdentity: {
        admissionId: admission.admissionId,
        providerId: admission.providerId,
        modelId: admission.modelId,
      },
      validateModelCredential: admission.validateCredential,
      sharedHarness: { controller, ready: controllerReady, flushObservability },
      timeoutMs: 12 * 60_000,
    })
    const identity = {
      accountId: randomUUID(),
      projectId: randomUUID(),
      executionId: randomUUID(),
    }
    const threadId = `conexus-builder:${identity.projectId}`
    const assertPersistedTurn = async (expectedUserMessage, expectedSummary) => {
      const thread = await memory.getThreadById({ threadId })
      assert.ok(thread, 'the exact Project Thread must remain persisted after runtime cleanup')
      assert.equal(thread.resourceId, identity.projectId)
      const messages = (await memory.recall({ threadId, resourceId: identity.projectId, page: 0, perPage: 50 })).messages
      const user = messages.find((message) => message.role === 'signal' && message.type === 'user' &&
        message.content.parts?.some((part) => part.type === 'text' && part.text === expectedUserMessage))
      assert.ok(user, 'the exact user request must be readable from the Project Thread')
      const assistantText = messages.filter((message) => message.role === 'assistant').flatMap((message) =>
        message.content.parts?.flatMap((part) => part.type === 'text' && typeof part.text === 'string' ? [part.text] : []) ?? [])
      assert.ok(assistantText.some((text) => text.trim()), 'terminal assistant text must be readable from the Project Thread')
      assert.ok(typeof expectedSummary === 'string' && expectedSummary.trim(), 'runtime must return a non-empty terminal summary')
    }

    try {
      await controllerReady
      const firstIntent = 'Create exactly one file named app/BUILDER_RESULT.txt containing exactly governed-by-conexus followed by a newline. Do not modify any other file.'
      const result = await runtime.execute({
        ...identity,
        intent: firstIntent,
        baseSourceRevision,
        sourceBundle: readFileSync(sourceBundlePath),
        bindPhysicalSandbox: async (sandboxId) => { boundSandboxId = sandboxId },
      })

      assert.equal(result.runtimeId, 'mastra-native-e2b-v1')
      assert.equal(result.sandboxId, boundSandboxId)
      assert.equal(result.baseSourceRevision, baseSourceRevision)
      assert.match(result.resultSourceRevision, /^[0-9a-f]{40}$/)
      assert.notEqual(result.resultSourceRevision, baseSourceRevision)
      const resultBundlePath = resolve(proofRoot, 'result.bundle')
      writeFileSync(resultBundlePath, result.resultBundle)
      git(proofRoot, 'clone', '--branch', 'conexus-result', resultBundlePath, resultRoot)
      assert.equal(git(resultRoot, 'rev-parse', 'HEAD^'), baseSourceRevision)
      assert.equal(git(resultRoot, 'rev-parse', 'HEAD'), result.resultSourceRevision)
      assert.equal(git(resultRoot, 'diff', '--name-only', 'HEAD^', 'HEAD'), 'app/BUILDER_RESULT.txt')
      assert.equal(readFileSync(resolve(resultRoot, 'app/BUILDER_RESULT.txt'), 'utf8'), 'governed-by-conexus\n')
      await assertPersistedTurn(firstIntent, result.summary)

      git(sourceRoot, 'checkout', '-B', 'failed-candidate', baseSourceRevision)
      mkdirSync(resolve(sourceRoot, 'app'), { recursive: true })
      writeFileSync(resolve(sourceRoot, 'app', 'CORRECTION_RESULT.txt'), 'incomplete\n')
      git(sourceRoot, 'add', 'app/CORRECTION_RESULT.txt')
      git(sourceRoot, 'commit', '-m', 'Exact rejected candidate fixture')
      const failedCandidate = git(sourceRoot, 'rev-parse', 'HEAD')
      const correctionIdentity = {
        projectId: identity.projectId,
        executionId: randomUUID(),
      }
      git(sourceRoot, 'branch', '-f', 'main', failedCandidate)
      const failedBundlePath = resolve(proofRoot, 'failed-candidate.bundle')
      git(sourceRoot, 'bundle', 'create', failedBundlePath, 'refs/heads/main')
      let correctionSandboxId
      const correctionIntent = 'Make app/CORRECTION_RESULT.txt contain exactly corrected-by-conexus followed by a newline. Do not modify any other file.'
      const correction = await runtime.execute({
        ...correctionIdentity,
        intent: correctionIntent,
        baseSourceRevision: failedCandidate,
        sourceBundle: readFileSync(failedBundlePath),
        bindPhysicalSandbox: async (sandboxId) => { correctionSandboxId = sandboxId },
      })
      assert.equal(correction.sandboxId, correctionSandboxId)
      assert.equal(correction.baseSourceRevision, failedCandidate)
      const correctionBundlePath = resolve(proofRoot, 'correction-result.bundle')
      const correctionRoot = resolve(proofRoot, 'correction-result')
      writeFileSync(correctionBundlePath, correction.resultBundle)
      git(proofRoot, 'clone', '--branch', 'conexus-result', correctionBundlePath, correctionRoot)
      assert.equal(git(correctionRoot, 'rev-parse', 'HEAD^'), failedCandidate)
      assert.equal(git(correctionRoot, 'diff', '--name-only', 'HEAD^', 'HEAD'), 'app/CORRECTION_RESULT.txt')
      assert.equal(readFileSync(resolve(correctionRoot, 'app', 'CORRECTION_RESULT.txt'), 'utf8'), 'corrected-by-conexus\n')
      await assertPersistedTurn(correctionIntent, correction.summary)
    } finally {
      await controller.destroy()
      await flushObservability()
      await observability.shutdown()
      await storage.close()
    }
  } finally {
    rmSync(proofRoot, { recursive: true, force: true })
    rmSync(buildRoot, { recursive: true, force: true })
  }
})
