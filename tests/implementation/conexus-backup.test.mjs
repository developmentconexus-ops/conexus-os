import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import pg from 'pg'
import { provisionApplicationDatabase } from '../../scripts/provision-application-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { ensurePreviewAllocation, previewAllocation, applyPendingMigrations } = await import(hubModuleUrl('app-runner/data-plane.js'))

const POSTGRES_IMAGE = 'postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f'
const KEYCLOAK_IMAGE = 'quay.io/keycloak/keycloak@sha256:c2a17fe407e892196d0b7cf9cef54e60952d6c372a9205f661a9efa0911463b0'
const KEYCLOAK = `conexus-backup-test-kc-${process.pid}`
const SOURCE = `conexus-backup-test-${process.pid}`
const APPLICATIONS = `conexus-backup-test-applications-${process.pid}`
const allocation = previewAllocation('00000000-0000-0000-0000-000000000001')
const otherAllocation = previewAllocation('00000000-0000-0000-0000-000000000002')
const scratch = mkdtempSync(join(tmpdir(), 'conexus-backup-test-'))
const gitRoot = join(scratch, 'git')
const outRoot = join(scratch, 'backups')
const keyFile = join(scratch, 'secret.key')
const keyFile2 = join(scratch, 'previous.key')
const script = (name) => new URL(`../../scripts/${name}`, import.meta.url).pathname

const sh = (file, args) => spawnSync(file, args, { encoding: 'utf8' })
const backupArgs = (root = outRoot) => [
  '--container', SOURCE, '--database', 'app', '--git-root', gitRoot, '--out-root', root,
  '--applications-container', APPLICATIONS, '--applications-database', 'conexus_apps',
  '--key-file', keyFile, '--key-file', keyFile2, '--keycloak-container', KEYCLOAK, '--keycloak-realm', 'master',
]
const psql = (sql) =>
  execFileSync('docker', ['exec', SOURCE, 'psql', '-U', 'postgres', '-d', 'app', '-At', '-c', sql], { encoding: 'utf8' })
