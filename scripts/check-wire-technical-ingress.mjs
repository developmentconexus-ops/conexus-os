import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const technicalSource = 'contracts/api/technical/openapi.yaml';
const technicalBundle = '/tmp/conexus-technical-openapi.bundle.json';
const productBundle = '/tmp/conexus-product-openapi.bundle.json';
const expectedProductOperations = 113;

if (!fs.existsSync(technicalSource)) {
  throw new Error('Technical Ingress contract is missing');
}
if (!fs.existsSync(productBundle)) {
  throw new Error('Product bundle must exist before Technical Ingress verification');
}

const bundled = spawnSync(
  'npx',
  ['--yes', '@redocly/cli@2.47.0', 'bundle', technicalSource, `--output=${technicalBundle}`, '--ext=json'],
  { encoding: 'utf8' },
);
if (bundled.status !== 0) {
  process.stdout.write(bundled.stdout ?? '');
  process.stderr.write(bundled.stderr ?? '');
  throw new Error('Technical Ingress OpenAPI bundle failed');
}

const technical = JSON.parse(fs.readFileSync(technicalBundle, 'utf8'));
const product = JSON.parse(fs.readFileSync(productBundle, 'utf8'));
const methods = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);

function collectOperations(oas) {
  const values = [];
  for (const [path, pathItem] of Object.entries(oas.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (!methods.has(method)) continue;
      values.push({ path, method: method.toUpperCase(), operation, pathItem });
    }
  }
  return values;
}

const productOperations = collectOperations(product);
if (productOperations.length !== expectedProductOperations) {
  throw new Error(`Technical Ingress proof expects the current ${expectedProductOperations}-operation Product census, found ${productOperations.length}`);
}
const productOperationIds = new Set(productOperations.map(({ operation }) => operation?.operationId).filter(Boolean));
const technicalOperations = collectOperations(technical);

const expected = new Map([
  ['TI-01', { operationId: 'BeginOidcLoginProtocol', method: 'GET', path: '/protocol/oidc/login' }],
  ['TI-02', { operationId: 'CompleteOidcCallbackProtocol', method: 'GET', path: '/protocol/oidc/callback' }],
  ['TI-03', { operationId: 'StreamAgentRunProjection', method: 'GET', path: '/protocol/projects/{projectId}/agent-runs/{agentRunId}/stream' }],
]);

if (technical['x-conexus-surface'] !== 'TECHNICAL_INGRESS') {
  throw new Error('Technical Ingress OAS must identify x-conexus-surface=TECHNICAL_INGRESS');
}
if (technical['x-conexus-product-operation-count-impact'] !== 0) {
  throw new Error('Technical Ingress must have zero impact on N_platform');
}
if (technicalOperations.length !== expected.size) {
  throw new Error(`Technical Ingress must contain exactly ${expected.size} current F1 operations, found ${technicalOperations.length}`);
}

const byTechnicalId = new Map();
for (const value of technicalOperations) {
  const operation = value.operation ?? {};
  const id = operation['x-conexus-technical-id'];
  if (!id) throw new Error(`${value.method} ${value.path} is missing x-conexus-technical-id`);
  if (byTechnicalId.has(id)) throw new Error(`duplicate Technical Ingress id ${id}`);
  byTechnicalId.set(id, value);

  if (operation['x-conexus-4a-id'] !== undefined) {
    throw new Error(`${id} must not carry x-conexus-4a-id Product authority`);
  }
  if (operation['x-conexus-surface'] !== 'TECHNICAL_INGRESS') {
    throw new Error(`${id} must remain classified as TECHNICAL_INGRESS`);
  }
  if (operation['x-conexus-protocol-state'] !== 'PROTOCOL_CLOSED') {
    throw new Error(`${id} is not PROTOCOL_CLOSED`);
  }
  if (productOperationIds.has(operation.operationId)) {
    throw new Error(`${id} operationId collides with Product operationId ${operation.operationId}`);
  }
  if (!value.path.startsWith('/protocol/')) {
    throw new Error(`${id} must remain outside Product /api namespaces`);
  }
  if (operation.requestBody) throw new Error(`${id} must not accept an arbitrary request body`);
  for (const response of Object.values(operation.responses ?? {})) {
    if (response?.['x-conexus-provisional'] === true) throw new Error(`${id} still has provisional response authority`);
  }
}

for (const [id, shape] of expected) {
  const value = byTechnicalId.get(id);
  if (!value) throw new Error(`Technical Ingress contract missing ${id}`);
  if (value.operation.operationId !== shape.operationId || value.method !== shape.method || value.path !== shape.path) {
    throw new Error(`${id} drifted: expected ${shape.method} ${shape.path} ${shape.operationId}`);
  }
}

function resolveLocalRef(value, oas = technical) {
  if (!value?.$ref || !value.$ref.startsWith('#/')) return value;
  return value.$ref
    .slice(2)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((node, part) => node?.[part], oas);
}

function resolvedParameters(value) {
  const parameters = new Map();
  for (const candidate of [...(value.pathItem.parameters ?? []), ...(value.operation.parameters ?? [])]) {
    const resolved = resolveLocalRef(candidate);
    parameters.set(`${resolved?.in}\0${resolved?.name}`, resolved);
  }
  return [...parameters.values()];
}

function parameter(value, where, name) {
  return resolvedParameters(value).find((candidate) => candidate?.in === where && candidate?.name === name);
}

function assertNoQuery(value, id) {
  const query = resolvedParameters(value).filter((candidate) => candidate?.in === 'query');
  if (query.length) throw new Error(`${id} must not invent query controls: ${query.map((x) => x.name).join(',')}`);
}

