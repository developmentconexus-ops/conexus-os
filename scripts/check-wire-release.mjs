import fs from 'node:fs';

const oas = JSON.parse(fs.readFileSync('/tmp/conexus-product-openapi.bundle.json', 'utf8'));
const methods = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);
const operations = new Map();

for (const [path, pathItem] of Object.entries(oas.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem ?? {})) {
    if (!methods.has(method)) continue;
    const id = operation?.['x-conexus-4a-id'];
    if (id) operations.set(id, { path, method: method.toUpperCase(), operation, pathItem });
    if (operation?.operationId === 'ComposeRelease') throw new Error('REL-03 ComposeRelease must remain SYSTEM_OWNER_TRANSITION, not caller Product wire');
  }
}

const expectedIds = ['REL-01', 'REL-02', 'REL-04', 'REL-05', 'REL-06', 'REL-07', 'REL-08'];
for (const id of expectedIds) {
  const entry = operations.get(id);
  if (!entry) throw new Error(`Release schema closure missing operation ${id}`);
  if (entry.operation['x-conexus-contract-state'] !== 'SCHEMA_CLOSED') throw new Error(`${id} is not SCHEMA_CLOSED`);
  for (const response of Object.values(entry.operation.responses ?? {})) {
    if (response?.['x-conexus-provisional'] === true) throw new Error(`${id} still has provisional response authority`);
  }
}

function entry(id) {
  const value = operations.get(id);
  if (!value) throw new Error(`missing operation ${id}`);
  return value;
}

