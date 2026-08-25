import fs from 'node:fs';

const bundlePath = process.env.CONEXUS_PRODUCT_BUNDLE ?? '/tmp/conexus-product-openapi.bundle.json';
const canonical = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
const methods = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);

function fail(message) {
  throw new Error(`F22 Data Explorer: ${message}`);
}

function resolveLocalRef(doc, value) {
  if (!value?.$ref || !value.$ref.startsWith('#/')) return value;
  return value.$ref
    .slice(2)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((node, part) => node?.[part], doc);
}

function resolveSchema(doc, schema) {
  let current = schema;
  const seen = new Set();
  while (current?.$ref?.startsWith('#/')) {
    if (seen.has(current.$ref)) fail(`schema ref cycle at ${current.$ref}`);
    seen.add(current.$ref);
    current = resolveLocalRef(doc, current);
  }
  return current;
}

function closed(doc, schema, label) {
  const resolved = resolveSchema(doc, schema);
  if (resolved?.type !== 'object' || resolved.additionalProperties !== false) {
    fail(`${label} must be a closed object schema`);
  }
  return resolved;
}

function required(schema) {
  return new Set(schema?.required ?? []);
}

function property(doc, schema, name) {
  return resolveSchema(doc, resolveSchema(doc, schema)?.properties?.[name]);
}

function operationIndex(doc) {
  const byId = new Map();
  for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (!methods.has(method)) continue;
      const id = operation?.['x-conexus-4a-id'];
      if (id) byId.set(id, { path, method, operation });
    }
  }
  return byId;
}

function operation(doc, id) {
  const found = operationIndex(doc).get(id);
  if (!found) fail(`missing operation ${id}`);
  return found;
}

function successSchema(doc, id) {
  const op = operation(doc, id).operation;
  const response = op.responses?.['200'];
  return resolveSchema(doc, response?.content?.['application/json']?.schema);
}

function requestSchema(doc, id) {
  const op = operation(doc, id).operation;
  return resolveSchema(doc, op.requestBody?.content?.['application/json']?.schema);
}

function assertExactEnum(schema, values, label) {
  const actual = schema?.enum;
  if (!Array.isArray(actual) || actual.length !== values.length || values.some((value) => !actual.includes(value))) {
    fail(`${label} must be exactly ${values.join('|')}`);
  }
}

function assertRequires(schema, fields, label) {
  const set = required(schema);
  for (const field of fields) {
    if (!set.has(field)) fail(`${label} must require ${field}`);
  }
}

function collectPropertyNames(doc, schema, seen = new Set(), names = new Set()) {
  if (!schema || typeof schema !== 'object') return names;
  if (schema.$ref?.startsWith('#/')) {
    if (seen.has(schema.$ref)) return names;
    seen.add(schema.$ref);
    return collectPropertyNames(doc, resolveLocalRef(doc, schema), seen, names);
  }
  for (const key of Object.keys(schema.properties ?? {})) names.add(key);
  for (const value of Object.values(schema.properties ?? {})) collectPropertyNames(doc, value, seen, names);
  for (const key of ['items', 'oneOf', 'anyOf', 'allOf', 'not', 'if', 'then', 'else']) {
    const value = schema[key];
    if (Array.isArray(value)) value.forEach((item) => collectPropertyNames(doc, item, seen, names));
    else collectPropertyNames(doc, value, seen, names);
  }
  return names;
}

