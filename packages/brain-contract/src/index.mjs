import canonicalize from 'canonicalize'
import { canonicalBytes, sha256 } from '../../canonical-json/src/index.mjs'

const CONTENT_CLASSES = new Set(['SEMANTIC', 'KNOWLEDGE', 'EVIDENCE_SPEC'])
const SECTION_KINDS = new Set(['DEFINITION', 'BUSINESS_MEANING', 'CALCULATION', 'GRAIN', 'RELATIONSHIPS', 'BUSINESS_RULES', 'CAVEATS', 'VERIFICATION'])
const HEALTH_STATES = new Set(['UNVERIFIED', 'VALID', 'SUSPECT', 'INVALID', 'CHECK_ERROR'])
const ITEM_KINDS = new Set(['DATASET', 'SEMANTIC', 'KNOWLEDGE', 'GROUP'])
const ASSERTION_SCOPES = new Set(['REVISION', 'SELECTED'])
const MAX_SOURCE_BYTES = 1_048_576
const MAX_ITEMS = 2_048
const MAX_CONCEPTS = 2_048
const MAX_DOMAINS = 128
const MAX_ASSERTIONS = 4_096
const MAX_DEPENDENCIES = 2_048
const MAX_ID_LENGTH = 256

export const BRAIN_REALIZATION_PATH = '.conexus/brain/realization.json'

const fail = (code) => { throw new Error(code) }
const record = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value) => typeof value === 'string' && /\S/.test(value)
const exactKeys = (value, expected) => Object.keys(value).sort().join('\0') === [...expected].sort().join('\0')

// Keep the v1 predicate and its return identity stable. Consumers still use
// this grammar for immutable historical sources and Workspace reads.
const validateV1Source = (source) => {
  if (!record(source) || !exactKeys(source, ['schemaVersion', 'reviewText', 'knowledgeBrowse']) ||
    source.schemaVersion !== 'conexus-brain/v1' || !text(source.reviewText) ||
    !record(source.knowledgeBrowse) || !exactKeys(source.knowledgeBrowse, ['domains']) || !Array.isArray(source.knowledgeBrowse.domains)) fail('BRAIN_SOURCE_REFUSED')
  if (source.knowledgeBrowse.domains.length > MAX_DOMAINS) fail('BRAIN_SOURCE_REFUSED')
  let conceptCount = 0
  const domainRefs = new Set()
  const conceptRefs = new Set()
  for (const domain of source.knowledgeBrowse.domains) {
    if (!record(domain) || !exactKeys(domain, ['domainRef', 'label', 'concepts']) || !text(domain.domainRef) ||
      !text(domain.label) || !Array.isArray(domain.concepts)) fail('BRAIN_SOURCE_REFUSED')
    if (domainRefs.has(domain.domainRef)) fail('BRAIN_SOURCE_REFUSED')
    domainRefs.add(domain.domainRef)
    for (const concept of domain.concepts) {
      conceptCount += 1
      if (conceptCount > MAX_CONCEPTS) fail('BRAIN_SOURCE_REFUSED')
      if (!record(concept) || !exactKeys(concept, ['conceptRef', 'label', 'summary', 'contentClasses', 'sections', 'provenanceRefs']) ||
        !text(concept.conceptRef) || !text(concept.label) || !text(concept.summary) ||
        !Array.isArray(concept.contentClasses) || concept.contentClasses.length === 0 ||
        !concept.contentClasses.every((entry) => CONTENT_CLASSES.has(entry)) ||
        new Set(concept.contentClasses).size !== concept.contentClasses.length ||
        !Array.isArray(concept.sections) || concept.sections.length === 0 ||
        !Array.isArray(concept.provenanceRefs) || !concept.provenanceRefs.every(text) ||
        new Set(concept.provenanceRefs).size !== concept.provenanceRefs.length) fail('BRAIN_SOURCE_REFUSED')
      if (conceptRefs.has(concept.conceptRef)) fail('BRAIN_SOURCE_REFUSED')
      conceptRefs.add(concept.conceptRef)
      for (const section of concept.sections) {
        if (!record(section) || !exactKeys(section, ['kind', 'text']) || !SECTION_KINDS.has(section.kind) || !text(section.text)) {
          fail('BRAIN_SOURCE_REFUSED')
        }
      }
    }
  }
  return source
}

