import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { constants } from 'node:os'

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
// `entry` is resolved against the build, so a path outside it (a test composition's entry) stays as given.
export const hubNodeArguments = ({ buildRoot, diagnosticDir, entry = 'server.js', args = [] }) => [
  '--max-old-space-size=512',
  '--heapsnapshot-near-heap-limit=1',
  `--diagnostic-dir=${diagnosticDir}`,
  '--report-on-fatalerror',
  `--report-directory=${diagnosticDir}`,
  '--import', pathToFileURL(join(buildRoot, 'telemetry/register.js')).href,
  resolve(buildRoot, entry),
  ...args,
]

// The application runner serves no screen, so `web: false` skips the web build.
export const buildHubLocal = async ({ web = true } = {}) => {
  if (web) {
    run(process.execPath, [
      resolve(repositoryRoot, 'node_modules/vite/bin/vite.js'),
      'build', '--config', resolve(repositoryRoot, 'apps/web/vite.config.mjs'), resolve(repositoryRoot, 'apps/web'),
    ])
  }
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

// A signal to this wrapper reaches the child once, which stops on its own terms; the wrapper then
// resolves with the child's exit status so a supervisor sees what the child did. The child runs in
// its own process group so a terminal's Ctrl-C, sent to the wrapper's group, is not also delivered
// to it directly.
export const runForwarding = async (command, args, options = {}) => {
  const child = spawn(command, args, { cwd: repositoryRoot, stdio: 'inherit', detached: true, ...options })
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP']
  const forward = (signal) => child.kill(signal)
  for (const signal of signals) process.on(signal, forward)
  try {
    const [status, signal] = await once(child, 'exit')
    return status ?? (signal ? 128 + constants.signals[signal] : 1)
  } finally {
    for (const signal of signals) process.off(signal, forward)
  }
}

// `--runner` builds and runs the application runner instead of the Hub.
const main = async () => {
  const runner = process.argv.includes('--runner')
  const buildRoot = await buildHubLocal({ web: !runner })
  const diagnosticDir = resolve(process.env.CONEXUS_DIAGNOSTIC_DIR ?? join(repositoryRoot, '.audit/diagnostics'))
  await mkdir(diagnosticDir, { recursive: true })
  try {
    process.exitCode = await runForwarding(process.execPath, hubNodeArguments({ buildRoot, diagnosticDir, entry: runner ? 'app-runner/main.js' : 'server.js' }))
  } finally {
    await rm(buildRoot, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await main()
