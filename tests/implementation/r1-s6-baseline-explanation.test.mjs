import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

process.env.MASTRA_TELEMETRY_DISABLED = '1'
const repositoryRoot = resolve(import.meta.dirname, '../..')

test('S6-P2 explains one exact candidate and refuses unowned context, provenance and stale authority', async (t) => {
  const build = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r1-s6-explanation-build-'))
  t.after(() => rmSync(build, { recursive: true, force: true }))
  const compiled = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project',
    resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', build,
  ], { encoding: 'utf8' })
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
  const built = (path) => pathToFileURL(resolve(build, path)).href
  const [{ createHttpApp }, { registerProjectRoutes }, { createProjectMastra },
    { createProjectBaselineExplanationService }, generated] = await Promise.all([
    import(built('http/app.js')),
    import(built('project/routes.js')),
    import(built('project/project-mastra.js')),
    import(built('project/explanation.js')),
    import(built('generated/s3-routes.js')),
  ])

  const candidate = Object.freeze({
    candidateBaselineDigest: 'c'.repeat(64),
    sourceRevision: 'b'.repeat(40),
    sourceText: 'Immutable Candidate A with bounded Product intent.',
    applicationRuntimeProfile: 'MANAGED',
  })
  let output = {
    answer: 'Candidate A selects a managed application runtime.',
    provenanceRefs: [candidate.candidateBaselineDigest, candidate.sourceRevision],
  }
  const modelCalls = []
  const model = {
    specificationVersion: 'v3', provider: 'conexus-s6-fake', modelId: 'explanation-fake-1', supportedUrls: {},
    async doGenerate(options) {
      modelCalls.push({
        prompt: JSON.stringify(options.prompt),
        maxOutputTokens: options.maxOutputTokens,
        maxRetries: options.maxRetries,
        toolChoice: options.toolChoice,
        tools: options.tools?.map((tool) => tool.name) ?? [],
        responseFormat: options.responseFormat?.type,
      })
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        finishReason: 'stop', usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 }, warnings: [],
      }
    },
    async doStream() { throw new Error('STREAM_NOT_ADMITTED') },
  }
  const cognition = createProjectMastra([{
    admissionId: 'fake-explanation', providerId: 'qualification', modelId: 'explanation-fake-1', enabled: true, model,
  }])
  t.after(() => cognition.close())
  let candidateReads = []
  const candidateReadCalls = []
  const store = {
    listProjects: async () => [], getProject: async () => null, createProject: async () => { throw new Error('NOT_USED') },
    getApprovedBaseline: async () => null, approveBaseline: async () => { throw new Error('NOT_USED') },
    getBaselineCandidate: async (input) => {
      candidateReadCalls.push(input)
      return candidateReads.length ? candidateReads.shift() : candidate
    },
  }
  const explanation = createProjectBaselineExplanationService({ store, cognition, admissionId: 'fake-explanation' })
  const app = await createHttpApp({ staticRoot: null, registerRoutes: (server) => registerProjectRoutes(server, {
    origin: 'https://conexus.test',
    resolveCurrentSession: async () => ({ account: { accountId: '10000000-0000-4000-8000-000000000024' } }),
    inception: { run: async () => { throw new Error('NOT_USED') }, close: async () => {} },
    explanation,
    store,
  }) })
  t.after(() => app.close())
  const inject = (payload) => app.inject({
    method: 'POST',
    url: `/api/control/projects/30000000-0000-4000-8000-000000000024/baseline-candidates/${candidate.candidateBaselineDigest}/assistant/queries`,
    headers: {
      origin: 'https://conexus.test', cookie: '__Host-conexus_csrf=csrf-24',
      'x-conexus-csrf': 'csrf-24', 'content-type': 'application/json',
    },
    payload,
  })

  candidateReads = [candidate, candidate]
  const nominal = await inject({ question: 'Which runtime profile does this candidate select?' })
  assert.equal(nominal.statusCode, 200, nominal.body)
  assert.deepEqual(nominal.json(), { candidateBaselineDigest: candidate.candidateBaselineDigest, ...output })
  assert.equal(modelCalls.length, 1)
  assert.equal(modelCalls[0].maxOutputTokens, 2048)
  assert.deepEqual(modelCalls[0].tools, [])
  assert.match(JSON.stringify(modelCalls[0].toolChoice), /none/)
  assert.equal(modelCalls[0].responseFormat, 'json')
  assert.match(modelCalls[0].prompt, new RegExp(candidate.candidateBaselineDigest))
  assert.match(modelCalls[0].prompt, /Immutable Candidate A/)
  assert.match(modelCalls[0].prompt, /Which runtime profile/)
  assert.deepEqual(candidateReadCalls.slice(0, 2), [0, 1].map(() => ({
    accountId: '10000000-0000-4000-8000-000000000024',
    projectId: '30000000-0000-4000-8000-000000000024',
    candidateBaselineDigest: candidate.candidateBaselineDigest,
  })))
  assert.match(readFileSync(resolve(repositoryRoot, 'apps/hub/src/project/project-mastra.ts'), 'utf8'),
    /maxSteps: 1,[\s\S]*toolChoice: 'none',[\s\S]*maxRetries: 0, maxOutputTokens: 2048,[\s\S]*totalMs: 45000, stepMs: 45000/)

  const callsBeforeContext = modelCalls.length
  const readsBeforeContext = candidateReadCalls.length
  candidateReads = [candidate, candidate]
  const context = await inject({ question: 'Explain this selection.', reviewContext: { projectionAnchor: 'client-only' } })
  assert.equal(context.statusCode, 422, context.body)
  assert.equal(modelCalls.length, callsBeforeContext)
  assert.equal(candidateReadCalls.length, readsBeforeContext)
  assert.equal(candidateReads.length, 2)

  output = { answer: 'Unbound answer', provenanceRefs: ['x'.repeat(40)] }
  candidateReads = [candidate, candidate]
  const badProvenance = await inject({ question: 'Explain this candidate.' })
  assert.equal(badProvenance.statusCode, 422, badProvenance.body)
  assert.equal(candidateReads.length, 1)

  output = {
    answer: 'Candidate-bound answer that must be discarded.',
    provenanceRefs: [candidate.candidateBaselineDigest, candidate.sourceRevision],
  }
  candidateReads = [candidate, null]
  const stale = await inject({ question: 'Explain this candidate.' })
  assert.equal(stale.statusCode, 422, stale.body)

  const callsBeforeMissing = modelCalls.length
  candidateReads = [null]
  const missing = await inject({ question: 'Explain this candidate.' })
  assert.equal(missing.statusCode, 404, missing.body)
  assert.equal(modelCalls.length, callsBeforeMissing)

  assert.equal(generated.S3_GENERATED_ROUTES['PRJ-24'].operationId, 'AskConexusAboutBaselineCandidate')
  assert.equal(generated.S3_GENERATED_ROUTES['PRJ-24'].url,
    '/api/control/projects/:projectId/baseline-candidates/:candidateBaselineDigest/assistant/queries')
})