const closedRecord = (value, expected) => {
  if (!record(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length !== expected.length ||
    expected.some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      return descriptor?.enumerable !== true || !('value' in descriptor)
    })) fail('BRAIN_SOURCE_REFUSED')
  const keys = Reflect.ownKeys(value)
  if (keys.some((key) => typeof key !== 'string' || !expected.includes(key)) ||
    expected.some((key) => !keys.includes(key))) fail('BRAIN_SOURCE_REFUSED')
  return value
}

const boundedId = (value) => text(value) && value.length <= MAX_ID_LENGTH && value.trim() === value &&
  [...value].every((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && codePoint >= 0x20 && codePoint !== 0x7f
  })

const validateV2Source = (source) => {
  closedRecord(source, ['schemaVersion', 'reviewText', 'knowledgeBrowse', 'items', 'assertions'])
  if (source.schemaVersion !== 'conexus-brain/v2' || !text(source.reviewText) ||
    !Array.isArray(source.items) || !Array.isArray(source.assertions)) fail('BRAIN_SOURCE_REFUSED')
  if (source.items.length > MAX_ITEMS || source.assertions.length > MAX_ASSERTIONS) fail('BRAIN_SOURCE_REFUSED')

  const itemIds = new Set()
  const items = []
  for (const item of source.items) {
    if (!record(item) || ![Object.prototype, null].includes(Object.getPrototypeOf(item))) fail('BRAIN_SOURCE_REFUSED')
    const itemKeys = Reflect.ownKeys(item)
    if (itemKeys.some((key) => typeof key !== 'string' || !['itemId', 'kind', 'grainId', 'dependsOn'].includes(key)) ||
      !itemKeys.includes('itemId') || !itemKeys.includes('kind') || !itemKeys.includes('dependsOn')) fail('BRAIN_SOURCE_REFUSED')
    const kindDescriptor = Object.getOwnPropertyDescriptor(item, 'kind')
    if (kindDescriptor?.enumerable !== true || !('value' in kindDescriptor) || typeof kindDescriptor.value !== 'string') fail('BRAIN_SOURCE_REFUSED')
    const expected = kindDescriptor.value === 'DATASET'
      ? ['itemId', 'kind', 'grainId', 'dependsOn']
      : ['itemId', 'kind', 'dependsOn']
    closedRecord(item, expected)
    if (!record(item) || !boundedId(item.itemId) || itemIds.has(item.itemId) ||
      !ITEM_KINDS.has(item.kind) || !Array.isArray(item.dependsOn) ||
      item.dependsOn.length > MAX_DEPENDENCIES || new Set(item.dependsOn).size !== item.dependsOn.length ||
      !item.dependsOn.every(boundedId)) fail('BRAIN_SOURCE_REFUSED')
    if (item.kind === 'DATASET' && !boundedId(item.grainId)) fail('BRAIN_SOURCE_REFUSED')
    itemIds.add(item.itemId)
    items.push(item)
  }

  // Dependencies are canonical item joins. Resolve before cycle detection so
  // neither a dangling edge nor a cyclic closure can be admitted.
  const itemById = new Map(items.map((item) => [item.itemId, item]))
  for (const item of items) {
    if (item.dependsOn.some((dependency) => !itemById.has(dependency))) fail('BRAIN_SOURCE_REFUSED')
  }
  const visiting = new Set()
  const visited = new Set()
  const visit = (itemId) => {
    if (visiting.has(itemId)) fail('BRAIN_SOURCE_REFUSED')
    if (visited.has(itemId)) return
    visiting.add(itemId)
    for (const dependency of itemById.get(itemId).dependsOn) visit(dependency)
    visiting.delete(itemId)
    visited.add(itemId)
  }
  for (const itemId of itemIds) visit(itemId)

  const knowledgeBrowse = source.knowledgeBrowse
  closedRecord(knowledgeBrowse, ['domains'])
  if (!Array.isArray(knowledgeBrowse.domains) || knowledgeBrowse.domains.length > MAX_DOMAINS) fail('BRAIN_SOURCE_REFUSED')
  let conceptCount = 0
  const domainRefs = new Set()
  const conceptRefs = new Set()
  for (const domain of knowledgeBrowse.domains) {
    closedRecord(domain, ['domainRef', 'label', 'concepts'])
    if (!boundedId(domain.domainRef) || domainRefs.has(domain.domainRef) || !text(domain.label) || !Array.isArray(domain.concepts)) {
      fail('BRAIN_SOURCE_REFUSED')
    }
    domainRefs.add(domain.domainRef)
    for (const concept of domain.concepts) {
      conceptCount += 1
      if (conceptCount > MAX_CONCEPTS) fail('BRAIN_SOURCE_REFUSED')
      closedRecord(concept, ['conceptRef', 'label', 'summary', 'contentClasses', 'sections', 'provenanceRefs', 'itemRef'])
      if (!boundedId(concept.conceptRef) || conceptRefs.has(concept.conceptRef) || !text(concept.label) ||
        !text(concept.summary) || !Array.isArray(concept.contentClasses) || concept.contentClasses.length === 0 ||
        !concept.contentClasses.every((entry) => CONTENT_CLASSES.has(entry)) ||
        new Set(concept.contentClasses).size !== concept.contentClasses.length || !Array.isArray(concept.sections) ||
        concept.sections.length === 0 || !Array.isArray(concept.provenanceRefs) ||
        !concept.provenanceRefs.every(text) || new Set(concept.provenanceRefs).size !== concept.provenanceRefs.length ||
        !boundedId(concept.itemRef) || !itemIds.has(concept.itemRef)) fail('BRAIN_SOURCE_REFUSED')
      conceptRefs.add(concept.conceptRef)
      for (const section of concept.sections) {
        closedRecord(section, ['kind', 'text'])
        if (!SECTION_KINDS.has(section.kind) || !text(section.text)) fail('BRAIN_SOURCE_REFUSED')
      }
    }
  }

  const assertionIds = new Set()
  const assertions = []
  for (const assertion of source.assertions) {
    closedRecord(assertion, ['assertionId', 'itemId', 'kind', 'predicateVersion', 'scope'])
    if (!boundedId(assertion.assertionId) || assertionIds.has(assertion.assertionId) ||
      !boundedId(assertion.itemId) || !itemIds.has(assertion.itemId) ||
      itemById.get(assertion.itemId).kind !== 'DATASET' || assertion.kind !== 'KEY_CONFORMANCE' ||
      assertion.predicateVersion !== '1' || !ASSERTION_SCOPES.has(assertion.scope)) fail('BRAIN_SOURCE_REFUSED')
    assertionIds.add(assertion.assertionId)
    assertions.push(assertion)
  }
  const datasetIds = items.filter((item) => item.kind === 'DATASET').map((item) => item.itemId)
  for (const itemId of datasetIds) {
    if (!assertions.some((assertion) => assertion.itemId === itemId)) fail('BRAIN_SOURCE_REFUSED')
  }

  let canonical
  try { canonical = canonicalize(source) } catch { fail('BRAIN_SOURCE_REFUSED') }
  if (typeof canonical !== 'string' || Buffer.byteLength(canonical, 'utf8') > MAX_SOURCE_BYTES) fail('BRAIN_SOURCE_REFUSED')
  return source
}

