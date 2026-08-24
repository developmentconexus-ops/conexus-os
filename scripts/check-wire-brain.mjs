import fs from 'node:fs';

const oas = JSON.parse(fs.readFileSync('/tmp/conexus-product-openapi.bundle.json', 'utf8'));
const methods = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);
const operations = new Map();

for (const [path, pathItem] of Object.entries(oas.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem ?? {})) {
    if (!methods.has(method)) continue;
    const id = operation?.['x-conexus-4a-id'];
    if (id) operations.set(id, { path, method: method.toUpperCase(), operation });
  }
}

const expectedIds = [
  ...Array.from({ length: 10 }, (_, i) => `BRN-${String(i + 1).padStart(2, '0')}`),
  'BRN-12',
  'BRN-13',
];
if (expectedIds.length !== 12) throw new Error('internal Brain gate setup error');
if (operations.has('BRN-11')) throw new Error('BRN-11 RunBrainHealthProbe must remain SYSTEM_OWNER_TRANSITION, not caller Product wire');

for (const id of expectedIds) {
  const entry = operations.get(id);
  if (!entry) throw new Error(`Brain schema closure missing operation ${id}`);
  if (entry.operation['x-conexus-contract-state'] !== 'SCHEMA_CLOSED') throw new Error(`${id} is not SCHEMA_CLOSED`);
  for (const response of Object.values(entry.operation.responses ?? {})) {
    if (response?.['x-conexus-provisional'] === true) throw new Error(`${id} still has provisional response authority`);
  }
}

function op(id) {
  const entry = operations.get(id);
  if (!entry) throw new Error(`missing operation ${id}`);
  return entry.operation;
}

function resolveLocalRef(value) {
  if (!value?.$ref || !value.$ref.startsWith('#/')) return value;
  return value.$ref
    .slice(2)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((node, part) => node?.[part], oas);
}

function resolveSchema(schema) {
  let current = schema;
  const seen = new Set();
  while (current?.$ref?.startsWith('#/')) {
    if (seen.has(current.$ref)) throw new Error(`schema ref cycle while checking ${current.$ref}`);
    seen.add(current.$ref);
    current = resolveLocalRef(current);
  }
  return current;
}

function resolvedParameters(id) {
  return (op(id).parameters ?? []).map(resolveLocalRef);
}

function parameter(id, where, name) {
  return resolvedParameters(id).find((p) => p?.in === where && p?.name === name);
}

function hasRequiredParameter(id, where, name) {
  return parameter(id, where, name)?.required === true;
}

function requestSchema(id) {
  return resolveSchema(op(id).requestBody?.content?.['application/json']?.schema);
}

function successSchema(id, status = '200') {
  return resolveSchema(op(id).responses?.[status]?.content?.['application/json']?.schema);
}

function assertClosedObject(schema, label) {
  const resolved = resolveSchema(schema);
  if (!resolved || resolved.type !== 'object' || resolved.additionalProperties !== false) {
    throw new Error(`${label} must be a closed object schema`);
  }
  return resolved;
}

function required(schema, ...names) {
  const set = new Set(resolveSchema(schema)?.required ?? []);
  for (const name of names) {
    if (!set.has(name)) throw new Error(`${name} must be required`);
  }
}

function property(schema, name) {
  return resolveSchema(resolveSchema(schema)?.properties?.[name]);
}

function exactEnum(schema, expected, label) {
  const actual = [...(resolveSchema(schema)?.enum ?? [])].sort();
  const want = [...expected].sort();
  if (actual.join(',') !== want.join(',')) throw new Error(`${label} must be exactly ${want.join('/')}; got ${actual.join(',')}`);
}

function nonBlankStringProperty(schema, name, label, requirePattern = false) {
  const value = property(schema, name);
  if (value?.type !== 'string' || (value?.minLength ?? 0) < 1) throw new Error(`${label} must be a non-blank string`);
  if (requirePattern && typeof value.pattern !== 'string') throw new Error(`${label} must reject whitespace-only presentation`);
}

function arrayProperty(schema, name, label) {
  const value = property(schema, name);
  if (value?.type !== 'array') throw new Error(`${label} must be an array`);
  return value;
}

