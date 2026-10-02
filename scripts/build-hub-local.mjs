import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const repositoryRoot = resolve(import.meta.dirname, '..')

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0) throw new Error(result.stdout || result.stderr || `${command} failed`)
}

// The heap snapshot flag sits on the process that dies of the OOM, which is this child and not the
// script that launches it. Telemetry loads first with --import and starts only when the endpoint is set.
export const hubNodeArguments = ({ buildRoot, diagnosticDir }) => [
  '--max-old-space-size=512',
  '--heapsnapshot-near-heap-limit=1',
  `--diagnostic-dir=${diagnosticDir}`,
  '--report-on-fatalerror',
  `--report-directory=${diagnosticDir}`,
  '--import', pathToFileURL(join(buildRoot, 'telemetry/register.js')).href,
  join(buildRoot, 'server.js'),
]

export const buildHubLocal = async () => {
  run(process.execPath, [
    resolve(repositoryRoot, 'node_modules/vite/bin/vite.js'),
    'build', '--config', resolve(repositoryRoot, 'apps/web/vite.config.mjs'), resolve(repositoryRoot, 'apps/web'),
  ])
  const buildRoot = await mkdtemp(join(repositoryRoot, 'apps/hub/.conexus-build-local-'))
  try {
    run(process.execPath, [
      resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
      '--pretty', 'false', '--noEmit', 'false', '--outDir', buildRoot,
    ])
    return buildRoot
  } catch (error) {
    await rm(buildRoot, { recursive: true, force: true })
    throw error
  }
}

const main = async () => {
  const buildRoot = await buildHubLocal()
  const diagnosticDir = resolve(process.env.CONEXUS_DIAGNOSTIC_DIR ?? join(repositoryRoot, '.audit/diagnostics'))
  await mkdir(diagnosticDir, { recursive: true })
  const server = spawnSync(process.execPath, hubNodeArguments({ buildRoot, diagnosticDir }), { cwd: repositoryRoot, stdio: 'inherit' })
  await rm(buildRoot, { recursive: true, force: true })
  process.exitCode = server.status ?? 1
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await main()
