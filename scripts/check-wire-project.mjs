import fs from 'node:fs';

const oas = JSON.parse(fs.readFileSync('/tmp/conexus-product-openapi.bundle.json', 'utf8'));
const methods = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);
const operations = new Map();

for (const [path, pathItem] of Object.entries(oas.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem ?? {})) {
    if (!methods.has(method)) continue;
    const id = operation?.['x-conexus-4a-id'];
    if (id) operations.set(id, { path, method: method.toUpperCase(), operation, pathParameters: pathItem?.parameters ?? [] });
  }
}

const expectedIds = [
  'PRJ-01', 'PRJ-02', 'PRJ-03',
  ...Array.from({ length: 18 }, (_, i) => `PRJ-${String(i + 5).padStart(2, '0')}`),
  'PRJ-23', 'PRJ-24', 'PRJ-29',
];

if (expectedIds.length !== 24) throw new Error(`internal test setup error: expected 24 Project ids, got ${expectedIds.length}`);
if (operations.has('PRJ-04')) throw new Error('PRJ-04 must remain subtracted after 4B-F01 / 4C-F01');

for (const id of expectedIds) {
  const entry = operations.get(id);
  if (!entry) throw new Error(`Project schema closure missing operation ${id}`);
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
  const entry = operations.get(id);
  if (!entry) throw new Error(`missing operation ${id}`);
  return [...(entry.pathParameters ?? []), ...(entry.operation.parameters ?? [])].map(resolveLocalRef);
}

function hasParameter(id, where, name, required = undefined) {
  return resolvedParameters(id).some((p) => p?.in === where && p?.name === name && (required === undefined || p?.required === required));
}

function requestSchema(id) {
  return resolveSchema(op(id).requestBody?.content?.['application/json']?.schema);
}

function successSchema(id, status = '200') {
  return resolveSchema(op(id).responses?.[status]?.content?.['application/json']?.schema);
}

function requiredFields(schema) {
  return new Set(resolveSchema(schema)?.required ?? []);
}

function assertClosedObject(schema, label) {
  const resolved = resolveSchema(schema);
  if (!resolved || resolved.type !== 'object' || resolved.additionalProperties !== false) {
    throw new Error(`${label} must be a closed object schema`);
  }
  return resolved;
}

function propertySchema(schema, name) {
  return resolveSchema(resolveSchema(schema)?.properties?.[name]);
}

function assertHumanName(schema, label) {
  const resolved = assertClosedObject(schema, label);
  if (!requiredFields(resolved).has('name')) throw new Error(`${label} must require name`);
  const name = propertySchema(resolved, 'name');
  if (name?.type !== 'string' || (name.minLength ?? 0) < 1 || typeof name.pattern !== 'string') {
    throw new Error(`${label} name must be an explicit non-blank string schema`);
  }
  return resolved;
}

function assertPresentationName(schema, label) {
  const resolved = assertClosedObject(schema, label);
  if (!requiredFields(resolved).has('name')) throw new Error(`${label} must require human presentation name`);
  const name = propertySchema(resolved, 'name');
  if (name?.type !== 'string' || (name.minLength ?? 0) < 1 || typeof name.pattern !== 'string') {
    throw new Error(`${label} name must reject blank presentation`);
  }
  return resolved;
}

function assertPresentationField(schema, field, label) {
  const resolved = assertClosedObject(schema, label);
  if (!requiredFields(resolved).has(field)) throw new Error(`${label} must require ${field}`);
  const value = propertySchema(resolved, field);
  if (value?.type !== 'string' || (value.minLength ?? 0) < 1 || typeof value.pattern !== 'string') {
    throw new Error(`${label} ${field} must be an explicit non-blank presentation string`);
  }
  return resolved;
}

function assertNonBlankString(schema, label) {
  const resolved = resolveSchema(schema);
  if (resolved?.type !== 'string' || (resolved.minLength ?? 0) < 1) throw new Error(`${label} must be a non-empty string`);
  return resolved;
}

function assertBaselineShape(schema, digestField, label) {
  const resolved = assertClosedObject(schema, label);
  for (const field of [digestField, 'sourceRevision', 'sourceText', 'applicationRuntimeProfile']) {
    if (!requiredFields(resolved).has(field)) throw new Error(`${label} must require ${field}`);
  }
  const profiles = propertySchema(resolved, 'applicationRuntimeProfile')?.enum ?? [];
  if (profiles.length !== 2 || !profiles.includes('MANAGED') || !profiles.includes('DEDICATED')) {
    throw new Error(`${label} runtime profile must be exactly MANAGED/DEDICATED; got ${profiles.join(',')}`);
  }
  return resolved;
}