export function validateDataExplorer(doc) {
  const expected = new Map([
    ['PRJ-25', ['get', '/api/control/projects/{projectId}/data-explorer/sources', 'ListProjectDataExplorerSources']],
    ['PRJ-26', ['get', '/api/control/projects/{projectId}/data-explorer/sources/{dataSourceId}/objects', 'ListProjectDataExplorerObjects']],
    ['PRJ-27', ['get', '/api/control/projects/{projectId}/data-explorer/sources/{dataSourceId}/objects/{dataObjectId}', 'GetProjectDataExplorerObject']],
    ['PRJ-28', ['post', '/api/control/projects/{projectId}/data-explorer/sources/{dataSourceId}/objects/{dataObjectId}/rows:query', 'ListProjectDataExplorerRows']],
  ]);

  for (const [id, [method, path, operationId]] of expected) {
    const found = operation(doc, id);
    if (found.method !== method || found.path !== path) fail(`${id} must be ${method.toUpperCase()} ${path}`);
    if (found.operation.operationId !== operationId) fail(`${id} operationId must be ${operationId}`);
    if (found.operation['x-conexus-current-state-carrier'] !== 'NONE') fail(`${id} must use current-state carrier NONE`);
    if (found.operation['x-conexus-contract-state'] !== 'SCHEMA_CLOSED') fail(`${id} must remain schema-closed`);
    if (!found.operation['x-conexus-ingress']?.includes('CONTROL_PLANE')) fail(`${id} must remain Control Plane only`);
  }

  for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
    if (!path.includes('/data-explorer/')) continue;
    for (const method of ['put', 'patch', 'delete']) {
      if (pathItem?.[method]) fail(`mutating ${method.toUpperCase()} is forbidden under ${path}`);
    }
    if (pathItem?.post && path !== expected.get('PRJ-28')[1]) fail(`POST is allowed only for the PRJ-28 semantic read`);
  }

  const sources = successSchema(doc, 'PRJ-25');
  if (sources?.type !== 'array') fail('PRJ-25 must return an array');
  const source = closed(doc, sources.items, 'PRJ-25 item');
  assertRequires(source, ['dataSourceId', 'name', 'sourceClass', 'availability'], 'PRJ-25 item');
  assertExactEnum(property(doc, source, 'sourceClass'), ['INTERNAL', 'INTEGRATION'], 'sourceClass');
  assertExactEnum(property(doc, source, 'availability'), ['AVAILABLE', 'UNAVAILABLE'], 'source availability');

  const objectPage = closed(doc, successSchema(doc, 'PRJ-26'), 'PRJ-26 page');
  assertRequires(objectPage, ['items'], 'PRJ-26 page');
  const objectItems = property(doc, objectPage, 'items');
  if (objectItems?.type !== 'array') fail('PRJ-26 items must be an array');
  const objectSummary = closed(doc, objectItems.items, 'PRJ-26 item');
  assertRequires(objectSummary, ['dataObjectId', 'name', 'kind'], 'PRJ-26 item');
  assertExactEnum(property(doc, objectSummary, 'kind'), ['TABLE', 'VIEW', 'DATASET'], 'object kind');

  const objectDetail = closed(doc, successSchema(doc, 'PRJ-27'), 'PRJ-27 object');
  assertRequires(objectDetail, ['dataObjectId', 'name', 'kind', 'rowReadAvailability', 'columns', 'relationships', 'constraints'], 'PRJ-27 object');
  assertExactEnum(property(doc, objectDetail, 'rowReadAvailability'), ['AVAILABLE', 'UNAVAILABLE'], 'rowReadAvailability');
  const columns = property(doc, objectDetail, 'columns');
  if (columns?.type !== 'array') fail('PRJ-27 columns must be an array');
  const column = closed(doc, columns.items, 'PRJ-27 column');
  assertRequires(column, ['dataColumnId', 'name', 'sourceType', 'nullable', 'keyRole'], 'PRJ-27 column');
  assertExactEnum(property(doc, column, 'keyRole'), ['PRIMARY', 'FOREIGN', 'UNIQUE', 'NONE'], 'column keyRole');

  const relationships = property(doc, objectDetail, 'relationships');
  if (relationships?.type !== 'array') fail('PRJ-27 relationships must be an array');
  const relationship = closed(doc, relationships.items, 'PRJ-27 relationship');
  assertRequires(relationship, ['relationshipId', 'sourceColumnId', 'targetDataObjectId', 'targetColumnId', 'kind'], 'PRJ-27 relationship');

  const constraints = property(doc, objectDetail, 'constraints');
  if (constraints?.type !== 'array') fail('PRJ-27 constraints must be an array');
  const constraint = closed(doc, constraints.items, 'PRJ-27 constraint');
  assertRequires(constraint, ['constraintId', 'kind', 'columnIds'], 'PRJ-27 constraint');

  const query = closed(doc, requestSchema(doc, 'PRJ-28'), 'PRJ-28 request');
  const forbidden = new Set(['sql', 'where', 'expression', 'connectionId', 'connectionRevisionId', 'environment', 'targetUrl', 'credential', 'password']);
  const requestProperties = collectPropertyNames(doc, query);
  for (const name of forbidden) {
    if (requestProperties.has(name)) fail(`PRJ-28 request must not expose ${name}`);
  }

  const filters = property(doc, query, 'filters');
  if (filters?.type !== 'array' || filters.maxItems !== 8) fail('PRJ-28 filters must be a bounded array with maxItems=8');
  const filter = resolveSchema(doc, filters.items);
  if (!Array.isArray(filter?.oneOf) || filter.oneOf.length !== 2) fail('ProjectDataExplorerFilter must be a two-branch closed union');
  const filterBranches = filter.oneOf.map((branch, index) => closed(doc, branch, `filter branch ${index + 1}`));
  const operatorValues = new Set();
  for (const branch of filterBranches) {
    assertRequires(branch, ['dataColumnId', 'operator'], 'filter branch');
    for (const value of property(doc, branch, 'operator')?.enum ?? []) operatorValues.add(value);
  }
  const expectedOperators = ['EQ', 'NE', 'GT', 'GTE', 'LT', 'LTE', 'CONTAINS', 'IS_NULL', 'IS_NOT_NULL'];
  if (operatorValues.size !== expectedOperators.length || expectedOperators.some((value) => !operatorValues.has(value))) {
    fail('filter operators must remain the exact bounded F22 grammar');
  }
  const valueBranch = filterBranches.find((branch) => required(branch).has('value'));
  const nullBranch = filterBranches.find((branch) => !required(branch).has('value'));
  if (!valueBranch || !nullBranch || nullBranch.properties?.value) fail('null filters must forbid value and value filters must require it');

  const sort = property(doc, query, 'sort');
  if (sort?.type !== 'array' || sort.maxItems !== 3) fail('PRJ-28 sort must be a bounded array with maxItems=3');
  const sortItem = closed(doc, sort.items, 'PRJ-28 sort item');
  assertRequires(sortItem, ['dataColumnId', 'direction'], 'PRJ-28 sort item');
  assertExactEnum(property(doc, sortItem, 'direction'), ['ASC', 'DESC'], 'sort direction');

  const limit = property(doc, query, 'limit');
  if (limit?.minimum !== 1 || limit.maximum !== 100) fail('PRJ-28 limit must remain 1..100');

  const page = closed(doc, successSchema(doc, 'PRJ-28'), 'PRJ-28 row page');
  assertRequires(page, ['observedAt', 'columns', 'rows'], 'PRJ-28 row page');
  const rows = property(doc, page, 'rows');
  if (rows?.type !== 'array' || rows.maxItems !== 100) fail('PRJ-28 rows must be bounded to maxItems=100');
  const row = closed(doc, rows.items, 'PRJ-28 row');
  assertRequires(row, ['cells'], 'PRJ-28 row');
  const cells = property(doc, row, 'cells');
  if (cells?.type !== 'array') fail('PRJ-28 cells must be an array, never dynamic row properties');
  const cell = closed(doc, cells.items, 'PRJ-28 cell');
  assertRequires(cell, ['dataColumnId', 'valueKind', 'displayValue', 'truncated'], 'PRJ-28 cell');
  assertExactEnum(property(doc, cell, 'valueKind'), ['NULL', 'TEXT', 'NUMBER', 'BOOLEAN', 'TEMPORAL', 'JSON', 'BINARY'], 'cell valueKind');

  return true;
}

