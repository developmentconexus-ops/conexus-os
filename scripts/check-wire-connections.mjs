import fs from 'node:fs';

const oas = JSON.parse(fs.readFileSync('/tmp/conexus-product-openapi.bundle.json', 'utf8'));
const methods = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);
const operations = new Map();

for (const [path, pathItem] of Object.entries(oas.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem ?? {})) {
    if (!methods.has(method)) continue;
    const id = operation?.['x-conexus-4a-id'];
    if (id) operations.set(id, { path, method: method.toUpperCase(), operation, pathItem });
  }
}

const expectedIds = Array.from({ length: 9 }, (_, i) => `CON-${String(i + 1).padStart(2, '0')}`);
for (const id of expectedIds) {
  const entry = operations.get(id);
  if (!entry) throw new Error(`Connections schema closure missing operation ${id}`);
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

  const parameters = new Map();
  for (const value of [...(entry.pathItem.parameters ?? []), ...(entry.operation.parameters ?? [])]) {
    const resolved = resolveLocalRef(value);
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

function successArrayItemSchema(id, status = '200') {
  const schema = successSchema(id, status);
  if (schema?.type !== 'array') throw new Error(`${id} ${status} must be an array`);
  return resolveSchema(schema.items);
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

function assertConnectionTest(schema, label) {
  const testSummary = assertClosedObject(property(schema, 'connectionTest'), `${label} connectionTest`);
  required(testSummary, 'state');
  exactEnum(property(testSummary, 'state'), ['NOT_TESTED', 'NEEDS_RETEST', 'PASSED', 'FAILED', 'INDETERMINATE'], `${label} connectionTest state`);
  for (const field of ['qualificationId', 'environment']) {
    const value = property(testSummary, field);
    if (value && (value.type !== 'string' || value.minLength !== 1)) throw new Error(`${label} connectionTest ${field} must be an optional nonblank string`);
  }
  const testedAt = property(testSummary, 'testedAt');
  if (testedAt && (testedAt.type !== 'string' || testedAt.format !== 'date-time')) throw new Error(`${label} connectionTest testedAt must be an optional date-time`);
  for (const forbidden of ['active', 'inactive', 'connected', 'ready', 'healthy', 'authorized', 'bound', 'latestQualification']) {
    if (testSummary.properties?.[forbidden]) throw new Error(`${label} connectionTest must not collapse/expose ${forbidden}`);
  }
}

// ConnectorDefinition is declarative platform-pack projection. It describes provider-specific schemas; it never contains secret values.
const connector = assertClosedObject(successSchema('CON-02'), 'CON-02 success');
required(connector, 'connectorDefinitionId', 'connectorVersion', 'provider', 'configurationSchema', 'credentialInputSchema', 'operationIds', 'environments');
for (const field of ['secret', 'credential', 'credentialValue', 'accessToken', 'refreshToken', 'password']) {
  if (connector.properties?.[field]) throw new Error(`ConnectorDefinition must not expose secret value field ${field}`);
}
for (const field of ['configurationSchema', 'credentialInputSchema']) {
  const schema = property(connector, field);
  if (schema?.type !== 'object') throw new Error(`ConnectorDefinition ${field} must be a machine-readable schema object`);
}

// Scope is exact and path-owned. CreateConnection cannot smuggle a sibling/cross-Workspace owner or secret material into the logical Connection command.
const ownerScope = parameter('CON-03', 'path', 'ownerScopeKind') ?? parameter('CON-05', 'path', 'ownerScopeKind');
exactEnum(ownerScope?.schema, ['WORKSPACE', 'PROJECT'], 'Connection ownerScopeKind');
const create = assertClosedObject(requestSchema('CON-05'), 'CON-05 request');
required(create, 'name', 'connectorDefinitionId', 'connectorVersion', 'configuration');
if (!hasRequiredParameter('CON-05', 'header', 'Idempotency-Key')) throw new Error('CON-05 must require Idempotency-Key');
const createName = property(create, 'name');
if (createName?.type !== 'string' || createName?.minLength !== 1 || createName?.pattern !== '.*\\S.*') {
  throw new Error('CON-05 name must be a required non-blank human presentation identity');
}
if (property(create, 'configuration')?.['x-conexus-schema-source'] !== 'CONNECTOR_DEFINITION_CONFIGURATION_SCHEMA') {
  throw new Error('CON-05 configuration must be validated by the exact ConnectorDefinition configuration schema');
}
for (const forbidden of ['ownerScopeKind', 'ownerId', 'shareWithWorkspaceId', 'shareWithProjectId', 'credential', 'secret']) {
  if (create.properties?.[forbidden]) throw new Error(`CON-05 must not accept ${forbidden}`);
}

// Lightweight Connection remains the browse/create projection; F09 does not make every list row carry provider configuration. F10 adds only derived current test applicability.
for (const [label, lightweight] of [
  ['CON-03 list item', assertClosedObject(successArrayItemSchema('CON-03'), 'CON-03 list item')],
  ['CON-05 success', assertClosedObject(successSchema('CON-05', '201'), 'CON-05 success')],
]) {
  required(lightweight, 'connectionId', 'name', 'ownerScopeKind', 'ownerId', 'connectorDefinitionId', 'connectorVersion', 'currentRevisionId', 'credentialConfigured', 'connectionTest');
  if (lightweight.properties?.configuration) throw new Error(`${label} must remain lightweight and omit configuration`);
  assertConnectionTest(lightweight, label);
}

// F09/F10: exact Connection detail carries current non-secret configuration + current test applicability while secret/health/binding/authorization truths remain separate.
const connection = assertClosedObject(successSchema('CON-04'), 'CON-04 ConnectionDetail');
required(connection, 'connectionId', 'name', 'ownerScopeKind', 'ownerId', 'connectorDefinitionId', 'connectorVersion', 'currentRevisionId', 'credentialConfigured', 'configuration', 'connectionTest');
const connectionName = property(connection, 'name');
if (connectionName?.type !== 'string' || connectionName?.minLength !== 1 || connectionName?.pattern !== '.*\\S.*') {
  throw new Error('Connection.name must remain required non-blank server-owned presentation identity');
}
exactEnum(property(connection, 'ownerScopeKind'), ['WORKSPACE', 'PROJECT'], 'Connection ownerScopeKind response');
const currentConfiguration = property(connection, 'configuration');
if (currentConfiguration?.type !== 'object' || currentConfiguration?.['x-conexus-schema-source'] !== 'CONNECTOR_DEFINITION_CONFIGURATION_SCHEMA') {
  throw new Error('ConnectionDetail configuration must be a schema-bound non-secret object');
}
if (!String(connection.properties?.configuration?.description ?? '').includes('currentRevisionId')) {
  throw new Error('ConnectionDetail configuration must be explicitly bound to currentRevisionId');
}
assertConnectionTest(connection, 'CON-04');
for (const forbidden of ['credential', 'secret', 'credentialHandle', 'ciphertext', 'accessToken', 'refreshToken', 'password', 'overallStatus', 'authorized', 'qualified', 'bound', 'healthy', 'active', 'connected', 'ready']) {
  if (connection.properties?.[forbidden]) throw new Error(`CON-04 ConnectionDetail must not expose/collapse ${forbidden}`);
}

// Revision is immutable/new-revision semantics protected by an explicit current revision, not false cross-resource If-Match or hidden rename authority.
if (op('CON-06')['x-conexus-current-state-carrier'] !== 'EXPLICIT_CURRENT_REVISION') throw new Error('CON-06 must use EXPLICIT_CURRENT_REVISION');
if (parameter('CON-06', 'header', 'If-Match')) throw new Error('CON-06 must not use cross-resource If-Match');
const revise = assertClosedObject(requestSchema('CON-06'), 'CON-06 request');
required(revise, 'expectedCurrentRevisionId', 'configuration');
if (property(revise, 'configuration')?.['x-conexus-schema-source'] !== 'CONNECTOR_DEFINITION_CONFIGURATION_SCHEMA') {
  throw new Error('CON-06 configuration must be validated by the exact ConnectorDefinition configuration schema');
}
for (const forbidden of ['name', 'credential', 'secret', 'ownerScopeKind', 'ownerId']) {
  if (revise.properties?.[forbidden]) throw new Error(`CON-06 must not accept ${forbidden}`);
}
const revision = assertClosedObject(successSchema('CON-06', '201'), 'CON-06 success');
required(revision, 'connectionId', 'connectionRevisionId', 'connectorDefinitionId', 'connectorVersion');
if (revision.properties?.name) throw new Error('ConnectionRevision must not re-own logical Connection human identity');

// Secret plaintext is write-only trusted ingress. Logical credential generation may advance server-side but never becomes secret readback.
const credential = assertClosedObject(requestSchema('CON-07'), 'CON-07 request');
required(credential, 'credential');
const secretInput = property(credential, 'credential');
if (secretInput?.type !== 'object' || secretInput?.writeOnly !== true) throw new Error('CON-07 credential must be a writeOnly object');
if (secretInput?.['x-conexus-schema-source'] !== 'CONNECTOR_DEFINITION_CREDENTIAL_INPUT_SCHEMA') {
  throw new Error('CON-07 credential must be validated by the exact ConnectorDefinition credential input schema');
}
if (!hasRequiredParameter('CON-07', 'header', 'Idempotency-Key')) throw new Error('CON-07 must require Idempotency-Key');
for (const response of Object.values(op('CON-07').responses ?? {})) {
  if (response?.content) throw new Error('CON-07 must never return credential content');
}

// Qualification/test is against an exact immutable ConnectionRevision + real environment + server-resolved logical credential generation. Caller cannot choose generation.
const qualify = assertClosedObject(requestSchema('CON-08'), 'CON-08 request');
required(qualify, 'connectionRevisionId', 'environment');
if (!hasRequiredParameter('CON-08', 'header', 'Idempotency-Key')) throw new Error('CON-08 must require Idempotency-Key');
for (const forbidden of ['credential', 'credentialGeneration', 'secret', 'testUrl', 'url', 'sql', 'projectBindingId']) {
  if (qualify.properties?.[forbidden]) throw new Error(`CON-08 must not accept qualification escape/basis field ${forbidden}`);
}

for (const [label, qualification] of [
  ['CON-08 success', assertClosedObject(successSchema('CON-08', '201'), 'CON-08 success')],
  ['CON-09 success', assertClosedObject(successSchema('CON-09'), 'CON-09 success')],
]) {
  required(qualification, 'qualificationId', 'connectionId', 'connectionRevisionId', 'credentialGeneration', 'environment', 'qualificationState', 'outcome', 'testedAt', 'diagnostic', 'evidenceRefs');
  const qState = property(qualification, 'qualificationState');
  if (qState?.type !== 'string' || qState?.enum) throw new Error(`${label} qualificationState must remain owner-issued rather than a frozen internal lifecycle enum`);
  exactEnum(property(qualification, 'outcome'), ['PASSED', 'FAILED', 'INDETERMINATE'], `${label} outcome`);
  const generation = property(qualification, 'credentialGeneration');
  const generationTypes = Array.isArray(generation?.type) ? [...generation.type].sort() : [];
  if (generationTypes.join(',') !== ['null', 'string'].sort().join(',') || generation?.minLength !== 1) {
    throw new Error(`${label} credentialGeneration must be a nullable nonblank logical coordinate`);
  }
  const testedAt = property(qualification, 'testedAt');
  if (testedAt?.type !== 'string' || testedAt?.format !== 'date-time') throw new Error(`${label} testedAt must be a date-time`);
  const diagnostic = assertClosedObject(property(qualification, 'diagnostic'), `${label} diagnostic`);
  required(diagnostic, 'title', 'message');
  for (const field of ['title', 'message']) {
    const value = property(diagnostic, field);
    if (value?.type !== 'string' || value?.minLength !== 1) throw new Error(`${label} diagnostic ${field} must be nonblank human text`);
  }
  const remediation = property(diagnostic, 'remediation');
  if (remediation && (remediation.type !== 'string' || remediation.minLength !== 1)) throw new Error(`${label} diagnostic remediation must be optional nonblank human text`);
  for (const forbidden of ['credential', 'secret', 'password', 'accessToken', 'refreshToken', 'bound', 'healthy', 'authorized', 'ready', 'active', 'connected']) {
    if (qualification.properties?.[forbidden] || diagnostic.properties?.[forbidden]) throw new Error(`${label} must not collapse/expose ${forbidden}`);
  }
}

console.log('Connections schema closure passed (9 operations; identity/scope/configuration/current-test/revision/write-only secret/exact diagnostic qualification boundaries closed).');