// Canonical Workspace Brain is one authority, not memory/vector/search runtime authority.
const brain = assertClosedObject(successSchema('BRN-01'), 'BRN-01 success');
required(brain, 'workspaceId', 'publishedBrainRevisionId');
for (const forbidden of ['memory', 'conversationMemory', 'vectorIndex', 'ragIndex', 'toolAuthority', 'permissions']) {
  if (brain.properties?.[forbidden]) throw new Error(`BRN-01 must not expose non-Brain authority ${forbidden}`);
}

// Published revision list/publication responses stay bounded summaries; F07 detail browse belongs to exact BRN-03 only.
const revisionList = successSchema('BRN-02');
if (revisionList?.type !== 'array') throw new Error('BRN-02 success must remain an array');
const revisionSummary = assertClosedObject(resolveSchema(revisionList.items), 'BRN-02 BrainRevision summary');
required(revisionSummary, 'brainRevisionId', 'brainDigest', 'sourceRevision', 'availability', 'reviewText');
if (revisionSummary.properties?.knowledgeBrowse) throw new Error('BRN-02 must not widen every revision summary with F07 knowledgeBrowse');

// F06/F07: exact BRN-03 detail carries human-readable exact-source content plus Brain-owned structured knowledge browse.
const revision = assertClosedObject(successSchema('BRN-03'), 'BRN-03 success BrainRevisionDetail');
required(revision, 'brainRevisionId', 'brainDigest', 'sourceRevision', 'availability', 'reviewText', 'knowledgeBrowse');
nonBlankStringProperty(revision, 'reviewText', 'BRN-03 reviewText');
if (property(revision, 'availability')?.const !== 'AVAILABLE') throw new Error('BRN-03 immutable published revision availability must be AVAILABLE');
for (const forbidden of ['activeEverywhere', 'liveInherited', 'mutable', 'latest']) {
  if (revision.properties?.[forbidden]) throw new Error(`BRN-03 must not imply mutable/live inheritance via ${forbidden}`);
}

const browse = assertClosedObject(property(revision, 'knowledgeBrowse'), 'BRN-03 knowledgeBrowse');
required(browse, 'domains');
const domains = arrayProperty(browse, 'domains', 'BRN-03 knowledgeBrowse.domains');
const domain = assertClosedObject(resolveSchema(domains.items), 'Brain knowledge domain projection');
required(domain, 'domainRef', 'label', 'concepts');
nonBlankStringProperty(domain, 'domainRef', 'Brain knowledge domainRef');
nonBlankStringProperty(domain, 'label', 'Brain knowledge domain label');
const concepts = arrayProperty(domain, 'concepts', 'Brain knowledge domain concepts');
const concept = assertClosedObject(resolveSchema(concepts.items), 'Brain knowledge concept projection');
required(concept, 'conceptRef', 'label', 'summary', 'contentClasses', 'sections', 'provenanceRefs');
nonBlankStringProperty(concept, 'conceptRef', 'Brain knowledge conceptRef');
nonBlankStringProperty(concept, 'label', 'Brain knowledge concept label');
nonBlankStringProperty(concept, 'summary', 'Brain knowledge concept summary');
const contentClasses = arrayProperty(concept, 'contentClasses', 'Brain knowledge concept contentClasses');
if ((contentClasses.minItems ?? 0) < 1 || contentClasses.uniqueItems !== true) throw new Error('Brain knowledge contentClasses must be non-empty and unique');
exactEnum(resolveSchema(contentClasses.items), ['SEMANTIC', 'KNOWLEDGE', 'EVIDENCE_SPEC'], 'Brain knowledge content class');
const sections = arrayProperty(concept, 'sections', 'Brain knowledge concept sections');
if ((sections.minItems ?? 0) < 1) throw new Error('Brain knowledge concept sections must be non-empty');
const section = assertClosedObject(resolveSchema(sections.items), 'Brain knowledge section projection');
required(section, 'kind', 'text');
exactEnum(property(section, 'kind'), ['DEFINITION', 'BUSINESS_MEANING', 'CALCULATION', 'GRAIN', 'RELATIONSHIPS', 'BUSINESS_RULES', 'CAVEATS', 'VERIFICATION'], 'Brain knowledge section kind');
nonBlankStringProperty(section, 'text', 'Brain knowledge section text');
const provenanceRefs = arrayProperty(concept, 'provenanceRefs', 'Brain knowledge concept provenanceRefs');
if (provenanceRefs.uniqueItems !== true) throw new Error('Brain knowledge concept provenanceRefs must be unique when present');
if (resolveSchema(provenanceRefs.items)?.type !== 'string' || (resolveSchema(provenanceRefs.items)?.minLength ?? 0) < 1) {
  throw new Error('Brain knowledge concept provenanceRefs items must be non-blank strings');
}

