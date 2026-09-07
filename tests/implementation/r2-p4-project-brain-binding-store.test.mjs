import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-p4-brain-binding-store-build-'))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', buildRoot,
], { cwd: repositoryRoot, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
const { createProjectBrainBindingStore } = await import(pathToFileURL(resolve(buildRoot, 'project/brain-binding.js')).href)
const { validateBrainSource } = await import('../../packages/brain-contract/src/index.mjs')

test.after(() => rmSync(buildRoot, { recursive: true, force: true }))

test('PRJ-10 preserves manage-only absence without invoking PRJ-11 brain.bind preflight', async () => {
  const accountId = '11111111-1111-4111-8111-111111111111'
  const projectId = '33333333-3333-4333-8333-333333333333'
  let preflightCalls = 0
  const store = createProjectBrainBindingStore({
    project: { getBindingContext: async () => {
      preflightCalls += 1
      throw Object.assign(new Error('PROJECT_BRAIN_BINDING_DENIED'), { code: '42501' })
    } },
    binding: { getCurrent: async () => null },
    registry: { getRevision: async () => null },
    sourceSnapshot: () => { throw new Error('UNREACHABLE') },
    validator: { validate: async () => ({ status: 'REFUSED' }) },
    attester: { persist: async () => { throw new Error('UNREACHABLE') } },
    recovery: { reconcile: async () => {}, executeBrain: async () => { throw new Error('UNREACHABLE') } },
  })

  assert.deepEqual(await store.get({ accountId, projectId }), { status: 'ABSENT' })
  assert.equal(preflightCalls, 0)
})

test('PRJ-11 reconciles pending work before lifecycle preflight and new command effects', async (t) => {
  const accountId = '11111111-1111-4111-8111-111111111111'
  const workspaceId = '22222222-2222-4222-8222-222222222222'
  const projectId = '33333333-3333-4333-8333-333333333333'
  const brainRevisionId = '44444444-4444-4444-8444-444444444444'
  const sourceRevision = 'a'.repeat(40)

  await t.test('archived Project', async () => {
      const calls = { binding: 0, registry: 0, source: 0, validation: 0, attestation: 0, recovery: 0 }
      const store = createProjectBrainBindingStore({
        project: { getBindingContext: async () => {
          throw Object.assign(new Error('archived Project'), { code: 'P0002' })
        } },
        binding: { getCurrent: async () => { calls.binding += 1; return null } },
        registry: { getRevision: async () => { calls.registry += 1; return null } },
        sourceSnapshot: () => { calls.source += 1; throw new Error('UNREACHABLE') },
        validator: { validate: async () => { calls.validation += 1; return { status: 'REFUSED' } } },
        attester: { persist: async () => { calls.attestation += 1 } },
        recovery: { reconcile: async () => { calls.recovery += 1 }, executeBrain: async () => {
          calls.recovery += 1
          throw new Error('UNREACHABLE')
        } },
      })

      assert.deepEqual(await store.set({
        accountId, projectId, brainRevisionId, expectedCurrent: { state: 'ABSENT' },
      }), { status: 'NOT_FOUND' })
      assert.deepEqual(calls, {
        binding: 0, registry: 0, source: 0, validation: 0, attestation: 0, recovery: 1,
      })
  })

  await t.test('active binding intent', async () => {
    let pending = true
    const order = []
    const store = createProjectBrainBindingStore({
      project: { getBindingContext: async () => {
        order.push('preflight')
        if (pending) throw Object.assign(new Error('active binding intent'), { code: 'P0001' })
        return { projectId, workspaceId, sourceRevision, connectionPermitted: false }
      } },
      binding: { getCurrent: async () => { order.push('binding'); return null } },
      registry: { getRevision: async () => { order.push('registry'); return null } },
      sourceSnapshot: () => { throw new Error('UNREACHABLE') },
      validator: { validate: async () => { throw new Error('UNREACHABLE') } },
      attester: { persist: async () => { throw new Error('UNREACHABLE') } },
      recovery: {
        reconcile: async () => { order.push('reconcile'); pending = false },
        executeBrain: async () => { throw new Error('UNREACHABLE') },
      },
    })

    assert.deepEqual(await store.set({
      accountId, projectId, brainRevisionId, expectedCurrent: { state: 'ABSENT' },
    }), { status: 'NOT_FOUND' })
    assert.deepEqual(order, ['reconcile', 'preflight', 'binding', 'registry'])
  })
})

test('PRJ-11 resolves authoritative revision, validates realization, attests and recovers with one UUID', async () => {
  const accountId = '11111111-1111-4111-8111-111111111111'
  const workspaceId = '22222222-2222-4222-8222-222222222222'
  const projectId = '33333333-3333-4333-8333-333333333333'
  const brainRevisionId = '44444444-4444-4444-8444-444444444444'
  const sourceRevision = 'a'.repeat(40)
  const brainDigest = 'b'.repeat(64)
  const projectBindingDigest = 'c'.repeat(64)
  const bindingValidationId = '55555555-5555-4555-8555-555555555555'
  const sourceInputDigest = 'd'.repeat(64)
  const mappingDigest = 'e'.repeat(64)
  const brainSource = {
    schemaVersion: 'conexus-brain/v2', reviewText: 'reviewed', knowledgeBrowse: { domains: [] },
    items: [{ itemId: 'documents', kind: 'DATASET', grainId: 'document', dependsOn: [] }],
    assertions: [{ assertionId: 'documents-keys', itemId: 'documents', kind: 'KEY_CONFORMANCE', predicateVersion: '1', scope: 'SELECTED' }],
  }
  validateBrainSource(brainSource)
  const manifest = {
    schemaVersion: 'conexus-project-brain-realization/v1', selectedRoots: ['documents'],
    mappings: [{ itemId: 'documents', queryId: 'documents-keys', mappingDigest }],
    sourceInputs: [{ path: 'src/data.ts', digest: sourceInputDigest }],
  }
  const manifestBytes = canonicalBytes(manifest)
  const source = {
    sourceRevision,
    async listPaths() {
      return [
        { path: '.conexus/brain/realization.json', ownershipClass: 'APP-OWNED', digest: sha256(manifestBytes), byteLength: manifestBytes.length },
        { path: 'src/data.ts', ownershipClass: 'APP-OWNED', digest: sourceInputDigest, byteLength: 1 },
      ]
    },
    async readBatch(paths) {
      return paths.map((path) => path === '.conexus/brain/realization.json'
        ? { path, digest: sha256(manifestBytes), utf8Bytes: manifestBytes.toString('utf8') }
        : { path, digest: sourceInputDigest, utf8Bytes: 'x' })
    },
  }
  const candidate = { schemaVersion: 'conexus-brain-binding-validation/v1', validationState: 'VALID' }
  const calls = { revision: [], validation: [], attestation: [], recovery: [] }
  const response = {
    brainRevisionId, brainDigest, projectBindingDigest, validationState: 'VALID', updateAvailable: false,
  }
  let bindingReads = 0
  const store = createProjectBrainBindingStore({
    project: { getBindingContext: async (input) => {
      calls.project = input
      return { projectId, workspaceId, sourceRevision, connectionPermitted: true }
    } },
    binding: { getCurrent: async () => ++bindingReads <= 2 ? null : {
      projectId, workspaceId, brainRevisionId, brainDigest, projectBindingDigest,
      validationState: 'VALID', updateAvailable: false,
    } },
    registry: {
      getRevision: async (input) => {
        calls.revision.push(input)
        return { brainRevisionId, brainDigest, payload: brainSource }
      },
    },
    sourceSnapshot: (input) => {
      calls.snapshot = input
      return source
    },
    validator: { validate: async (input) => {
      calls.validation.push(input)
      return { status: 'VALIDATED', candidate, projectBindingDigest }
    } },
    attester: { persist: async (input) => calls.attestation.push(input) },
    recovery: { reconcile: async () => {}, executeBrain: async (input) => {
      calls.recovery.push(input)
      return { state: 'COMPLETED', terminal_result: response, refusal_code: null }
    } },
    mintIdentity: () => bindingValidationId,
  })

  const result = await store.set({ accountId, projectId, brainRevisionId, expectedCurrent: { state: 'ABSENT' } })
  assert.deepEqual(result, { status: 'FOUND', value: response, created: true })
  assert.deepEqual(calls.project, { accountId, projectId })
  assert.deepEqual(calls.revision, [{ workspaceId, brainRevisionId }])
  assert.deepEqual(calls.snapshot, { projectId, sourceRevision })
  assert.equal(calls.validation.length, 1)
  assert.deepEqual(calls.validation[0], {
    accountId, projectId, workspaceId, brainRevisionId, brainDigest, brainSource,
    realization: calls.validation[0].realization,
  })
  assert.equal(calls.attestation[0].bindingValidationId, bindingValidationId)
  assert.equal(calls.recovery[0].bindingValidationId, bindingValidationId)
  assert.deepEqual(calls.recovery[0].expectedCurrent, { state: 'ABSENT' })
  assert.deepEqual(calls.attestation[0].candidate, candidate)
  assert.deepEqual(calls.recovery[0].candidate, candidate)
})

test('PRJ-11 rechecks the complete strong representation after asynchronous validation', async () => {
  const accountId = '11111111-1111-4111-8111-111111111111'
  const workspaceId = '22222222-2222-4222-8222-222222222222'
  const projectId = '33333333-3333-4333-8333-333333333333'
  const brainRevisionId = '44444444-4444-4444-8444-444444444444'
  const sourceRevision = 'a'.repeat(40)
  const brainDigest = 'b'.repeat(64)
  const projectBindingDigest = 'c'.repeat(64)
  const manifest = {
    schemaVersion: 'conexus-project-brain-realization/v1', selectedRoots: [], mappings: [], sourceInputs: [],
  }
  const manifestBytes = canonicalBytes(manifest)
  const source = {
    sourceRevision,
    async listPaths() {
      return [{
        path: '.conexus/brain/realization.json', ownershipClass: 'APP-OWNED',
        digest: sha256(manifestBytes), byteLength: manifestBytes.length,
      }]
    },
    async readBatch() {
      return [{
        path: '.conexus/brain/realization.json', digest: sha256(manifestBytes),
        utf8Bytes: manifestBytes.toString('utf8'),
      }]
    },
  }
  const brainSource = {
    schemaVersion: 'conexus-brain/v2', reviewText: 'reviewed',
    knowledgeBrowse: { domains: [] }, items: [], assertions: [],
  }
  const before = {
    projectId, workspaceId, brainRevisionId, brainDigest, projectBindingDigest,
    validationState: 'VALID', updateAvailable: false,
  }
  let reads = 0
  let attestations = 0
  let recoveries = 0
  const store = createProjectBrainBindingStore({
    project: { getBindingContext: async () => ({ projectId, workspaceId, sourceRevision, connectionPermitted: false }) },
    binding: { getCurrent: async () => ({ ...before, updateAvailable: ++reads >= 2 }) },
    registry: { getRevision: async () => ({ brainRevisionId, brainDigest, payload: brainSource }) },
    sourceSnapshot: () => source,
    validator: { validate: async () => ({
      status: 'VALIDATED', candidate: {}, projectBindingDigest: 'd'.repeat(64),
    }) },
    attester: { persist: async () => { attestations += 1 } },
    recovery: { reconcile: async () => {}, executeBrain: async () => {
      recoveries += 1
      throw new Error('UNREACHABLE')
    } },
  })

  const representationDigest = sha256(canonicalBytes({
    brainRevisionId, brainDigest, projectBindingDigest,
    validationState: 'VALID', updateAvailable: false,
  }))
  assert.deepEqual(await store.set({
    accountId, projectId, brainRevisionId,
    expectedCurrent: { state: 'PRESENT', representationDigest },
  }), { status: 'STALE' })
  assert.equal(reads, 2)
  assert.equal(attestations, 0)
  assert.equal(recoveries, 0)
})

test('PRJ-11 refuses absent or revoked connection.use before physical validation and preserves proof-free adoption', async (t) => {
  const accountId = '11111111-1111-4111-8111-111111111111'
  const workspaceId = '22222222-2222-4222-8222-222222222222'
  const projectId = '33333333-3333-4333-8333-333333333333'
  const brainRevisionId = '44444444-4444-4444-8444-444444444444'
  const sourceRevision = 'a'.repeat(40)
  const brainDigest = 'b'.repeat(64)
  const projectBindingDigest = 'c'.repeat(64)
  for (const [name, initiallyPermitted, revokeDuringSourceRead, physicalRequired, expected] of [
    ['absent use authority', false, false, true, 'DENIED'],
    ['use revoked after initial admission', true, true, true, 'DENIED'],
    ['current use authority', true, false, true, 'FOUND'],
    ['proof-free adoption without use', false, false, false, 'FOUND'],
  ]) {
    await t.test(name, async () => {
      let connectionPermitted = initiallyPermitted
      let preflights = 0
      let validations = 0
      let physicalReads = 0
      let attestations = 0
      let recoveries = 0
      const brainSource = {
        schemaVersion: 'conexus-brain/v2', reviewText: 'reviewed', knowledgeBrowse: { domains: [] },
        items: physicalRequired ? [{ itemId: 'documents', kind: 'DATASET', grainId: 'document', dependsOn: [] }] : [],
        assertions: physicalRequired ? [{
          assertionId: 'documents-keys', itemId: 'documents', kind: 'KEY_CONFORMANCE', predicateVersion: '1', scope: 'REVISION',
        }] : [],
      }
      // Empty roots still require the revision-level physical assertion.
      const manifest = {
        schemaVersion: 'conexus-project-brain-realization/v1', selectedRoots: [], sourceInputs: [],
        mappings: physicalRequired ? [{ itemId: 'documents', queryId: 'documents-keys', mappingDigest: 'd'.repeat(64) }] : [],
      }
      const bytes = canonicalBytes(manifest)
      const response = { brainRevisionId, brainDigest, projectBindingDigest, validationState: 'VALID', updateAvailable: false }
      const store = createProjectBrainBindingStore({
        project: { getBindingContext: async () => {
          preflights += 1
          return { projectId, workspaceId, sourceRevision, connectionPermitted }
        } },
        binding: { getCurrent: async () => recoveries > 0 ? { projectId, workspaceId, ...response } : null },
        registry: { getRevision: async () => ({ brainRevisionId, brainDigest, payload: brainSource }) },
        sourceSnapshot: () => ({
          sourceRevision,
          listPaths: async () => [{
            path: '.conexus/brain/realization.json', ownershipClass: 'APP-OWNED', digest: sha256(bytes), byteLength: bytes.length,
          }],
          readBatch: async () => {
            if (revokeDuringSourceRead) connectionPermitted = false
            return [{ path: '.conexus/brain/realization.json', digest: sha256(bytes), utf8Bytes: bytes.toString('utf8') }]
          },
        }),
        validator: { validate: async () => {
          validations += 1
          if (physicalRequired) physicalReads += 1
          return { status: 'VALIDATED', candidate: {}, projectBindingDigest }
        } },
        attester: { persist: async () => { attestations += 1 } },
        recovery: { reconcile: async () => {}, executeBrain: async () => {
          recoveries += 1
          return { state: 'COMPLETED', terminal_result: response, refusal_code: null }
        } },
      })
      const result = await store.set({ accountId, projectId, brainRevisionId, expectedCurrent: { state: 'ABSENT' } })
      assert.equal(result.status, expected)
      assert.equal(validations, expected === 'FOUND' ? 1 : 0)
      assert.equal(physicalReads, expected === 'FOUND' && physicalRequired ? 1 : 0)
      assert.equal(attestations, expected === 'FOUND' ? 1 : 0)
      assert.equal(recoveries, expected === 'FOUND' ? 1 : 0)
      assert.equal(preflights, physicalRequired ? 2 : 1)
    })
  }
})

test('PRJ-12 reconciles before validating the exact representation and delegates delete-only removal without brain.bind preflight', async () => {
  const accountId = '11111111-1111-4111-8111-111111111111'
  const projectId = '33333333-3333-4333-8333-333333333333'
  const brainRevisionId = '44444444-4444-4444-8444-444444444444'
  const brainDigest = 'b'.repeat(64)
  const projectBindingDigest = 'c'.repeat(64)
  const current = {
    projectId,
    workspaceId: '22222222-2222-4222-8222-222222222222',
    brainRevisionId,
    brainDigest,
    projectBindingDigest,
    validationState: 'VALID',
    updateAvailable: false,
  }
  const representationDigest = sha256(canonicalBytes({
    brainRevisionId, brainDigest, projectBindingDigest,
    validationState: 'VALID', updateAvailable: false,
  }))
  const order = []
  const removalCalls = []
  const store = createProjectBrainBindingStore({
    project: { getBindingContext: async () => {
      throw new Error('brain.bind preflight must not run for PRJ-12')
    } },
    binding: { getCurrent: async () => {
      order.push('binding')
      return current
    } },
    registry: { getRevision: async () => { throw new Error('UNREACHABLE') } },
    sourceSnapshot: () => { throw new Error('UNREACHABLE') },
    validator: { validate: async () => { throw new Error('UNREACHABLE') } },
    attester: { persist: async () => { throw new Error('UNREACHABLE') } },
    recovery: {
      reconcile: async () => { order.push('reconcile') },
      executeBrain: async () => { throw new Error('UNREACHABLE') },
      executeBrainRemoval: async (input) => {
        order.push('remove')
        removalCalls.push(input)
        return { state: 'COMPLETED', terminal_result: null, refusal_code: null }
      },
    },
  })

  assert.deepEqual(await store.remove({
    accountId, projectId, expectedCurrent: { state: 'PRESENT', representationDigest },
  }), { status: 'FOUND', value: undefined })
  assert.deepEqual(order, ['reconcile', 'binding', 'remove'])
  assert.deepEqual(removalCalls, [{
    accountId,
    projectId,
    expectedCurrent: { state: 'PRESENT', projectBindingDigest },
  }])

  const stale = await store.remove({
    accountId, projectId,
    expectedCurrent: { state: 'PRESENT', representationDigest: 'd'.repeat(64) },
  })
  assert.deepEqual(stale, { status: 'STALE' })
  assert.equal(removalCalls.length, 1)
})