function expectReject(label, mutate, messagePattern) {
  const candidate = structuredClone(canonical);
  mutate(candidate);
  try {
    validateDataExplorer(candidate);
  } catch (error) {
    if (messagePattern && !messagePattern.test(String(error?.message ?? error))) {
      throw new Error(`negative control fired for wrong reason: ${label}: ${error?.message ?? error}`);
    }
    console.log(`negative control fired: ${label}`);
    return;
  }
  throw new Error(`negative control failed: ${label}`);
}

validateDataExplorer(canonical);

expectReject('F22 cannot admit SQL text', (doc) => {
  const query = closed(doc, requestSchema(doc, 'PRJ-28'), 'negative request');
  query.properties.sql = { type: 'string' };
}, /must not expose sql/);

expectReject('F22 cannot select Connection revision', (doc) => {
  const query = closed(doc, requestSchema(doc, 'PRJ-28'), 'negative request');
  query.properties.connectionRevisionId = { type: 'string' };
}, /must not expose connectionRevisionId/);

expectReject('F22 sourceClass cannot become DERIVED physical source', (doc) => {
  const sources = successSchema(doc, 'PRJ-25');
  const source = closed(doc, sources.items, 'negative source');
  property(doc, source, 'sourceClass').enum.push('DERIVED');
}, /sourceClass must be exactly/);

expectReject('F22 cannot admit SQL filter operator', (doc) => {
  const query = closed(doc, requestSchema(doc, 'PRJ-28'), 'negative request');
  const filters = property(doc, query, 'filters');
  const filter = resolveSchema(doc, filters.items);
  const branch = closed(doc, filter.oneOf[0], 'negative filter');
  property(doc, branch, 'operator').enum.push('SQL');
}, /filter operators must remain/);

expectReject('F22 rows cannot become dynamic object DTOs', (doc) => {
  const page = closed(doc, successSchema(doc, 'PRJ-28'), 'negative page');
  const row = closed(doc, property(doc, page, 'rows').items, 'negative row');
  row.additionalProperties = true;
}, /row must be a closed object schema/);

expectReject('F22 truncated cell truth is required', (doc) => {
  const page = closed(doc, successSchema(doc, 'PRJ-28'), 'negative page');
  const row = closed(doc, property(doc, page, 'rows').items, 'negative row');
  const cell = closed(doc, property(doc, row, 'cells').items, 'negative cell');
  cell.required = cell.required.filter((field) => field !== 'truncated');
}, /cell must require truncated/);

expectReject('F22 cannot admit DELETE mutation', (doc) => {
  const path = '/api/control/projects/{projectId}/data-explorer/sources/{dataSourceId}/objects/{dataObjectId}';
  doc.paths[path].delete = { operationId: 'DeleteProjectDataObject', responses: { 204: { description: 'deleted' } } };
}, /mutating DELETE is forbidden/);

expectReject('F22 cannot admit unlisted source projection property', (doc) => {
  const sources = successSchema(doc, 'PRJ-25');
  const source = closed(doc, sources.items, 'negative source');
  source.properties.connectionUri = { type: 'string' };
}, /PRJ-25 item properties must be exactly/);

console.log('Project F22 Data Explorer closure passed (4 bounded reads; no SQL/write/credential authority).');
