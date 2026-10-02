import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const POSTGRES_IMAGE = 'postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f'
const KEYCLOAK_IMAGE = 'quay.io/keycloak/keycloak@sha256:c2a17fe407e892196d0b7cf9cef54e60952d6c372a9205f661a9efa0911463b0'
const KEYCLOAK = `conexus-backup-test-kc-${process.pid}`
const SOURCE = `conexus-backup-test-${process.pid}`
const scratch = mkdtempSync(join(tmpdir(), 'conexus-backup-test-'))
const gitRoot = join(scratch, 'git')
const outRoot = join(scratch, 'backups')
const keyFile = join(scratch, 'secret.key')
const keyFile2 = join(scratch, 'previous.key')
const script = (name) => new URL(`../../scripts/${name}`, import.meta.url).pathname

const sh = (file, args) => spawnSync(file, args, { encoding: 'utf8' })
const backupArgs = (root = outRoot) => [
  '--container', SOURCE, '--database', 'app', '--git-root', gitRoot, '--out-root', root,
  '--key-file', keyFile, '--key-file', keyFile2, '--keycloak-container', KEYCLOAK, '--keycloak-realm', 'master',
]
const psql = (sql) =>
  execFileSync('docker', ['exec', SOURCE, 'psql', '-U', 'postgres', '-d', 'app', '-At', '-c', sql], { encoding: 'utf8' })

const sourceReady = (() => {
  execFileSync('docker', ['run', '--rm', '-d', '--name', SOURCE, '-e', 'POSTGRES_PASSWORD=scratch', POSTGRES_IMAGE])
  for (let i = 0; i < 60; i++) {
    if (sh('docker', ['exec', SOURCE, 'pg_isready', '-U', 'postgres', '-h', '127.0.0.1']).status === 0) break
    execFileSync('sleep', ['1'])
  }
  execFileSync('sleep', ['1'])
  execFileSync('docker', ['exec', SOURCE, 'createdb', '-U', 'postgres', 'app'])
  psql("CREATE TABLE notes (id int PRIMARY KEY, body text); INSERT INTO notes VALUES (1,'a'),(2,'b'),(3,'c'); CREATE TABLE tags (name text); INSERT INTO tags VALUES ('x'),('y');")
  execFileSync('docker', ['run', '--rm', '-d', '--name', KEYCLOAK, '-e', 'KC_BOOTSTRAP_ADMIN_USERNAME=admin', '-e', 'KC_BOOTSTRAP_ADMIN_PASSWORD=scratch-pw-1', KEYCLOAK_IMAGE, 'start-dev'])
  writeFileSync(keyFile, 'k'.repeat(64) + '\n', { mode: 0o644 })
  writeFileSync(keyFile2, 'p'.repeat(64) + '\n', { mode: 0o644 })
  for (let i = 0; i < 120; i++) {
    if (sh('docker', ['logs', KEYCLOAK]).stdout.includes('Listening on') || sh('docker', ['logs', KEYCLOAK]).stderr.includes('Listening on')) break
    execFileSync('sleep', ['1'])
  }
  mkdirSync(join(gitRoot, 'one.git'), { recursive: true })
  const work = join(scratch, 'work')
  execFileSync('git', ['init', '-q', work])
  writeFileSync(join(work, 'f.txt'), 'hello\n')
  execFileSync('git', ['-C', work, 'add', '.'])
  execFileSync('git', ['-C', work, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'first'])
  execFileSync('git', ['clone', '-q', '--bare', work, join(gitRoot, 'one.git')])
})()

test.after(() => {
  sh('timeout', ['60', 'docker', 'stop', SOURCE])
  sh('timeout', ['60', 'docker', 'stop', KEYCLOAK])
  rmSync(scratch, { recursive: true, force: true })
})

