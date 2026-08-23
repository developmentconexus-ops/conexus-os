import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const productBundlePath = '/tmp/conexus-product-openapi.bundle.json';
const technicalBundlePath = '/tmp/conexus-technical-openapi.bundle.json';
const budgetOasPath = '/tmp/conexus-budget-analyzer.openapi.generated.json';
const projectionPath = '/tmp/conexus-wire-projection-a.json';
const projectSchemaPath = 'contracts/api/project-operation.schema.json';
const projectGenerator = 'scripts/generate-project-openapi.mjs';
const expectedProductOperations = 116;

for (const required of [productBundlePath, technicalBundlePath, budgetOasPath, projectionPath, projectSchemaPath, projectGenerator]) {
  if (!fs.existsSync(required)) throw new Error(`whole-4B prerequisite missing: ${required}`);
}

const methods = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);
const product = JSON.parse(fs.readFileSync(productBundlePath, 'utf8'));
const technical = JSON.parse(fs.readFileSync(technicalBundlePath, 'utf8'));
const budget = JSON.parse(fs.readFileSync(budgetOasPath, 'utf8'));
const projection = JSON.parse(fs.readFileSync(projectionPath, 'utf8'));

function collectOperations(oas) {
  const operations = [];
  for (const [route, pathItem] of Object.entries(oas.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (!methods.has(method)) continue;
      operations.push({ route, method: method.toUpperCase(), operation: operation ?? {}, pathItem: pathItem ?? {} });
    }
  }
  return operations;
}

function pair(value) {
  return `${value.method} ${value.route}`;
}

function slugifyOperationId(value) {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[._]+/g, '-')
    .toLowerCase();
}

function stable(value) {
  return JSON.stringify(value);
}

