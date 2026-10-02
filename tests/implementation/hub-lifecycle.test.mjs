import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { hubModuleUrl } from './hub-build.mjs'
import { buildHubDatabase, createEmptyDatabase, query, testPool } from './hub-database.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const migrationsRoot = resolve(repositoryRoot, 'apps/hub/migrations')
const { assertSchemaCurrent, takeInstanceLock } = await import(hubModuleUrl('platform/lifecycle.js'))
const { createHttpApp } = await import(hubModuleUrl('http/app.js'))

const latestVersion = '0047'

test('a database one migration behind the code refuses to serve and names the missing version', async (t) => {
  const { connection, connectionString, onCleanup } = await buildHubDatabase(t, 'conexus_lifecycle_behind')
  const pool = testPool({ ...connection, max: 2 })
  onCleanup(() => pool.end())
  await assertSchemaCurrent(pool, migrationsRoot)
  await query(connectionString, 'DELETE FROM iam.schema_migration WHERE version = $1', [latestVersion])
  await assert.rejects(assertSchemaCurrent(pool, migrationsRoot), { message: `HUB_SCHEMA_BEHIND:${latestVersion}` })
})

test('a database with no ledger at all is behind by every migration', async (t) => {
  const { connection, onCleanup } = await createEmptyDatabase(t, 'conexus_lifecycle_empty')
  const pool = testPool({ ...connection, max: 2 })
  onCleanup(() => pool.end())
  await assert.rejects(assertSchemaCurrent(pool, migrationsRoot), (error) => error.message.startsWith('HUB_SCHEMA_BEHIND:0001,0002,') && error.message.endsWith(`,${latestVersion}`))
})

test('a second Hub on the same database is refused until the first lets go', async (t) => {
  const { connection, onCleanup } = await buildHubDatabase(t, 'conexus_lifecycle_lock')
  const release = await takeInstanceLock(connection)
  onCleanup(() => release().catch(() => undefined))
  await assert.rejects(takeInstanceLock(connection), { message: 'HUB_ALREADY_RUNNING' })
  await release()
  const releaseSecond = await takeInstanceLock(connection)
  await releaseSecond()
})

