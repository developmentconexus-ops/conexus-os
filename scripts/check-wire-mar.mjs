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
    if (/^(CreateCron|ReplayMissedSlots|ForceRedelivery|MarkJobSucceeded|RetryJob|ReplayJob|RedeliverJob|CreateWorkflow|ExecuteWorkflow|RunWorkflow)$/i.test(operationId)) {
      throw new Error(`${operationId} must remain MAR/runtime mechanics, not a caller Product operation`);
    }
  }
}

const expected = {
  'MAR-04': { method: 'GET', path: '/api/control/projects/{projectId}/managed-jobs', carrier: 'NONE' },
  'MAR-01': { method: 'GET', path: '/api/control/projects/{projectId}/job-runs', carrier: 'NONE' },
  'MAR-02': { method: 'GET', path: '/api/control/projects/{projectId}/job-runs/{jobRunId}', carrier: 'NONE' },
  'MAR-03': { method: 'POST', path: '/api/control/projects/{projectId}/jobs/{jobId}/runs', carrier: 'IDEMPOTENCY_KEY' }
};

for (const [id, shape] of Object.entries(expected)) {
  const value = operations.get(id);
  if (!value) throw new Error(`MAR schema closure missing operation ${id}`);
  if (value.method !== shape.method || value.path !== shape.path) {
    throw new Error(`${id} method/path drifted: ${value.method} ${value.path}`);
  }
  if (value.operation['x-conexus-contract-state'] !== 'SCHEMA_CLOSED') throw new Error(`${id} is not SCHEMA_CLOSED`);
  if (value.operation['x-conexus-current-state-carrier'] !== shape.carrier) {
    throw new Error(`${id} current-state carrier must remain ${shape.carrier}`);
  }
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

function assertOpaqueString(schema, label) {
  const resolved = resolveSchema(schema);
  if (!resolved || resolved.type !== 'string' || resolved.minLength !== 1) {
    throw new Error(`${label} must be an opaque non-empty string`);
  }
}

function rejectProperties(schema, label, names) {
  const props = resolveSchema(schema)?.properties ?? {};
  for (const name of names) if (props[name]) throw new Error(`${label} must not expose MAR runtime/queue control field ${name}`);
}

const runtimeEscapeFields = [
  'queueId', 'queueJobId', 'pgBossJobId', 'workerId', 'claimToken', 'leaseToken', 'resumeToken',
  'retry', 'retryCount', 'retryAt', 'redelivery', 'redeliveryCount', 'forceRedelivery',
  'cron', 'scheduleId', 'scheduler', 'heartbeat', 'lockToken', 'coalesceKey', 'missedSlots',
  'catchUpSlots', 'markSucceeded', 'markFailed', 'setStatus', 'providerPayload', 'rawPayload'
];

// 4C-F33 / MAR-04 exposes safe runnable-job discovery from the exact currently served Release.
if (resolvedParameters('MAR-04').some((candidate) => candidate?.in === 'query')) throw new Error('MAR-04 must not accept caller Release/job discovery overrides');
if (op('MAR-04').requestBody) throw new Error('MAR-04 must not accept a request body');
const catalog = assertClosedObject(successSchema('MAR-04'), 'MAR-04 success');
required(catalog, 'projectId', 'catalogState', 'items');
rejectProperties(catalog, 'MAR-04 RunnableManagedJobCatalog', runtimeEscapeFields);
const catalogStates = property(catalog, 'catalogState')?.enum ?? [];
if (catalogStates.join(',') !== 'AVAILABLE,NO_SERVED_RELEASE') throw new Error('MAR-04 catalogState must distinguish AVAILABLE from NO_SERVED_RELEASE');
const catalogItems = property(catalog, 'items');
if (catalogItems?.type !== 'array' || !catalogItems.items) throw new Error('MAR-04 items must be an array');
const runnableJob = assertClosedObject(catalogItems.items, 'MAR-04 RunnableManagedJobSummary');
required(runnableJob, 'jobId', 'name', 'purpose');
for (const name of ['jobId', 'name', 'purpose']) assertOpaqueString(property(runnableJob, name), `MAR-04 ${name}`);
rejectProperties(runnableJob, 'MAR-04 RunnableManagedJobSummary', runtimeEscapeFields);
for (const forbidden of ['runNowEligible', 'canRun', 'currentPermission', 'releaseSelector']) {
  if (runnableJob.properties?.[forbidden]) throw new Error(`MAR-04 must not project browser authority field ${forbidden}`);
}

// MAR-01 exposes only exact Release/job filters plus the shared opaque continuation token.
const listQuery = resolvedParameters('MAR-01').filter((candidate) => candidate?.in === 'query');
const allowedListQuery = new Set(['releaseId', 'jobId', 'pageToken']);
for (const candidate of listQuery) {
  if (!allowedListQuery.has(candidate.name)) throw new Error(`MAR-01 must not invent query filter/control ${candidate.name}`);
}
for (const name of ['releaseId', 'jobId']) {
  const candidate = parameter('MAR-01', 'query', name);
  if (!candidate) throw new Error(`MAR-01 must expose the accepted ${name} filter`);
  if (candidate.required === true) throw new Error(`MAR-01 ${name} filter must remain optional`);
  assertOpaqueString(candidate.schema, `MAR-01 ${name}`);
}
const pageToken = parameter('MAR-01', 'query', 'pageToken');
if (pageToken) {
  if (pageToken.required === true) throw new Error('MAR-01 pageToken must remain optional');
  assertOpaqueString(pageToken.schema, 'MAR-01 pageToken');
}
if (op('MAR-01').requestBody) throw new Error('MAR-01 must not accept a request body');

const list = assertClosedObject(successSchema('MAR-01'), 'MAR-01 success');
required(list, 'items');
rejectProperties(list, 'MAR-01 success', runtimeEscapeFields);
const items = property(list, 'items');
if (items?.type !== 'array' || !items.items) throw new Error('MAR-01 items must be an array');
const summary = assertClosedObject(items.items, 'MAR-01 ManagedJobRunSummary');
required(summary, 'jobRunId', 'releaseId', 'jobId', 'state', 'admittedAt');
rejectProperties(summary, 'MAR-01 ManagedJobRunSummary', runtimeEscapeFields);
const summaryState = property(summary, 'state');
if (summaryState?.type !== 'string' || summaryState?.enum) throw new Error('MAR-01 state must remain owner-issued rather than an invented lifecycle enum');
const nextPageToken = property(list, 'nextPageToken');
if (nextPageToken) assertOpaqueString(nextPageToken, 'MAR-01 nextPageToken');

// MAR-02 exposes durable JobRun owner truth/provenance, not queue mechanics or a worker control surface.
if (resolvedParameters('MAR-02').some((candidate) => candidate?.in === 'query')) throw new Error('MAR-02 must not invent query controls');
if (op('MAR-02').requestBody) throw new Error('MAR-02 must not accept a request body');
const detail = assertClosedObject(successSchema('MAR-02'), 'MAR-02 success');
required(detail, 'jobRunId', 'projectId', 'releaseId', 'jobId', 'state', 'admittedAt', 'evidenceRefs');
rejectProperties(detail, 'MAR-02 ManagedJobRun', runtimeEscapeFields);
const detailState = property(detail, 'state');
if (detailState?.type !== 'string' || detailState?.enum) throw new Error('MAR-02 state must remain owner-issued rather than an invented lifecycle enum');
const evidenceRefs = property(detail, 'evidenceRefs');
if (evidenceRefs?.type !== 'array' || !evidenceRefs.items) throw new Error('MAR-02 evidenceRefs must be an array');
assertOpaqueString(evidenceRefs.items, 'MAR-02 evidenceRefs item');

// MAR-03 asks for one manual occurrence. The server resolves the current served Release and admitted job/v1.
if (op('MAR-03').requestBody) throw new Error('MAR-03 must not accept caller job payload or Release/runtime overrides');
const runNowQuery = resolvedParameters('MAR-03').filter((candidate) => candidate?.in === 'query');
if (runNowQuery.length) throw new Error(`MAR-03 must not accept query overrides: ${runNowQuery.map((x) => x.name).join(',')}`);
const idempotency = parameter('MAR-03', 'header', 'Idempotency-Key');
if (!idempotency || idempotency.required !== true) throw new Error('MAR-03 must require Idempotency-Key for repeatable occurrence intake');
if (parameter('MAR-03', 'header', 'If-Match')) throw new Error('MAR-03 must not use If-Match');
if (!op('MAR-03').responses?.['409']) throw new Error('MAR-03 must preserve a 409-class current single-flight/coalesce conflict');
const admission = assertClosedObject(successSchema('MAR-03', '202'), 'MAR-03 202 admission');
required(admission, 'jobRunId', 'projectId', 'releaseId', 'jobId', 'state', 'admittedAt');
rejectProperties(admission, 'MAR-03 JobRunAdmission', runtimeEscapeFields);
const admissionState = property(admission, 'state');
if (admissionState?.type !== 'string' || admissionState?.enum) throw new Error('MAR-03 state must remain owner-issued rather than an invented lifecycle enum');

for (const forbidden of ['releaseId', 'environmentId', 'queueId', 'scheduleId', 'runAt', 'force', 'retry', 'catchUp']) {
  if (parameter('MAR-03', 'header', forbidden) || parameter('MAR-03', 'query', forbidden)) {
    throw new Error(`MAR-03 caller must not select runtime/Release control ${forbidden}`);
  }
}

console.log('Managed Application Runtime schema closure passed (4 operations; runnable-job discovery, JobRun owner truth and run-now admission closed without queue/scheduler authority).');
