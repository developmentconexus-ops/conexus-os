import fs from 'node:fs';

const oas = JSON.parse(fs.readFileSync('/tmp/conexus-product-openapi.bundle.json', 'utf8'));
const targetPath = '/api/control/projects/{projectId}/brain-context';
const pathItem = oas.paths?.[targetPath];
const operation = pathItem?.get;

if (!operation) throw new Error('F23 missing GET Project Brain Context wire');
if (operation.operationId !== 'GetProjectBrainContext') throw new Error('F23 operationId must be GetProjectBrainContext');
if (operation['x-conexus-4a-id'] !== 'BRN-14') throw new Error('F23 must be BRN-14');
if (operation['x-conexus-contract-state'] !== 'SCHEMA_CLOSED') throw new Error('BRN-14 must be SCHEMA_CLOSED');
const ingress = operation['x-conexus-ingress'] ?? [];
if (ingress.length !== 1 || ingress[0] !== 'CONTROL_PLANE') throw new Error('BRN-14 must remain Control-Plane only');
if (operation['x-conexus-non-http-ingress']) throw new Error('BRN-14 must not create non-HTTP/runtime ingress');
if (operation.requestBody) throw new Error('BRN-14 must remain a read-only GET without request body');
const authorityRoutes = operation['x-conexus-authority-routes'] ?? [];
if (authorityRoutes.join(',') !== 'brain.read + project.read,project.build') throw new Error('BRN-14 must admit ordinary context inspection + purpose-bound project.build');

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
    if (seen.has(current.$ref)) throw new Error(`F23 schema ref cycle at ${current.$ref}`);
    seen.add(current.$ref);
    current = resolveLocalRef(current);
  }
  return current;
}

function property(schema, name) {
  return resolveSchema(resolveSchema(schema)?.properties?.[name]);
}

function requireClosedObject(schema, label) {
  const resolved = resolveSchema(schema);
  if (resolved?.type !== 'object' || resolved.additionalProperties !== false) throw new Error(`${label} must be a closed object`);
  return resolved;
}

function requireFields(schema, ...names) {
  const required = new Set(resolveSchema(schema)?.required ?? []);
  for (const name of names) if (!required.has(name)) throw new Error(`F23 requires ${name}`);
}

function requireNonBlankString(schema, name, label) {
  const field = property(schema, name);
  if (field?.type !== 'string' || (field.minLength ?? 0) < 1) throw new Error(`${label} must be a non-blank string`);
}

function assertProjectContextSchema(candidate) {
  const context = requireClosedObject(candidate, 'ProjectBrainContext');
  requireFields(context, 'projectId', 'brainRevisionId', 'brainDigest', 'projectBindingDigest', 'validationState', 'updateAvailable', 'domains');
  for (const name of ['projectId', 'brainRevisionId', 'brainDigest', 'projectBindingDigest', 'validationState']) {
    requireNonBlankString(context, name, `F23 ${name}`);
  }
  if (property(context, 'updateAvailable')?.type !== 'boolean') throw new Error('F23 updateAvailable must be boolean');

  for (const forbidden of [
    'workspaceId', 'publishedBrainRevisionId', 'effectiveBrainSliceDigest', 'healthSnapshotDigest',
    'runtimeSlice', 'toolAuthority', 'permissions', 'memory', 'vectorIndex', 'ragIndex',
    'candidateSourceRevision', 'publish', 'autoPublish',
  ]) {
    if (context.properties?.[forbidden]) throw new Error(`F23 must not expose ${forbidden}`);
  }

  const domains = property(context, 'domains');
  if (domains?.type !== 'array') throw new Error('F23 domains must be an array');
  const domain = requireClosedObject(resolveSchema(domains.items), 'ProjectBrainContextDomain');
  requireFields(domain, 'domainRef', 'label', 'concepts');
  requireNonBlankString(domain, 'domainRef', 'F23 domainRef');
  requireNonBlankString(domain, 'label', 'F23 domain label');

  const concepts = property(domain, 'concepts');
  if (concepts?.type !== 'array') throw new Error('F23 concepts must be an array');
  const concept = requireClosedObject(resolveSchema(concepts.items), 'ProjectBrainContextConcept');
  requireFields(concept, 'conceptRef', 'authoringRef', 'label', 'summary', 'contentClasses', 'detailDisclosed', 'sections', 'provenanceRefs');
  for (const name of ['conceptRef', 'authoringRef', 'label', 'summary']) requireNonBlankString(concept, name, `F23 concept ${name}`);
  if (property(concept, 'detailDisclosed')?.type !== 'boolean') throw new Error('F05 detailDisclosed must be boolean');
  if (!(property(concept, 'detailDisclosed')?.description ?? '').includes('withheld by current authority')) throw new Error('F05 withheld detail must not masquerade as empty/invalid meaning');

  const classes = property(concept, 'contentClasses');
  if (classes?.type !== 'array' || (classes.minItems ?? 0) < 1 || classes.uniqueItems !== true) throw new Error('F23 contentClasses must be non-empty and unique');
  const classEnum = [...(resolveSchema(classes.items)?.enum ?? [])].sort().join(',');
  if (classEnum !== ['EVIDENCE_SPEC', 'KNOWLEDGE', 'SEMANTIC'].sort().join(',')) throw new Error('F23 contentClasses must preserve Brain content classes');

  const sections = property(concept, 'sections');
  if (sections?.type !== 'array') throw new Error('F23 sections must be an array');
  const section = requireClosedObject(resolveSchema(sections.items), 'ProjectBrainContextSection');
  requireFields(section, 'kind', 'text');
  requireNonBlankString(section, 'text', 'F23 section text');
  const kindEnum = [...(property(section, 'kind')?.enum ?? [])].sort().join(',');
  const expectedKinds = ['DEFINITION', 'BUSINESS_MEANING', 'CALCULATION', 'GRAIN', 'RELATIONSHIPS', 'BUSINESS_RULES', 'CAVEATS', 'VERIFICATION'].sort().join(',');
  if (kindEnum !== expectedKinds) throw new Error('F23 sections must preserve bounded Brain section kinds');

  const provenance = property(concept, 'provenanceRefs');
  if (provenance?.type !== 'array' || provenance.uniqueItems !== true) throw new Error('F23 provenanceRefs must be a unique array');
  const provenanceItem = resolveSchema(provenance.items);
  if (provenanceItem?.type !== 'string' || (provenanceItem.minLength ?? 0) < 1) throw new Error('F23 provenanceRefs must contain non-blank strings');

  return context;
}

const success = operation.responses?.['200']?.content?.['application/json']?.schema;
const context = assertProjectContextSchema(resolveSchema(success));

function expectNegative(label, mutate) {
  const copy = structuredClone(context);
  mutate(copy);
  try {
    assertProjectContextSchema(copy);
  } catch {
    console.log(`negative control fired: ${label}`);
    return;
  }
  throw new Error(`negative control failed: ${label}`);
}

expectNegative('F23 cannot masquerade as runtime effective slice', (schema) => {
  schema.properties.effectiveBrainSliceDigest = { type: 'string', minLength: 1 };
});
expectNegative('F23 cannot widen into Workspace Brain publication projection', (schema) => {
  schema.properties.workspaceId = { type: 'string', minLength: 1 };
});
expectNegative('F23 cannot expose tool authority', (schema) => {
  schema.properties.toolAuthority = { type: 'array', items: { type: 'string' } };
});

console.log('Project Brain Context closure passed (BRN-14 ordinary detail + purpose-bound build authoring refs; no Workspace publication/runtime-slice/tool authority).');