// 4C-F01 + 4C-F02: creation establishes human identity and exactly one source bootstrap; no generic Project metadata/source mutation domain.
const createProject = assertHumanName(requestSchema('PRJ-03'), 'PRJ-03 request');
if (!requiredFields(createProject).has('sourceBootstrap')) throw new Error('PRJ-03 must require creation-time sourceBootstrap after 4C-F02');
for (const forbidden of ['description', 'settings', 'metadata', 'credential', 'credentials', 'secret', 'sourceId']) {
  if (createProject.properties?.[forbidden]) throw new Error(`PRJ-03 must not expose speculative Project/source field ${forbidden}`);
}
const sourceBootstrap = propertySchema(createProject, 'sourceBootstrap');
const sourceVariants = sourceBootstrap?.oneOf ?? [];
if (sourceVariants.length !== 2) throw new Error('PRJ-03 sourceBootstrap must be exactly NEW | EXISTING_GIT');
const byMode = new Map(sourceVariants.map((variant) => [variant?.properties?.mode?.const, variant]));
if (!byMode.has('NEW') || !byMode.has('EXISTING_GIT')) throw new Error('PRJ-03 sourceBootstrap modes must be exactly NEW and EXISTING_GIT');
const newSource = assertClosedObject(byMode.get('NEW'), 'PRJ-03 NEW source bootstrap');
if ([...requiredFields(newSource)].join(',') !== 'mode') throw new Error('PRJ-03 NEW source bootstrap must require only mode');
const existingSource = assertClosedObject(byMode.get('EXISTING_GIT'), 'PRJ-03 EXISTING_GIT source bootstrap');
for (const field of ['mode', 'repositoryLocator']) {
  if (!requiredFields(existingSource).has(field)) throw new Error(`PRJ-03 EXISTING_GIT source bootstrap must require ${field}`);
}
const locator = propertySchema(existingSource, 'repositoryLocator');
if (locator?.type !== 'string' || (locator.minLength ?? 0) < 1 || typeof locator.pattern !== 'string') {
  throw new Error('PRJ-03 repositoryLocator must be an explicit non-blank string reference');
}
for (const forbidden of ['credential', 'credentials', 'secret', 'token', 'password', 'branch', 'ref']) {
  if (existingSource.properties?.[forbidden]) throw new Error(`PRJ-03 source bootstrap must not expose ${forbidden}`);
}
if (!hasParameter('PRJ-03', 'header', 'Idempotency-Key', true)) throw new Error('PRJ-03 must require Idempotency-Key');

const projectRepresentation = assertHumanName(successSchema('PRJ-02'), 'PRJ-02 success');
const projectList = resolveSchema(successSchema('PRJ-01'));
assertHumanName(resolveSchema(projectList?.items), 'PRJ-01 item');
for (const field of ['projectId', 'workspaceId', 'projectRevision', 'archived']) {
  if (!requiredFields(projectRepresentation).has(field)) throw new Error(`PRJ-02 success must require ${field}`);
}

// ArchiveProject: current Project subject is explicit because command subpath cannot truthfully reuse Project ETag.
const archive = assertClosedObject(requestSchema('PRJ-05'), 'PRJ-05 request');
if (!requiredFields(archive).has('expectedProjectRevision')) throw new Error('PRJ-05 must require expectedProjectRevision');
if (archive.properties?.name || archive.properties?.settings || archive.properties?.metadata) {
  throw new Error('PRJ-05 must not become rename/generic Project mutation');
}

// DuplicateProject: destination Workspace and a new human-readable destination identity are explicit; default remains NO DATA.
const duplicate = assertClosedObject(requestSchema('PRJ-06'), 'PRJ-06 request');
for (const field of ['destinationWorkspaceId', 'name']) {
  if (!requiredFields(duplicate).has(field)) throw new Error(`PRJ-06 must require ${field}`);
}
const duplicateName = propertySchema(duplicate, 'name');
if (duplicateName?.type !== 'string' || (duplicateName.minLength ?? 0) < 1 || typeof duplicateName.pattern !== 'string') {
  throw new Error('PRJ-06 name must be an explicit non-blank destination identity');
}
for (const forbidden of ['copyData', 'dataMode', 'copyCredentials', 'copyConnectionBindings', 'connectionBindings', 'credentials']) {
  if (duplicate.properties?.[forbidden]) throw new Error(`PRJ-06 must not expose speculative duplication field ${forbidden}`);
}
if (!hasParameter('PRJ-06', 'header', 'Idempotency-Key', true)) throw new Error('PRJ-06 must require Idempotency-Key');

