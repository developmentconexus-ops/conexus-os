import fs from 'node:fs';

const oas = JSON.parse(fs.readFileSync('/tmp/conexus-product-openapi.bundle.json', 'utf8'));
const methods = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);
const operations = new Map();

for (const [path, pathItem] of Object.entries(oas.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem ?? {})) {
    if (!methods.has(method)) continue;
    const id = operation?.['x-conexus-4a-id'];
    if (id) operations.set(id, { path, method: method.toUpperCase(), operation, pathItem });

    const operationId = operation?.operationId ?? '';
    if (/^(Create|Update|Patch|Delete|Set|Mark|Resolve|Retry|Replay|Complete|Authorize).*(Audit|Observation|Telemetry)/i.test(operationId)) {
      throw new Error(`${operationId} must not create telemetry/audit mutation or owner-state authority`);
    }
  }
}

const expected = {
  'OBS-01': { method: 'GET', path: '/api/control/projects/{projectId}/activity' },
  'OBS-02': { method: 'GET', path: '/api/control/projects/{projectId}/execution-observations/{observationId}' },
  'OBS-03': { method: 'GET', path: '/api/control/projects/{projectId}/usage-cost-summary' },
  'OBS-04': { method: 'GET', path: '/api/control/workspaces/{workspaceId}/audit-records' },
  'OBS-05': { method: 'GET', path: '/api/control/workspaces/{workspaceId}/audit-records/{auditRecordId}' }
};