function applicationSql(sql) {
  return execFileSync('docker', ['exec', APPLICATIONS, 'psql', '-U', 'postgres', '-d', 'conexus_apps', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' })
}
function withDockerShim(file, args, body) {
  const shim = mkdtempSync(join(scratch, 'docker-shim-'))
  writeFileSync(join(shim, 'docker'), `#!/usr/bin/env bash\nset -eu\n${body}\n`, { mode: 0o755 })
  const realDocker = execFileSync('which', ['docker'], { encoding: 'utf8' }).trim()
  return spawnSync(file, args, { encoding: 'utf8', env: { ...process.env, PATH: `${shim}:${process.env.PATH}`, REAL_DOCKER: realDocker } })
}

test.before(async () => {
  execFileSync('docker', ['run', '--rm', '-d', '--name', SOURCE, '-e', 'POSTGRES_PASSWORD=scratch', POSTGRES_IMAGE])
  for (let i = 0; i < 60; i++) {
    if (sh('docker', ['exec', SOURCE, 'pg_isready', '-U', 'postgres', '-h', '127.0.0.1']).status === 0) break
    execFileSync('sleep', ['1'])
  }
  execFileSync('sleep', ['1'])
  execFileSync('docker', ['exec', SOURCE, 'createdb', '-U', 'postgres', 'app'])
  psql("CREATE TABLE notes (id int PRIMARY KEY, body text); INSERT INTO notes VALUES (1,'a'),(2,'b'),(3,'c'); CREATE TABLE tags (name text); INSERT INTO tags VALUES ('x'),('y');")
  execFileSync('docker', ['run', '--rm', '-d', '--name', APPLICATIONS, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', POSTGRES_IMAGE,
    '-c', 'shared_preload_libraries=pg_stat_statements', '-c', 'statement_timeout=60s', '-c', 'transaction_timeout=120s', '-c', 'idle_in_transaction_session_timeout=30s'])
  for (let i = 0; i < 60; i++) {
    if (sh('docker', ['exec', APPLICATIONS, 'pg_isready', '-U', 'postgres', '-h', '127.0.0.1']).status === 0) break
    execFileSync('sleep', ['1'])
  }
  const port = Number(execFileSync('docker', ['port', APPLICATIONS, '5432'], { encoding: 'utf8' }).trim().split(':').at(-1))
  const cluster = { host: '127.0.0.1', port }
  await provisionApplicationDatabase({ cluster, database: 'conexus_apps', hubRoles: ['hub_runtime'], installation: { user: 'postgres', password: 'synthetic' }, provisionerPassword: 'synthetic' })
  const provisioner = new pg.Client({ ...cluster, database: 'conexus_apps', user: 'app_provisioner' })
  await provisioner.connect()
  try {
    await ensurePreviewAllocation(provisioner, { allocation, database: 'conexus_apps' })
    await ensurePreviewAllocation(provisioner, { allocation: otherAllocation, database: 'conexus_apps' })
  } finally {
    await provisioner.end()
  }
  const migrator = new pg.Client({ ...cluster, database: 'conexus_apps', user: allocation.migrationRole })
  await migrator.connect()
  try {
    const sql = "CREATE TABLE notes (id bigserial PRIMARY KEY, body text NOT NULL); INSERT INTO notes (body) VALUES ('synthetic');"
    assert.deepEqual(await applyPendingMigrations(migrator, allocation.schema, [{ position: 1, name: '001_notes.sql', sql, sha256: createHash('sha256').update(sql).digest('hex') }]), { ok: true, result: undefined })
  } finally {
    await migrator.end()
  }
  applicationSql('CREATE EXTENSION pgcrypto')
  execFileSync('docker', ['run', '--rm', '-d', '--name', KEYCLOAK, '-e', 'KC_BOOTSTRAP_ADMIN_USERNAME=admin', '-e', 'KC_BOOTSTRAP_ADMIN_PASSWORD=scratch-pw-1', KEYCLOAK_IMAGE, 'start-dev'])
  writeFileSync(keyFile, `${'k'.repeat(64)}\n`, { mode: 0o644 })
  writeFileSync(keyFile2, `${'p'.repeat(64)}\n`, { mode: 0o644 })
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
})

test.after(() => {
  sh('timeout', ['60', 'docker', 'stop', SOURCE])
  sh('timeout', ['60', 'docker', 'stop', APPLICATIONS])
  sh('timeout', ['60', 'docker', 'stop', KEYCLOAK])
  rmSync(scratch, { recursive: true, force: true })
})

test('the backup describes itself: it passes after the source changed and fails on a wrong count', () => {
  const backup = sh(script('conexus-backup.sh'), backupArgs())
  assert.equal(backup.status, 0, backup.stderr)
  const [folder] = readdirSync(outRoot)
  const dir = join(outRoot, folder)
  assert.deepEqual(readdirSync(dir).sort(), ['applications-globals.sql', 'applications.dump', 'database.dump', 'git.tar.gz', 'identity-realm.json', 'keys', 'manifest.txt'])
  assert.equal(statSync(dir).mode & 0o777, 0o700)
  for (const name of ['applications.dump', 'applications-globals.sql', 'database.dump', 'git.tar.gz', 'identity-realm.json', 'manifest.txt', 'keys/secret.key', 'keys/previous.key']) assert.equal(statSync(join(dir, name)).mode & 0o777, 0o600, name)
  assert.deepEqual(readdirSync(join(dir, 'keys')).sort(), ['previous.key', 'secret.key'])
  assert.equal(readFileSync(join(dir, 'keys/secret.key'), 'utf8'), `${'k'.repeat(64)}\n`)
  assert.equal(JSON.parse(readFileSync(join(dir, 'identity-realm.json'), 'utf8')).realm, 'master')
  const manifest = readFileSync(join(dir, 'manifest.txt'), 'utf8')
  assert.match(manifest, /^[0-9a-f]{64} {2}\d+ {2}database\.dump$/m)
  assert.match(manifest, /^[0-9a-f]{64} {2}65 {2}keys\/secret\.key$/m)
  assert.match(manifest, /^[0-9a-f]{64} {2}\d+ {2}identity-realm\.json$/m)
  assert.match(manifest, /^rows public\.notes 3$/m)
  assert.match(manifest, /^rows public\.tags 2$/m)
  assert.match(manifest, new RegExp(`^applications-rows ${allocation.schema}\\.notes 1$`, 'm'))
  assert.match(manifest, /^# applications-tables 3$/m)
  assert.doesNotMatch(readFileSync(join(dir, 'applications-globals.sql'), 'utf8'), /PASSWORD '/)

  const args = ['--backup', dir]
  psql('DELETE FROM notes WHERE id = 3')
  const pass = sh(script('conexus-restore-check.sh'), args)
  assert.equal(pass.stdout.trim(), 'PASS tables=2 repositories=1 applications-tables=3', pass.stderr)
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

test('Applications restores native owners, defaults, sequences, settings and ledger admission after source data changes', () => {
  const root = join(scratch, 'backups-applications')
  const backup = sh(script('conexus-backup.sh'), backupArgs(root))
  assert.equal(backup.status, 0, backup.stderr)
  const dir = join(root, readdirSync(root)[0])
  applicationSql(`UPDATE ${allocation.schema}.notes SET body = 'changed-after-backup'`)
  const proof = join(scratch, 'roles-proof.txt')
  const denied = join(scratch, 'roles-denied.txt')
  try {
    const check = withDockerShim(script('conexus-restore-check.sh'), ['--backup', dir], `
if [[ "$1" = stop && "$2" = conexus-restore-applications-check-* ]]; then
  trap '"$REAL_DOCKER" "$@" >/dev/null' EXIT
  "$REAL_DOCKER" exec "$2" psql -U ${allocation.runtimeRole} -d conexus_apps -Atq -v ON_ERROR_STOP=1 -c "SHOW search_path; SELECT id, body FROM notes; INSERT INTO notes(body) VALUES ('next') RETURNING id; SELECT has_language_privilege(current_user, 'plpgsql', 'USAGE');" > '${proof}'
  "$REAL_DOCKER" exec "$2" psql -U ${allocation.migrationRole} -d conexus_apps -Atq -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM conexus_migration; CREATE TABLE restored_defaults (id bigserial, body text);" >> '${proof}'
  "$REAL_DOCKER" exec "$2" psql -U ${allocation.runtimeRole} -d conexus_apps -Atq -v ON_ERROR_STOP=1 -c "INSERT INTO restored_defaults(body) VALUES ('default-grants') RETURNING id;" >> '${proof}'
  "$REAL_DOCKER" exec "$2" psql -U postgres -d conexus_apps -Atq -v ON_ERROR_STOP=1 -c "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='conexus_apps'; SELECT tableowner FROM pg_tables WHERE schemaname='${allocation.schema}' AND tablename='notes'; SELECT pg_has_role('app_provisioner', 'pg_use_reserved_connections', 'USAGE'), has_parameter_privilege('app_provisioner', 'temp_file_limit', 'SET'); SELECT extname FROM pg_extension WHERE extname='pgcrypto'; SELECT bool_and(rolpassword IS NULL) FROM pg_authid WHERE rolname LIKE 'app_%'; GRANT SELECT, INSERT ON ${allocation.schema}.conexus_migration TO ${allocation.runtimeRole};" >> '${proof}'
  "$REAL_DOCKER" exec "$2" psql -U ${allocation.runtimeRole} -d conexus_apps -Atq -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM conexus_migration;" >> '${proof}'
  for sql in "DROP TABLE notes" "SELECT * FROM ${otherAllocation.schema}.conexus_migration" "INSERT INTO conexus_migration(position, name, sha256) VALUES (2, 'forged.sql', repeat('a', 64))"; do
    if "$REAL_DOCKER" exec "$2" psql -U ${allocation.runtimeRole} -d conexus_apps -Atq -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -c "$sql" >> '${proof}' 2>> '${denied}'; then
      echo UNEXPECTED_ACCESS >> '${proof}'
    fi
  done
fi
exec "$REAL_DOCKER" "$@"`)
    assert.equal(check.status, 0, check.stdout + check.stderr)
    assert.equal(check.stdout.trim(), 'PASS tables=2 repositories=1 applications-tables=3')
    assert.equal(readFileSync(proof, 'utf8'), `${allocation.schema}\n1|synthetic\n2\nf\n1\n1\napp_provisioner\n${allocation.migrationRole}\nt|t\npgcrypto\nt\n0\n`)
    assert.equal(readFileSync(denied, 'utf8'), 'ERROR:  42501\nERROR:  42501\nERROR:  42501\n')
  } finally {
    applicationSql(`UPDATE ${allocation.schema}.notes SET body = 'synthetic'`)
  }
})

test('Applications artifacts and manifest records are mandatory and corrupt restore input fails', () => {
  const root = join(scratch, 'backups-applications-negative')
  const backup = sh(script('conexus-backup.sh'), backupArgs(root))
  assert.equal(backup.status, 0, backup.stderr)
  const dir = join(root, readdirSync(root)[0])
  const manifestPath = join(dir, 'manifest.txt')
  const manifest = readFileSync(manifestPath, 'utf8')
  for (const name of ['applications.dump', 'applications-globals.sql']) {
    renameSync(join(dir, name), join(dir, `${name}.moved`))
    const missing = sh(script('conexus-restore-check.sh'), ['--backup', dir])
    assert.equal(missing.status, 1)
    assert.equal(missing.stdout.trim(), `FAIL\nMISSING_FILE ${name}`)
    renameSync(join(dir, `${name}.moved`), join(dir, name))
    writeFileSync(manifestPath, manifest.split('\n').filter((line) => !line.endsWith(`  ${name}`)).join('\n'))
    const omitted = sh(script('conexus-restore-check.sh'), ['--backup', dir])
    assert.equal(omitted.status, 1)
    assert.equal(omitted.stdout.trim(), `FAIL\nMANIFEST_MISSING_FILE ${name}`)
    writeFileSync(manifestPath, manifest)
  }
  for (const field of ['applications-database', 'applications-tables']) {
    writeFileSync(manifestPath, manifest.split('\n').filter((line) => !line.startsWith(`# ${field} `)).join('\n'))
    const missing = sh(script('conexus-restore-check.sh'), ['--backup', dir])
    assert.equal(missing.status, 1)
    assert.equal(missing.stdout.trim(), `FAIL\nMANIFEST_INVALID ${field}`)
  }
  const dumpRecord = manifest.split('\n').find((line) => line.endsWith('  applications.dump'))
  for (const [mutation, code] of [
    [manifest.replace(dumpRecord, dumpRecord.replace(/^[0-9a-f]{64}/, 'invalid')), 'MANIFEST_INVALID file-record'],
    [manifest.replace('  applications.dump', '  ../applications.dump'), 'MANIFEST_INVALID file-name'],
    [`${manifest}${dumpRecord}\n`, 'MANIFEST_INVALID duplicate-file applications.dump'],
    [manifest.replace(dumpRecord, dumpRecord.replace(/ {2}\d+ {2}/, '  0  ')), 'SIZE_MISMATCH applications.dump'],
    [manifest.replace(dumpRecord, dumpRecord.replace(/^[0-9a-f]{64}/, '0'.repeat(64))), 'CHECKSUM_MISMATCH applications.dump'],
    [manifest.replace('# applications-database conexus_apps', '# applications-database postgres'), 'MANIFEST_INVALID applications-database'],
    [manifest.replace(`applications-rows ${allocation.schema}.notes 1\n`, ''), 'MANIFEST_INVALID applications-tables'],
  ]) {
    writeFileSync(manifestPath, mutation)
    const refused = sh(script('conexus-restore-check.sh'), ['--backup', dir])
    assert.equal(refused.status, 1)
    assert.equal(refused.stdout.split('\n')[1], code)
  }
  writeFileSync(manifestPath, manifest.replace(`applications-rows ${allocation.schema}.notes 1`, `applications-rows ${allocation.schema}.notes 2`))
  const wrongCount = sh(script('conexus-restore-check.sh'), ['--backup', dir])
  assert.equal(wrongCount.status, 1, wrongCount.stdout + wrongCount.stderr)
  assert.match(wrongCount.stdout, /^FAIL\nAPPLICATIONS_ROW_COUNTS_DIFFER /)
  const globals = join(dir, 'applications-globals.sql')
  writeFileSync(globals, `${readFileSync(globals, 'utf8')}\nSELECT missing_restore_function();\n`)
  const content = readFileSync(globals)
  writeFileSync(manifestPath, manifest.replace(/^[0-9a-f]{64} {2}\d+ {2}applications-globals\.sql$/m, `${createHash('sha256').update(content).digest('hex')}  ${content.length}  applications-globals.sql`))
  const invalid = sh(script('conexus-restore-check.sh'), ['--backup', dir])
  assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr)
  assert.match(invalid.stdout, /^FAIL\nAPPLICATIONS_GLOBALS_RESTORE_FAILED /)
})

test('backup rejects missing, shared and reserved Applications inputs before writing artifacts', () => {
  const root = join(scratch, 'backups-invalid-applications')
  for (const [args, message] of [
    [backupArgs(root).filter((value, index, all) => value !== '--applications-container' && all[index - 1] !== '--applications-container'), /usage:/],
    [backupArgs(root).map((value) => value === APPLICATIONS ? SOURCE : value), /APPLICATIONS_CLUSTER_NOT_SEPARATE/],
    [backupArgs(root).map((value) => value === 'conexus_apps' ? 'postgres' : value), /APPLICATIONS_DATABASE_RESERVED/],
    [backupArgs(root).map((value) => value === 'conexus_apps' ? '../invalid' : value), /APPLICATIONS_DATABASE_INVALID/],
  ]) {
    const refused = sh(script('conexus-backup.sh'), args)
    assert.equal(refused.status, 2)
    assert.match(refused.stderr, message)
  }
})

test('the scheduled run keeps seven verified folders through a failed backup and a corrupted dump', () => {
  const root = join(scratch, 'backups-run')
  mkdirSync(root)
  for (let day = 1; day <= 7; day++) {
    mkdirSync(join(root, `2026010${day}T030000Z`))
    writeFileSync(join(root, `2026010${day}T030000Z`, 'manifest.txt'), '# sha256  bytes  file\n')
  }
  const seeded = readdirSync(root).sort()
  const failedOf = () => readdirSync(root).filter((name) => name.endsWith('.failed'))

  mkdirSync(join(root, '20260108T030000Z.partial'))
  writeFileSync(join(root, '20260108T030000Z.partial', 'database.dump'), 'leftover')
  const noKeycloak = backupArgs(root).map((a) => (a === KEYCLOAK ? 'conexus-backup-test-no-such-container' : a))
  const broken = sh(script('conexus-backup-run.sh'), noKeycloak)
  assert.equal(broken.status, 1, broken.stdout)
  assert.match(broken.stdout.trim(), /^BACKUP_RUN code=BACKUP_FAILED REALM_EXPORT_COPY_FAILED$/m)
  assert.match(broken.stdout, /^BACKUP_RUN code=PARTIAL_REMOVED folder=\S+20260108T030000Z\.partial$/m)
  assert.deepEqual(readdirSync(root).filter((name) => !name.endsWith('.failed')).sort(), seeded)
  assert.equal(failedOf().length, 1)

  renameSync(join(root, failedOf()[0]), join(root, '20260108T030000Z.failed'))
  const noApplications = backupArgs(root).map((value) => value === APPLICATIONS ? 'conexus-backup-test-no-applications' : value)
  const missingApplications = sh(script('conexus-backup-run.sh'), noApplications)
  assert.equal(missingApplications.status, 1, missingApplications.stdout)
  assert.match(missingApplications.stdout, /^BACKUP_RUN code=BACKUP_FAILED /)
  assert.deepEqual(readdirSync(root).filter((name) => !name.endsWith('.failed')).sort(), seeded)
  assert.equal(failedOf().length, 1)
  renameSync(join(root, failedOf()[0]), join(root, '20260108T030000Z.failed'))

  const ok = sh(script('conexus-backup-run.sh'), backupArgs(root))
  assert.equal(ok.status, 0, ok.stderr)
  assert.match(ok.stdout.trim(), /^BACKUP_RUN code=OK folder=.+ PASS tables=2 repositories=1 applications-tables=3$/)
  const verified = readdirSync(root).filter((name) => !name.endsWith('.failed')).sort()
  assert.deepEqual(verified.slice(0, 6), seeded.slice(1))
  assert.equal(verified.length, 7)
  assert.equal(statSync(join(root, verified[6], 'manifest.txt')).isFile(), true)
  assert.equal(failedOf().length, 1)

  const invalidApplications = withDockerShim(script('conexus-backup-run.sh'), backupArgs(root), `
case " $* " in
  *" ${APPLICATIONS} pg_dump "*) printf 'invalid-archive' ;;
  *) exec "$REAL_DOCKER" "$@" ;;
esac`)
  assert.equal(invalidApplications.status, 1, invalidApplications.stdout)
  assert.match(invalidApplications.stdout, /^BACKUP_RUN code=RESTORE_CHECK_FAILED folder=\S+\.failed APPLICATIONS_RESTORE_FAILED /)
  assert.deepEqual(readdirSync(root).filter((name) => !name.endsWith('.failed')).sort(), verified)
  assert.equal(failedOf().length, 1)

  const failedDump = withDockerShim(script('conexus-backup-run.sh'), backupArgs(root), `
case " $* " in
  *" ${APPLICATIONS} pg_dump "*) echo APPLICATIONS_DUMP_FAILED >&2; exit 1 ;;
  *) exec "$REAL_DOCKER" "$@" ;;
esac`)
  assert.equal(failedDump.status, 1, failedDump.stdout)
  assert.match(failedDump.stdout, /^BACKUP_RUN code=BACKUP_FAILED APPLICATIONS_DUMP_FAILED/)
  assert.deepEqual(readdirSync(root).filter((name) => !name.endsWith('.failed')).sort(), verified)
  assert.equal(applicationSql("SELECT count(*) FROM pg_stat_activity WHERE datname='conexus_apps' AND state='idle in transaction'"), '0\n')

  const bad = withDockerShim(script('conexus-backup-run.sh'), backupArgs(root), `
case " $* " in
  *" ${SOURCE} pg_dump "*) "$REAL_DOCKER" "$@" | head -c 300 ;;
  *) exec "$REAL_DOCKER" "$@" ;;
esac`)
  assert.equal(bad.status, 1, bad.stdout)
  assert.match(bad.stdout.trim(), /^BACKUP_RUN code=RESTORE_CHECK_FAILED folder=\S+\.failed RESTORE_FAILED /)
  assert.deepEqual(readdirSync(root).filter((name) => !name.endsWith('.failed')).sort(), verified)
  assert.equal(failedOf().length, 1)
})
