import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadHubMigrationFiles } from '../../scripts/run-hub-migrations.mjs'
import { failureOf } from './failure-matchers.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { buildHubDatabase, createEmptyDatabase, query, testPool } from './hub-database.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const migrationsRoot = resolve(repositoryRoot, 'apps/hub/migrations')
const { assertSchemaCurrent, exitOnLostInstanceLock, takeInstanceLock } = await import(hubModuleUrl('platform/lifecycle.js'))
const { createHttpApp } = await import(hubModuleUrl('http/app.js'))

const latestVersion = loadHubMigrationFiles(migrationsRoot).at(-1).version

test('a database one migration behind the code refuses to serve and names the missing version', async (t) => {
  const { connection, connectionString, onCleanup } = await buildHubDatabase(t, 'conexus_lifecycle_behind')
  const pool = testPool({ ...connection, max: 2 })
  onCleanup(() => pool.end())
  await assertSchemaCurrent(pool, migrationsRoot)
  await query(connectionString, 'DELETE FROM iam.schema_migration WHERE version = $1', [latestVersion])
  await assert.rejects(assertSchemaCurrent(pool, migrationsRoot), failureOf('HUB_SCHEMA_BEHIND', { versions: latestVersion }))
})

test('a database with no ledger at all is behind by every migration', async (t) => {
  const { connection, onCleanup } = await createEmptyDatabase(t, 'conexus_lifecycle_empty')
  const pool = testPool({ ...connection, max: 2 })
  onCleanup(() => pool.end())
  await assert.rejects(assertSchemaCurrent(pool, migrationsRoot), (error) => error.id === 'HUB_SCHEMA_BEHIND' && error.details.versions.startsWith('0001,0002,') && error.details.versions.endsWith(`,${latestVersion}`))
})

test('a second Hub on the same database is refused until the first lets go', async (t) => {
  const { connection, onCleanup } = await buildHubDatabase(t, 'conexus_lifecycle_lock')
  const lost = []
  const release = await takeInstanceLock(connection, (cause) => { lost.push(cause) })
  onCleanup(() => release().catch(() => undefined))
  await assert.rejects(takeInstanceLock(connection, () => undefined), failureOf('HUB_ALREADY_RUNNING'))
  await release()
  const releaseSecond = await takeInstanceLock(connection, (cause) => { lost.push(cause) })
  await releaseSecond()
  assert.deepEqual(lost, [], 'a lock the Hub lets go of itself is not lost')
})

test('a Hub whose instance lock connection drops is told once, and logs HUB_INSTANCE_LOCK_LOST and exits 1 (AC-12)', async (t) => {
  const { connection, connectionString } = await buildHubDatabase(t, 'conexus_lifecycle_lock_lost')
  const exits = []
  const release = await takeInstanceLock(connection, exitOnLostInstanceLock((code) => { exits.push(code) }))
  t.after(() => release().catch(() => undefined))
  await query(connectionString, "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'conexus-hub:instance-lock' AND datname = current_database()")
  for (let waited = 0; exits.length === 0 && waited < 5_000; waited += 20) await new Promise((settle) => { setTimeout(settle, 20) })
  assert.deepEqual(exits, [1])
  const next = await takeInstanceLock(connection, () => undefined)
  await next()
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
  writeFileSync(file, `import * as lifecycle from ${JSON.stringify(hubModuleUrl('platform/lifecycle.js'))}\nimport { Failure } from ${JSON.stringify(hubModuleUrl('platform/failure.js'))}\n${source}`)
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
  assert.doesNotMatch(output, /HUB_TEST_BOOM/)
})

test('a boot step that rejects at the top level logs HUB_FATAL and exits non-zero', async () => {
  const { status, output } = await runFixture('top-level', 'lifecycle.installFatalHandlers()\nawait Promise.reject(new Error("HUB_TEST_BOOM"))\n')
  assert.equal(status, 1)
  assert.match(output, /"msg":"HUB_FATAL"/)
  assert.doesNotMatch(output, /HUB_TEST_BOOM/)
})

