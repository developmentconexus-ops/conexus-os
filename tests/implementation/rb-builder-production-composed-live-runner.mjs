import { mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = await mkdtemp(join(repositoryRoot, 'apps/hub/.conexus-rb-composed-hub-'))
let server
const stopServer = () => {
  if (server && !server.killed) server.kill('SIGTERM')
}
process.once('SIGINT', stopServer)
process.once('SIGTERM', stopServer)

const waitForServer = async () => {
  const port = process.env.CONEXUS_PORT ?? '3000'
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error('RB_COMPOSED_SERVER_EXITED')
    try {
      await fetch(`http://127.0.0.1:${port}`)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  throw new Error('RB_COMPOSED_SERVER_NOT_READY')
}

let exitCode = 1
try {
  const compile = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
    '--noEmit', 'false', '--outDir', buildRoot,
  ], { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (compile.status !== 0) throw new Error(compile.stdout || compile.stderr)
  server = spawn(process.execPath, [join(buildRoot, 'server.js')], { cwd: repositoryRoot, env: process.env, stdio: 'inherit' })
  await waitForServer()
  const result = spawnSync(process.execPath, [
    '--test', '--test-concurrency=1', resolve(repositoryRoot, 'tests/implementation/rb-builder-production-composed-live.test.mjs'),
  ], { cwd: repositoryRoot, env: process.env, stdio: 'inherit' })
  exitCode = result.status ?? 1
} finally {
  stopServer()
  if (server && server.exitCode === null) await new Promise((resolve) => server.once('exit', resolve))
  await rm(buildRoot, { recursive: true, force: true })
}
process.exitCode = exitCode
