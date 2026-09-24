import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const source = 'contracts/api/technical/openapi.yaml';
const output = '/tmp/conexus-technical-openapi.bundle.json';
const product = JSON.parse(fs.readFileSync('/tmp/conexus-product-openapi.bundle.json', 'utf8'));
const result = spawnSync('npx', ['--yes', '@redocly/cli@2.47.0', 'bundle', source, `--output=${output}`, '--ext=json'], { encoding: 'utf8' });
if (result.status !== 0) { process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? ''); throw new Error('Technical Ingress bundle failed'); }
const oas = JSON.parse(fs.readFileSync(output, 'utf8'));
const methods = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);
const operations = Object.entries(oas.paths ?? {}).flatMap(([path, item]) => Object.entries(item ?? {}).filter(([method]) => methods.has(method)).map(([method, operation]) => ({ path, method: method.toUpperCase(), operation })));
if (oas['x-conexus-surface'] !== 'TECHNICAL_INGRESS' || oas['x-conexus-product-operation-count-impact'] !== 0) throw new Error('Technical Ingress metadata drifted');
const expected = new Map([['TI-01', ['GET', '/protocol/oidc/login', 'BeginOidcLoginProtocol']], ['TI-02', ['GET', '/protocol/oidc/callback', 'CompleteOidcCallbackProtocol']]]);
if (operations.length !== expected.size) throw new Error(`Technical Ingress must contain ${expected.size} current protocols, found ${operations.length}`);
for (const value of operations) {
  const id = value.operation['x-conexus-technical-id'];
  const shape = expected.get(id);
  if (!shape || value.method !== shape[0] || value.path !== shape[1] || value.operation.operationId !== shape[2]) throw new Error(`unexpected current Technical Ingress operation ${id ?? value.path}`);
  if (value.operation['x-conexus-surface'] !== 'TECHNICAL_INGRESS' || value.operation['x-conexus-protocol-state'] !== 'PROTOCOL_CLOSED') throw new Error(`${id} metadata drifted`);
  if (product.paths?.[value.path]) throw new Error(`${id} overlaps Product OAS`);
}
const byId = new Map(operations.map(value => [value.operation['x-conexus-technical-id'], value]));
const ti01 = byId.get('TI-01');
if (JSON.stringify(ti01.operation.security ?? null) !== '[]' || ti01.operation['x-conexus-oidc-flow'] !== 'AUTHORIZATION_CODE_PKCE_S256') throw new Error('TI-01 must be the server-owned public PKCE login protocol');
if (!ti01.operation.responses?.['302']?.headers?.Location) throw new Error('TI-01 must return a server-derived redirect Location');
const loginParameters = (ti01.operation.parameters ?? []).filter(parameter => parameter.in === 'query');
if (JSON.stringify(loginParameters.map(parameter => parameter.name).sort()) !== JSON.stringify(['application', 'binding'])) throw new Error('TI-01 must accept only the optional application and binding query values');
if (loginParameters.some(parameter => parameter.required !== false || parameter.schema?.type !== 'string' || !parameter.schema?.pattern)) throw new Error('TI-01 application/binding must be optional, patterned values');
const ti02 = byId.get('TI-02');
if (JSON.stringify(ti02.operation.security ?? null) !== '[]') throw new Error('TI-02 must be the public OIDC callback protocol');
const callbackParameters = (ti02.operation.parameters ?? []).filter(parameter => parameter.in === 'query');
if (JSON.stringify(callbackParameters.map(parameter => parameter.name).sort()) !== JSON.stringify(['code', 'state'])) throw new Error('TI-02 must accept only code and state query values');
if (callbackParameters.some(parameter => parameter.required !== true || parameter.schema?.type !== 'string' || parameter.schema?.minLength !== 1)) throw new Error('TI-02 code/state must be required opaque values');
if (!ti02.operation.responses?.['303']?.headers?.['Set-Cookie']) throw new Error('TI-02 must establish the Conexus session cookie');
console.log(`Technical Ingress current proof passed (${operations.length} protocols; TI-03 preserved outside current contract and TI-04 legacy)`);
