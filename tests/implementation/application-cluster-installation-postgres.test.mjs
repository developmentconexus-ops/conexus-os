import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { confineApplicationCluster, ensureTlsMaterial } from '../../scripts/confine-application-cluster.mjs'

// The Applications cluster's installation steps on throwaway containers of their own: the run script
// and the container's entrypoint refuse storage that is not the cluster's dedicated, mounted
// filesystem, on first start and on every restart, and confinement takes back TLS settings the
// runner cannot verify. Needs Docker and passwordless sudo, to mount and unmount the same small
// preallocated image an installation gets.
const repository = resolve(import.meta.dirname, '../..')
const MARKER = '.conexus-apps-storage'
const REFUSAL = 'APPLICATION_CLUSTER_STORAGE_UNMOUNTED'
const MOUNT_SCRIPT = 'scripts/mount-application-cluster-storage.sh'
// The mount script fallocates a 256 MiB recovery-ballast file inside the mounted filesystem
// (scripts/mount-application-cluster-storage.sh), on top of the marker and pgdata. A filesystem
// exactly 256 MiB cannot hold that ballast once ext4's own metadata is subtracted, so the test's
// throwaway images need headroom past the script's 256 MiB minimum.
const STORAGE_MIB = 512

const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8' })
const sudo = (...args) => spawnSync('sudo', ['-n', ...args], { cwd: repository, encoding: 'utf8' })
const run = (container, port, root, passwordFile) => spawnSync('bash', ['scripts/run-application-cluster.sh', container, String(port), root, passwordFile], { cwd: repository, encoding: 'utf8' })
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
const ready = (container) => docker('exec', container, 'pg_isready', '-U', 'postgres', '-h', '127.0.0.1').status === 0
const refusals = (container) => docker('logs', container).stderr.split('\n').filter((line) => line === REFUSAL).length
const refusedAgain = async (container, before, what) => {
  await until(() => refusals(container) > before, `${what} to be refused`)
  assert.equal(ready(container), false, `${what}: nothing serves`)
}
const mountStorage = (image, mountpoint) => {
  const result = sudo('bash', MOUNT_SCRIPT, 'install', image, String(STORAGE_MIB), mountpoint)
  assert.equal(result.status, 0, result.stderr)
}
const removeStorage = (image, mountpoint) => {
  sudo('bash', MOUNT_SCRIPT, 'remove', image, mountpoint)
  sudo('rm', '-rf', mountpoint)
}