// Inception consumes human intent; optional refinement is bound to one exact prior candidate while source selection stays server-resolved.
const inception = assertClosedObject(requestSchema('PRJ-07'), 'PRJ-07 request');
if (!requiredFields(inception).has('intent')) throw new Error('PRJ-07 must require human intent');
const intent = propertySchema(inception, 'intent');
if (intent?.type !== 'string' || (intent.minLength ?? 0) < 1 || typeof intent.pattern !== 'string') {
  throw new Error('PRJ-07 intent must be an explicit non-blank string');
}
for (const forbidden of ['url', 'targetUrl', 'repositoryUrl', 'repositoryLocator', 'connectionId', 'sourceId', 'sql']) {
  if (inception.properties?.[forbidden]) throw new Error(`PRJ-07 must not accept caller-selected ${forbidden}`);
}
assertNonBlankString(propertySchema(inception, 'priorCandidateBaselineDigest'), 'PRJ-07 priorCandidateBaselineDigest');
const reviewFeedback = assertNonBlankString(propertySchema(inception, 'reviewFeedback'), 'PRJ-07 reviewFeedback');
if (typeof reviewFeedback.pattern !== 'string') throw new Error('PRJ-07 reviewFeedback must reject whitespace-only input');
const dependent = inception.dependentRequired ?? {};
if (!dependent.priorCandidateBaselineDigest?.includes('reviewFeedback') || !dependent.reviewFeedback?.includes('priorCandidateBaselineDigest')) {
  throw new Error('PRJ-07 refinement fields must be all-or-nothing: priorCandidateBaselineDigest + reviewFeedback');
}
if (!hasParameter('PRJ-07', 'header', 'Idempotency-Key', true)) throw new Error('PRJ-07 must require Idempotency-Key');
assertBaselineShape(successSchema('PRJ-07'), 'candidateBaselineDigest', 'PRJ-07 success');

// Approved Baseline exposes exact pinned source + digest and the closed runtime profile union.
assertBaselineShape(successSchema('PRJ-08'), 'baselineDigest', 'PRJ-08 success');
const approveBaseline = assertClosedObject(requestSchema('PRJ-09'), 'PRJ-09 request');
if (!requiredFields(approveBaseline).has('candidateBaselineDigest')) throw new Error('PRJ-09 must require candidateBaselineDigest');

// 4C-F02: exact immutable candidate is durably readable for human refresh/re-entry without candidate CRUD/listing.
if (!hasParameter('PRJ-23', 'path', 'candidateBaselineDigest', true)) throw new Error('PRJ-23 must require exact candidateBaselineDigest path identity');
if (requestSchema('PRJ-23')) throw new Error('PRJ-23 read must not have a request body');
assertBaselineShape(successSchema('PRJ-23'), 'candidateBaselineDigest', 'PRJ-23 success');
const candidatePath = operations.get('PRJ-23')?.path ?? '';
if (candidatePath !== '/api/control/projects/{projectId}/baseline-candidates/{candidateBaselineDigest}') {
  throw new Error(`PRJ-23 must use exact candidate read path; got ${candidatePath}`);
}