function op(id) {
  return entry(id).operation;
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
  const value = entry(id);
  const parameters = new Map();
  for (const candidate of [...(value.pathItem.parameters ?? []), ...(value.operation.parameters ?? [])]) {
    const resolved = resolveLocalRef(candidate);
    parameters.set(`${resolved?.in}\0${resolved?.name}`, resolved);
  }
  return [...parameters.values()];
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

function assertOwnerIssuedState(schema, name, label) {
  const state = property(schema, name);
  if (state?.type !== 'string' || state?.enum) throw new Error(`${label} must remain owner-issued until exact lifecycle vocabulary is ratified`);
}

function assertOpaqueString(schema, label) {
  const value = resolveSchema(schema);
  if (value?.type !== 'string' || value?.minLength !== 1) throw new Error(`${label} must be a non-empty string`);
}

function assertHumanString(schema, label) {
  const value = resolveSchema(schema);
  if (value?.type !== 'string' || value?.minLength !== 1 || !value?.pattern) throw new Error(`${label} must be a nonblank human presentation`);
}

// REL-01 is a scalable human-recognizable immutable Release collection, not an opaque digest array.
const releasePageToken = parameter('REL-01', 'query', 'pageToken');
if (!releasePageToken || releasePageToken.required === true) throw new Error('REL-01 must admit an optional opaque pageToken');
assertOpaqueString(releasePageToken.schema, 'REL-01 pageToken');
const releasePage = assertClosedObject(successSchema('REL-01'), 'REL-01 success');
required(releasePage, 'items');
const releaseItems = property(releasePage, 'items');
if (releaseItems?.type !== 'array' || !releaseItems.items) throw new Error('REL-01 items must be an array');
const releaseSummary = assertClosedObject(releaseItems.items, 'REL-01 ReleaseSummary');
required(releaseSummary, 'releaseId', 'releaseLabel', 'releaseManifestDigest', 'sourceRevision', 'createdAt', 'releaseState', 'compositionSummary');
assertHumanString(property(releaseSummary, 'releaseLabel'), 'REL-01 releaseLabel');
if (property(releaseSummary, 'createdAt')?.format !== 'date-time') throw new Error('REL-01 createdAt must be date-time');
const releaseCompositionSummary = assertClosedObject(property(releaseSummary, 'compositionSummary'), 'REL-01 compositionSummary');
required(releaseCompositionSummary, 'componentCount', 'bindingCount', 'managedJobCount');
for (const count of ['componentCount', 'bindingCount', 'managedJobCount']) {
  const value = property(releaseCompositionSummary, count);
  if (value?.type !== 'integer' || value?.minimum !== 0) throw new Error(`REL-01 ${count} must be a non-negative integer`);
}
const releaseNext = property(releasePage, 'nextPageToken');
if (releaseNext) assertOpaqueString(releaseNext, 'REL-01 nextPageToken');

// Release is an immutable composition projection. It must not become mutable-latest or a deployment control surface.
const release = assertClosedObject(successSchema('REL-02'), 'REL-02 success');
required(release, 'releaseId', 'releaseLabel', 'projectId', 'releaseManifestDigest', 'sourceRevision', 'verificationEvidenceDigest', 'createdAt', 'releaseState', 'compositionSummary', 'composition');
assertHumanString(property(release, 'releaseLabel'), 'REL-02 releaseLabel');
if (property(release, 'createdAt')?.format !== 'date-time') throw new Error('REL-02 createdAt must be date-time');
assertOwnerIssuedState(release, 'releaseState', 'Release releaseState');
const composition = property(release, 'composition');
if (composition?.type !== 'object' || composition?.additionalProperties !== false || composition?.['x-conexus-schema-source'] !== 'RELEASE_MANIFEST') {
  throw new Error('REL-02 composition must project the exact immutable ReleaseManifest authority');
}
required(composition, 'components', 'bindings', 'configurationDigest', 'runtimeContractDigest');
const components = property(composition, 'components');
if (components?.type !== 'array' || !components.items) throw new Error('REL-02 composition.components must be an array');
const component = assertClosedObject(components.items, 'REL-02 ReleaseComponentProjection');
required(component, 'kind', 'ref', 'label', 'digest');
assertHumanString(property(component, 'label'), 'REL-02 component label');
const bindings = property(composition, 'bindings');
if (bindings?.type !== 'array' || !bindings.items) throw new Error('REL-02 composition.bindings must be an array');
const binding = assertClosedObject(bindings.items, 'REL-02 ReleaseBindingProjection');
required(binding, 'kind', 'ref', 'label', 'revisionRef');
assertHumanString(property(binding, 'label'), 'REL-02 binding label');
for (const forbidden of ['latest', 'active', 'served', 'promoted', 'ready', 'live', 'mutable', 'rebuild']) {
  if (release.properties?.[forbidden]) throw new Error(`REL-02 must not collapse Release identity into ${forbidden}`);
}

// Promotion is the only caller Product decision for forward promotion or rollback-to-eligible-prior-Release.
if (op('REL-06')['x-conexus-current-state-carrier'] !== 'EXPECTED_POINTER_GENERATION+IDEMPOTENCY_KEY') {
  throw new Error('REL-06 must preserve EXPECTED_POINTER_GENERATION+IDEMPOTENCY_KEY');
}
if (parameter('REL-06', 'header', 'If-Match')) throw new Error('REL-06 must not use cross-resource If-Match');
if (!hasRequiredParameter('REL-06', 'header', 'Idempotency-Key')) throw new Error('REL-06 must require Idempotency-Key');
const promote = assertClosedObject(requestSchema('REL-06'), 'REL-06 request');
required(promote, 'releaseId', 'environmentId', 'expectedPointerGeneration');
for (const forbidden of ['force', 'skipConformance', 'skipVerification', 'skipMigration', 'rollback', 'targetUrl', 'activePointer', 'setPointer', 'downMigration', 'proofDigest', 'conformanceId']) {
  if (promote.properties?.[forbidden]) throw new Error(`REL-06 must not accept promotion escape field ${forbidden}`);
}
const promotion = assertClosedObject(successSchema('REL-06', '201'), 'REL-06 success');
required(promotion, 'promotionId', 'projectId', 'releaseId', 'environmentId', 'environmentLabel', 'expectedPointerGeneration', 'requestedAt', 'requestedBy', 'promotionState');
assertHumanString(property(promotion, 'environmentLabel'), 'REL-06 environmentLabel');
if (property(promotion, 'requestedAt')?.format !== 'date-time') throw new Error('REL-06 requestedAt must be date-time');
const promotionActor = assertClosedObject(property(promotion, 'requestedBy'), 'REL-06 requestedBy');
required(promotionActor, 'accountId', 'displayName');
assertHumanString(property(promotionActor, 'displayName'), 'REL-06 requestedBy.displayName');
assertOwnerIssuedState(promotion, 'promotionState', 'Promotion promotionState');

// REL-04 preserves chronological Promotion history with exact target and immutable human context.
for (const name of ['environmentId', 'pageToken']) {
  const candidate = parameter('REL-04', 'query', name);
  if (!candidate || candidate.required === true) throw new Error(`REL-04 must admit optional ${name}`);
  assertOpaqueString(candidate.schema, `REL-04 ${name}`);
}
const promotionPage = assertClosedObject(successSchema('REL-04'), 'REL-04 success');
required(promotionPage, 'items');
const promotionItems = property(promotionPage, 'items');
if (promotionItems?.type !== 'array' || !promotionItems.items) throw new Error('REL-04 items must be an array');
const promotionHistory = assertClosedObject(promotionItems.items, 'REL-04 Promotion');
required(promotionHistory, 'promotionId', 'environmentId', 'environmentLabel', 'requestedAt', 'requestedBy', 'promotionState');
const promotionNext = property(promotionPage, 'nextPageToken');
if (promotionNext) assertOpaqueString(promotionNext, 'REL-04 nextPageToken');

// Serving truth must preserve active pointer separately from observed/verified serving truth.
const serving = assertClosedObject(successSchema('REL-07'), 'REL-07 success');
required(serving, 'projectId', 'environments');
const servingEnvironments = property(serving, 'environments');
if (servingEnvironments?.type !== 'array' || servingEnvironments?.minItems !== 1 || !servingEnvironments.items) throw new Error('REL-07 environments must be a non-empty server-disclosed array');
const servingEnvironment = assertClosedObject(servingEnvironments.items, 'REL-07 EnvironmentServingState');
required(servingEnvironment, 'environmentId', 'environmentLabel', 'pointerState', 'pointerGeneration');
assertHumanString(property(servingEnvironment, 'environmentLabel'), 'REL-07 environmentLabel');
const pointerStates = property(servingEnvironment, 'pointerState')?.enum ?? [];
if (pointerStates.join(',') !== 'UNSET,SET') throw new Error('REL-07 pointerState must distinguish UNSET from SET');
const servingVerification = assertClosedObject(property(servingEnvironment, 'servingVerification'), 'REL-07 servingVerification');
required(servingVerification, 'state', 'expectedReleaseId', 'expectedManifestDigest');
assertOwnerIssuedState(servingVerification, 'state', 'Serving verification state');
for (const forbidden of ['ready', 'live', 'available', 'promoted', 'success']) {
  if (servingEnvironment.properties?.[forbidden]) throw new Error(`REL-07 must not collapse serving truth into ${forbidden}`);
}

// Environment conformance is owner-specific proof over the real target, not a generic deployment executor.
const conformance = assertClosedObject(successSchema('REL-08'), 'REL-08 success');
required(conformance, 'projectId', 'environmentId', 'environmentLabel', 'conformanceState', 'observedPointerGeneration', 'checks', 'evidenceRefs');
assertHumanString(property(conformance, 'environmentLabel'), 'REL-08 environmentLabel');
assertOwnerIssuedState(conformance, 'conformanceState', 'Environment conformanceState');
const checks = property(conformance, 'checks');
if (checks?.type !== 'array' || !checks.items) throw new Error('REL-08 checks must be an owner-specific conformance proof list');
const check = assertClosedObject(checks.items, 'REL-08 check');
required(check, 'subject', 'state', 'evidenceRefs');
const admittedSubjects = ['POSTGRES_MAJOR', 'PRIVILEGES', 'MIGRATIONS', 'SCHEMA_FINGERPRINT', 'CONFIG_BINDINGS', 'CONNECTION_BINDINGS', 'CURRENT_POINTER', 'SERVED_DIGEST'];
const subjects = [...(property(check, 'subject')?.enum ?? [])].sort();
if (subjects.join(',') !== [...admittedSubjects].sort().join(',')) throw new Error(`REL-08 conformance subjects drifted: ${subjects.join(',')}`);
assertOwnerIssuedState(check, 'state', 'Environment conformance check state');
for (const forbidden of ['execute', 'apply', 'migrate', 'force', 'repair', 'targetUrl', 'sql']) {
  if (conformance.properties?.[forbidden]) throw new Error(`REL-08 must not expose execution field ${forbidden}`);
}

console.log('Release schema closure passed (7 operations; immutable Release/Promotion CAS/serving/conformance boundaries closed).');
