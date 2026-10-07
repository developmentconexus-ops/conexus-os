import fs from 'node:fs';
import { OPERATIONS } from '@conexus/contract';

const bundledProductOas = () => {
  if (process.env.CONEXUS_PRODUCT_OAS_BUNDLE) return JSON.parse(fs.readFileSync(process.env.CONEXUS_PRODUCT_OAS_BUNDLE, 'utf8'));
  return JSON.parse(fs.readFileSync('contracts/api/product/openapi.json', 'utf8'));
};

const methods = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);

const oas = bundledProductOas();

const seenOperationIds = new Set();
const seenMethodPath = new Set();
let operationCount = 0;
for (const [path, pathItem] of Object.entries(oas.paths ?? {})) {
  if (path.includes('{operationSlug}') || /(^|\/)execute(\/|$)/i.test(path)) {
    throw new Error(`forbidden generic executor-shaped Product path: ${path}`);
  }
  for (const [method, operation] of Object.entries(pathItem ?? {})) {
    if (!methods.has(method)) continue;
    const operationId = operation?.operationId;
    if (!operationId) throw new Error(`wire operation missing operationId: ${method.toUpperCase()} ${path}`);
    if (seenOperationIds.has(operationId)) throw new Error(`duplicate operationId: ${operationId}`);
    const methodPath = `${method.toUpperCase()} ${path}`;
    if (seenMethodPath.has(methodPath)) throw new Error(`duplicate method+path: ${methodPath}`);
    seenOperationIds.add(operationId);
    seenMethodPath.add(methodPath);
    operationCount += 1;
  }
}

const declaredOperations = new Map(Object.values(OPERATIONS).map((operation) => [
  `${operation.method} ${operation.path.replace(/:(\w+)/g, '{$1}')}`, operation.id,
]));
const unsourced = [...seenMethodPath].filter((methodPath) => {
  const [method, path] = methodPath.split(' ', 2);
  return oas.paths[path][method.toLowerCase()].operationId !== declaredOperations.get(methodPath);
});
if (unsourced.length > 0) {
  throw new Error(`Product OAS operations with no declared operation in @conexus/contract: ${unsourced.join(', ')}`);
}

const CREDENTIAL_FIELDS = new Set(['clientId', 'clientSecret', 'xToken', 'credential', 'credentialSealed']);
const walkProperties = (schema, onProperty) => {
  if (!schema || typeof schema !== 'object') return;
  for (const [name, property] of Object.entries(schema.properties ?? {})) { onProperty(name, property); walkProperties(property, onProperty); }
  if (schema.items) walkProperties(schema.items, onProperty);
  for (const key of ['oneOf', 'anyOf', 'allOf']) for (const branch of schema[key] ?? []) walkProperties(branch, onProperty);
};

for (const pathItem of Object.values(oas.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem ?? {})) {
    if (!methods.has(method)) continue;
    for (const [status, response] of Object.entries(operation.responses ?? {})) {
      if (status[0] !== '2') continue;
      walkProperties(response.content?.['application/json']?.schema, (name) => {
        if (CREDENTIAL_FIELDS.has(name)) throw new Error(`a successful response schema of ${operation.operationId} carries the credential field ${name}`);
      });
    }
    walkProperties(operation.requestBody?.content?.['application/json']?.schema, (name, property) => {
      if (CREDENTIAL_FIELDS.has(name) && name !== 'credential' && property?.writeOnly !== true) {
        throw new Error(`credential field ${name} of ${operation.operationId} is not writeOnly`);
      }
    });
  }
}

console.log(`wire bijection passed (${operationCount} Product operations; 0 unsourced; 0 duplicate).`);