test('a boot step that fails unexpectedly logs where it failed and what caused it, by type and system code, and never the messages', async () => {
  const { status, output } = await runFixture('unexpected-boot', `
const discoverIssuer = async () => {
  throw new TypeError('fetch failed HUB_TEST_SECRET_URL', { cause: Object.assign(new Error('connect ECONNREFUSED HUB_TEST_SECRET_HOST'), { code: 'ECONNREFUSED' }) })
}
const startHub = async () => { await discoverIssuer() }
await startHub().catch(lifecycle.exitOnFailedStart)
`)
  assert.equal(status, 1)
  const line = JSON.parse(output.split('\n').find((entry) => entry.includes('"msg":"INTERNAL_UNEXPECTED"')))
  const stack = line['exception.stacktrace']
  assert.equal(stack.split('\n')[0], 'TypeError')
  assert.match(stack, /at discoverIssuer \(file:\/\/.*unexpected-boot\.mjs:\d+:\d+\)/)
  assert.match(stack, /^caused by Error \(ECONNREFUSED\)$/m)
  assert.doesNotMatch(output, /HUB_TEST_SECRET/)
})

for (const [code, details] of [['HUB_SCHEMA_BEHIND', "{ details: { versions: '0045' } }"], ['HUB_ALREADY_RUNNING', '']]) {
  test(`a refused start (${code}) exits 78 so a supervisor does not retry it`, async () => {
    const { status, output } = await runFixture(`refused-${code.slice(4, 9)}`, `lifecycle.installFatalHandlers()\nawait Promise.reject(new Failure(${JSON.stringify(code)}${details ? `, ${details}` : ''}))\n`)
    assert.equal(status, 78)
    assert.match(output, new RegExp(`"msg":"${code}"`))
  })
}

test('SIGTERM closes the Hub and exits 0', async () => {
  const { status, output } = await runFixture('sigterm', `
lifecycle.exitOnSignals(async () => { process.stdout.write('CLOSED\\n') })
process.stdout.write('READY\\n')
setInterval(() => {}, 1000)
`, { signalAfterLine: { line: 'READY', signal: 'SIGTERM' } })
  assert.equal(status, 0)
  assert.match(output, /"msg":"HUB_SHUTDOWN_STARTED".*"signal":"SIGTERM"|"signal":"SIGTERM".*"msg":"HUB_SHUTDOWN_STARTED"/)
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
const releaseInstanceLock = await lifecycle.takeInstanceLock(connection, () => undefined)
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
  assert.match(output, /"msg":"HUB_SHUTDOWN_STARTED".*"signal":"SIGINT"|"signal":"SIGINT".*"msg":"HUB_SHUTDOWN_STARTED"/)
  assert.doesNotMatch(output, /HUB_SHUTDOWN_FORCED/)
})

const bootWith = (environment) => new Promise((resolveRun) => {
  const child = spawn(process.execPath, [fileURLToPath(hubModuleUrl('server.js'))], { env: { PATH: process.env.PATH, NODE_ENV: 'test', ...environment }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  child.on('exit', (status) => resolveRun({ status, lines: output.split('\n').filter(Boolean).map((line) => JSON.parse(line)) }))
})

test('a Hub with a bad config boots to one operator line and exits 78', async () => {
  const missing = await bootWith({ CONEXUS_ORIGIN: 'https://hub.test' })
  assert.equal(missing.status, 78)
  assert.deepEqual(missing.lines.map((line) => [line.msg, line['failure.details.name'], line.level]), [['CONFIG_MISSING', 'CONEXUS_PORT', 50]])
  const invalid = await bootWith({ CONEXUS_ORIGIN: 'https://hub.test', CONEXUS_PORT: 'eighty' })
  assert.equal(invalid.status, 78)
  assert.deepEqual(invalid.lines.map((line) => [line.msg, line['failure.details.name'], line.level]), [['CONFIG_INVALID', 'CONEXUS_PORT', 50]])
})
