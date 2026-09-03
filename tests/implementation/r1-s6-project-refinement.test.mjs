import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'

process.env.MASTRA_TELEMETRY_DISABLED = '1'
const repositoryRoot = resolve(import.meta.dirname, '../..')
const hasToolResult = (prompt, toolName) => prompt.some((message) =>
  message.role === 'tool' && JSON.stringify(message.content).includes(toolName))

test('S6-P1 refines exact Candidate A into distinct immutable Candidate B and refuses false success', async (t) => {
  const build = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r1-s6-refinement-build-'))
  t.after(() => rmSync(build, { recursive: true, force: true }))
  const compiled = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project',
    resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', build,
  ], { encoding: 'utf8' })
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
  const built = (path) => pathToFileURL(resolve(build, path)).href
  const [{ createHttpApp }, { registerProjectRoutes }, { createProjectMastra }, { createProjectInceptionService }] = await Promise.all([
    import(built('http/app.js')),
    import(built('project/routes.js')),
    import(built('project/project-mastra.js')),
    import(built('project/inception.js')),
  ])

  const sourceRevision = 'b'.repeat(40)
  const candidateAValue = Object.freeze({
    sourceRevision,
    sourceText: 'Candidate A immutable source text',
    applicationRuntimeProfile: 'MANAGED',
  })
  const candidateA = Object.freeze({
    candidateBaselineDigest: sha256(canonicalBytes(candidateAValue)),
    ...candidateAValue,
  })
  const feedback = 'Add the commercial supervisor as an explicit user.'
  const modelCalls = []
  const model = {
    specificationVersion: 'v3', provider: 'conexus-s6-fake', modelId: 'refinement-fake-1', supportedUrls: {},
    async doGenerate(options) {
      modelCalls.push(JSON.stringify(options.prompt))
      if (!hasToolResult(options.prompt, 'listProjectSourceSnapshotPaths')) return {
        content: [{ type: 'tool-call', toolCallId: 'list-1', toolName: 'listProjectSourceSnapshotPaths', input: '{}' }],
        finishReason: 'tool-calls', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [],
      }
      if (!hasToolResult(options.prompt, 'readProjectSourceSnapshotBatch')) return {
        content: [{ type: 'tool-call', toolCallId: 'read-1', toolName: 'readProjectSourceSnapshotBatch', input: JSON.stringify({ paths: ['README.md'] }) }],
        finishReason: 'tool-calls', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [],
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({
          sourceText: 'Candidate B refined source text', applicationRuntimeProfile: 'MANAGED',
          provenance: [{ path: 'README.md', digest: 'a'.repeat(64) }],
        }) }],
        finishReason: 'stop', usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 }, warnings: [],
      }
    },
    async doStream() { throw new Error('STREAM_NOT_ADMITTED') },
  }
  const cognition = createProjectMastra([{
    admissionId: 'fake-refinement', providerId: 'qualification', modelId: 'refinement-fake-1', enabled: true, model,
  }])
  t.after(() => cognition.close())
  const source = Object.freeze({
    sourceRevision,
    listPaths: async () => [{
      path: 'README.md', ownershipClass: 'APP-OWNED', mediaType: 'text/plain; charset=utf-8',
      byteLength: 14, digest: 'a'.repeat(64),
    }],
    readBatch: async (paths) => paths.map((path) => ({ path, digest: 'a'.repeat(64), utf8Bytes: 'bounded source' })),
  })
  const statements = []
  let candidateB
  const client = {
    async query(statement, values = []) {
      statements.push({ statement, values })
      if (statement.includes('reserve_or_replay_inception')) return { rows: [{
        state: 'RESERVED', source_revision: sourceRevision, response_body: null,
        prior_candidate_digest: candidateA.candidateBaselineDigest,
        prior_source_text: candidateA.sourceText,
        prior_application_runtime_profile: candidateA.applicationRuntimeProfile,
      }] }
      if (statement.includes('complete_inception')) {
        candidateB = JSON.parse(values[10])
        return { rows: [{ complete_inception: candidateB }] }
      }
      return { rows: [] }
    },
    release() {},
  }
  const inception = createProjectInceptionService({
    pool: { connect: async () => client, end: async () => {} }, cognition,
    sourceSnapshot: () => source, admissionId: 'fake-refinement',
    mintIdentity: () => '40000000-0000-4000-8000-000000000201',
  })
  const app = await createHttpApp({ staticRoot: null, registerRoutes: (server) => registerProjectRoutes(server, {
    origin: 'https://conexus.test',
    resolveCurrentSession: async () => ({ account: { accountId: '10000000-0000-4000-8000-000000000201' } }),
    inception,
    store: {
      listProjects: async () => [], getProject: async () => null, createProject: async () => { throw new Error('NOT_USED') },
      getBaselineCandidate: async () => null, getApprovedBaseline: async () => null,
      approveBaseline: async () => { throw new Error('NOT_USED') },
    },
  }) })
  t.after(() => app.close())
  const response = await app.inject({
    method: 'POST', url: '/api/control/projects/30000000-0000-4000-8000-000000000201/inception-investigations',
    headers: {
      origin: 'https://conexus.test', cookie: '__Host-conexus_csrf=csrf-1',
      'x-conexus-csrf': 'csrf-1', 'idempotency-key': 'refine-1', 'content-type': 'application/json',
    },
    payload: { intent: 'Refine the reviewed Baseline.', priorCandidateBaselineDigest: candidateA.candidateBaselineDigest, reviewFeedback: feedback },
  })
  assert.equal(response.statusCode, 200, response.body)
  assert.notEqual(candidateB.candidateBaselineDigest, candidateA.candidateBaselineDigest)
  assert.equal(candidateB.sourceText, 'Candidate B refined source text')
  assert.equal(statements.find(({ statement }) => statement.includes('complete_inception')).values[6], candidateA.candidateBaselineDigest)
  assert.equal(candidateA.sourceText, 'Candidate A immutable source text')
  assert.equal(modelCalls.length, 3)
  assert.match(modelCalls[0], new RegExp(candidateA.candidateBaselineDigest))
  assert.match(modelCalls[0], /Candidate A immutable source text/)
  assert.match(modelCalls[0], /commercial supervisor/)

  let invalidConnects = 0
  const invalid = createProjectInceptionService({
    pool: { connect: async () => { invalidConnects += 1; throw new Error('SHOULD_NOT_CONNECT') }, end: async () => {} },
    cognition, sourceSnapshot: () => source, admissionId: 'fake-refinement',
  })
  await assert.rejects(invalid.run({
    accountId: '10000000-0000-4000-8000-000000000201',
    projectId: '30000000-0000-4000-8000-000000000201', idempotencyKey: 'invalid-1',
    body: { intent: 'Refine', priorCandidateBaselineDigest: candidateA.candidateBaselineDigest },
  }), /PRJ07_REFINEMENT_INPUT_REFUSED/)
  assert.equal(invalidConnects, 0)

  let abandoned = false
  const noChangeClient = {
    async query(statement) {
      if (statement.includes('reserve_or_replay_inception')) return { rows: [{
        state: 'RESERVED', source_revision: sourceRevision, response_body: null,
        prior_candidate_digest: candidateA.candidateBaselineDigest,
        prior_source_text: candidateA.sourceText,
        prior_application_runtime_profile: candidateA.applicationRuntimeProfile,
      }] }
      if (statement.includes('abandon_inception')) abandoned = true
      if (statement.includes('complete_inception')) throw new Error('FALSE_SUCCESS')
      return { rows: [] }
    },
    release() {},
  }
  const noChange = createProjectInceptionService({
    pool: { connect: async () => noChangeClient, end: async () => {} },
    cognition: {
      runInception: async () => ({ ...candidateAValue, provenance: [{ path: 'README.md', digest: 'a'.repeat(64) }] }),
      close: async () => {},
    },
    sourceSnapshot: () => source, admissionId: 'fake-refinement',
    mintIdentity: () => '40000000-0000-4000-8000-000000000202',
  })
  await assert.rejects(noChange.run({
    accountId: '10000000-0000-4000-8000-000000000201',
    projectId: '30000000-0000-4000-8000-000000000201', idempotencyKey: 'same-1',
    body: { intent: 'Refine', priorCandidateBaselineDigest: candidateA.candidateBaselineDigest, reviewFeedback: feedback },
  }), /PRJ07_REFINEMENT_NO_CHANGE/)
  assert.equal(abandoned, true)
})