// Discovery is read-only over admitted Project source authority. Credentials/arbitrary source selectors/full scans are not caller input.
const discovery = assertClosedObject(requestSchema('BRN-04'), 'BRN-04 request');
required(discovery, 'projectId');
if (!hasRequiredParameter('BRN-04', 'header', 'Idempotency-Key')) throw new Error('BRN-04 must require Idempotency-Key');
for (const forbidden of ['credential', 'secret', 'connectionString', 'sql', 'url', 'targetUrl', 'physicalTable', 'fullScan']) {
  if (discovery.properties?.[forbidden]) throw new Error(`BRN-04 must not accept discovery escape field ${forbidden}`);
}
const discoveryResult = assertClosedObject(successSchema('BRN-04'), 'BRN-04 success');
required(discoveryResult, 'projectId', 'candidates');
const candidate = resolveSchema(property(discoveryResult, 'candidates')?.items);
if (candidate) {
  required(candidate, 'candidateRef', 'hypothesis', 'provenanceRefs');
  for (const forbidden of ['accuracyPercent', 'verifiedPercent', 'canonical', 'candidateSourceRevision']) {
    if (candidate.properties?.[forbidden]) throw new Error(`Brain Discovery candidate must not manufacture authority/certainty via ${forbidden}`);
  }
}

// Proposals are exact Brain-owned source candidates. F06 makes the exact candidate meaning human-readable without changing proposal identity.
const proposal = assertClosedObject(successSchema('BRN-06'), 'BRN-06 success');
required(proposal, 'proposalId', 'proposalRevision', 'candidateSourceRevision', 'provenanceRefs', 'hypothesisState', 'reviewState', 'reviewText');
nonBlankStringProperty(proposal, 'reviewText', 'BRN-06 reviewText');
if (property(proposal, 'hypothesisState')?.enum || property(proposal, 'reviewState')?.enum) {
  throw new Error('BRN-06 proposal states must remain owner-issued until Product authority ratifies exact lifecycle vocabularies');
}
for (const forbidden of ['accuracyPercent', 'autoPublished', 'machineApproved']) {
  if (proposal.properties?.[forbidden]) throw new Error(`BRN-06 must not expose false Brain authority ${forbidden}`);
}

// F05: SubmitKnowledgeProposal keeps one semantic operation with two exclusive intake forms.
const submitProposal = requestSchema('BRN-07');
const submitForms = submitProposal?.oneOf;
if (!Array.isArray(submitForms) || submitForms.length !== 2) {
  throw new Error('BRN-07 must have exactly two mutually exclusive source-backed/discovery-backed input forms');
}
const resolvedSubmitForms = submitForms.map(resolveSchema);
const sourceBacked = resolvedSubmitForms.find((schema) => schema?.properties?.candidateSourceRevision);
const discoveryBacked = resolvedSubmitForms.find((schema) => schema?.properties?.discoveryCandidateRef);
if (!sourceBacked || !discoveryBacked) throw new Error('BRN-07 input union must contain source-backed and Discovery-backed forms');
assertClosedObject(sourceBacked, 'BRN-07 source-backed input');
assertClosedObject(discoveryBacked, 'BRN-07 Discovery-backed input');
required(sourceBacked, 'candidateSourceRevision', 'provenanceRefs');
required(discoveryBacked, 'discoveryCandidateRef', 'humanResolution');
if ((property(discoveryBacked, 'humanResolution')?.minLength ?? 0) < 1) throw new Error('BRN-07 Discovery-backed humanResolution must be non-blank');
for (const forbidden of ['discoveryCandidateRef', 'humanResolution']) {
  if (sourceBacked.properties?.[forbidden]) throw new Error(`BRN-07 source-backed input must not absorb ${forbidden}`);
}
for (const forbidden of ['candidateSourceRevision', 'provenanceRefs', 'publish', 'autoPublish', 'approved', 'machineDecision', 'reviewText', 'knowledgeBrowse']) {
  if (discoveryBacked.properties?.[forbidden]) throw new Error(`BRN-07 Discovery-backed browser input must not accept ${forbidden}`);
}
for (const form of [sourceBacked, discoveryBacked]) {
  for (const forbidden of ['publish', 'autoPublish', 'approved', 'machineDecision', 'reviewText', 'knowledgeBrowse']) {
    if (form.properties?.[forbidden]) throw new Error(`BRN-07 must never accept presentation/authority shortcut ${forbidden}`);
  }
}
if (!hasRequiredParameter('BRN-07', 'header', 'Idempotency-Key')) throw new Error('BRN-07 must require Idempotency-Key');
const submittedProposal = assertClosedObject(successSchema('BRN-07', '201'), 'BRN-07 success');
required(submittedProposal, 'proposalId', 'proposalRevision', 'candidateSourceRevision', 'provenanceRefs', 'hypothesisState', 'reviewState', 'reviewText');

