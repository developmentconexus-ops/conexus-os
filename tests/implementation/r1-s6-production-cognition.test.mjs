import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

process.env.MASTRA_TELEMETRY_DISABLED = '1'
const repositoryRoot = resolve(import.meta.dirname, '../..')

const compileHub = (t) => {
  const build = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r1-s6-production-cognition-build-'))
  t.after(() => rmSync(build, { recursive: true, force: true }))
  const compiled = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project',
    resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', build,
  ], { encoding: 'utf8' })
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
  return (path) => pathToFileURL(resolve(build, path)).href
}

const generateInput = (prompt = 'bounded production prompt') => ({
  prompt: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
})

test('production cognition boundaries fire on the admitted Hub modules', async (t) => {
  const built = compileHub(t)
  const [{ createBoundedProviderFetch }, {
    createAnthropicOAuthModel, PROJECT_ANTHROPIC_ADMISSION_ID, PROJECT_ANTHROPIC_MODEL_ID,
  }, {
    createProjectMastra, ProjectToolBudget,
  }] = await Promise.all([
    import(built('project/bounded-provider-fetch.js')),
    import(built('project/anthropic-oauth-provider.js')),
    import(built('project/project-mastra.js')),
  ])

  let networkCalls = 0
  const denied = createBoundedProviderFetch({
    officialOrigin: 'https://api.anthropic.com/', maxResponseBytes: 16,
    fetchImpl: async () => { networkCalls += 1; return Response.json({ ok: true }) },
  })
  await assert.rejects(denied('https://example.invalid/v1/messages'), /PROJECT_MODEL_EGRESS_DENIED/)
  assert.equal(networkCalls, 0)

  let cancelled = 0
  const oversized = createBoundedProviderFetch({
    officialOrigin: 'https://api.anthropic.com/', maxResponseBytes: 16,
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(32)) },
      cancel() { cancelled += 1 },
    }), { headers: { 'content-type': 'application/json' } }),
  })
  const oversizedResponse = await oversized('https://api.anthropic.com/v1/messages')
  await assert.rejects(oversizedResponse.arrayBuffer(), /PROJECT_MODEL_RESPONSE_LIMIT_EXCEEDED/)
  assert.equal(cancelled, 1)

  let redirectCancelled = 0
  const redirect = createBoundedProviderFetch({
    officialOrigin: 'https://api.anthropic.com/', maxResponseBytes: 1024,
    fetchImpl: async () => new Response(new ReadableStream({ cancel() { redirectCancelled += 1 } }), {
      status: 302, headers: { location: 'https://example.invalid/escape' },
    }),
  })
  await assert.rejects(redirect('https://api.anthropic.com/v1/messages'), /PROJECT_MODEL_REDIRECT_DENIED/)
  assert.equal(redirectCancelled, 1)

  const captured = []
  const model = createAnthropicOAuthModel({
    tokenStore: { getAccessToken: async () => 'access-must-not-leak' },
    fetchImpl: async (input, init) => {
      captured.push({ url: String(input), init })
      return Response.json({
        id: 'msg_production_boundary', type: 'message', role: 'assistant', model: PROJECT_ANTHROPIC_MODEL_ID,
        content: [{ type: 'text', text: 'READY' }], stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      })
    },
  })
  const generated = await model.doGenerate({
    prompt: [
      { role: 'system', content: 'Conexus governed system instruction.' },
      ...generateInput().prompt,
    ],
  })
  assert.equal(generated.content.find((part) => part.type === 'text')?.text, 'READY')
  assert.equal(captured.length, 1)
  assert.equal(new URL(captured[0].url).origin, 'https://api.anthropic.com')
  const headers = new Headers(captured[0].init.headers)
  assert.equal(headers.get('authorization'), 'Bearer access-must-not-leak')
  assert.equal(headers.get('x-api-key'), null)
  const request = JSON.parse(captured[0].init.body)
  assert.equal(PROJECT_ANTHROPIC_ADMISSION_ID, 'project-inception-opus-5')
  assert.equal(PROJECT_ANTHROPIC_MODEL_ID, 'claude-opus-5')
  assert.equal(request.model, PROJECT_ANTHROPIC_MODEL_ID)
  assert.equal(request.system.at(0).text, "You are Claude Code, Anthropic's official CLI for Claude.")
  assert.equal(request.system.at(1).text, 'Conexus governed system instruction.')
  assert.equal(headers.get('anthropic-beta').split(',').includes('oauth-2025-04-20'), true)

  const budget = new ProjectToolBudget()
  const release = budget.enter()
  assert.throws(() => budget.enter(), /PROJECT_MODEL_PARALLEL_TOOL_CALL_DENIED/)
  release()
  budget.enter()()
  budget.enter()()
  assert.throws(() => budget.enter(), /PROJECT_MODEL_TOOL_CALL_BUDGET_EXHAUSTED/)

  let failedCalls = 0
  const cognition = createProjectMastra([{
    admissionId: 'failure-admission', providerId: 'qualification', modelId: 'failure-model-1', enabled: true,
    model: {
      specificationVersion: 'v3', provider: 'qualification', modelId: 'failure-model-1', supportedUrls: {},
      async doGenerate() { failedCalls += 1; throw new Error('raw-secret-provider-failure') },
      async doStream() { throw new Error('STREAM_NOT_ADMITTED') },
    },
  }])
  t.after(() => cognition.close())
  await assert.rejects(cognition.askAboutCandidate({
    admissionId: 'failure-admission', question: 'Why?',
    candidate: {
      candidateBaselineDigest: 'c'.repeat(64), sourceRevision: 'b'.repeat(40),
      sourceText: 'Bounded candidate', applicationRuntimeProfile: 'MANAGED',
    },
  }), (error) => {
    assert.equal(error.message, 'PROJECT_MODEL_PROVIDER_FAILURE')
    assert.doesNotMatch(String(error), /raw-secret-provider-failure/)
    return true
  })
  assert.equal(failedCalls, 1)
})