function assertRedirect(value, status, id) {
  const response = resolveLocalRef(value.operation.responses?.[status]);
  if (!response) throw new Error(`${id} must return ${status}`);
  const location = resolveLocalRef(response.headers?.Location);
  if (!location?.schema || location.schema.type !== 'string' || location.schema.minLength !== 1) {
    throw new Error(`${id} ${status} must carry a non-empty Location header`);
  }
}

// TI-01: Conexus owns state/PKCE generation; caller cannot choose issuer/client/redirect mechanics.
const ti01 = byTechnicalId.get('TI-01');
assertNoQuery(ti01, 'TI-01');
if (JSON.stringify(ti01.operation.security ?? null) !== '[]') throw new Error('TI-01 must be a pre-session public protocol endpoint');
assertRedirect(ti01, '302', 'TI-01');
if (ti01.operation['x-conexus-oidc-flow'] !== 'AUTHORIZATION_CODE_PKCE_S256') {
  throw new Error('TI-01 must remain Authorization Code + PKCE S256');
}

// TI-02: successful allowlisted OIDC callback accepts only code+state and establishes Conexus-owned session.
const ti02 = byTechnicalId.get('TI-02');
const callbackQuery = resolvedParameters(ti02).filter((candidate) => candidate?.in === 'query');
const callbackNames = callbackQuery.map((candidate) => candidate.name).sort();
if (JSON.stringify(callbackNames) !== JSON.stringify(['code', 'state'])) {
  throw new Error(`TI-02 success callback must expose only code+state, found ${callbackNames.join(',')}`);
}
for (const name of ['code', 'state']) {
  const candidate = parameter(ti02, 'query', name);
  if (!candidate || candidate.required !== true || candidate.schema?.type !== 'string' || candidate.schema?.minLength !== 1) {
    throw new Error(`TI-02 ${name} must be a required opaque protocol value`);
  }
}
if (JSON.stringify(ti02.operation.security ?? null) !== '[]') throw new Error('TI-02 must be a pre-session public callback endpoint');
assertRedirect(ti02, '303', 'TI-02');
const setCookie = resolveLocalRef(ti02.operation.responses?.['303']?.headers?.['Set-Cookie']);
if (!setCookie?.schema || setCookie.schema.type !== 'string' || !/Conexus-owned opaque session/i.test(setCookie.description ?? '')) {
  throw new Error('TI-02 must establish the Conexus-owned opaque session without exposing Keycloak bearer authority');
}

// TI-03: exact AgentRun projection, authenticated by current Conexus session; no resume/runtime override surface.
const ti03 = byTechnicalId.get('TI-03');
assertNoQuery(ti03, 'TI-03');
for (const name of ['projectId', 'agentRunId']) {
  const candidate = parameter(ti03, 'path', name);
  if (!candidate || candidate.required !== true || candidate.schema?.type !== 'string' || candidate.schema?.minLength !== 1) {
    throw new Error(`TI-03 ${name} must be a required opaque path reference`);
  }
}
const streamSecurity = ti03.operation.security ?? [];
if (!streamSecurity.some((entry) => Object.hasOwn(entry, 'ConexusSession'))) {
  throw new Error('TI-03 must require current ConexusSession carriage');
}
const streamResponse = resolveLocalRef(ti03.operation.responses?.['200']);
const streamSchema = resolveLocalRef(streamResponse?.content?.['text/event-stream']?.schema);
if (!streamSchema || streamSchema.type !== 'string') throw new Error('TI-03 must expose an SSE text/event-stream projection');
for (const status of ['401', '403', '404', '409']) {
  if (!ti03.operation.responses?.[status]) throw new Error(`TI-03 must preserve ${status} protocol failure semantics`);
}
const projection = ti03.operation['x-conexus-stream-projection'];
if (!projection || projection.identity !== 'AGENT_RUN' || projection.terminalTruth !== false || projection.rawReasoning !== false || projection.frameworkIdsAuthoritative !== false || projection.resume !== 'DEFERRED_REQUALIFICATION') {
  throw new Error('TI-03 must remain a non-authoritative AgentRun stream projection with resume deferred');
}

const forbiddenParameterNames = new Set([
  'issuer', 'clientId', 'client_id', 'redirectUri', 'redirect_uri', 'codeVerifier', 'code_verifier',
  'realm', 'provider', 'model', 'releaseId', 'mastraRunId', 'runId', 'toolCallId', 'threadId',
  'requestContext', 'resumeToken', 'lastEventId', 'Last-Event-ID', 'workerId', 'queueId', 'scheduleId',
]);
for (const [id, value] of byTechnicalId) {
  for (const candidate of resolvedParameters(value)) {
    if (forbiddenParameterNames.has(candidate?.name)) {
      throw new Error(`${id} exposes forbidden caller/runtime protocol control ${candidate.name}`);
    }
  }
}

const forbiddenPathFragments = ['/webhooks', '/webhook', '/schedule', '/queue', '/worker', '/runtime-bus', '/rpc', '/resume', '/reconnect'];
for (const { path } of technicalOperations) {
  for (const fragment of forbiddenPathFragments) {
    if (path.includes(fragment)) throw new Error(`Technical Ingress must not prebuild unused ${fragment} surface`);
  }
}

console.log(`Technical Ingress contract passed (3 protocol-only operations; Product-count impact remains 0 over the current ${expectedProductOperations}-operation Product census, and schedule/MAR/runtime mechanics remain internal).`);