test('the backup describes itself: it passes after the source changed and fails on a wrong count', () => {
  void sourceReady
  const backup = sh(script('conexus-backup.sh'), backupArgs())
  assert.equal(backup.status, 0, backup.stderr)
  const [folder] = readdirSync(outRoot)
  const dir = join(outRoot, folder)
  assert.deepEqual(readdirSync(dir).sort(), ['database.dump', 'git.tar.gz', 'identity-realm.json', 'keys', 'manifest.txt'])
  assert.equal(statSync(dir).mode & 0o777, 0o700)
  for (const name of ['database.dump', 'git.tar.gz', 'identity-realm.json', 'manifest.txt', 'keys/secret.key', 'keys/previous.key']) assert.equal(statSync(join(dir, name)).mode & 0o777, 0o600, name)
  assert.deepEqual(readdirSync(join(dir, 'keys')).sort(), ['previous.key', 'secret.key'])
  assert.equal(readFileSync(join(dir, 'keys/secret.key'), 'utf8'), 'k'.repeat(64) + '\n')
  assert.equal(JSON.parse(readFileSync(join(dir, 'identity-realm.json'), 'utf8')).realm, 'master')
  const manifest = readFileSync(join(dir, 'manifest.txt'), 'utf8')
  assert.match(manifest, /^[0-9a-f]{64} {2}\d+ {2}database\.dump$/m)
  assert.match(manifest, /^[0-9a-f]{64} {2}65 {2}keys\/secret\.key$/m)
  assert.match(manifest, /^[0-9a-f]{64} {2}\d+ {2}identity-realm\.json$/m)
  assert.match(manifest, /^rows public\.notes 3$/m)
  assert.match(manifest, /^rows public\.tags 2$/m)

  const args = ['--backup', dir]
  psql('DELETE FROM notes WHERE id = 3')
  const pass = sh(script('conexus-restore-check.sh'), args)
  assert.equal(pass.stdout.trim(), 'PASS tables=2 repositories=1', pass.stderr)
  assert.equal(pass.status, 0)

  writeFileSync(join(dir, 'manifest.txt'), manifest.replace('rows public.notes 3', 'rows public.notes 4'))
  const fail = sh(script('conexus-restore-check.sh'), args)
  assert.equal(fail.status, 1)
  assert.equal(fail.stdout.trim(), 'FAIL\nROW_COUNTS_DIFFER (< manifest, > restored):\n1c1\n< public.notes 4\n---\n> public.notes 3')

  writeFileSync(join(dir, 'manifest.txt'), manifest)
  renameSync(join(dir, 'git.tar.gz'), join(dir, 'git.tar.gz.moved'))
  const missing = sh(script('conexus-restore-check.sh'), args)
  assert.equal(missing.status, 1)
  assert.match(missing.stdout, /^FAIL\nMISSING_FILE git\.tar\.gz$/m)

  writeFileSync(join(dir, 'manifest.txt'), manifest)
  renameSync(join(dir, 'git.tar.gz.moved'), join(dir, 'git.tar.gz'))
  chmodSync(join(dir, 'keys/secret.key'), 0o644)
  const loose = sh(script('conexus-restore-check.sh'), args)
  assert.equal(loose.status, 1)
  assert.equal(loose.stdout.trim(), 'FAIL\nKEY_FILE_MODE keys/secret.key')
})

test('a restore check fails loudly when Projects exist and the Git root is empty', () => {
  void sourceReady
  const emptyGit = join(scratch, 'empty-git')
  mkdirSync(emptyGit)
  psql('CREATE SCHEMA project; CREATE TABLE project.project (id int); INSERT INTO project.project VALUES (1)')
  const root = join(scratch, 'backups-empty-git')
  const backup = sh(script('conexus-backup.sh'), backupArgs(root).map((a) => (a === gitRoot ? emptyGit : a)))
  assert.equal(backup.status, 0, backup.stderr)
  const [folder] = readdirSync(root)
  const check = sh(script('conexus-restore-check.sh'), ['--backup', join(root, folder)])
  assert.equal(check.status, 1)
  assert.equal(check.stdout.trim(), 'FAIL\nGIT_EMPTY_WITH_PROJECTS repositories=0 projects=1')
  psql('DROP SCHEMA project CASCADE')
})

test('the scheduled run keeps seven good folders and a corrupted dump keeps the older ones and logs a code', () => {
  void sourceReady
  const root = join(scratch, 'backups-run')
  mkdirSync(root)
  for (let day = 1; day <= 7; day++) mkdirSync(join(root, `2026010${day}T030000Z`))
  const ok = sh(script('conexus-backup-run.sh'), backupArgs(root))
  assert.equal(ok.status, 0, ok.stderr)
  assert.match(ok.stdout.trim(), /^BACKUP_RUN code=OK folder=.+ PASS tables=2 repositories=1$/)
  const good = readdirSync(root).filter((name) => !name.endsWith('.failed')).sort()
  assert.equal(good.length, 7)
  assert.equal(good.includes('20260101T030000Z'), false)

  const shim = join(scratch, 'shim')
  mkdirSync(shim)
  const realDocker = execFileSync('which', ['docker'], { encoding: 'utf8' }).trim()
  writeFileSync(join(shim, 'docker'), `#!/usr/bin/env bash\ncase " $* " in *" pg_dump "*) ${realDocker} "$@" | head -c 300 ;; *) exec ${realDocker} "$@" ;; esac\n`, { mode: 0o755 })
  const bad = sh('bash', ['-c', `PATH="${shim}:$PATH" exec ${script('conexus-backup-run.sh')} "$@"`, '_', ...backupArgs(root)])
  assert.equal(bad.status, 1, bad.stdout)
  assert.match(bad.stdout.trim(), /^BACKUP_RUN code=RESTORE_CHECK_FAILED folder=\S+\.failed RESTORE_FAILED /)
  const after = readdirSync(root).sort()
  assert.deepEqual(after.filter((name) => !name.endsWith('.failed')), good)
  assert.equal(after.filter((name) => name.endsWith('.failed')).length, 1)
})