function assertWhole(currentProduct, currentTechnical, currentProject, currentProjection) {
  const productOps = collectOperations(currentProduct);
  const technicalOps = collectOperations(currentTechnical);
  const projectOps = collectOperations(currentProject);

  if (productOps.length !== expectedProductOperations) throw new Error(`whole-4B Product census drifted: ${productOps.length}`);
  if (technicalOps.length !== 3) throw new Error(`whole-4B Technical census drifted: ${technicalOps.length}`);
  if (projectOps.length !== 2) throw new Error(`whole-4B Budget proving census drifted: ${projectOps.length}`);
  if (currentProject['x-conexus-generated'] !== true) throw new Error('Project OAD must remain a generated projection');
  if (currentProjection.authority !== 'PROJECTION_ONLY') throw new Error('wire projection must remain PROJECTION_ONLY');
  if (!Array.isArray(currentProjection.operations) || currentProjection.operations.length !== expectedProductOperations) {
    throw new Error(`wire projection must remain an exact ${expectedProductOperations}-operation projection`);
  }

  const productOperationIds = new Set();
  const productAuthorityIds = new Set();
  const productPairs = new Set();
  for (const value of productOps) {
    if (!value.route.startsWith('/api/')) throw new Error(`Product route escaped /api surface: ${value.route}`);
    if (!value.operation.operationId || !value.operation['x-conexus-4a-id']) {
      throw new Error(`Product operation lost canonical identity: ${pair(value)}`);
    }
    productOperationIds.add(value.operation.operationId);
    productAuthorityIds.add(value.operation['x-conexus-4a-id']);
    productPairs.add(pair(value));
  }
  if (!productOperationIds.has('GetProjectBaselineCandidate') || !productAuthorityIds.has('PRJ-23')) {
    throw new Error('whole-4B Product wire lost accepted PRJ-23 candidate Baseline read');
  }
  if (!productOperationIds.has('AskConexusAboutBaselineCandidate') || !productAuthorityIds.has('PRJ-24')) {
    throw new Error('whole-4B Product wire lost accepted PRJ-24 candidate Baseline contextual read');
  }
  for (const [authorityId, operationId] of [
    ['IAM-18', 'ListWorkspaceMembershipCandidates'],
    ['IAM-19', 'GetWorkspaceMemberAccess'],
    ['IAM-20', 'GetAreaAccess'],
  ]) {
    if (!productAuthorityIds.has(authorityId) || !productOperationIds.has(operationId)) {
      throw new Error(`whole-4B Product wire lost accepted ${authorityId} ${operationId}`);
    }
  }

  const technicalPairs = new Set();
  for (const value of technicalOps) {
    if (!value.route.startsWith('/protocol/')) throw new Error(`Technical route escaped /protocol surface: ${value.route}`);
    if (value.operation['x-conexus-4a-id'] !== undefined) throw new Error(`Technical operation acquired Product authority: ${pair(value)}`);
    if (productOperationIds.has(value.operation.operationId)) throw new Error(`Technical operationId collided with Product: ${value.operation.operationId}`);
    technicalPairs.add(pair(value));
  }

  for (const value of projectOps) {
    if (value.operation['x-conexus-4a-id'] !== undefined) throw new Error(`generated Project operation acquired fixed Product authority: ${pair(value)}`);
    if (!value.route.startsWith('/api/projects/{projectId}/')) throw new Error(`generated Project operation escaped static Project root: ${value.route}`);
    if (value.route.includes('{operationSlug}') || /(^|\/)execute(\/|$)/i.test(value.route)) {
      throw new Error(`generated Project operation became generic dispatch: ${value.route}`);
    }

    const expectedSuffix = slugifyOperationId(value.operation.operationId ?? '');
    if (!expectedSuffix || !value.route.endsWith(`/${expectedSuffix}`)) {
      throw new Error(`generated Project operation path is not derived from exact operationId: ${pair(value)}`);
    }

    const httpCallers = value.operation['x-conexus-http-callers'];
    const nonHttpCallers = value.operation['x-conexus-non-http-callers'];
    if (!Array.isArray(httpCallers) || httpCallers.length === 0) {
      throw new Error(`${value.operation.operationId} lost exact HTTP caller/authorization projection`);
    }
    if (!Array.isArray(nonHttpCallers)) {
      throw new Error(`${value.operation.operationId} lost explicit non-HTTP caller classification`);
    }
    if (!value.operation['x-conexus-scope']) throw new Error(`${value.operation.operationId} lost Project scope projection`);
    if (!value.operation['x-conexus-effect-class']) throw new Error(`${value.operation.operationId} lost effect-class projection`);

    for (const caller of httpCallers) {
      if (!['PUBLISHED_APP', 'CONTROL_PLANE'].includes(caller?.kind)) {
        throw new Error(`${value.operation.operationId} converted non-HTTP caller ${caller?.kind ?? '<missing>'} into HTTP authority`);
      }
    }
    for (const caller of nonHttpCallers) {
      if (!['PAR_TOOL', 'MAR_JOB', 'DEDICATED_SERVICE_SCOPED'].includes(caller?.kind)) {
        throw new Error(`${value.operation.operationId} has invalid non-HTTP caller classification ${caller?.kind ?? '<missing>'}`);
      }
    }
  }

  const projectPairs = new Set(projectOps.map(pair));
  for (const candidate of technicalPairs) if (productPairs.has(candidate) || projectPairs.has(candidate)) throw new Error(`Technical method+path collided across surfaces: ${candidate}`);
  for (const candidate of projectPairs) if (productPairs.has(candidate)) throw new Error(`Project-generated method+path collided with fixed Product wire: ${candidate}`);

  const projectedById = new Map(currentProjection.operations.map((value) => [value.operationId, value]));
  if (projectedById.size !== expectedProductOperations) throw new Error('wire projection duplicated Product operationId');
  for (const value of productOps) {
    const projected = projectedById.get(value.operation.operationId);
    if (!projected) throw new Error(`wire projection lost Product operation ${value.operation.operationId}`);
    if (projected.authorityId !== value.operation['x-conexus-4a-id'] || projected.method !== value.method || projected.path !== value.route) {
      throw new Error(`wire projection drifted from canonical Product operation ${value.operation.operationId}`);
    }
  }
}

