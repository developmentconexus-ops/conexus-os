import fs from 'node:fs';

const oas = JSON.parse(fs.readFileSync('/tmp/conexus-product-openapi.bundle.json', 'utf8'));
const methods = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);
const operations = new Map();

for (const [path, pathItem] of Object.entries(oas.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem ?? {})) {
    if (!methods.has(method)) continue;
    const id = operation?.['x-conexus-4a-id'];
    if (id) operations.set(id, operation);
  }
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

function op(id) {
  const operation = operations.get(id);
  if (!operation) throw new Error(`F13 Project Agent catalog checker missing operation ${id}`);
  return operation;
}

function successSchema(id) {
  return resolveSchema(op(id).responses?.['200']?.content?.['application/json']?.schema);
}

function assertClosedObject(schema, label) {
  const resolved = resolveSchema(schema);
  if (!resolved || resolved.type !== 'object' || resolved.additionalProperties !== false) {
    throw new Error(`${label} must be a closed object schema`);
  }
  return resolved;
}

function requiredFields(schema) {
  return new Set(resolveSchema(schema)?.required ?? []);
}

function propertySchema(schema, name) {
  return resolveSchema(resolveSchema(schema)?.properties?.[name]);
}

function assertNonBlankText(schema, label) {
  const resolved = resolveSchema(schema);
  if (resolved?.type !== 'string' || (resolved.minLength ?? 0) < 1 || typeof resolved.pattern !== 'string') {
    throw new Error(`${label} must be an explicit non-blank string`);
  }
}

function assertProjectProductAgent(schema, label) {
  const agent = assertClosedObject(schema, label);
  for (const field of ['agentId', 'name', 'purpose', 'authoredRevisionId', 'releaseRefs', 'activeReleaseId']) {
    if (!requiredFields(agent).has(field)) throw new Error(`${label} must require ${field}`);
  }

  assertNonBlankText(propertySchema(agent, 'name'), `${label}.name`);
  assertNonBlankText(propertySchema(agent, 'purpose'), `${label}.purpose`);

  const activeRelease = propertySchema(agent, 'activeReleaseId');
  const types = Array.isArray(activeRelease?.type) ? activeRelease.type : [activeRelease?.type].filter(Boolean);
  if (!types.includes('string') || !types.includes('null')) {
    throw new Error(`${label}.activeReleaseId must preserve string|null Release-presence semantics`);
  }

  for (const forbidden of ['status', 'health', 'running', 'online', 'ready', 'mastraAgentId', 'runtimeRevisionId', 'requestRevisionOverride', 'storedAgentId']) {
    if (agent.properties?.[forbidden]) throw new Error(`${label} must not invent runtime/fleet field ${forbidden}`);
  }

  return agent;
}

// Canonical schemas guarded by this bounded Project sub-checker:
// ProjectProductAgent, WorkspaceProductAgentCatalogItem and ProjectSummary.
// 4C-F13: PRJ-20 and PRJ-21 expose the same Project-owned authored Agent projection.
const projectAgentList = successSchema('PRJ-20');
if (projectAgentList?.type !== 'array') throw new Error('PRJ-20 must return an Agent array');
assertProjectProductAgent(projectAgentList.items, 'PRJ-20 item');
assertProjectProductAgent(successSchema('PRJ-21'), 'PRJ-21 success');

// 4C-F13: PRJ-22 is a self-contained Workspace catalog item, not a frontend join or Workspace fleet owner.
const workspaceCatalog = successSchema('PRJ-22');
if (workspaceCatalog?.type !== 'array') throw new Error('PRJ-22 must return a Workspace Agent catalog array');
const catalogItem = assertClosedObject(workspaceCatalog.items, 'PRJ-22 item');
for (const field of ['agent', 'project']) {
  if (!requiredFields(catalogItem).has(field)) throw new Error(`PRJ-22 item must require ${field}`);
}
assertProjectProductAgent(propertySchema(catalogItem, 'agent'), 'PRJ-22 item.agent');

const project = assertClosedObject(propertySchema(catalogItem, 'project'), 'PRJ-22 item.project ProjectSummary');
for (const field of ['projectId', 'workspaceId', 'name', 'archived']) {
  if (!requiredFields(project).has(field)) throw new Error(`PRJ-22 item.project must require ${field}`);
}
assertNonBlankText(propertySchema(project, 'name'), 'PRJ-22 item.project.name');

for (const forbidden of ['projectName', 'workspaceAgentId', 'fleetStatus', 'runtimeHealth', 'agentStatus']) {
  if (catalogItem.properties?.[forbidden]) throw new Error(`PRJ-22 item must not invent parallel catalog field ${forbidden}`);
}

console.log('Project Agent catalog F13 closure passed (human Agent name/purpose + canonical ProjectSummary; no fleet/runtime authority).');
