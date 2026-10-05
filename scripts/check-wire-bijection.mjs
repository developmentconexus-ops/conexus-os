import fs from 'node:fs';
import { OPERATIONS } from '../packages/contract/dist/index.js';

const bundledProductOas = () => {
  if (process.env.CONEXUS_PRODUCT_OAS_BUNDLE) return JSON.parse(fs.readFileSync(process.env.CONEXUS_PRODUCT_OAS_BUNDLE, 'utf8'));
  return JSON.parse(fs.readFileSync('contracts/api/product/openapi.json', 'utf8'));
};

const ledgerPath = 'docs/product/operation-ledger.md';
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

// The census ends at the next top-level heading, whatever it is. Naming one particular
// successor heading tied this gate to a section that has since been deleted, and a rename
// there would have failed the gate for a reason that has nothing to do with the wire.
const ledger = fs.readFileSync(ledgerPath, 'utf8');
const censusHeading = /^# \d+[A-Z]?\. Current fixed Product census\s*$/m.exec(ledger);
if (!censusHeading) {
  throw new Error('unable to locate fixed-platform census in operation ledger');
}
const sectionStart = censusHeading.index;
const afterHeading = ledger.indexOf('\n', sectionStart);
const nextHeading = ledger.indexOf('\n# ', afterHeading);
const sectionEnd = nextHeading < 0 ? ledger.length : nextHeading;

const fixedSection = ledger.slice(sectionStart, sectionEnd);

// The id grammar allows a letter suffix (BLD-05B). The previous pattern required a purely numeric
// suffix and skipped anything else, so a census row could be dropped without a word and the count
// on both sides would simply agree one lower. Every data row in the census must now parse, or the
// gate fails naming the row it could not read.
const rowPattern = /^\| `([A-Z][A-Z0-9]*-(?:\d+[A-Z]?|[A-Z]{2,}))` \| `([A-Za-z][A-Za-z0-9]+)` \|/;
const expectedById = new Map();
for (const line of fixedSection.split('\n')) {
  if (!line.startsWith('|')) continue;
  if (/^\|\s*ID\s*\|/.test(line)) continue;
  if (/^\|[\s|-]+\|?$/.test(line)) continue;
  const match = rowPattern.exec(line);
  if (!match) {
    throw new Error(`unparsable 4A census row in operation ledger: ${line.trim()}`);
  }
  const [, id, operationId] = match;
  if (expectedById.has(id)) {
    throw new Error(`duplicate 4A operation id in ledger: ${id}`);
  }
  expectedById.set(id, operationId);
}

if (expectedById.size === 0) {
  throw new Error('fixed-platform census contains no 4A operations');
}

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
const declaredOperations = new Map(OPERATIONS.map((operation) => [
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

const actual = [];
for (const [path, pathItem] of Object.entries(oas.paths ?? {})) {
  if (path.includes('{operationSlug}') || /(^|\/)execute(\/|$)/i.test(path)) {
    throw new Error(`forbidden generic executor-shaped Product path: ${path}`);
  }
  for (const [method, operation] of Object.entries(pathItem ?? {})) {
    if (!methods.has(method)) continue;
    const operationId = operation?.operationId;
    const source = leafOperations.find((leaf) => leaf.method === method.toUpperCase() && leaf.path === path);
    const declared = declaredOperations.get(`${method.toUpperCase()} ${path}`);
    const fourAId = source?.fourAId ?? declared?.id;
    if (!operationId || !fourAId) {
      throw new Error(`wire operation missing operationId or source id: ${method.toUpperCase()} ${path}`);
    }
    actual.push({ fourAId, operationId, method: method.toUpperCase(), path, declared: declared !== undefined });
  }
}

if (actual.length !== expectedById.size) {
  throw new Error(`4A/OAS census mismatch: ledger has ${expectedById.size} fixed operations, wire has ${actual.length}`);
}

const seenIds = new Set();
const seenOperationIds = new Set();
const seenMethodPath = new Set();
for (const entry of actual) {
  if (seenIds.has(entry.fourAId)) throw new Error(`duplicate x-conexus-4a-id: ${entry.fourAId}`);
  if (seenOperationIds.has(entry.operationId)) throw new Error(`duplicate operationId: ${entry.operationId}`);
  const methodPath = `${entry.method} ${entry.path}`;
  if (seenMethodPath.has(methodPath)) throw new Error(`duplicate method+path: ${methodPath}`);
  seenIds.add(entry.fourAId);
  seenOperationIds.add(entry.operationId);
  seenMethodPath.add(methodPath);

  const expectedOperationId = expectedById.get(entry.fourAId);
  if (!expectedOperationId) {
    throw new Error(`wire-only Product operation not admitted by 4A: ${entry.fourAId} ${entry.operationId}`);
  }
  if (entry.declared ? entry.operationId !== entry.fourAId : expectedOperationId !== entry.operationId) {
    throw new Error(`4A/OAS identity mismatch for ${entry.fourAId}: expected ${expectedOperationId}, got ${entry.operationId}`);
  }
}

for (const [id, operationId] of expectedById) {
  if (!seenIds.has(id)) throw new Error(`4A operation missing from Product OAS: ${id} ${operationId}`);
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

console.log(`4A↔OAS bijection passed (${actual.length} fixed Product operations; 0 missing; 0 extra; 0 duplicate).`);
