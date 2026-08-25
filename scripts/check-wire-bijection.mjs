import fs from 'node:fs';

const ledgerPath = 'docs/product/operation-ledger.md';
const bundlePath = '/tmp/conexus-product-openapi.bundle.json';
const allowedContractStates = new Set(['METHOD_PATH_MAPPED', 'SCHEMA_CLOSED']);

const ledger = fs.readFileSync(ledgerPath, 'utf8');
const sectionStart = ledger.indexOf('# 5. Fixed Conexus platform census');
const sectionEnd = ledger.indexOf('\n---\n\n## 6. Product-visible Published Application boundary', sectionStart);
if (sectionStart < 0 || sectionEnd < 0) {
  throw new Error('unable to locate fixed-platform census in operation ledger');
}

const fixedSection = ledger.slice(sectionStart, sectionEnd);
const rowPattern = /^\| `([A-Z]+-\d+)` \| `([A-Za-z][A-Za-z0-9]+)` \|/gm;
const expectedById = new Map();
for (const match of fixedSection.matchAll(rowPattern)) {
  const [, id, operationId] = match;
  if (expectedById.has(id)) {
    throw new Error(`duplicate 4A operation id in ledger: ${id}`);
  }
  expectedById.set(id, operationId);
}

if (expectedById.size === 0) {
  throw new Error('fixed-platform census contains no 4A operations');
}

const oas = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
const methods = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);
const actual = [];
for (const [path, pathItem] of Object.entries(oas.paths ?? {})) {
  if (path.includes('{operationSlug}') || /(^|\/)execute(\/|$)/i.test(path)) {
    throw new Error(`forbidden generic executor-shaped Product path: ${path}`);
  }
  for (const [method, operation] of Object.entries(pathItem ?? {})) {
    if (!methods.has(method)) continue;
    const operationId = operation?.operationId;
    const fourAId = operation?.['x-conexus-4a-id'];
    if (!operationId || !fourAId) {
      throw new Error(`wire operation missing operationId or x-conexus-4a-id: ${method.toUpperCase()} ${path}`);
    }
    const contractState = operation?.['x-conexus-contract-state'];
    if (!allowedContractStates.has(contractState)) {
      throw new Error(`unexpected 4B contract state for ${operationId}: ${contractState ?? '<missing>'}`);
    }
    actual.push({ fourAId, operationId, method: method.toUpperCase(), path, contractState });
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
  if (expectedOperationId !== entry.operationId) {
    throw new Error(`4A/OAS identity mismatch for ${entry.fourAId}: expected ${expectedOperationId}, got ${entry.operationId}`);
  }
}

for (const [id, operationId] of expectedById) {
  if (!seenIds.has(id)) throw new Error(`4A operation missing from Product OAS: ${id} ${operationId}`);
}

const schemaClosed = actual.filter((entry) => entry.contractState === 'SCHEMA_CLOSED').length;
console.log(`4A↔OAS bijection passed (${actual.length} fixed Product operations; ${schemaClosed} schema-closed; 0 missing; 0 extra; 0 duplicate).`);
