import fs from 'node:fs';
import { OPERATIONS } from '@conexus/contract';

const bundledProductOas = () => {
  if (process.env.CONEXUS_PRODUCT_OAS_BUNDLE) return JSON.parse(fs.readFileSync(process.env.CONEXUS_PRODUCT_OAS_BUNDLE, 'utf8'));
  return JSON.parse(fs.readFileSync('contracts/api/product/openapi.json', 'utf8'));
};

const productDirectory = 'contracts/api/product';
const httpMethods = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);

const leafDefinedOperations = () => {
  const operations = [];
  const files = fs.readdirSync(productDirectory).filter((name) => name.endsWith('-paths.yaml')).sort();
  if (files.length === 0) throw new Error(`no leaf contract files found under ${productDirectory}`);
  for (const file of files) {
    const lines = fs.readFileSync(`${productDirectory}/${file}`, 'utf8').split('\n');
    const pathsIndex = lines.indexOf('paths:');
    if (pathsIndex < 0) throw new Error(`leaf contract file has no top-level paths block: ${file}`);
    let currentPath = null;
    let current = null;
    let pathCount = 0;
    const close = () => { if (current) operations.push(current); current = null; };
    for (const line of lines.slice(pathsIndex + 1)) {
      if (line.trim() !== '' && /^\S/.test(line)) break;
      const pathMatch = /^ {2}(\/\S*):\s*$/.exec(line);
      if (pathMatch) {
        close();
        currentPath = pathMatch[1];
        pathCount += 1;
        continue;
      }
      const methodMatch = /^ {4}([a-z]+):\s*$/.exec(line);
      if (methodMatch && httpMethods.has(methodMatch[1])) {
        close();
        if (currentPath === null) throw new Error(`operation before any path in ${file}: ${line.trim()}`);
        current = { file, method: methodMatch[1].toUpperCase(), path: currentPath, fourAId: null };
        continue;
      }
      const idMatch = /^ {6}x-conexus-4a-id:\s*(\S+)\s*$/.exec(line);
      if (idMatch && current) current.fourAId = idMatch[1];
    }
    close();
    if (pathCount === 0) throw new Error(`no paths parsed from ${file}; the scanner does not understand its shape`);
  }
  return operations;
};

const oas = bundledProductOas();
const methods = httpMethods;

const bundledMethodPaths = new Set();
for (const [path, pathItem] of Object.entries(oas.paths ?? {})) {
  for (const method of Object.keys(pathItem ?? {})) {
    if (methods.has(method)) bundledMethodPaths.add(`${method.toUpperCase()} ${path}`);
  }
}
const leafOperations = leafDefinedOperations();
const leafMethodPaths = new Set(leafOperations.map((operation) => `${operation.method} ${operation.path}`));
const declaredOperations = new Map(Object.values(OPERATIONS).map((operation) => [
  `${operation.method} ${operation.path.replace(/:(\w+)/g, '{$1}')}`, operation,
]));

const unbundled = leafOperations
  .filter((operation) => !bundledMethodPaths.has(`${operation.method} ${operation.path}`))
  .map((operation) => `${operation.fourAId ?? '<no 4A id>'} ${operation.method} ${operation.path} (${operation.file})`);
if (unbundled.length > 0) {
  throw new Error(`leaf contract operations missing from the bundled Product OAS, add a $ref in openapi.yaml: ${unbundled.join(', ')}`);
}

const unsourced = [...bundledMethodPaths].filter((methodPath) => {
  if (leafMethodPaths.has(methodPath)) return false;
  const declared = declaredOperations.get(methodPath);
  if (!declared) return true;
  const [method, path] = methodPath.split(' ', 2);
  return oas.paths?.[path]?.[method.toLowerCase()]?.operationId !== declared.id;
});
if (unsourced.length > 0) {
  throw new Error(`bundled Product OAS operations with no leaf contract source: ${unsourced.join(', ')}`);
}

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

console.log(`wire bijection passed (${operationCount} Product operations; 0 unbundled; 0 unsourced; 0 duplicate).`);
