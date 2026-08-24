import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [, , bundledOpenApi] = process.argv;
if (!bundledOpenApi) throw new Error('usage: node scripts/run-kubb-wire-probe.mjs <bundled-openapi.json>');

const versions = {
  kubb: '5.0.0',
  typescript: '7.0.2',
};
const expectedProductOperations = 117;
const root = '/tmp/conexus-kubb-real-oas-probe';
const outputA = path.join(root, 'generated-a');
const outputB = path.join(root, 'generated-b');
const source = path.join(root, 'openapi.json');
const config = path.join(root, 'kubb.config.ts');

fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });
fs.copyFileSync(bundledOpenApi, source);
fs.writeFileSync(
  path.join(root, 'package.json'),
  `${JSON.stringify({ name: 'conexus-kubb-wire-probe', private: true, type: 'module' }, null, 2)}\n`,
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}`);
  }
  return result;
}

run('npm', [
  'install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact',
  `kubb@${versions.kubb}`,
  `@kubb/cli@${versions.kubb}`,
  `@kubb/plugin-ts@${versions.kubb}`,
  `@kubb/plugin-fetch@${versions.kubb}`,
  `typescript@${versions.typescript}`,
]);

fs.writeFileSync(
  config,
  `import { defineConfig } from 'kubb/config'\n` +
    `import { pluginTs } from '@kubb/plugin-ts'\n` +
    `import { pluginFetch } from '@kubb/plugin-fetch'\n\n` +
    `const outputPath = process.env.CONEXUS_KUBB_OUTPUT\n` +
    `if (!outputPath) throw new Error('CONEXUS_KUBB_OUTPUT is required')\n\n` +
    `export default defineConfig({\n` +
    `  input: './openapi.json',\n` +
    `  output: { path: outputPath, clean: true, barrel: false },\n` +
    `  plugins: [\n` +
    `    pluginTs({ output: { path: 'types', mode: 'directory', barrel: false } }),\n` +
    `    pluginFetch({ output: { path: 'clients', mode: 'directory', barrel: false } }),\n` +
    `  ],\n` +
    `})\n`,
);

const kubbBin = path.join(root, 'node_modules', '.bin', 'kubb');
function generate(outputPath) {
  run(kubbBin, ['generate', '--config', config, '--silent'], {
    env: { ...process.env, CONEXUS_KUBB_OUTPUT: outputPath },
  });
}

generate(outputA);
generate(outputB);

function listFiles(directory) {
  const values = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) values.push(...listFiles(absolute));
    else values.push(absolute);
  }
  return values.sort();
}

function snapshot(directory) {
  const result = new Map();
  for (const file of listFiles(directory)) {
    result.set(path.relative(directory, file), fs.readFileSync(file));
  }
  return result;
}

const snapshotA = snapshot(outputA);
const snapshotB = snapshot(outputB);
if (snapshotA.size !== snapshotB.size) {
  throw new Error(`Kubb generation is not deterministic: file count ${snapshotA.size} != ${snapshotB.size}`);
}
for (const [relative, bytes] of snapshotA) {
  const other = snapshotB.get(relative);
  if (!other || !bytes.equals(other)) throw new Error(`Kubb generation drifted at ${relative}`);
}

const oas = JSON.parse(fs.readFileSync(source, 'utf8'));
const methods = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);
function resolveLocalRef(value) {
  if (!value?.$ref || !value.$ref.startsWith('#/')) return value;
  return value.$ref
    .slice(2)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((node, part) => node?.[part], oas);
}

const expectedPairs = new Set();
for (const [route, rawPathItem] of Object.entries(oas.paths ?? {})) {
  const pathItem = resolveLocalRef(rawPathItem) ?? {};
  for (const [method, candidate] of Object.entries(pathItem)) {
    if (!methods.has(method)) continue;
    const operation = resolveLocalRef(candidate) ?? {};
    if (!operation.operationId) throw new Error(`${method.toUpperCase()} ${route} lost operationId before Kubb probe`);
    expectedPairs.add(`${method.toUpperCase()} ${route}`);
  }
}
if (expectedPairs.size !== expectedProductOperations) {
  throw new Error(`Kubb probe expected ${expectedProductOperations} source operation pairs, found ${expectedPairs.size}`);
}

const clientsRoot = path.join(outputA, 'clients');
const clientFiles = listFiles(clientsRoot).filter((file) => file.endsWith('.ts'));
const generatedPairs = new Set();
for (const file of clientFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const methodMatch = text.match(/method:\s*['\"]([A-Z]+)['\"]/);
  const urlMatch = text.match(/url:\s*['\"]([^'\"]+)['\"]/);
  if (methodMatch && urlMatch) generatedPairs.add(`${methodMatch[1]} ${urlMatch[1]}`);
}
if (generatedPairs.size !== expectedProductOperations) {
  throw new Error(`Kubb Fetch projection must expose ${expectedProductOperations} method+path pairs, found ${generatedPairs.size} across ${clientFiles.length} client files`);
}
for (const pair of expectedPairs) {
  if (!generatedPairs.has(pair)) throw new Error(`Kubb Fetch projection lost ${pair}`);
}
for (const pair of generatedPairs) {
  if (!expectedPairs.has(pair)) throw new Error(`Kubb Fetch projection invented ${pair}`);
}

const allGeneratedText = [...snapshotA.values()].map((bytes) => bytes.toString('utf8')).join('\n');
for (const carrier of ['If-Match', 'Idempotency-Key']) {
  if (!allGeneratedText.includes(carrier)) throw new Error(`Kubb generated types lost ${carrier} carrier`);
}
if (!allGeneratedText.includes('__Host-conexus_session')) {
  throw new Error('Kubb generated client lost ConexusSession cookie security scheme');
}
for (const operationId of [
  'GetProjectBaselineCandidate',
  'AskConexusAboutBaselineCandidate',
  'ListWorkspaceMembershipCandidates',
  'GetWorkspaceMemberAccess',
  'GetAreaAccess',
  'GetProjectAnalyticQueryCatalog',
]) {
  if (!allGeneratedText.includes(operationId)) {
    throw new Error(`Kubb generated projection lost accepted ${operationId}`);
  }
}
for (const status of ['401', '403', '404', '409', '412', '422', '503']) {
  const pattern = new RegExp(`['\"]?${status}['\"]?\\s*:`);
  if (!pattern.test(allGeneratedText)) throw new Error(`Kubb generated types lost documented HTTP status ${status}`);
}

const publicTypeText = listFiles(path.join(outputA, 'types'))
  .filter((file) => file.endsWith('.ts'))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
if (/\bany\b/.test(publicTypeText)) {
  throw new Error('Kubb generated public Product types contain explicit any');
}

fs.writeFileSync(
  path.join(root, 'tsconfig.json'),
  `${JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      allowSyntheticDefaultImports: true,
      allowImportingTsExtensions: true,
    },
    include: ['./generated-a/**/*.ts'],
  }, null, 2)}\n`,
);
const tscBin = path.join(root, 'node_modules', '.bin', 'tsc');
run(tscBin, ['--project', path.join(root, 'tsconfig.json')]);

console.log(`Kubb real-OAS probe passed (kubb=${versions.kubb}, typescript=${versions.typescript}, operations=${expectedProductOperations}, files=${snapshotA.size}, byte-deterministic, TypeScript strict compile green).`);
