import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const productBundle = '/tmp/conexus-product-openapi.bundle.json';
const generator = 'scripts/generate-wire-projection.mjs';
const kubbProbe = 'scripts/run-kubb-wire-probe.mjs';
const expectedProductOperations = 113;

if (!fs.existsSync(productBundle)) {
  throw new Error('Product bundle must exist before generated projection verification');
}
if (!fs.existsSync(generator) || !fs.existsSync(kubbProbe)) {
  throw new Error('Generated wire projection proof is missing');
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
  return result;
}

const manifestA = '/tmp/conexus-wire-projection-a.json';
const manifestB = '/tmp/conexus-wire-projection-b.json';
run('node', [generator, productBundle, manifestA]);
run('node', [generator, productBundle, manifestB]);

const bytesA = fs.readFileSync(manifestA);
const bytesB = fs.readFileSync(manifestB);
if (!bytesA.equals(bytesB)) {
  throw new Error('Generated wire projection is not byte-deterministic');
}

const manifest = JSON.parse(bytesA.toString('utf8'));
if (manifest.schemaVersion !== 'conexus-wire-projection/v1') {
  throw new Error('Generated wire projection schemaVersion drifted');
}
if (!Array.isArray(manifest.operations) || manifest.operations.length !== expectedProductOperations) {
  throw new Error(`Generated wire projection must contain exactly ${expectedProductOperations} Product operations, found ${manifest.operations?.length ?? 'none'}`);
}

const operationIds = new Set();
const authorityIds = new Set();
for (const operation of manifest.operations) {
  if (!operation.operationId || !operation.authorityId || !operation.method || !operation.path) {
    throw new Error('Generated wire projection contains an incomplete operation identity');
  }
  if (operationIds.has(operation.operationId)) throw new Error(`duplicate projected operationId ${operation.operationId}`);
  if (authorityIds.has(operation.authorityId)) throw new Error(`duplicate projected authorityId ${operation.authorityId}`);
  operationIds.add(operation.operationId);
  authorityIds.add(operation.authorityId);

  if (!Array.isArray(operation.responses) || operation.responses.length === 0) {
    throw new Error(`${operation.operationId} lost response status information`);
  }
  if (!Array.isArray(operation.security)) {
    throw new Error(`${operation.operationId} lost security-carriage projection`);
  }
}

for (const requiredId of ['GetProject', 'GetProjectBaselineCandidate', 'AskConexusAboutBaselineCandidate', 'ClearProjectBrainBinding', 'RunManagedJobNow', 'GetProjectUsageCostSummary']) {
  if (!operationIds.has(requiredId)) throw new Error(`Generated projection is missing ${requiredId}`);
}

run('node', [kubbProbe, productBundle]);

console.log(`Generated projection/no-parallel-DTO proof passed (${expectedProductOperations} deterministic Product entries + real Kubb probe).`);
