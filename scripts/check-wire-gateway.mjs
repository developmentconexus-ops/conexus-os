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
    if (/^(Retry|Replay|Execute|Resume|Reconcile|Resolve|Mark|Set).*Effect/i.test(operationId)) {
      throw new Error(`${operationId} must remain Gateway owner/runtime mechanics, not a caller Product operation`);
    }
  }
}

const expected = {
  'GW-01': { method: 'GET', path: '/api/control/projects/{projectId}/effect-attempts' },
  'GW-02': { method: 'GET', path: '/api/control/projects/{projectId}/effect-attempts/{effectAttemptId}' }
};

for (const [id, shape] of Object.entries(expected)) {
  const value = operations.get(id);
  if (!value) throw new Error(`Gateway schema closure missing operation ${id}`);
  if (value.method !== shape.method || value.path !== shape.path) {
    throw new Error(`${id} method/path drifted: ${value.method} ${value.path}`);
  }
  if (value.operation['x-conexus-contract-state'] !== 'SCHEMA_CLOSED') throw new Error(`${id} is not SCHEMA_CLOSED`);
  if (value.operation['x-conexus-current-state-carrier'] !== 'NONE') throw new Error(`${id} must remain read-only with current-state carrier NONE`);
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
  for (const name of names) if (!set.has(name)) throw new Error(`${name} must be required`);
}

function property(schema, name) {
  return resolveSchema(resolveSchema(schema)?.properties?.[name]);
}

function rejectProperties(schema, label, names) {
  const props = resolveSchema(schema)?.properties ?? {};
  for (const name of names) if (props[name]) throw new Error(`${label} must not expose Gateway control/provider escape field ${name}`);
}

const controlEscapeFields = [
  'retry', 'retryable', 'replay', 'execute', 'resume', 'resolve', 'reconcile', 'markSucceeded', 'markFailed',
  'setOutcome', 'idempotencyKey', 'claimToken', 'resumeToken', 'providerCredential', 'credential',
  'rawRequest', 'rawResponse', 'providerRequest', 'providerResponse', 'requestPayload', 'responsePayload',
  'success', 'failed', 'overallSuccess'
];

// GW-01 is an audit/provenance list only. It admits one exact owner-coordinate filter, not a generic filter/sort DSL or effect control.
const listQuery = resolvedParameters('GW-01').filter((candidate) => candidate?.in === 'query');
const allowedListQuery = new Set(['pageToken', 'originatingRun']);
for (const candidate of listQuery) {
  if (!allowedListQuery.has(candidate.name)) throw new Error(`GW-01 must not invent query control/filter ${candidate.name}`);
}
const pageToken = parameter('GW-01', 'query', 'pageToken');
if (pageToken) {
  if (pageToken.required === true) throw new Error('GW-01 pageToken must be optional');
  const schema = resolveSchema(pageToken.schema);
  if (schema?.type !== 'string' || schema?.minLength !== 1) throw new Error('GW-01 pageToken must be an opaque non-empty string');
}

const originatingRun = parameter('GW-01', 'query', 'originatingRun');
if (!originatingRun) throw new Error('GW-01 must expose the exact originatingRun filter');
if (originatingRun.required === true) throw new Error('GW-01 originatingRun must remain optional');
if (originatingRun.style !== 'deepObject') throw new Error('GW-01 originatingRun must use deepObject query encoding');
if (originatingRun.explode !== true) throw new Error('GW-01 originatingRun must use explode=true');
const originatingRunSchema = assertClosedObject(originatingRun.schema, 'GW-01 originatingRun');
required(originatingRunSchema, 'kind', 'ref');
for (const name of ['kind', 'ref']) {
  const value = property(originatingRunSchema, name);
  if (value?.type !== 'string' || value?.minLength !== 1) throw new Error(`GW-01 originatingRun.${name} must be a non-empty string`);
}
for (const forbidden of ['originatingRunKind', 'originatingRunRef', 'status', 'provider', 'originatingOperationId', 'sort', 'filter']) {
  if (parameter('GW-01', 'query', forbidden)) throw new Error(`GW-01 must not expose query control ${forbidden}`);
}
if (!op('GW-01').responses?.['422']) throw new Error('GW-01 must reject incomplete originatingRun or incompatible pageToken shapes with 422');

const effectList = assertClosedObject(successSchema('GW-01'), 'GW-01 success');
required(effectList, 'items');
rejectProperties(effectList, 'GW-01 success', controlEscapeFields);
const items = property(effectList, 'items');
if (items?.type !== 'array' || !items.items) throw new Error('GW-01 items must be an array');
const summary = assertClosedObject(items.items, 'GW-01 EffectAttemptSummary');
required(summary, 'effectAttemptId', 'originatingOperationId', 'effectIdentity', 'outcome', 'attemptedAt');
rejectProperties(summary, 'GW-01 EffectAttemptSummary', controlEscapeFields);
const nextPageToken = property(effectList, 'nextPageToken');
if (nextPageToken && (nextPageToken.type !== 'string' || nextPageToken.minLength !== 1)) {
  throw new Error('GW-01 nextPageToken must be an opaque non-empty string when present');
}

// GW-02 exposes exact receipt/reconciliation/provenance, never mutation/retry authority or raw provider payloads.
const effectAttempt = assertClosedObject(successSchema('GW-02'), 'GW-02 success');
required(
  effectAttempt,
  'effectAttemptId',
  'projectId',
  'originatingOperationId',
  'effectIdentity',
  'effectSubjectDigest',
  'outcome',
  'attemptedAt',
  'evidenceRefs'
);
rejectProperties(effectAttempt, 'GW-02 EffectAttempt', controlEscapeFields);

const outcome = property(effectAttempt, 'outcome');
if (outcome?.type !== 'string' || outcome?.enum) throw new Error('GW-02 outcome must remain owner-issued rather than an invented universal enum');
if (!(outcome?.description ?? '').includes('OUTCOME_UNKNOWN')) {
  throw new Error('GW-02 outcome must explicitly preserve OUTCOME_UNKNOWN for ambiguous external acceptance');
}

const detailOriginatingRun = property(effectAttempt, 'originatingRun');
if (detailOriginatingRun) {
  const run = assertClosedObject(detailOriginatingRun, 'GW-02 originatingRun');
  required(run, 'kind', 'ref');
}

const receipt = property(effectAttempt, 'receipt');
if (receipt) {
  const safeReceipt = assertClosedObject(receipt, 'GW-02 receipt');
  required(safeReceipt, 'recordedAt', 'evidenceRefs');
  rejectProperties(safeReceipt, 'GW-02 receipt', controlEscapeFields);
}

const reconciliation = property(effectAttempt, 'reconciliation');
if (reconciliation) {
  const safeReconciliation = assertClosedObject(reconciliation, 'GW-02 reconciliation');
  required(safeReconciliation, 'state', 'observedAt', 'evidenceRefs');
  const state = property(safeReconciliation, 'state');
  if (state?.type !== 'string' || state?.enum) throw new Error('GW-02 reconciliation state must remain owner-issued');
  rejectProperties(safeReconciliation, 'GW-02 reconciliation', controlEscapeFields);
}

for (const id of ['GW-01', 'GW-02']) {
  if (parameter(id, 'header', 'If-Match')) throw new Error(`${id} must not use If-Match`);
  if (parameter(id, 'header', 'Idempotency-Key')) throw new Error(`${id} must not expose an idempotency mutation carrier`);
}

console.log('Gateway schema closure passed (2 operations; effect inspection/provenance only, OUTCOME_UNKNOWN preserved, no retry/reconciliation authority).');