test('the Applications cluster starts only on its own storage, and confinement undoes TLS it cannot verify', async (t) => {
  const secrets = mkdtempSync(join(tmpdir(), 'conexus-apps-install-'))
  const image = join(secrets, 'apps.img')
  const root = join(secrets, 'apps-storage')
  const passwordFile = join(secrets, 'password')
  writeFileSync(passwordFile, randomBytes(18).toString('base64url'), { mode: 0o600 })
  const container = `conexus-install-test-${randomBytes(4).toString('hex')}`
  const port = await freePort()
  t.after(() => {
    const usedImage = docker('inspect', '--format', '{{.Config.Image}}', container).stdout.trim()
    docker('rm', '-f', container)
    // The cluster's files belong to the image's postgres uid; only a container can remove them.
    if (usedImage) docker('run', '--rm', '--mount', `type=bind,source=${root},target=/s`, '--entrypoint', 'rm', usedImage, '-rf', '/s/pgdata')
    removeStorage(image, root)
    rmSync(secrets, { recursive: true, force: true })
  })

  await t.test('the run script refuses storage without the marker, or not mounted', () => {
    const bare = mkdtempSync(join(tmpdir(), 'conexus-apps-bare-'))
    const unmarked = run(container, port, bare, passwordFile)
    assert.equal(unmarked.status, 1)
    assert.equal(unmarked.stderr.trim(), `APPLICATION_CLUSTER_STORAGE_MISSING: ${bare}`)
    mkdirSync(join(bare, 'pgdata'), { mode: 0o700 })
    writeFileSync(join(bare, MARKER), '')
    const unmounted = run(container, port, bare, passwordFile)
    assert.equal(unmounted.status, 1)
    assert.equal(unmounted.stderr.trim(), `APPLICATION_CLUSTER_STORAGE_NOT_MOUNTED: ${bare}`)
    assert.equal(docker('inspect', container).status, 1, 'no container was created')
    rmSync(bare, { recursive: true, force: true })
  })

  await t.test('a failed TLS load leaves no TLS settings behind', async () => {
    mountStorage(image, root)
    assert.equal(run(container, port, root, passwordFile).status, 0)
    await until(() => ready(container), 'the cluster to accept connections')
    const tls = mkdtempSync(join(secrets, 'tls-'))
    const material = ensureTlsMaterial({ authorityDir: join(tls, 'authority'), relayDir: join(tls, 'relay') }, ['DNS:elsewhere.invalid'])
    assert.throws(() => confineApplicationCluster({ container, authorityDir: material.authorityDir, tlsDir: material.relayDir, database: 'conexus_apps_000000000000' }),
      { message: 'CONFINE_TLS_NOT_LOADED: the ssl settings were reset; check the server log for the certificate error' })
    const sql = (statement) => docker('exec', '-u', 'postgres', container, 'psql', '-XAtc', statement).stdout.trim()
    assert.equal(sql('SHOW ssl'), 'off')
    assert.equal(sql("SELECT count(*) FROM pg_file_settings WHERE sourcefile LIKE '%postgresql.auto.conf' AND name LIKE 'ssl%'"), '0')
  })

  await t.test('without the marker, Docker cannot start the cluster again, on any path', async () => {
    // The mount's root directory belongs to the image's mkfs, not to this process.
    assert.equal(sudo('rm', '-f', join(root, MARKER)).status, 0)
    docker('exec', '-u', 'postgres', container, 'pg_ctl', 'stop', '-m', 'fast', '-D', '/var/lib/postgresql/data')
    await refusedAgain(container, 0, 'the restart policy\'s restart')
    assert.ok(Number(docker('inspect', '--format', '{{.RestartCount}}', container).stdout) >= 1)
    assert.equal(docker('stop', container).status, 0)
    const stopped = refusals(container)
    assert.equal(docker('start', container).status, 0)
    await refusedAgain(container, stopped, 'docker start')
    const started = refusals(container)
    assert.equal(docker('restart', container).status, 0)
    await refusedAgain(container, started, 'docker restart')
  })

  // The bug this guards against: the old entrypoint compared only device numbers, so a marker plus a
  // stale pgdata copied directly onto the plain directory an unmounted <storage-root> leaves behind
  // would satisfy it, because both bind mounts still resolve to the same (wrong) filesystem. Docker's
  // own restart runs the entrypoint again without this script, so only the container-side guard,
  // never the host-side mountpoint check above, stands between an unmounted host and a served cluster.
  await t.test('a stale pgdata and a copied marker on an ordinary directory are refused, on start and restart', async (t2) => {
    const attackImage = join(secrets, 'apps-attack.img')
    const attackRoot = join(secrets, 'apps-attack-storage')
    const attackContainer = `conexus-install-attack-${randomBytes(4).toString('hex')}`
    const attackPort = await freePort()
    const stage = mkdtempSync(join(tmpdir(), 'conexus-apps-stale-'))
    t2.after(() => {
      docker('rm', '-f', attackContainer)
      removeStorage(attackImage, attackRoot)
      // sudo cp -a below preserves pgdata's postgres-uid ownership into stage.
      sudo('rm', '-rf', stage)
    })

    mountStorage(attackImage, attackRoot)
    assert.equal(run(attackContainer, attackPort, attackRoot, passwordFile).status, 0)
    await until(() => ready(attackContainer), 'the throwaway cluster to accept connections')
    assert.equal(docker('stop', attackContainer).status, 0)

    // Stage a copy of the real pgdata while it is still reachable, unmount the dedicated filesystem,
    // then plant the stage and a fresh marker directly on the plain directory left behind: what an
    // unmounted <storage-root> is, and what the run script's own mountpoint check no longer runs on
    // Docker's restart.
    const staged = sudo('cp', '-a', join(attackRoot, 'pgdata'), stage)
    assert.equal(staged.status, 0, staged.stderr)
    const unmounted = sudo('umount', attackRoot)
    assert.equal(unmounted.status, 0, unmounted.stderr)
    const replantedData = sudo('cp', '-a', join(stage, 'pgdata'), join(attackRoot, 'pgdata'))
    assert.equal(replantedData.status, 0, replantedData.stderr)
    const replantedMarker = sudo('touch', join(attackRoot, MARKER))
    assert.equal(replantedMarker.status, 0, replantedMarker.stderr)

    const before = refusals(attackContainer)
    assert.equal(docker('start', attackContainer).status, 0)
    await refusedAgain(attackContainer, before, 'docker start on the unmounted directory')
    const started = refusals(attackContainer)
    assert.equal(docker('restart', attackContainer).status, 0)
    await refusedAgain(attackContainer, started, 'docker restart on the unmounted directory')
  })

  // The bug this guards against (#283): a host reboot remounts the same image but the kernel can
  // assign it a different /dev/loopN, since loop numbers are handed out in mount order, not tied to
  // the backing file. The old guard compared that raw device path, so a mere renumbering looked
  // identical to an unmounted storage root and crash-looped the cluster on every boot.
  await t.test('a renumbered loop device is not mistaken for unmounted storage', async (t2) => {
    const renumberImage = join(secrets, 'apps-renumber.img')
    const renumberRoot = join(secrets, 'apps-renumber-storage')
    const renumberContainer = `conexus-install-renumber-${randomBytes(4).toString('hex')}`
    const renumberPort = await freePort()
    const dummyImage = join(secrets, 'dummy-loop.img')
    let dummyDevice = ''
    t2.after(() => {
      docker('rm', '-f', renumberContainer)
      if (dummyDevice) sudo('losetup', '-d', dummyDevice)
      removeStorage(renumberImage, renumberRoot)
    })

    mountStorage(renumberImage, renumberRoot)
    assert.equal(run(renumberContainer, renumberPort, renumberRoot, passwordFile).status, 0)
    await until(() => ready(renumberContainer), 'the throwaway cluster to accept connections')
    const oldDevice = sudo('findmnt', '-n', '-o', 'SOURCE', '--mountpoint', renumberRoot).stdout.trim()
    assert.match(oldDevice, /^\/dev\/loop/)
    assert.equal(docker('stop', renumberContainer).status, 0)

    // Simulate a reboot renumbering the mount: unmount (the mount unit's loop option autoclears the
    // device), occupy the number that freed so the remount lands on a different one, then remount the
    // same image the installation script's way.
    assert.equal(sudo('umount', renumberRoot).status, 0)
    writeFileSync(dummyImage, Buffer.alloc(1024 * 1024))
    const attach = sudo('losetup', '-f', '--show', dummyImage)
    assert.equal(attach.status, 0, attach.stderr)
    dummyDevice = attach.stdout.trim()
    mountStorage(renumberImage, renumberRoot)
    const newDevice = sudo('findmnt', '-n', '-o', 'SOURCE', '--mountpoint', renumberRoot).stdout.trim()
    assert.notEqual(newDevice, oldDevice, 'the remount should land on a different loop device number')

    const before = refusals(renumberContainer)
    assert.equal(docker('start', renumberContainer).status, 0)
    await until(() => ready(renumberContainer), 'the cluster to accept connections again, on a renumbered loop device')
    assert.equal(refusals(renumberContainer), before, 'a mere renumbering must not trigger APPLICATION_CLUSTER_STORAGE_UNMOUNTED')
  })
})
