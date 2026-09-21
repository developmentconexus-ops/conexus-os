import { mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

// Runs the Hub's one-shot Factory command (apps/hub/src/factory-cli.ts) from a fresh build of the
// Hub, the same way scripts/build-hub-local.mjs runs the server. Run it with the Hub's env file:
//   node --env-file=<hub.env> scripts/hub-factory.mjs connect
//   node --env-file=<hub.env> scripts/hub-factory.mjs provision --project <projectId> --name <repo>
const repositoryRoot = resolve(import.meta.dirname, '..')

const buildRoot = await mkdtemp(join(repositoryRoot, 'apps/hub/.conexus-build-factory-'))
try {
  const compiled = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
    '--pretty', 'false', '--noEmit', 'false', '--outDir', buildRoot,
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr || 'HUB_COMPILE_FAILED')
  const run = spawnSync(process.execPath, [join(buildRoot, 'factory-cli.js'), ...process.argv.slice(2)], { cwd: repositoryRoot, stdio: 'inherit' })
  process.exitCode = run.status ?? 1
} finally {
  await rm(buildRoot, { recursive: true, force: true })
}