// 4C-F03: contextual Baseline discussion is bound to that same immutable candidate and cannot become Builder authority or a mutation surface.
if (!hasParameter('PRJ-24', 'path', 'candidateBaselineDigest', true)) throw new Error('PRJ-24 must require exact candidateBaselineDigest path identity');
const baselineQuestionPath = operations.get('PRJ-24')?.path ?? '';
if (baselineQuestionPath !== '/api/control/projects/{projectId}/baseline-candidates/{candidateBaselineDigest}/assistant/queries') {
  throw new Error(`PRJ-24 must use exact candidate assistant path; got ${baselineQuestionPath}`);
}
const baselineQuestion = assertClosedObject(requestSchema('PRJ-24'), 'PRJ-24 request');
if (!requiredFields(baselineQuestion).has('question')) throw new Error('PRJ-24 must require question');
const question = assertNonBlankString(propertySchema(baselineQuestion, 'question'), 'PRJ-24 question');
if (typeof question.pattern !== 'string') throw new Error('PRJ-24 question must reject whitespace-only input');
for (const forbidden of ['reviewFeedback', 'decision', 'approve', 'candidateMutation', 'projectBuildGrant']) {
  if (baselineQuestion.properties?.[forbidden]) throw new Error(`PRJ-24 must remain read-only and must not expose ${forbidden}`);
}
const reviewContext = propertySchema(baselineQuestion, 'reviewContext');
if (reviewContext) {
  const context = assertClosedObject(reviewContext, 'PRJ-24 reviewContext');
  if (!requiredFields(context).has('projectionAnchor')) throw new Error('PRJ-24 reviewContext must require projectionAnchor when present');
  assertNonBlankString(propertySchema(context, 'projectionAnchor'), 'PRJ-24 projectionAnchor');
  const selectedText = propertySchema(context, 'selectedText');
  if (selectedText) assertNonBlankString(selectedText, 'PRJ-24 selectedText');
}
const baselineAnswer = assertClosedObject(successSchema('PRJ-24'), 'PRJ-24 success');
for (const field of ['candidateBaselineDigest', 'answer', 'provenanceRefs']) {
  if (!requiredFields(baselineAnswer).has(field)) throw new Error(`PRJ-24 success must require ${field}`);
}
assertNonBlankString(propertySchema(baselineAnswer, 'candidateBaselineDigest'), 'PRJ-24 success candidateBaselineDigest');
assertNonBlankString(propertySchema(baselineAnswer, 'answer'), 'PRJ-24 success answer');
const provenanceRefs = propertySchema(baselineAnswer, 'provenanceRefs');
if (provenanceRefs?.type !== 'array' || (provenanceRefs.minItems ?? 0) < 1) throw new Error('PRJ-24 success must carry non-empty provenanceRefs');

// Brain binding: one same-target conditional contract. GET emits ETag; PUT requires exactly one present/absent HTTP precondition; DELETE requires If-Match.
const getBrainBinding200 = op('PRJ-10').responses?.['200'];
if (!getBrainBinding200?.headers?.ETag) throw new Error('PRJ-10 must emit ETag for the current binding representation');
const setBrain = assertClosedObject(requestSchema('PRJ-11'), 'PRJ-11 request');
if (!requiredFields(setBrain).has('brainRevisionId')) throw new Error('PRJ-11 must require exact brainRevisionId');
if (!hasParameter('PRJ-11', 'header', 'If-Match', false)) throw new Error('PRJ-11 must expose optional If-Match for present-state update');
if (!hasParameter('PRJ-11', 'header', 'If-None-Match', false)) throw new Error('PRJ-11 must expose optional If-None-Match for absent-state create');
const preconditions = op('PRJ-11')['x-conexus-precondition-one-of'] ?? [];
if (preconditions.length !== 2 || !preconditions.includes('If-Match') || !preconditions.includes('If-None-Match')) {
  throw new Error('PRJ-11 must require exactly one of If-Match / If-None-Match');
}
if (!hasParameter('PRJ-12', 'header', 'If-Match', true)) throw new Error('PRJ-12 must require If-Match');

// F17 Connection binding: disclosed binding carries presentation, while write input stays exact machine coordinates/current subject.
const bindingList = resolveSchema(successSchema('PRJ-13'));
if (bindingList?.type !== 'array') throw new Error('PRJ-13 success must remain an array');
const disclosedBinding = assertPresentationField(resolveSchema(bindingList.items), 'connectionName', 'PRJ-13 ProjectConnectionBinding');
for (const field of ['connectionId', 'connectionRevisionId', 'environment']) {
  if (!requiredFields(disclosedBinding).has(field)) throw new Error(`PRJ-13 ProjectConnectionBinding must require ${field}`);
}
const setConnection = assertClosedObject(requestSchema('PRJ-14'), 'PRJ-14 request');
for (const field of ['connectionId', 'connectionRevisionId', 'environment', 'expectedCurrent']) {
  if (!requiredFields(setConnection).has(field)) throw new Error(`PRJ-14 must require ${field}`);
}
if (setConnection.properties?.connectionName) throw new Error('PRJ-14 request must not accept connectionName presentation as binding authority');
assertPresentationField(successSchema('PRJ-14'), 'connectionName', 'PRJ-14 ProjectConnectionBinding response');
const expectedConnectionVariants = propertySchema(setConnection, 'expectedCurrent')?.oneOf ?? [];
const expectedConnectionStates = expectedConnectionVariants.map((variant) => variant?.properties?.state?.const).filter(Boolean).sort();
if (expectedConnectionStates.join(',') !== 'ABSENT,PRESENT') {
  throw new Error(`PRJ-14 expectedCurrent must close ABSENT/PRESENT; got ${expectedConnectionStates.join(',')}`);
}
const removeConnection = assertClosedObject(requestSchema('PRJ-15'), 'PRJ-15 request');
for (const field of ['connectionId', 'expectedConnectionRevisionId', 'expectedEnvironment']) {
  if (!requiredFields(removeConnection).has(field)) throw new Error(`PRJ-15 must require ${field}`);
}