export const validateBrainSource = (source) => {
  if (record(source) && source.schemaVersion === 'conexus-brain/v2') return validateV2Source(source)
  return validateV1Source(source)
}

export const validateBrainHealth = (health, source) => {
  if (!record(health) || !exactKeys(health, ['schemaVersion', 'items']) ||
    health.schemaVersion !== 'conexus-brain-health/v1' || !Array.isArray(health.items)) fail('BRAIN_HEALTH_REFUSED')
  const semanticRefs = new Set()
  for (const item of health.items) {
    if (!record(item) || !exactKeys(item, ['semanticRef', 'state', 'critical']) || !text(item.semanticRef) ||
      !HEALTH_STATES.has(item.state) || typeof item.critical !== 'boolean') fail('BRAIN_HEALTH_REFUSED')
    if (semanticRefs.has(item.semanticRef)) fail('BRAIN_HEALTH_REFUSED')
    semanticRefs.add(item.semanticRef)
  }
  if (source !== undefined) {
    let validatedSource
    try { validatedSource = validateBrainSource(source) } catch { fail('BRAIN_HEALTH_REFUSED') }
    if (validatedSource.schemaVersion === 'conexus-brain/v2') {
      const itemIds = new Set(validatedSource.items.map((item) => item.itemId))
      if (itemIds.size !== semanticRefs.size || [...itemIds].some((itemId) => !semanticRefs.has(itemId))) {
        fail('BRAIN_HEALTH_REFUSED')
      }
    }
  }
  return health
}