// F06/F07 projections are output presentation content only. They never become a decision/publication identity or input.
const decideProposal = assertClosedObject(requestSchema('BRN-08'), 'BRN-08 request');
required(decideProposal, 'expectedProposalRevision', 'decision');
exactEnum(property(decideProposal, 'decision'), ['APPROVE', 'REJECT'], 'BRN-08 decision');
for (const forbidden of ['reviewText', 'knowledgeBrowse', 'domainRef', 'conceptRef']) {
  if (decideProposal.properties?.[forbidden]) throw new Error(`BRN-08 must not accept ${forbidden} as decision identity/input`);
}
if (decideProposal.properties?.machineApproved || decideProposal.properties?.confidenceThreshold) {
  throw new Error('BRN-08 must preserve human review authority');
}

const publish = assertClosedObject(requestSchema('BRN-09'), 'BRN-09 request');
required(publish, 'candidateSourceRevision');
for (const forbidden of ['reviewText', 'knowledgeBrowse', 'domainRef', 'conceptRef']) {
  if (publish.properties?.[forbidden]) throw new Error(`BRN-09 must not accept ${forbidden} as publication identity/input`);
}
const published = assertClosedObject(successSchema('BRN-09', '201'), 'BRN-09 success');
required(published, 'brainRevisionId', 'brainDigest', 'sourceRevision', 'availability', 'reviewText');
nonBlankStringProperty(published, 'reviewText', 'BRN-09 published BrainRevision reviewText');
if (published.properties?.knowledgeBrowse) throw new Error('BRN-09 publication response must not widen into the F07 exact-detail browse projection');
if (property(published, 'availability')?.const !== 'AVAILABLE') throw new Error('BRN-09 must produce immutable AVAILABLE revision, not live adoption');

// Brain operational health has an accepted exact state vocabulary and never mutates immutable Brain content.
const health = assertClosedObject(successSchema('BRN-10'), 'BRN-10 success');
required(health, 'brainRevisionId', 'brainDigest', 'healthSnapshotDigest', 'items');
const healthItem = resolveSchema(property(health, 'items')?.items);
if (!healthItem) throw new Error('BRN-10 must expose health items');
required(healthItem, 'semanticRef', 'state', 'critical');
exactEnum(property(healthItem, 'state'), ['UNVERIFIED', 'VALID', 'SUSPECT', 'INVALID', 'CHECK_ERROR'], 'Brain health state');
if (healthItem.properties?.rewriteBrain || healthItem.properties?.mutateRevision) throw new Error('BRN-10 health overlay must not mutate immutable Brain revision');