// Capabilities remain exact finite Project capability projections, not invocation authority.
const capability = assertClosedObject(successSchema('PRJ-17'), 'PRJ-17 success');
for (const field of ['capabilityId', 'operationId', 'regime']) {
  if (!requiredFields(capability).has(field)) throw new Error(`PRJ-17 must require ${field}`);
}
const regimes = propertySchema(capability, 'regime')?.enum ?? [];
if (regimes.length !== 3 || !['QUERY', 'ACTION', 'INTEGRATION'].every((value) => regimes.includes(value))) {
  throw new Error(`PRJ-17 regime must be exactly QUERY/ACTION/INTEGRATION; got ${regimes.join(',')}`);
}

// F16: Data resources keep exact machine identity plus required server-owned human presentation, without a physical DB explorer.
const dataList = resolveSchema(successSchema('PRJ-18'));
assertPresentationName(resolveSchema(dataList?.items), 'PRJ-18 ProjectDataResourceSummary');
const dataResource = assertPresentationName(successSchema('PRJ-19'), 'PRJ-19 ProjectDataResource');
for (const field of ['dataResourceId', 'grain', 'freshness', 'coverage', 'provenance']) {
  if (!requiredFields(dataResource).has(field)) throw new Error(`PRJ-19 must require ${field}`);
}
for (const forbidden of ['table', 'schema', 'sql', 'connectionString', 'storageKey']) {
  if (dataResource.properties?.[forbidden]) throw new Error(`PRJ-19 must not expose generic physical-data field ${forbidden}`);
}

// F30: exact authored Product-Agent detail includes the safe complete agent/v1 definition; runtime/Mastra identity remains excluded.
const agent = assertClosedObject(successSchema('PRJ-21'), 'PRJ-21 success');
for (const field of ['agentId', 'authoredRevisionId', 'releaseRefs', 'activeReleaseId', 'definition']) {
  if (!requiredFields(agent).has(field)) throw new Error(`PRJ-21 must require ${field}`);
}
for (const forbidden of ['mastraAgentId', 'runtimeRevisionId', 'requestRevisionOverride', 'storedAgentId']) {
  if (agent.properties?.[forbidden]) throw new Error(`PRJ-21 must not expose runtime-authority field ${forbidden}`);
}
const agentDefinition = assertClosedObject(propertySchema(agent, 'definition'), 'PRJ-21 ProductAgentDefinition');
for (const field of ['schemaVersion', 'name', 'purpose', 'instructions', 'modelPolicy', 'tools', 'brainContext', 'memory', 'interactions', 'policyRefs', 'approvalPolicyRefs', 'budgetPolicyRefs', 'verificationRefs', 'knownLimitations']) {
  if (!requiredFields(agentDefinition).has(field)) throw new Error(`PRJ-21 definition must require ${field}`);
}
if (propertySchema(agentDefinition, 'schemaVersion')?.const !== 'agent/v1') throw new Error('PRJ-21 definition must be exact agent/v1');

for (const id of ['PRJ-16', 'PRJ-17', 'PRJ-29']) {
  const routes = op(id)['x-conexus-authority-routes'] ?? [];
  if (routes.join(',') !== 'project.read,project.build') throw new Error(`${id} must admit ordinary project.read + purpose-bound project.build`);
}
if (operations.get('PRJ-29')?.path !== '/api/control/projects/{projectId}/model-policies') throw new Error('PRJ-29 path must remain Project-owned model-policies');
const modelPolicies = successSchema('PRJ-29');
if (modelPolicies?.type !== 'array') throw new Error('PRJ-29 success must be a finite array');
const modelPolicy = assertClosedObject(modelPolicies.items, 'PRJ-29 ProjectModelPolicySummary');
for (const field of ['policyRef', 'label', 'purpose', 'isDefault']) if (!requiredFields(modelPolicy).has(field)) throw new Error(`PRJ-29 must require ${field}`);
if (propertySchema(modelPolicy, 'isDefault')?.type !== 'boolean') throw new Error('PRJ-29 isDefault must be server-owned boolean truth');
for (const forbidden of ['provider', 'model', 'endpoint', 'credential', 'runtimeOverride']) if (modelPolicy.properties?.[forbidden]) throw new Error(`PRJ-29 must not expose ${forbidden}`);

console.log('Project schema closure passed (24 operations; prior Project truth plus purpose-bound build discovery and Project-owned model policies closed).');