function deepClone(value) {
  return structuredClone(value);
}

function expectRejected(label, expectedMessage, mutate) {
  const mutated = {
    product: deepClone(product),
    technical: deepClone(technical),
    project: deepClone(budget),
    projection: deepClone(projection),
  };
  mutate(mutated);
  try {
    assertWhole(mutated.product, mutated.technical, mutated.project, mutated.projection);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expectedMessage)) {
      throw new Error(`negative control ${label} failed for wrong reason: ${message}`);
    }
    console.log(`negative control fired: ${label}`);
    return;
  }
  throw new Error(`negative control failed: ${label}`);
}

function firstOperation(oas) {
  for (const pathItem of Object.values(oas.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (methods.has(method)) return operation;
    }
  }
  throw new Error('no operation available for adversarial mutation');
}

assertWhole(product, technical, budget, projection);

expectRejected('Technical Ingress cannot acquire x-conexus-4a-id', 'Technical operation acquired Product authority', ({ technical: candidate }) => {
  firstOperation(candidate)['x-conexus-4a-id'] = 'IAM-01';
});
expectRejected('Product wire cannot escape into /protocol', 'Product route escaped /api surface', ({ product: candidate }) => {
  const [route, item] = Object.entries(candidate.paths)[0];
  delete candidate.paths[route];
  candidate.paths[`/protocol/adversarial${route}`] = item;
});
expectRejected('Project operation cannot become generic {operationSlug} dispatch', 'generated Project operation became generic dispatch', ({ project: candidate }) => {
  const [route, item] = Object.entries(candidate.paths)[0];
  delete candidate.paths[route];
  candidate.paths['/api/projects/{projectId}/queries/{operationSlug}'] = item;
});
expectRejected('generated wire projection cannot become editable authority', 'wire projection must remain PROJECTION_ONLY', ({ projection: candidate }) => {
  candidate.authority = 'EDITABLE_AUTHORITY';
});
expectRejected('generated wire projection cannot drift method/path identity', 'wire projection drifted from canonical Product operation', ({ projection: candidate }) => {
  candidate.operations[0].path = '/api/adversarial/drift';
});

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, ...options });
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}`);
  }
  return result;
}

function expectCommandFailure(label, command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, ...options });
  if (result.status === 0) throw new Error(`negative control failed: ${label}`);
  console.log(`negative control fired: ${label}`);
}

const probeRoot = '/tmp/conexus-whole-4b-project-probe';
const declarationDir = path.join(probeRoot, 'declarations');
const generatedPath = path.join(probeRoot, 'generated.json');
fs.rmSync(probeRoot, { recursive: true, force: true });
fs.mkdirSync(declarationDir, { recursive: true });

const baseDeclaration = {
  schemaVersion: 'project-operation/v1',
  operationId: 'InspectGovernedProjectState',
  regime: 'QUERY',
  inputSchema: { type: 'object', additionalProperties: false },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok'],
    properties: { ok: { type: 'boolean' } },
  },
  callers: [
    { kind: 'CONTROL_PLANE', permission: 'project.read' },
    { kind: 'PAR_TOOL' },
  ],
  scope: {
    workspace: 'CURRENT_WORKSPACE',
    project: 'CURRENT_PROJECT',
    publishedApp: 'NONE',
  },
  requiredPins: ['ACTIVE_RELEASE'],
  effectClass: 'READ_ONLY',
  outcomeProfile: 'READ',
  icProfiles: ['IC0'],
  proof: {
    positiveCaseId: 'whole-4b-project-mixed-ingress-positive',
    negativeControlId: 'whole-4b-project-mixed-ingress-negative',
  },
};

const declarationPath = path.join(declarationDir, 'InspectGovernedProjectState.operation.json');
fs.writeFileSync(declarationPath, `${JSON.stringify(baseDeclaration, null, 2)}\n`);
run('npx', ['--yes', 'ajv-cli@5.0.0', 'validate', '--spec=draft2020', '-s', projectSchemaPath, '-d', declarationPath]);
run('node', [projectGenerator, declarationDir, generatedPath, '--write']);

const generatedProbe = JSON.parse(fs.readFileSync(generatedPath, 'utf8'));
const generatedProbeOps = collectOperations(generatedProbe);
if (generatedProbeOps.length !== 1) throw new Error(`mixed-ingress Project probe expected one HTTP operation, found ${generatedProbeOps.length}`);
const probeOperation = generatedProbeOps[0].operation;
if (stable(probeOperation['x-conexus-http-callers']) !== stable([{ kind: 'CONTROL_PLANE', permission: 'project.read' }])) {
  throw new Error('Project HTTP projection lost exact CONTROL_PLANE permission');
}
if (stable(probeOperation['x-conexus-non-http-callers']) !== stable([{ kind: 'PAR_TOOL' }])) {
  throw new Error('Project HTTP projection converted or lost PAR_TOOL non-HTTP ingress');
}
if (stable(probeOperation['x-conexus-scope']) !== stable(baseDeclaration.scope)) throw new Error('Project HTTP projection lost exact declared scope');
if (probeOperation['x-conexus-effect-class'] !== 'READ_ONLY') throw new Error('Project HTTP projection lost effectClass');
if (generatedProbeOps[0].route !== '/api/projects/{projectId}/queries/inspect-governed-project-state') {
  throw new Error(`Project HTTP projection lost static exact route: ${generatedProbeOps[0].route}`);
}

const invalidPermission = deepClone(baseDeclaration);
invalidPermission.operationId = 'InvalidPermissionProbe';
invalidPermission.callers = [{ kind: 'CONTROL_PLANE', permission: 'root.admin' }];
const invalidPermissionPath = path.join(probeRoot, 'invalid-permission.operation.json');
fs.writeFileSync(invalidPermissionPath, `${JSON.stringify(invalidPermission, null, 2)}\n`);
expectCommandFailure('Project grammar rejects arbitrary global Permission', 'npx', ['--yes', 'ajv-cli@5.0.0', 'validate', '--spec=draft2020', '-s', projectSchemaPath, '-d', invalidPermissionPath]);

const invalidTarget = deepClone(baseDeclaration);
invalidTarget.operationId = 'CallerTargetProbe';
invalidTarget.targetUrl = 'https://attacker.invalid';
const invalidTargetPath = path.join(probeRoot, 'invalid-target.operation.json');
fs.writeFileSync(invalidTargetPath, `${JSON.stringify(invalidTarget, null, 2)}\n`);
expectCommandFailure('Project grammar rejects caller-selected target URL authority', 'npx', ['--yes', 'ajv-cli@5.0.0', 'validate', '--spec=draft2020', '-s', projectSchemaPath, '-d', invalidTargetPath]);

const genericDeclaration = deepClone(baseDeclaration);
genericDeclaration.operationId = 'execute';
genericDeclaration.callers = [{ kind: 'CONTROL_PLANE', permission: 'project.read' }];
const genericDir = path.join(probeRoot, 'generic');
fs.mkdirSync(genericDir, { recursive: true });
const genericPath = path.join(genericDir, 'execute.operation.json');
fs.writeFileSync(genericPath, `${JSON.stringify(genericDeclaration, null, 2)}\n`);
run('npx', ['--yes', 'ajv-cli@5.0.0', 'validate', '--spec=draft2020', '-s', projectSchemaPath, '-d', genericPath]);
expectCommandFailure('Project generator rejects generic execute dispatch after valid declaration admission', 'node', [projectGenerator, genericDir, path.join(probeRoot, 'generic.json'), '--write']);

console.log(`Whole 4B adversarial proof passed (${expectedProductOperations} fixed Product operations; cross-surface separation, Project grammar/HTTP projection, generated authority and negative controls).`);
