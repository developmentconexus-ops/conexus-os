import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve as pathResolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'

const repositoryRoot = pathResolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(pathResolve(repositoryRoot, 'apps/hub/r2-p4-brain-context-build-'))
const compiled = spawnSync(process.execPath, [
  pathResolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', pathResolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', buildRoot,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`R2_P4_BRAIN_CONTEXT_HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
process.once('exit', () => rmSync(buildRoot, { recursive: true, force: true }))

const { createProjectBrainContextResolver } = await import(
  pathToFileURL(pathResolve(buildRoot, 'brain/context.js')).href,
)

const PROJECT = '11111111-1111-4111-8111-111111111111'
const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const BRAIN_REVISION = '33333333-3333-4333-8333-333333333333'
const BRAIN_DIGEST = 'a'.repeat(64)
const VALIDATION_SOURCE_REVISION = 'b'.repeat(40)
const CURRENT_PROJECT_SOURCE_REVISION = '9'.repeat(40)

const source = {
  schemaVersion: 'conexus-brain/v2',
  reviewText: 'Synthetic context source.',
  knowledgeBrowse: {
    domains: [{
      domainRef: 'finance',
      label: 'Finance',
      concepts: [{
        conceptRef: 'budget.amount',
        label: 'Budget amount',
        summary: 'Planned amount for a budget line.',
        contentClasses: ['SEMANTIC', 'KNOWLEDGE'],
        sections: [{ kind: 'DEFINITION', text: 'A planned budget amount.' }],
        provenanceRefs: ['brain://source/budget.amount'],
        itemRef: 'budget',
      }],
    }],
  },
  items: [{ itemId: 'budget', kind: 'SEMANTIC', dependsOn: [] }],
  assertions: [],
}

const emptySource = {
  ...source,
  knowledgeBrowse: { domains: [] },
  items: [],
}

const candidateFor = (candidateOverrides = {}) => {
  const candidate = {
    schemaVersion: 'conexus-brain-binding-validation/v1',
    validationState: 'VALID',
    projectId: PROJECT,
    workspaceId: WORKSPACE,
    brainRevisionId: BRAIN_REVISION,
    brainDigest: BRAIN_DIGEST,
    sourceRevision: VALIDATION_SOURCE_REVISION,
    inputDigest: 'c'.repeat(64),
    manifestDigest: 'd'.repeat(64),
    applicableItemIds: ['budget'],
    proofs: [],
    ...candidateOverrides,
  }
  return candidate
}

const bindingFor = (candidate = candidateFor(), overrides = {}) => ({
  projectId: PROJECT,
  workspaceId: WORKSPACE,
  brainRevisionId: BRAIN_REVISION,
  brainDigest: BRAIN_DIGEST,
  projectBindingDigest: sha256(canonicalBytes(candidate)),
  validationState: 'VALID',
  updateAvailable: true,
  currentProjectSourceRevision: CURRENT_PROJECT_SOURCE_REVISION,
  validationCandidate: candidate,
  ...overrides,
})

const healthFor = (overrides = {}) => ({
  brainRevisionId: BRAIN_REVISION,
  brainDigest: BRAIN_DIGEST,
  healthSnapshotDigest: 'e'.repeat(64),
  items: [{ semanticRef: 'budget', state: 'VALID', critical: true }],
  ...overrides,
})

const found = (value) => ({ status: 'FOUND', value })
const portsFor = ({ authorization, binding, revision, health, currentRealization } = {}) => {
  const selectedBinding = binding ?? bindingFor()
  const selectedCandidate = selectedBinding.validationCandidate
  return ({
    basis: { load: async () => found({
      authorization: authorization ?? { projectRead: true, brainRead: true, projectBuild: false },
      binding: selectedBinding,
      revision: revision ?? {
        brainRevisionId: BRAIN_REVISION,
        brainDigest: BRAIN_DIGEST,
        sourceRevision: 'f'.repeat(40),
        availability: 'AVAILABLE',
        payload: source,
      },
      health: health ?? healthFor(),
    }) },
    project: {
    getCurrentRealization: async () => found(currentRealization ?? {
      sourceRevision: CURRENT_PROJECT_SOURCE_REVISION,
      inputDigest: selectedCandidate.inputDigest,
      manifestDigest: selectedCandidate.manifestDigest,
      applicableItemIds: selectedCandidate.applicableItemIds,
    }),
    },
  })
}

const resolve = (ports, input = { accountId: 'account', projectId: PROJECT }) =>
  createProjectBrainContextResolver(ports).resolve(input)

test('BRN-14 resolves only the current applicable Project Brain context with full detail', async () => {
  const result = await resolve(portsFor())
  assert.equal(result.status, 'FOUND')
  assert.equal(result.value.updateAvailable, true)
  assert.deepEqual(result.value.domains.map((domain) => domain.label), ['Finance'])
  const concept = result.value.domains[0].concepts[0]
  assert.equal(concept.label, 'Budget amount')
  assert.equal(concept.detailDisclosed, true)
  assert.deepEqual(concept.sections, [{ kind: 'DEFINITION', text: 'A planned budget amount.' }])
  assert.deepEqual(concept.provenanceRefs, ['brain://source/budget.amount'])
  assert.match(concept.authoringRef, /^project-brain-authoring\/v1:[a-f0-9]{64}$/)
  assert.match(concept.conceptRef, /^project-brain-context\/v1:[a-f0-9]{64}$/)
  assert.equal('workspaceId' in result.value, false)
  assert.equal('effectiveBrainSlice' in result.value, false)
  assert.equal('toolProjection' in result.value, false)
})

test('BRN-14 enforces compound read authority and supports purpose-bound build disclosure', async () => {
  const denied = await resolve(portsFor({ authorization: { projectRead: true, brainRead: false, projectBuild: false } }))
  assert.deepEqual(denied, { status: 'DENIED' })

  const build = await resolve(portsFor({
    authorization: { projectRead: false, brainRead: false, projectBuild: true },
  }), { accountId: 'account', projectId: PROJECT, purpose: 'BUILD' })
  assert.equal(build.status, 'FOUND')
  const concept = build.value.domains[0].concepts[0]
  assert.equal(concept.detailDisclosed, false)
  assert.deepEqual(concept.sections, [])
  assert.deepEqual(concept.provenanceRefs, [])
  assert.match(concept.authoringRef, /^project-brain-authoring\/v1:[a-f0-9]{64}$/)

  const wrongPurpose = await resolve(portsFor({
    authorization: { projectRead: false, brainRead: false, projectBuild: true },
  }))
  assert.deepEqual(wrongPurpose, { status: 'DENIED' })
})

test('BRN-14 fails unavailable for stale validation, foreign revision and blocking health', async () => {
  const stale = await resolve(portsFor({ binding: bindingFor(candidateFor({ validationState: 'STALE' })) }))
  assert.deepEqual(stale, { status: 'UNAVAILABLE' })

  const foreignCandidate = candidateFor({ projectId: '44444444-4444-4444-8444-444444444444' })
  const foreign = await resolve(portsFor({ binding: bindingFor(foreignCandidate) }))
  assert.deepEqual(foreign, { status: 'UNAVAILABLE' })

  const blocked = await resolve(portsFor({
    health: healthFor({ items: [{ semanticRef: 'budget', state: 'SUSPECT', critical: true }] }),
  }))
  assert.deepEqual(blocked, { status: 'UNAVAILABLE' })

  const nonCritical = await resolve(portsFor({
    health: healthFor({ items: [{ semanticRef: 'budget', state: 'SUSPECT', critical: false }] }),
  }))
  assert.equal(nonCritical.status, 'FOUND')

  const changedInput = await resolve(portsFor({
    currentRealization: {
      sourceRevision: CURRENT_PROJECT_SOURCE_REVISION,
      inputDigest: '0'.repeat(64),
      manifestDigest: 'd'.repeat(64),
      applicableItemIds: ['budget'],
    },
  }))
  assert.deepEqual(changedInput, { status: 'UNAVAILABLE' })
})

test('BRN-14 preserves validated known-empty context and rejects missing exact dependencies', async () => {
  const emptyCandidate = candidateFor({ applicableItemIds: [] })
  const emptyBinding = bindingFor(emptyCandidate)
  const empty = await resolve(portsFor({
    binding: emptyBinding,
    revision: {
      brainRevisionId: BRAIN_REVISION,
      brainDigest: BRAIN_DIGEST,
      sourceRevision: 'f'.repeat(40),
      availability: 'AVAILABLE',
      payload: emptySource,
    },
    health: { ...healthFor(), items: [] },
  }))
  assert.equal(empty.status, 'FOUND')
  assert.deepEqual(empty.value.domains, [])

  const missingHealth = await resolve(portsFor({ health: { ...healthFor(), items: [] } }))
  assert.deepEqual(missingHealth, { status: 'UNAVAILABLE' })

  const v1Revision = await resolve(portsFor({ revision: {
    brainRevisionId: BRAIN_REVISION,
    brainDigest: BRAIN_DIGEST,
    sourceRevision: 'f'.repeat(40),
    availability: 'AVAILABLE',
    payload: { schemaVersion: 'conexus-brain/v1' },
  } }))
  assert.deepEqual(v1Revision, { status: 'UNAVAILABLE' })
})