// AnalyticQuery v0 is semantic-ID + curated-dataset only, with explicit restricted/SELECT-only proof semantics and no SQL/physical topology authority.
const analytic = assertClosedObject(requestSchema('BRN-12'), 'BRN-12 request');
required(analytic, 'datasetSemanticId', 'selectSemanticIds');
const selected = property(analytic, 'selectSemanticIds');
if (selected?.type !== 'array' || (selected?.minItems ?? 0) < 1) throw new Error('BRN-12 selectSemanticIds must be a non-empty array');
for (const forbidden of ['sql', 'rawSql', 'table', 'schema', 'join', 'joinTopology', 'physicalTable', 'connectionId', 'expression']) {
  if (analytic.properties?.[forbidden]) throw new Error(`BRN-12 must not accept arbitrary query/physical authority ${forbidden}`);
}
if (op('BRN-12')['x-conexus-query-regime'] !== 'ANALYTIC_QUERY_V0') throw new Error('BRN-12 must declare ANALYTIC_QUERY_V0 regime');
if (op('BRN-12')['x-conexus-sql-proof'] !== 'SELECT_ONLY_REQUIRED') throw new Error('BRN-12 must require SELECT-only proof');
const httpIngress = [...(op('BRN-12')['x-conexus-ingress'] ?? [])].sort();
if (httpIngress.join(',') !== ['CONTROL_PLANE', 'PUBLISHED_APP'].sort().join(',')) throw new Error('BRN-12 HTTP ingress must be CONTROL_PLANE + PUBLISHED_APP only');
const nonHttpIngress = op('BRN-12')['x-conexus-non-http-ingress'] ?? [];
if (nonHttpIngress.length !== 1 || nonHttpIngress[0] !== 'PAR_TOOL') throw new Error('BRN-12 PAR_TOOL must remain explicit non-HTTP ingress');
const analyticResult = assertClosedObject(successSchema('BRN-12'), 'BRN-12 success');
required(analyticResult, 'effectiveBrainPlanDigest', 'projectBindingDigest', 'healthSnapshotDigest', 'datasetSemanticId', 'columns', 'rows', 'provenanceRefs');
for (const forbidden of ['rawSql', 'executedSql', 'physicalTable', 'credential']) {
  if (analyticResult.properties?.[forbidden]) throw new Error(`BRN-12 response must not expose physical/secret authority ${forbidden}`);
}

// F19: the human-readable semantic input catalog is a current exact-Project read for BRN-12, not another query executor or physical-data API.
const catalogEntry = operations.get('BRN-13');
if (catalogEntry?.path !== '/api/control/projects/{projectId}/analytic-query-catalog') {
  throw new Error(`BRN-13 must use exact Project analytic-query-catalog path; got ${catalogEntry?.path}`);
}
if (catalogEntry?.method !== 'GET') throw new Error('BRN-13 must remain a read-only GET');
if (requestSchema('BRN-13')) throw new Error('BRN-13 must not have a request body');
const catalogIngress = op('BRN-13')['x-conexus-ingress'] ?? [];
if (catalogIngress.length !== 1 || catalogIngress[0] !== 'CONTROL_PLANE') throw new Error('BRN-13 must remain Control-Plane only in F1');
if (op('BRN-13')['x-conexus-non-http-ingress']) throw new Error('BRN-13 must not create Product-Agent/non-HTTP ingress');

const catalog = assertClosedObject(successSchema('BRN-13'), 'BRN-13 ProjectAnalyticQueryCatalog');
required(catalog, 'projectId', 'brainRevisionId', 'brainDigest', 'projectBindingDigest', 'datasets');
for (const field of ['projectId', 'brainRevisionId', 'brainDigest', 'projectBindingDigest']) nonBlankStringProperty(catalog, field, `BRN-13 ${field}`);
const datasets = arrayProperty(catalog, 'datasets', 'BRN-13 datasets');
const dataset = assertClosedObject(resolveSchema(datasets.items), 'BRN-13 AnalyticDatasetChoice');
required(dataset, 'datasetSemanticId', 'label', 'selectableSemantics');
nonBlankStringProperty(dataset, 'datasetSemanticId', 'BRN-13 datasetSemanticId');
nonBlankStringProperty(dataset, 'label', 'BRN-13 dataset label', true);
const semantics = arrayProperty(dataset, 'selectableSemantics', 'BRN-13 selectableSemantics');
const semantic = assertClosedObject(resolveSchema(semantics.items), 'BRN-13 AnalyticSemanticChoice');
required(semantic, 'semanticId', 'label');
nonBlankStringProperty(semantic, 'semanticId', 'BRN-13 semanticId');
nonBlankStringProperty(semantic, 'label', 'BRN-13 semantic label', true);
for (const [label, schema] of [['catalog', catalog], ['dataset', dataset], ['semantic', semantic]]) {
  for (const forbidden of ['rawSql', 'sql', 'physicalTable', 'table', 'schema', 'join', 'joinTopology', 'semanticSearch', 'naturalLanguageQuestion', 'expression']) {
    if (schema.properties?.[forbidden]) throw new Error(`BRN-13 ${label} must not expose ${forbidden}`);
  }
}

console.log('Brain schema closure passed (12 Product operations; F05/F06/F07 Brain review/browse, F18 purpose-bound revision selection and F19 Project analytic semantic-input catalog closed; BRN-11 remains owner transition; BRN-12 remains deterministic executor).');