for (const [id, shape] of Object.entries(expected)) {
  const value = operations.get(id);
  if (!value) throw new Error(`Observability schema closure missing operation ${id}`);
  if (value.method !== shape.method || value.path !== shape.path) {
    throw new Error(`${id} method/path drifted: ${value.method} ${value.path}`);
  }
  if (value.operation['x-conexus-contract-state'] !== 'SCHEMA_CLOSED') throw new Error(`${id} is not SCHEMA_CLOSED`);
  if (value.operation['x-conexus-current-state-carrier'] !== 'NONE') throw new Error(`${id} must remain IC0/read-only with carrier NONE`);
  if (value.operation.requestBody) throw new Error(`${id} must not accept a request body`);
  for (const response of Object.values(value.operation.responses ?? {})) {
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
  return resolvedParameters(id).find((candidate) => candidate?.in === where && candidate?.name === name);
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
  for (const name of names) if (!set.has(name)) throw new Error(`${labelFor(schema)}: ${name} must be required`);
}

function labelFor() {
  return 'schema';
}

function property(schema, name) {
  return resolveSchema(resolveSchema(schema)?.properties?.[name]);
}

function assertOpaqueString(schema, label) {
  const resolved = resolveSchema(schema);
  if (!resolved || resolved.type !== 'string' || resolved.minLength !== 1) {
    throw new Error(`${label} must be an opaque non-empty string`);
  }
}

function assertNonblankHumanString(schema, label) {
  const resolved = resolveSchema(schema);
  if (!resolved || resolved.type !== 'string' || resolved.minLength !== 1 || typeof resolved.pattern !== 'string') {
    throw new Error(`${label} must be an explicit non-blank human string`);
  }
}

function assertStringEnum(schema, label, exact) {
  const resolved = resolveSchema(schema);
  const actual = [...(resolved?.enum ?? [])].sort();
  const expectedValues = [...exact].sort();
  if (resolved?.type !== 'string' || JSON.stringify(actual) !== JSON.stringify(expectedValues)) {
    throw new Error(`${label} enum drifted: ${JSON.stringify(actual)}`);
  }
}

function assertStringArray(schema, label) {
  const resolved = resolveSchema(schema);
  if (resolved?.type !== 'array' || !resolved.items) throw new Error(`${label} must be an array`);
  assertOpaqueString(resolved.items, `${label} item`);
}

function rejectProperties(schema, label, names) {
  const props = resolveSchema(schema)?.properties ?? {};
  for (const name of names) if (props[name]) throw new Error(`${label} must not expose telemetry-to-owner authority field ${name}`);
}

const authorityEscapeFields = [
  'currentState', 'ownerState', 'authoritativeState', 'setState', 'setStatus', 'markCompleted', 'markSucceeded', 'markFailed',
  'retry', 'replay', 'resolve', 'authorize', 'grant', 'revoke', 'permission', 'permissions',
  'credential', 'credentials', 'secret', 'rawProviderPayload', 'providerPayload', 'rawRequest', 'rawResponse',
  'claimToken', 'leaseToken', 'resumeToken'
];

const producerTrust = ['HUB_AUTHORITY', 'GATEWAY_AUTHORITY', 'PROVIDER_OBSERVED', 'GUEST_OBSERVED'];
const usageStates = ['REPORTED', 'INFERRED', 'MISSING'];
const calculationStates = ['CALCULATED', 'MISSING_USAGE', 'MISSING_PRICE', 'UNSUPPORTED'];
const reconciliationStates = ['NOT_AVAILABLE', 'PENDING', 'MATCHED', 'MISMATCH', 'ADJUSTED'];

// Shared owner-reference shape: observations point to owner truth; they never replace it.
function assertOwnerSubject(schema, label) {
  const subject = assertClosedObject(schema, label);
  required(subject, 'kind', 'ref');
  const kind = property(subject, 'kind');
  if (kind?.type !== 'string' || kind?.enum || kind?.minLength !== 1) {
    throw new Error(`${label}.kind must remain an owner-issued typed kind, not a universal telemetry lifecycle enum`);
  }
  assertOpaqueString(property(subject, 'ref'), `${label}.ref`);
  if (subject.properties?.label) throw new Error(`${label} must not inherit AuditSubjectSnapshotRef presentation`);
  rejectProperties(subject, label, authorityEscapeFields);
  return subject;
}

// 4C-F12: immutable audit facts use a dedicated append-time presentation snapshot rather than widening OwnerSubjectRef.
function assertAuditSubjectSnapshot(schema, label) {
  const subject = assertClosedObject(schema, label);
  required(subject, 'kind', 'ref', 'label');
  const kind = property(subject, 'kind');
  if (kind?.type !== 'string' || kind?.enum || kind?.minLength !== 1) {
    throw new Error(`${label}.kind must remain exact owner-issued subject class`);
  }
  assertOpaqueString(property(subject, 'ref'), `${label}.ref`);
  assertNonblankHumanString(property(subject, 'label'), `${label}.label`);
  const labelDescription = subject.properties?.label?.description ?? '';
  if (!labelDescription.includes('append-time')) throw new Error(`${label}.label must be immutable append-time presentation Evidence`);
  rejectProperties(subject, label, authorityEscapeFields);
  return subject;
}

// OBS-01: one bounded Project activity projection, not a generic event query language.
const activityQuery = resolvedParameters('OBS-01').filter((candidate) => candidate?.in === 'query');
for (const candidate of activityQuery) {
  if (candidate.name !== 'pageToken') throw new Error(`OBS-01 must not invent activity filter/query control ${candidate.name}`);
}
const activityPageToken = parameter('OBS-01', 'query', 'pageToken');
if (activityPageToken) {
  if (activityPageToken.required === true) throw new Error('OBS-01 pageToken must remain optional');
  assertOpaqueString(activityPageToken.schema, 'OBS-01 pageToken');
}
const activityPage = assertClosedObject(successSchema('OBS-01'), 'OBS-01 success');
required(activityPage, 'items');
rejectProperties(activityPage, 'OBS-01 success', authorityEscapeFields);
const activityItems = property(activityPage, 'items');
if (activityItems?.type !== 'array' || !activityItems.items) throw new Error('OBS-01 items must be an array');
const activity = assertClosedObject(activityItems.items, 'OBS-01 ProjectActivityEntry');
required(activity, 'activityId', 'subject', 'kind', 'occurredAt');
assertOpaqueString(property(activity, 'activityId'), 'OBS-01 activityId');
assertOwnerSubject(property(activity, 'subject'), 'OBS-01 subject');
const activityKind = property(activity, 'kind');
if (activityKind?.type !== 'string' || activityKind?.enum || activityKind?.minLength !== 1) {
  throw new Error('OBS-01 kind must remain owner-issued rather than a universal event-state enum');
}
rejectProperties(activity, 'OBS-01 ProjectActivityEntry', authorityEscapeFields);
const activityNext = property(activityPage, 'nextPageToken');
if (activityNext) assertOpaqueString(activityNext, 'OBS-01 nextPageToken');

// OBS-02: technical observation detail stays subordinate to an exact owner execution subject.
if (resolvedParameters('OBS-02').some((candidate) => candidate?.in === 'query')) throw new Error('OBS-02 must not invent query controls');
const observation = assertClosedObject(successSchema('OBS-02'), 'OBS-02 success');
required(observation, 'observationId', 'projectId', 'subject', 'producerTrust', 'observedAt', 'evidenceRefs');
assertOpaqueString(property(observation, 'observationId'), 'OBS-02 observationId');
assertOpaqueString(property(observation, 'projectId'), 'OBS-02 projectId');
assertOwnerSubject(property(observation, 'subject'), 'OBS-02 subject');
assertStringEnum(property(observation, 'producerTrust'), 'OBS-02 producerTrust', producerTrust);
assertStringArray(property(observation, 'evidenceRefs'), 'OBS-02 evidenceRefs');
const traceRefs = property(observation, 'traceRefs');
if (traceRefs) assertStringArray(traceRefs, 'OBS-02 traceRefs');
const durationMs = property(observation, 'durationMs');
if (durationMs && (durationMs.type !== 'integer' || durationMs.minimum !== 0)) throw new Error('OBS-02 durationMs must be a non-negative integer when present');
rejectProperties(observation, 'OBS-02 ExecutionObservationDetail', authorityEscapeFields);

// OBS-03: exact requested period; missing usage/cost is represented as missing, never fabricated zero.
const costQuery = resolvedParameters('OBS-03').filter((candidate) => candidate?.in === 'query');
const allowedCostQuery = new Set(['from', 'to']);
for (const candidate of costQuery) {
  if (!allowedCostQuery.has(candidate.name)) throw new Error(`OBS-03 must not invent usage/cost query control ${candidate.name}`);
}
for (const name of ['from', 'to']) {
  const candidate = parameter('OBS-03', 'query', name);
  if (!candidate || candidate.required !== true) throw new Error(`OBS-03 must require exact ${name} period coordinate`);
  const schema = resolveSchema(candidate.schema);
  if (schema?.type !== 'string' || schema?.format !== 'date-time') throw new Error(`OBS-03 ${name} must be RFC3339 date-time`);
}
const usageSummary = assertClosedObject(successSchema('OBS-03'), 'OBS-03 success');
required(usageSummary, 'projectId', 'period', 'usageState', 'calculationState', 'reconciliationState', 'evidenceRefs');
assertOpaqueString(property(usageSummary, 'projectId'), 'OBS-03 projectId');
assertStringEnum(property(usageSummary, 'usageState'), 'OBS-03 usageState', usageStates);
assertStringEnum(property(usageSummary, 'calculationState'), 'OBS-03 calculationState', calculationStates);
assertStringEnum(property(usageSummary, 'reconciliationState'), 'OBS-03 reconciliationState', reconciliationStates);
assertStringArray(property(usageSummary, 'evidenceRefs'), 'OBS-03 evidenceRefs');
const period = assertClosedObject(property(usageSummary, 'period'), 'OBS-03 period');
required(period, 'from', 'to');
for (const name of ['from', 'to']) {
  const coordinate = property(period, name);
  if (coordinate?.type !== 'string' || coordinate?.format !== 'date-time') throw new Error(`OBS-03 period.${name} must be date-time`);
}

const usage = property(usageSummary, 'usage');
if (usage) {
  const safeUsage = assertClosedObject(usage, 'OBS-03 usage');
  for (const name of ['inputTokens', 'outputTokens', 'cacheTokens', 'reasoningTokens']) {
    const value = property(safeUsage, name);
    if (value && (value.type !== 'integer' || value.minimum !== 0 || Object.hasOwn(value, 'default'))) {
      throw new Error(`OBS-03 ${name} must be an optional non-negative observed count with no fabricated default`);
    }
  }
}

const costs = property(usageSummary, 'cost');
if (costs) {
  const safeCost = assertClosedObject(costs, 'OBS-03 cost');
  for (const name of ['calculatedUsd', 'providerReportedUsd', 'reconciledUsd', 'sandboxUsd']) {
    const value = property(safeCost, name);
    if (value) {
      if (value.type !== 'string' || !value.pattern || Object.hasOwn(value, 'default')) {
        throw new Error(`OBS-03 ${name} must be an optional exact decimal string with no fabricated default`);
      }
    }
  }
}
rejectProperties(usageSummary, 'OBS-03 ProjectUsageCostSummary', authorityEscapeFields);
if (!(usageSummary.description ?? '').includes('missing != zero')) {
  throw new Error('OBS-03 schema must explicitly preserve missing != zero semantics');
}

// 4C-F12 / OBS-04: server-side human investigation over the admitted audit set; filters apply before pagination.
const auditListQuery = resolvedParameters('OBS-04').filter((candidate) => candidate?.in === 'query');
const allowedAuditQuery = new Set(['from', 'to', 'actorQuery', 'actionQuery', 'projectId', 'pageToken']);
for (const candidate of auditListQuery) {
  if (!allowedAuditQuery.has(candidate.name)) throw new Error(`OBS-04 must not invent audit query language ${candidate.name}`);
  if (candidate.required === true) throw new Error(`OBS-04 filter ${candidate.name} must remain optional`);
}
for (const name of ['from', 'to']) {
  const candidate = parameter('OBS-04', 'query', name);
  if (!candidate) throw new Error(`OBS-04 must admit optional ${name} period filter`);
  const schema = resolveSchema(candidate.schema);
  if (schema?.type !== 'string' || schema?.format !== 'date-time') throw new Error(`OBS-04 ${name} must be RFC3339 date-time`);
}
for (const name of ['actorQuery', 'actionQuery', 'projectId', 'pageToken']) {
  const candidate = parameter('OBS-04', 'query', name);
  if (!candidate) throw new Error(`OBS-04 must admit optional ${name}`);
  assertOpaqueString(candidate.schema, `OBS-04 ${name}`);
}
const auditTokenDescription = parameter('OBS-04', 'query', 'pageToken')?.description ?? '';
const auditResponseDescription = op('OBS-04').responses?.['200']?.description ?? '';
if (!auditTokenDescription.includes('before pagination') && !auditResponseDescription.includes('before pagination')) {
  throw new Error('OBS-04 must state that admitted filters are applied before pagination');
}

const auditPage = assertClosedObject(successSchema('OBS-04'), 'OBS-04 success');
required(auditPage, 'items');
const auditItems = property(auditPage, 'items');
if (auditItems?.type !== 'array' || !auditItems.items) throw new Error('OBS-04 items must be an array');
const auditSummary = assertClosedObject(auditItems.items, 'OBS-04 AuditRecordSummary');
required(auditSummary, 'auditRecordId', 'workspaceId', 'actor', 'action', 'subject', 'occurredAt', 'summary');
assertOpaqueString(property(auditSummary, 'auditRecordId'), 'OBS-04 auditRecordId');
assertOpaqueString(property(auditSummary, 'workspaceId'), 'OBS-04 workspaceId');
assertAuditSubjectSnapshot(property(auditSummary, 'actor'), 'OBS-04 actor AuditSubjectSnapshotRef');
assertAuditSubjectSnapshot(property(auditSummary, 'subject'), 'OBS-04 subject AuditSubjectSnapshotRef');
const auditAction = property(auditSummary, 'action');
if (auditAction?.type !== 'string' || auditAction?.enum || auditAction?.minLength !== 1) {
  throw new Error('OBS-04 action must remain owner-issued rather than a universal audit action enum');
}
assertNonblankHumanString(property(auditSummary, 'summary'), 'OBS-04 summary');
rejectProperties(auditSummary, 'OBS-04 AuditRecordSummary', authorityEscapeFields);
const auditNext = property(auditPage, 'nextPageToken');
if (auditNext) assertOpaqueString(auditNext, 'OBS-04 nextPageToken');

// 4C-F12 / OBS-05: exact immutable audit fact retains append-time human snapshot + Evidence and no correction authority.
if (resolvedParameters('OBS-05').some((candidate) => candidate?.in === 'query')) throw new Error('OBS-05 must not invent query controls');
const audit = assertClosedObject(successSchema('OBS-05'), 'OBS-05 success');
required(audit, 'auditRecordId', 'workspaceId', 'actor', 'action', 'subject', 'occurredAt', 'summary', 'evidenceRefs');
assertOpaqueString(property(audit, 'auditRecordId'), 'OBS-05 auditRecordId');
assertOpaqueString(property(audit, 'workspaceId'), 'OBS-05 workspaceId');
assertAuditSubjectSnapshot(property(audit, 'actor'), 'OBS-05 actor AuditSubjectSnapshotRef');
assertAuditSubjectSnapshot(property(audit, 'subject'), 'OBS-05 subject AuditSubjectSnapshotRef');
assertStringArray(property(audit, 'evidenceRefs'), 'OBS-05 evidenceRefs');
assertNonblankHumanString(property(audit, 'summary'), 'OBS-05 summary');
const auditDetailAction = property(audit, 'action');
if (auditDetailAction?.type !== 'string' || auditDetailAction?.enum || auditDetailAction?.minLength !== 1) {
  throw new Error('OBS-05 action must remain owner-issued rather than a universal audit action enum');
}
rejectProperties(audit, 'OBS-05 AuditRecord', authorityEscapeFields);

for (const id of Object.keys(expected)) {
  if (parameter(id, 'header', 'If-Match')) throw new Error(`${id} must not use If-Match`);
  if (parameter(id, 'header', 'Idempotency-Key')) throw new Error(`${id} must not expose an idempotency mutation carrier`);
}

console.log('Observability & Audit schema closure passed (5 operations; F12 server-side filters before pagination + immutable AuditSubjectSnapshotRef presentation; no telemetry authority inflation).');
