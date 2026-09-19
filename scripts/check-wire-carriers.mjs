import fs from 'node:fs';

const oas = JSON.parse(fs.readFileSync('/tmp/conexus-product-openapi.bundle.json', 'utf8'));
const methods = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);
const operations = new Map();
for (const [path, item] of Object.entries(oas.paths ?? {})) {
  for (const [method, operation] of Object.entries(item ?? {})) {
    if (!methods.has(method) || !operation?.['x-conexus-4a-id']) continue;
    const id = operation['x-conexus-4a-id'];
    if (operations.has(id)) throw new Error(`duplicate current operation ${id}`);
    operations.set(id, { path, method: method.toUpperCase(), operation });
  }
}
const current = new Set(operations.keys());
const historical = ['PRJ-11', 'PRJ-12', 'PAR-10', 'PAR-14', 'PAR-15', 'REL-06', 'IAM-15', 'IAM-17'];
for (const id of historical) if (current.has(id)) throw new Error(`retained carrier ${id} is in the current Product OAS`);
const carriers = new Map([...operations].filter(([, entry]) => entry.operation['x-conexus-current-state-carrier'] && entry.operation['x-conexus-current-state-carrier'] !== 'NONE').map(([id, entry]) => [id, entry.operation['x-conexus-current-state-carrier']]));
const expected = new Map([
  ['IAM-02', 'OWNER_CURRENT'], ['IAM-03', 'IDEMPOTENCY_KEY'], ['WS-01', 'IDEMPOTENCY_KEY'],
  ['IAM-05', 'OWNER_CURRENT'], ['IAM-06', 'OWNER_CURRENT'], ['IAM-10', 'OWNER_CURRENT'],
  ['PRJ-03', 'IDEMPOTENCY_KEY'], ['BLD-24', 'IDEMPOTENCY_KEY'],
]);
if (JSON.stringify([...carriers].sort()) !== JSON.stringify([...expected].sort())) throw new Error(`current carrier set mismatch: ${JSON.stringify([...carriers])}`);
for (const [id, value] of expected) if (carriers.get(id) !== value) throw new Error(`carrier mismatch for ${id}`);
for (const [id, entry] of operations) {
  const params = [...(entry.operation.parameters ?? [])];
  if (params.some(param => param.in === 'header' && ['If-Match', 'If-None-Match'].includes(param.name))) throw new Error(`${id} carries retained conditional header`);
  if (entry.operation['x-conexus-current-state-carrier'] === 'IDEMPOTENCY_KEY' && !params.some(param => param.name === 'Idempotency-Key' || (param.$ref ?? '').includes('IdempotencyKey'))) throw new Error(`${id} is missing Idempotency-Key`);
}
console.log(`current carrier proof passed (${operations.size} operations; ${carriers.size} current state carriers; no retained conditional carriers)`);
