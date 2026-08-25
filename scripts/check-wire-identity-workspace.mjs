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
  ...Array.from({ length: 15 }, (_, i) => `IAM-${String(i + 1).padStart(2, '0')}`).filter((id) => id !== 'IAM-16'),
  'IAM-17', 'IAM-18', 'IAM-19', 'IAM-20',
  'WS-01', 'WS-02', 'WS-04', 'WS-05'
];

if (expectedIds.length !== 23) throw new Error(`internal test setup error: expected 23 ids, got ${expectedIds.length}`);

for (const id of expectedIds) {
  const entry = operations.get(id);
  if (!entry) throw new Error(`IAM/Workspace schema closure missing operation ${id}`);
  if (entry.operation['x-conexus-contract-state'] !== 'SCHEMA_CLOSED') {
    throw new Error(`${id} is not SCHEMA_CLOSED`);
  }
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

function jsonRequestSchema(id) {
  return resolveSchema(op(id).requestBody?.content?.['application/json']?.schema);
}

function successSchema(id, status = '200') {
  return resolveSchema(op(id).responses?.[status]?.content?.['application/json']?.schema);
}

function resolvedParameters(id) {
  return (op(id).parameters ?? []).map(resolveLocalRef);
}

function hasRequiredParameter(id, where, name) {
  return resolvedParameters(id).some((p) => p?.in === where && p?.name === name && p?.required === true);
}

function assertClosedObject(schema, label) {
  const resolved = resolveSchema(schema);
  if (!resolved || resolved.type !== 'object' || resolved.additionalProperties !== false) {
    throw new Error(`${label} must be a closed object schema`);
  }
  return resolved;
}

function assertHumanName(schema, label) {
  const resolved = resolveSchema(schema);
  if (!resolved?.required?.includes('name')) throw new Error(`${label} must require name`);
  const name = resolveSchema(resolved.properties?.name);
  if (name?.type !== 'string' || (name.minLength ?? 0) < 1 || typeof name.pattern !== 'string') {
    throw new Error(`${label} name must be an explicit non-blank string schema`);
  }
  return name;
}

function assertAccountSummary(schema, label) {
  const resolved = assertClosedObject(schema, label);
  for (const field of ['accountId', 'displayName']) {
    if (!resolved.required?.includes(field)) throw new Error(`${label} must require ${field}`);
  }
  const displayName = resolveSchema(resolved.properties?.displayName);
  if (displayName?.type !== 'string' || (displayName.minLength ?? 0) < 1 || typeof displayName.pattern !== 'string') {
    throw new Error(`${label} displayName must be explicit non-blank human presentation`);
  }
  if (resolved.properties?.email?.format !== 'email') throw new Error(`${label} optional email must be format=email`);
  return resolved;
}

function assertAreaSummary(schema, label) {
  const resolved = assertClosedObject(schema, label);
  if (!resolved.required?.includes('areaId')) throw new Error(`${label} must require areaId`);
  assertHumanName(resolved, label);
  return resolved;
}

const provision = jsonRequestSchema('IAM-03');
if (!provision || provision.type !== 'object' || provision.additionalProperties !== false) {
  throw new Error('IAM-03 must have a closed object request schema');
}
for (const field of ['externalSubject', 'displayName']) {
  if (!provision.required?.includes(field)) throw new Error(`IAM-03 must require ${field}`);
}
if (provision.properties?.issuer) throw new Error('IAM-03 must not accept caller-selected issuer');
if (provision.properties?.email?.format !== 'email') throw new Error('IAM-03 optional email must be format=email');
if (!hasRequiredParameter('IAM-03', 'header', 'Idempotency-Key')) throw new Error('IAM-03 must require Idempotency-Key');
assertAccountSummary(successSchema('IAM-03', '201'), 'IAM-03 success AccountSummary');

const workspaceMembers = assertClosedObject(successSchema('IAM-04'), 'IAM-04 success');
assertAccountSummary(workspaceMembers.properties?.items?.items, 'IAM-04 member AccountSummary');

// 4C-F11: ListWorkspaceMembershipCandidates is the human lookup read for IAM-05; listing never creates membership.
const candidatePage = assertClosedObject(successSchema('IAM-18'), 'IAM-18 success');
assertAccountSummary(candidatePage.properties?.items?.items, 'IAM-18 candidate AccountSummary');
const membershipCandidateQuery = resolvedParameters('IAM-18').find((p) => p?.in === 'query' && p?.name === 'query');
if (!membershipCandidateQuery) throw new Error('ListWorkspaceMembershipCandidates must admit optional human query');

// 4C-F11: GetWorkspaceMemberAccess must keep effective-access derivation at I&A and preserve all DIRECT/AREA sources.
const memberAccess = assertClosedObject(successSchema('IAM-19'), 'IAM-19 WorkspaceMemberAccess');
assertAccountSummary(memberAccess.properties?.account, 'IAM-19 account');
const effectiveItem = assertClosedObject(memberAccess.properties?.effectiveProjects?.items, 'IAM-19 effective Project item');
const sourceItem = resolveSchema(effectiveItem.properties?.sources?.items);
const sourceVariants = sourceItem?.oneOf ?? [];
const sourceKinds = sourceVariants.map((variant) => resolveSchema(variant)?.properties?.kind?.const).filter(Boolean).sort();
if (sourceKinds.join(',') !== 'AREA,DIRECT') {
  throw new Error(`GetWorkspaceMemberAccess source vocabulary must be exactly DIRECT/AREA; got ${sourceKinds.join(',')}`);
}
if ((effectiveItem.properties?.sources?.minItems ?? 0) < 1) throw new Error('IAM-19 effective Project access must preserve at least one exact source');

// 4C-F11: GetAreaAccess exposes current Area members and Project summaries without conferring Project content authority.
const areaAccess = assertClosedObject(successSchema('IAM-20'), 'IAM-20 AreaAccess');
assertAreaSummary(areaAccess.properties?.area, 'IAM-20 area');
assertAccountSummary(areaAccess.properties?.members?.items, 'IAM-20 member AccountSummary');
if (!resolveSchema(areaAccess.properties?.projects?.items)?.required?.includes('projectId')) {
  throw new Error('IAM-20 Project summaries must carry exact projectId');
}

const setAccess = jsonRequestSchema('IAM-15');
if (!setAccess || setAccess.additionalProperties !== false) throw new Error('IAM-15 must have a closed request schema');
if (!setAccess.required?.includes('role') || !setAccess.required?.includes('expectedCurrent')) {
  throw new Error('IAM-15 must require desired role and explicit expected current state');
}
const roles = setAccess.properties?.role?.enum ?? [];
if (roles.length !== 2 || !roles.includes('admin') || !roles.includes('member')) {
  throw new Error(`IAM-15 role set must be exactly admin/member; got ${roles.join(',')}`);
}
const expectedVariants = setAccess.properties?.expectedCurrent?.oneOf ?? [];
const states = expectedVariants.map((variant) => variant?.properties?.state?.const).filter(Boolean).sort();
if (states.join(',') !== 'ABSENT,PRESENT') {
  throw new Error(`IAM-15 expectedCurrent must close ABSENT/PRESENT; got ${states.join(',')}`);
}

if (!hasRequiredParameter('IAM-17', 'query', 'expectedRole')) {
  throw new Error('IAM-17 must carry the expected current app role explicitly');
}
const revokeExpectedRole = resolvedParameters('IAM-17').find((p) => p?.in === 'query' && p?.name === 'expectedRole');
const revokeRoles = revokeExpectedRole?.schema?.enum ?? [];
if (revokeRoles.length !== 2 || !revokeRoles.includes('admin') || !revokeRoles.includes('member')) {
  throw new Error('IAM-17 expectedRole must be exactly admin/member');
}

// 4C-F01: current Control Plane disclosure must carry human-recognizable Workspace and Project identity.
const accessContext = assertClosedObject(successSchema('IAM-01'), 'IAM-01 success');
const workspaceItems = resolveSchema(accessContext.properties?.workspaces?.items);
const projectItems = resolveSchema(accessContext.properties?.projects?.items);
if (!workspaceItems?.required?.includes('workspaceId')) throw new Error('IAM-01 Workspace projection must require workspaceId');
assertHumanName(workspaceItems, 'IAM-01 Workspace projection');
if (!projectItems?.required?.includes('projectId') || !projectItems?.required?.includes('workspaceId')) {
  throw new Error('IAM-01 Project projection must require projectId + workspaceId');
}
assertHumanName(projectItems, 'IAM-01 Project projection');

const createWorkspace = assertClosedObject(jsonRequestSchema('WS-01'), 'WS-01 request');
assertHumanName(createWorkspace, 'WS-01 request');
for (const forbidden of ['description', 'settings', 'metadata']) {
  if (createWorkspace.properties?.[forbidden]) throw new Error(`WS-01 must not expose speculative Workspace field ${forbidden}`);
}
if (!hasRequiredParameter('WS-01', 'header', 'Idempotency-Key')) throw new Error('WS-01 must require Idempotency-Key');
const createdWorkspace = assertClosedObject(successSchema('WS-01', '201'), 'WS-01 success');
if (!createdWorkspace.required?.includes('workspaceId')) throw new Error('WS-01 success must require workspaceId');
assertHumanName(createdWorkspace, 'WS-01 success');
const workspaceRead = assertClosedObject(successSchema('WS-02'), 'WS-02 success');
if (!workspaceRead.required?.includes('workspaceId')) throw new Error('WS-02 success must require workspaceId');
assertHumanName(workspaceRead, 'WS-02 success');

// 4C-F11: Area gains bounded creation/read presentation but no generic update/rename authority.
const areaList = assertClosedObject(successSchema('WS-04'), 'WS-04 success');
assertAreaSummary(areaList.properties?.items?.items, 'WS-04 AreaSummary');
const createArea = assertClosedObject(jsonRequestSchema('WS-05'), 'WS-05 request');
assertHumanName(createArea, 'WS-05 request');
if (!hasRequiredParameter('WS-05', 'header', 'Idempotency-Key')) throw new Error('WS-05 must require Idempotency-Key');
assertAreaSummary(successSchema('WS-05', '201'), 'WS-05 success AreaSummary');

const areaAuthorityRoutes = op('WS-04')['x-conexus-authority-routes'] ?? [];
if (!areaAuthorityRoutes.includes('workspace.manage') || !areaAuthorityRoutes.includes('workspace.access.manage')) {
  throw new Error('WS-04 must preserve workspace.manage and narrow workspace.access.manage summary routes');
}

if (operations.has('WS-03')) throw new Error('4C-F11 must not resurrect WS-03 UpdateWorkspace');
if (operations.has('WS-06')) throw new Error('4C-F11 must not resurrect WS-06 UpdateArea');

console.log('IAM/Workspace schema closure passed (23 operations; Account/Area human identity + IAM-18..20 access reads closed; no generic mutation/RBAC authority).');
