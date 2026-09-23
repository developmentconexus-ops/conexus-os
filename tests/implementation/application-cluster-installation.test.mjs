import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { confineApplicationCluster, ensureTlsMaterial } from '../../scripts/confine-application-cluster.mjs'

// The Applications cluster's installation steps on a throwaway container of their own: the run script
// and the container's entrypoint refuse storage that is not the cluster's filesystem, and confinement
// takes back TLS settings the runner cannot verify. Needs Docker; the storage is an ordinary directory,
// which is what an unmounted mountpoint is.
const repository = resolve(import.meta.dirname, '../..')
const MARKER = '.conexus-apps-storage'
const REFUSAL = 'APPLICATION_CLUSTER_STORAGE_UNMOUNTED'

const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8' })
const freePort = () => new Promise((done) => {
  const server = net.createServer()
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => done(port)) })
})
const until = async (probe, what, seconds = 60) => {
  for (let tick = 0; tick < seconds * 4; tick += 1) {
    if (probe()) return
    await new Promise((done) => setTimeout(done, 250))
  }
  assert.fail(`timed out waiting for ${what}`)
}

test('the Applications cluster starts only on its own storage, and confinement undoes TLS it cannot verify', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-apps-storage-'))
  const secrets = mkdtempSync(join(tmpdir(), 'conexus-apps-install-'))
  mkdirSync(join(root, 'pgdata'), { mode: 0o700 })
  const passwordFile = join(secrets, 'password')
  writeFileSync(passwordFile, randomBytes(18).toString('base64url'), { mode: 0o600 })
  const container = `conexus-install-test-${randomBytes(4).toString('hex')}`
  const port = await freePort()
  const runScript = (env = {}) => spawnSync('bash', ['scripts/run-application-cluster.sh', container, String(port), root, passwordFile], { cwd: repository, encoding: 'utf8', env: { ...process.env, ...env } })
  const ci = { CONEXUS_APP_CLUSTER_UNMOUNTED_STORAGE: 'ci' }
  t.after(() => {
    const image = docker('inspect', '--format', '{{.Config.Image}}', container).stdout.trim()
    docker('rm', '-f', container)
    // The cluster's files belong to the image's postgres uid; only a container can remove them.
    if (image) docker('run', '--rm', '--mount', `type=bind,source=${root},target=/s`, '--entrypoint', 'rm', image, '-rf', '/s/pgdata')
    rmSync(root, { recursive: true, force: true })
    rmSync(secrets, { recursive: true, force: true })
  })
  const ready = () => docker('exec', container, 'pg_isready', '-U', 'postgres', '-h', '127.0.0.1').status === 0
  const refusals = () => docker('logs', container).stderr.split('\n').filter((line) => line === REFUSAL).length
  const refusedAgain = async (before, what) => {
    await until(() => refusals() > before, `${what} to be refused`)
    assert.equal(ready(), false, `${what}: nothing serves`)
  }

  await t.test('the run script refuses storage without the marker, or not mounted', () => {
    const unmarked = runScript(ci)
    assert.equal(unmarked.status, 1)
    assert.equal(unmarked.stderr.trim(), `APPLICATION_CLUSTER_STORAGE_MISSING: ${root}`)
    writeFileSync(join(root, MARKER), '')
    const unmounted = runScript()
    assert.equal(unmounted.status, 1)
    assert.equal(unmounted.stderr.trim(), `APPLICATION_CLUSTER_STORAGE_NOT_MOUNTED: ${root}`)
    assert.equal(docker('inspect', container).status, 1, 'no container was created')
  })

  await t.test('a failed TLS load leaves no TLS settings behind', async () => {
    assert.equal(runScript(ci).status, 0)
    await until(ready, 'the cluster to accept connections')
    const tls = mkdtempSync(join(secrets, 'tls-'))
    const material = ensureTlsMaterial({ authorityDir: join(tls, 'authority'), relayDir: join(tls, 'relay') }, ['DNS:elsewhere.invalid'])
    assert.throws(() => confineApplicationCluster({ container, authorityDir: material.authorityDir, tlsDir: material.relayDir, database: 'conexus_apps_000000000000' }),
      { message: 'CONFINE_TLS_NOT_LOADED: the ssl settings were reset; check the server log for the certificate error' })
    const sql = (statement) => docker('exec', '-u', 'postgres', container, 'psql', '-XAtc', statement).stdout.trim()
    assert.equal(sql('SHOW ssl'), 'off')
    assert.equal(sql("SELECT count(*) FROM pg_file_settings WHERE sourcefile LIKE '%postgresql.auto.conf' AND name LIKE 'ssl%'"), '0')
  })

  await t.test('without the marker, Docker cannot start the cluster again, on any path', async () => {
    unlinkSync(join(root, MARKER))
    docker('exec', '-u', 'postgres', container, 'pg_ctl', 'stop', '-m', 'fast', '-D', '/var/lib/postgresql/data')
    await refusedAgain(0, 'the restart policy\'s restart')
    assert.ok(Number(docker('inspect', '--format', '{{.RestartCount}}', container).stdout) >= 1)
    assert.equal(docker('stop', container).status, 0)
    const stopped = refusals()
    assert.equal(docker('start', container).status, 0)
    await refusedAgain(stopped, 'docker start')
    const started = refusals()
    assert.equal(docker('restart', container).status, 0)
    await refusedAgain(started, 'docker restart')
  })
})
