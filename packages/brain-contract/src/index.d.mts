export type BrainContentClass = 'SEMANTIC' | 'KNOWLEDGE' | 'EVIDENCE_SPEC'
export type BrainSectionKind = 'DEFINITION' | 'BUSINESS_MEANING' | 'CALCULATION' | 'GRAIN' | 'RELATIONSHIPS' | 'BUSINESS_RULES' | 'CAVEATS' | 'VERIFICATION'
export type BrainHealthState = 'UNVERIFIED' | 'VALID' | 'SUSPECT' | 'INVALID' | 'CHECK_ERROR'
export type BrainItemKind = 'DATASET' | 'SEMANTIC' | 'KNOWLEDGE' | 'GROUP'
export type BrainAssertionScope = 'REVISION' | 'SELECTED'

export type BrainBrowseConceptV1 = Readonly<{
  conceptRef: string
  label: string
  summary: string
  contentClasses: readonly BrainContentClass[]
  sections: readonly Readonly<{ kind: BrainSectionKind; text: string }>[]
  provenanceRefs: readonly string[]
}>
export type BrainBrowseConceptV2 = BrainBrowseConceptV1 & Readonly<{ itemRef: string }>
export type BrainBrowseDomain<TConcept> = Readonly<{
  domainRef: string
  label: string
  concepts: readonly TConcept[]
}>
export type BrainKnowledgeBrowseV1 = Readonly<{ domains: readonly BrainBrowseDomain<BrainBrowseConceptV1>[] }>
export type BrainKnowledgeBrowseV2 = Readonly<{ domains: readonly BrainBrowseDomain<BrainBrowseConceptV2>[] }>

export type BrainDatasetItem = Readonly<{
  itemId: string
  kind: 'DATASET'
  grainId: string
  dependsOn: readonly string[]
}>
export type BrainNonDatasetItem = Readonly<{
  itemId: string
  kind: Exclude<BrainItemKind, 'DATASET'>
  dependsOn: readonly string[]
}>
export type BrainItem = BrainDatasetItem | BrainNonDatasetItem
export type BrainAssertion = Readonly<{
  assertionId: string
  itemId: string
  kind: 'KEY_CONFORMANCE'
  predicateVersion: '1'
  scope: BrainAssertionScope
}>
export type BrainSourceV1 = Readonly<{
  schemaVersion: 'conexus-brain/v1'
  reviewText: string
  knowledgeBrowse: BrainKnowledgeBrowseV1
}>
export type BrainSourceV2 = Readonly<{
  schemaVersion: 'conexus-brain/v2'
  reviewText: string
  knowledgeBrowse: BrainKnowledgeBrowseV2
  items: readonly BrainItem[]
  assertions: readonly BrainAssertion[]
}>
export type BrainSource = BrainSourceV1 | BrainSourceV2
export type BrainHealth = Readonly<{
  schemaVersion: 'conexus-brain-health/v1'
  items: readonly Readonly<{ semanticRef: string; state: BrainHealthState; critical: boolean }>[]
}>

export declare const BRAIN_REALIZATION_PATH: '.conexus/brain/realization.json'

type BrainRealizationMapping = Readonly<{ itemId: string; queryId: string; mappingDigest: string }>
type BrainRealizationSourceInput = Readonly<{ path: string; digest: string }>
export type BrainRealization = Readonly<{
  schemaVersion: 'conexus-project-brain-realization/v1'
  selectedRoots: readonly string[]
  mappings: readonly BrainRealizationMapping[]
  sourceInputs: readonly BrainRealizationSourceInput[]
}>
export type ParsedBrainRealization = Readonly<{
  manifest: BrainRealization
  applicableItemIds: readonly string[]
  requiredAssertions: readonly BrainAssertion[]
  inputDigest: string
}>
export type ParsedBrainRealizationManifest = Readonly<{
  manifest: BrainRealization
  inputDigest: string
}>

export declare const validateBrainSource: (source: unknown) => BrainSource
export declare const validateBrainHealth: (health: unknown, source?: unknown) => BrainHealth
export declare const parseBrainRealizationManifest: (input: unknown) => ParsedBrainRealizationManifest
export declare const parseBrainRealization: (input: unknown, brainInput: unknown) => ParsedBrainRealization
