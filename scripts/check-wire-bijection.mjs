import fs from 'node:fs';

const ledgerPath = 'docs/product/operation-ledger.md';
// A fixed name under /tmp is shared with anything else running on the machine, and the gate's
// own tests need to point it at a controlled fixture.
const bundlePath = process.env.CONEXUS_PRODUCT_OAS_BUNDLE ?? '/tmp/conexus-product-openapi.bundle.json';
const productDirectory = 'contracts/api/product';
const allowedContractStates = new Set(['METHOD_PATH_MAPPED', 'SCHEMA_CLOSED']);
const httpMethods = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);

// openapi.yaml lists every path by an explicit $ref, so the bundle contains only what that list
// names. An operation added to a leaf *-paths.yaml alone is invisible to every check that reads
// the bundle, and this gate used to be one of them.
//
// The leaf files used to also hold operations retained for future surfaces that were deliberately
// left unwired, which forced this gate to match by 4A id against the census rather than demand a
// full leaf-to-bundle bijection. Those retained-but-unwired paths are gone (contract only for
// surfaces that were never built or were removed); every remaining leaf path is bundled contract,
// so the bijection below is unconditional: every leaf path must be bundled, and every bundled
// operation must be a leaf path, with no id- or census-based exemption for either direction.
//
// This scans rather than parses YAML, so it refuses anything it does not positively understand
// instead of returning an empty set. Silent under-reporting is the defect being fixed here; a
// scanner that finds nothing and passes would reproduce it exactly.
const leafDefinedOperations = () => {
  const operations = [];
  const files = fs.readdirSync(productDirectory).filter((name) => name.endsWith('-paths.yaml')).sort();
  if (files.length === 0) throw new Error(`no leaf contract files found under ${productDirectory}`);
  for (const file of files) {
    const lines = fs.readFileSync(`${productDirectory}/${file}`, 'utf8').split('\n');
    const pathsIndex = lines.findIndex((line) => line === 'paths:');
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

const ledger = fs.readFileSync(ledgerPath, 'utf8');
const sectionStart = ledger.indexOf('# 5. Current fixed Product census');
const sectionEnd = ledger.indexOf('\n# 5A. Broader retained historical/platform ledger');
if (sectionStart < 0 || sectionEnd < 0) {
  throw new Error('unable to locate fixed-platform census in operation ledger');
}

const fixedSection = ledger.slice(sectionStart, sectionEnd);

// The id grammar allows a letter suffix (CLA-05B). The previous pattern required a purely numeric
// suffix and skipped anything else, so a census row could be dropped without a word and the count
// on both sides would simply agree one lower. Every data row in the census must now parse, or the
// gate fails naming the row it could not read.
const rowPattern = /^\| `([A-Z][A-Z0-9]*-\d+[A-Z]?)` \| `([A-Za-z][A-Za-z0-9]+)` \|/;
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

const oas = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
const methods = httpMethods;

const bundledMethodPaths = new Set();
for (const [path, pathItem] of Object.entries(oas.paths ?? {})) {
  for (const method of Object.keys(pathItem ?? {})) {
    if (methods.has(method)) bundledMethodPaths.add(`${method.toUpperCase()} ${path}`);
  }
}
const leafOperations = leafDefinedOperations();
const leafMethodPaths = new Set(leafOperations.map((operation) => `${operation.method} ${operation.path}`));

// Absolute in both directions: no leaf path may be left unbundled (there is no longer a retained,
// deliberately-unwired category to exempt), and no path may be bundled without a leaf source.
const unbundled = leafOperations
  .filter((operation) => !bundledMethodPaths.has(`${operation.method} ${operation.path}`))
  .map((operation) => `${operation.fourAId ?? '<no 4A id>'} ${operation.method} ${operation.path} (${operation.file})`);
if (unbundled.length > 0) {
  throw new Error(`leaf contract operations missing from the bundled Product OAS, add a $ref in openapi.yaml: ${unbundled.join(', ')}`);
}

const unsourced = [...bundledMethodPaths].filter((methodPath) => !leafMethodPaths.has(methodPath));
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