test('shutdown with an open stream ends the close and does not wait for the browser', async () => {
  const app = await createHttpApp({
    registerRoutes: async (server) => {
      server.get('/stream', (_request, reply) => {
        reply.raw.writeHead(200, { 'content-type': 'text/event-stream' })
        reply.raw.write('data: open\n\n')
        reply.hijack()
      })
      return ['GET /stream']
    },
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  const { port } = app.server.address()
  const opened = await new Promise((resolveOpen) => {
    const call = request({ host: '127.0.0.1', port, path: '/stream' }, (response) => response.once('data', () => resolveOpen(call)))
    call.on('error', () => {})
    call.end()
  })
  const started = Date.now()
  await app.close()
  opened.destroy()
  assert.ok(Date.now() - started < 5_000, `close took ${Date.now() - started} ms`)
})

const fixtureDirectory = mkdtempSync(join(tmpdir(), 'conexus-lifecycle-'))
test.after(() => rmSync(fixtureDirectory, { recursive: true, force: true }))

const runFixture = (name, source, { signalAfterLine, env = {} } = {}) => new Promise((resolveRun) => {
  const file = join(fixtureDirectory, `${name}.mjs`)
  writeFileSync(file, `import * as lifecycle from ${JSON.stringify(hubModuleUrl('platform/lifecycle.js'))}\n${source}`)
  const child = spawn(process.execPath, [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] })
  let output = ''
  let signalled = false
  child.stdout.on('data', (chunk) => {
    output += chunk
    if (signalAfterLine && !signalled && output.includes(signalAfterLine.line)) {
      signalled = true
      child.kill(signalAfterLine.signal)
    }
  })
  child.on('exit', (status) => resolveOpen(status))
  const resolveOpen = (status) => resolveRun({ status, output })
})

test('a rejected promise nobody handled logs HUB_FATAL and exits non-zero', async () => {
  const { status, output } = await runFixture('rejection', 'lifecycle.installFatalHandlers()\nPromise.reject(new Error("HUB_TEST_BOOM"))\nsetTimeout(() => {}, 10_000)\n')
  assert.equal(status, 1)
  assert.match(output, /"msg":"HUB_FATAL"/)
  assert.match(output, /HUB_TEST_BOOM/)
})

test('a boot step that rejects at the top level logs HUB_FATAL and exits non-zero', async () => {
  const { status, output } = await runFixture('top-level', 'lifecycle.installFatalHandlers()\nawait Promise.reject(new Error("HUB_SCHEMA_BEHIND:0045"))\n')
  assert.equal(status, 1)
  assert.match(output, /"msg":"HUB_FATAL"/)
  assert.match(output, /HUB_SCHEMA_BEHIND:0045/)
})

test('SIGTERM closes the Hub and exits 0', async () => {
  const { status, output } = await runFixture('sigterm', `
lifecycle.exitOnSignals(async () => { process.stdout.write('CLOSED\\n') })
process.stdout.write('READY\\n')
setInterval(() => {}, 1000)
`, { signalAfterLine: { line: 'READY', signal: 'SIGTERM' } })
  assert.equal(status, 0)
  assert.match(output, /HUB_SHUTDOWN_STARTED:SIGTERM/)
  assert.match(output, /CLOSED/)
})

test('a close that never ends is cut at the deadline with a non-zero exit', async () => {
  const started = Date.now()
  const { status, output } = await runFixture('deadline', `
lifecycle.exitOnSignals(() => new Promise(() => {}), { deadlineMs: 300 })
process.stdout.write('READY\\n')
setInterval(() => {}, 1000)
`, { signalAfterLine: { line: 'READY', signal: 'SIGTERM' } })
  assert.equal(status, 1)
  assert.match(output, /HUB_SHUTDOWN_TIMEOUT/)
  assert.ok(Date.now() - started < 10_000)
})

test('a SIGTERM to the launcher reaches the Hub child, which stops and leaves no orphan', async () => {
  const marker = join(fixtureDirectory, 'child-stopped')
  const pidFile = join(fixtureDirectory, 'child-pid')
  const childSource = `
import { writeFileSync } from 'node:fs'
writeFileSync(${JSON.stringify(pidFile)}, String(process.pid))
process.on('SIGTERM', () => { writeFileSync(${JSON.stringify(marker)}, 'stopped'); process.exit(7) })
setInterval(() => {}, 1000)
`
  const childFile = join(fixtureDirectory, 'launched-child.mjs')
  writeFileSync(childFile, childSource)
  const launcherFile = join(fixtureDirectory, 'launcher.mjs')
  writeFileSync(launcherFile, `
import { runForwarding } from ${JSON.stringify(pathToFileURL(resolve(repositoryRoot, 'scripts/build-hub-local.mjs')).href)}
process.exitCode = await runForwarding(process.execPath, [${JSON.stringify(childFile)}])
`)
  const launcher = spawn(process.execPath, [launcherFile], { stdio: 'ignore' })
  const exited = new Promise((resolveExit) => launcher.on('exit', (status) => resolveExit(status)))
  for (let attempt = 0; attempt < 200 && !existsSync(pidFile); attempt++) await new Promise((wake) => setTimeout(wake, 25))
  await new Promise((wake) => setTimeout(wake, 100))
  launcher.kill('SIGTERM')
  assert.equal(await exited, 7)
  assert.equal(readFileSync(marker, 'utf8'), 'stopped')
  const pid = Number(readFileSync(pidFile, 'utf8'))
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
})

test('SIGTERM with the real instance lock and pool ends the close and exits 0 well under the deadline', async (t) => {
  const { connection } = await buildHubDatabase(t, 'conexus_lifecycle_shutdown')
  const started = Date.now()
  const { status, output } = await runFixture('real-close', `
const connection = ${JSON.stringify(connection)}
const pool = (await import(${JSON.stringify(hubModuleUrl('platform/postgres.js'))})).createPostgresPool(connection)
const releaseInstanceLock = await lifecycle.takeInstanceLock(connection)
await pool.query('SELECT 1')
lifecycle.exitOnSignals(async () => {
  await pool.end()
  await releaseInstanceLock()
})
process.stdout.write('READY\\n')
setInterval(() => {}, 1000)
`, { signalAfterLine: { line: 'READY', signal: 'SIGTERM' } })
  assert.equal(status, 0, output)
  assert.doesNotMatch(output, /HUB_SHUTDOWN_TIMEOUT/)
  assert.ok(Date.now() - started < 5_000, `shutdown took ${Date.now() - started} ms`)
})

test('Ctrl-C on the launcher reaches the Hub once: it closes and exits 0, never forced', async () => {
  const childFile = join(fixtureDirectory, 'ctrl-c-child.mjs')
  writeFileSync(childFile, `
import * as lifecycle from ${JSON.stringify(hubModuleUrl('platform/lifecycle.js'))}
lifecycle.exitOnSignals(() => new Promise((done) => setTimeout(done, 300)))
process.stdout.write('READY\\n')
setInterval(() => {}, 1000)
`)
  const launcherFile = join(fixtureDirectory, 'ctrl-c-launcher.mjs')
  writeFileSync(launcherFile, `
import { runForwarding } from ${JSON.stringify(pathToFileURL(resolve(repositoryRoot, 'scripts/build-hub-local.mjs')).href)}
process.exitCode = await runForwarding(process.execPath, [${JSON.stringify(childFile)}])
`)
  // detached makes the launcher a process group leader, so a negative pid signals the group as a terminal does.
  const launcher = spawn(process.execPath, [launcherFile], { detached: true, stdio: ['ignore', 'pipe', 'inherit'] })
  let output = ''
  const exited = new Promise((resolveExit) => launcher.on('exit', (status) => resolveExit(status)))
  await new Promise((resolveReady) => launcher.stdout.on('data', (chunk) => {
    output += chunk
    if (output.includes('READY')) resolveReady()
  }))
  process.kill(-launcher.pid, 'SIGINT')
  assert.equal(await exited, 0)
  assert.match(output, /HUB_SHUTDOWN_STARTED:SIGINT/)
  assert.doesNotMatch(output, /HUB_SHUTDOWN_FORCED/)
})
