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

const expectedIds = Array.from({ length: 17 }, (_, i) => `BLD-${String(i + 1).padStart(2, '0')}`);
if (expectedIds.length !== 17) throw new Error('internal Builder gate setup error');

for (const id of expectedIds) {
  const entry = operations.get(id);
  if (!entry) throw new Error(`Builder schema closure missing operation ${id}`);
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
    if (!set.has(name)) throw new Error(`schema must require ${name}`);
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

// Change creation is bounded intent over the exact current Project/Baseline; no direct harness mechanics are caller input.
const createChange = assertClosedObject(requestSchema('BLD-03'), 'BLD-03 request');
required(createChange, 'intent');
for (const forbidden of ['workUnits', 'actorRuns', 'sandboxId', 'status', 'verified', 'accepted']) {
  if (createChange.properties?.[forbidden]) throw new Error(`BLD-03 must not expose owner/runtime mechanic ${forbidden}`);
}
if (!hasRequiredParameter('BLD-03', 'header', 'Idempotency-Key')) throw new Error('BLD-03 must require Idempotency-Key');

// F14: the exact authored Change intent remains human-recognizable on both collection and detail reads.
const changeSummary = assertClosedObject(resolveSchema(successSchema('BLD-01')?.items), 'BLD-01 item');
required(changeSummary, 'changeId', 'projectId', 'intent', 'state');
if (property(changeSummary, 'intent')?.type !== 'string' || (property(changeSummary, 'intent')?.minLength ?? 0) < 1) {
  throw new Error('BLD-01 ChangeSummary intent must remain a nonblank human semantic statement');
}

const change = assertClosedObject(successSchema('BLD-02'), 'BLD-02 success');
required(change, 'changeId', 'projectId', 'intent', 'baselineDigest', 'planningDepth', 'rigorProfile', 'state');
if (property(change, 'intent')?.type !== 'string' || (property(change, 'intent')?.minLength ?? 0) < 1) {
  throw new Error('BLD-02 Change intent must remain a nonblank human semantic statement');
}
exactEnum(property(change, 'planningDepth'), ['DIRECT', 'LIGHT', 'FULL'], 'Builder PlanningDepth');
exactEnum(property(change, 'rigorProfile'), ['FAST', 'BOUNDED', 'CONTROLLED'], 'Builder RigorProfile');

// Plan is a visual projection of owner truth; JSON Patch/state-machine control is not Product authority.
const plan = assertClosedObject(successSchema('BLD-04'), 'BLD-04 success');
required(plan, 'planRevision', 'planningDepth', 'rigorProfile', 'items', 'dependencyEdges', 'acceptanceLinks', 'blockers', 'unknowns', 'progress');
exactEnum(property(plan, 'planningDepth'), ['DIRECT', 'LIGHT', 'FULL'], 'Plan PlanningDepth');
exactEnum(property(plan, 'rigorProfile'), ['FAST', 'BOUNDED', 'CONTROLLED'], 'Plan RigorProfile');
for (const forbidden of ['jsonPatch', 'patch', 'setItemStatus', 'markVerified']) {
  if (plan.properties?.[forbidden]) throw new Error(`BLD-04 must not expose plan control field ${forbidden}`);
}

const planDecision = assertClosedObject(requestSchema('BLD-05'), 'BLD-05 request');
required(planDecision, 'planRevision', 'decision');
exactEnum(property(planDecision, 'decision'), ['APPROVE', 'REJECT'], 'BLD-05 decision');
if (planDecision.properties?.itemStatus || planDecision.properties?.workUnitState) {
  throw new Error('BLD-05 must decide the exact Plan checkpoint, not mutate checklist state');
}

const progress = assertClosedObject(successSchema('BLD-06'), 'BLD-06 success');
required(progress, 'planRevision', 'items', 'overallState');

// Source is read-only and exact-revision pinned. A path is required only for file detail.
for (const id of ['BLD-08', 'BLD-09']) {
  if (!hasRequiredParameter(id, 'query', 'sourceRevision')) throw new Error(`${id} must require sourceRevision`);
  if (op(id).requestBody) throw new Error(`${id} source read must not have a request body`);
}
if (!hasRequiredParameter('BLD-09', 'query', 'path')) throw new Error('BLD-09 must require source path');
const sourceFile = assertClosedObject(successSchema('BLD-09'), 'BLD-09 success');
required(sourceFile, 'sourceRevision', 'path', 'content');
for (const forbidden of ['writeToken', 'commit', 'push', 'applyPatch']) {
  if (sourceFile.properties?.[forbidden]) throw new Error(`BLD-09 must remain read-only; forbidden ${forbidden}`);
}

// Diff binds exact lineage rather than an unpinned mutable workspace.
const diff = assertClosedObject(successSchema('BLD-07'), 'BLD-07 success');
required(diff, 'baseSourceRevision', 'candidateSourceRevision', 'patch');

// Preview readiness, verification and production serving are distinct truths.
const preview = assertClosedObject(successSchema('BLD-10'), 'BLD-10 success');
required(preview, 'previewId', 'candidateDigest', 'ready', 'verified', 'live');
if (property(preview, 'live')?.const !== false) throw new Error('BLD-10 preview live must be const false');
if (property(preview, 'ready')?.type !== 'boolean' || property(preview, 'verified')?.type !== 'boolean') {
  throw new Error('BLD-10 ready and verified must remain independent booleans');
}

// Finding closure consumes exact current Finding revision plus actual Evidence; it never accepts a generic status write.
// 4B intentionally does not invent a Finding lifecycle enum that current Product authority has not ratified.
const finding = assertClosedObject(successSchema('BLD-12'), 'BLD-12 success');
required(finding, 'findingId', 'changeId', 'findingRevision', 'state', 'summary');
const findingState = property(finding, 'state');
if (findingState?.type !== 'string' || findingState?.enum) {
  throw new Error('Finding state must remain an owner-issued string until Product authority closes a lifecycle vocabulary');
}
const closeFinding = assertClosedObject(requestSchema('BLD-13'), 'BLD-13 request');
required(closeFinding, 'expectedFindingRevision', 'resolutionEvidenceIds');
if (closeFinding.properties?.status || closeFinding.properties?.resolved) {
  throw new Error('BLD-13 must not accept generic status/resolved mutation fields');
}
if ((property(closeFinding, 'resolutionEvidenceIds')?.minItems ?? 0) < 1) throw new Error('BLD-13 must require at least one resolution Evidence id');

// Evidence is actual proof with subject binding and provenance, not a green badge or narration flag.
const evidence = assertClosedObject(successSchema('BLD-15'), 'BLD-15 success');
required(evidence, 'evidenceId', 'changeId', 'claim', 'subjectDigest', 'provenance');
for (const forbidden of ['green', 'agentSaysPassed', 'telemetryEqualsTruth']) {
  if (evidence.properties?.[forbidden]) throw new Error(`BLD-15 must not encode fake Evidence field ${forbidden}`);
}

// F14: contextual Builder assistance may narrow to one exact current Change without widening authority.
const assistantRequest = assertClosedObject(requestSchema('BLD-16'), 'BLD-16 request');
required(assistantRequest, 'question');
if (!assistantRequest.properties?.changeId) throw new Error('BLD-16 must admit optional exact changeId context');
if ((assistantRequest.required ?? []).includes('changeId')) throw new Error('BLD-16 changeId must remain optional for Project-level assistance');
if (property(assistantRequest, 'changeId')?.type !== 'string' || (property(assistantRequest, 'changeId')?.minLength ?? 0) < 1) {
  throw new Error('BLD-16 changeId must be a nonblank untrusted exact Change reference');
}
for (const forbidden of ['permission', 'grant', 'toolAuthority', 'credential', 'systemPrompt', 'sourceRevision', 'findingId', 'evidenceId']) {
  if (assistantRequest.properties?.[forbidden]) throw new Error(`BLD-16 must not accept authority-bearing or cross-permission ${forbidden}`);
}
const assistantResponse = assertClosedObject(successSchema('BLD-16'), 'BLD-16 success');
required(assistantResponse, 'answer', 'provenanceRefs');

// Execution detail may project subordinate owner facts, but cannot expose runtime-control operations or credentials.
const execution = assertClosedObject(successSchema('BLD-17'), 'BLD-17 success');
required(execution, 'changeId', 'workUnits', 'actorRuns');
for (const forbidden of ['resumeSandbox', 'markVerified', 'setWorkItemStatus', 'createActorRun', 'credential', 'token']) {
  if (execution.properties?.[forbidden]) throw new Error(`BLD-17 must not expose runtime-control field ${forbidden}`);
}
const actorRun = resolveSchema(property(execution, 'actorRuns')?.items);
if (actorRun) {
  required(actorRun, 'actorRunId', 'state', 'lineageDisposition');
  exactEnum(property(actorRun, 'lineageDisposition'), ['FRESH_BASE', 'CONTINUE_LINEAGE'], 'ActorRun lineageDisposition');
}

console.log('Builder schema closure passed (17 operations; F14 Change intent/context + Plan/Evidence/source/preview authority remain owner-truthful).');