const refused = () => { throw new Error('PROJECT_BRAIN_REALIZATION_REFUSED') }
const id = (value) => typeof value === 'string' && value.length > 0 &&
  value.length <= 256 && value.trim() === value && [...value].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
const digest = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
const closed = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return refused()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).length !== keys.length) return refused()
  const result = {}
  for (const key of keys) {
    const descriptor = descriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) return refused()
    result[key] = descriptor.value
  }
  return result
}
const list = (value) => {
  if (!Array.isArray(value) || value.length > 2_048) return refused()
  return Array.from(value)
}
const sourcePath = (value) => {
  if (!id(value) || value.includes('\\') || value.includes(':') || value === BRAIN_REALIZATION_PATH) return false
  const parts = value.split('/')
  return parts.every((part) => part !== '' && part !== '.' && part !== '..' && part.toLowerCase() !== '.git') &&
    !value.startsWith('.conexus/project/') && value !== '.conexus/project'
}

/** Closed manifest grammar only: no Brain payload, source I/O, permission, health or physical proof. */
export const parseBrainRealizationManifest = (input) => {
  const value = closed(input, ['schemaVersion', 'selectedRoots', 'mappings', 'sourceInputs'])
  if (value.schemaVersion !== 'conexus-project-brain-realization/v1') return refused()
  const roots = list(value.selectedRoots).map((root) => id(root) ? root : refused())
  if (new Set(roots).size !== roots.length) return refused()
  const mapped = new Set()
  const mappings = list(value.mappings).map((entry) => {
    const mapping = closed(entry, ['itemId', 'queryId', 'mappingDigest'])
    if (!id(mapping.itemId) || !id(mapping.queryId) || !digest(mapping.mappingDigest) ||
      mapped.has(mapping.itemId)) return refused()
    mapped.add(mapping.itemId)
    return Object.freeze({ itemId: mapping.itemId, queryId: mapping.queryId, mappingDigest: mapping.mappingDigest })
  })
  const paths = new Set()
  const sourceInputs = list(value.sourceInputs).map((entry) => {
    const reference = closed(entry, ['path', 'digest'])
    if (!sourcePath(reference.path) || !digest(reference.digest) || paths.has(reference.path)) return refused()
    paths.add(reference.path)
    return Object.freeze({ path: reference.path, digest: reference.digest })
  })
  const manifest = Object.freeze({
    schemaVersion: 'conexus-project-brain-realization/v1',
    selectedRoots: Object.freeze(roots), mappings: Object.freeze(mappings), sourceInputs: Object.freeze(sourceInputs),
  })
  const bytes = canonicalBytes(manifest)
  if (bytes.length > 1_048_576) return refused()
  return Object.freeze({ manifest, inputDigest: sha256(bytes) })
}

/** Input grammar and Brain obligations only: no source I/O, permission, health or physical proof. */
export const parseBrainRealization = (input, brainInput) => {
  let source
  try { source = validateBrainSource(brainInput) } catch { return refused() }
  if (source.schemaVersion !== 'conexus-brain/v2') return refused()
  const parsedManifest = parseBrainRealizationManifest(input)
  const items = new Map(source.items.map((item) => [item.itemId, item]))
  const selected = new Set()
  const pending = [...parsedManifest.manifest.selectedRoots]
  while (pending.length) {
    const itemId = pending.pop()
    if (itemId === undefined) return refused()
    if (selected.has(itemId)) continue
    const item = items.get(itemId)
    if (!item) return refused()
    selected.add(itemId)
    pending.push(...item.dependsOn)
  }
  const assertions = source.assertions.filter((assertion) =>
    assertion.scope === 'REVISION' || selected.has(assertion.itemId))
  const requiredDatasets = new Set(assertions.map((assertion) => assertion.itemId))
  const mapped = new Set(parsedManifest.manifest.mappings.map((mapping) => mapping.itemId))
  if (mapped.size !== requiredDatasets.size ||
    [...mapped].some((itemId) => !requiredDatasets.has(itemId))) return refused()
  return Object.freeze({ manifest: parsedManifest.manifest, applicableItemIds: Object.freeze([...selected].sort()),
    requiredAssertions: Object.freeze(assertions.map((assertion) => Object.freeze({ ...assertion }))),
    inputDigest: parsedManifest.inputDigest })
}
