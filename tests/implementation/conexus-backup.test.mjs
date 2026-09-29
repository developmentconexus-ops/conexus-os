import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const SOURCE = `conexus-backup-test-${process.pid}`
const scratch = mkdtempSync(join(tmpdir(), 'conexus-backup-test-'))
const gitRoot = join(scratch, 'git')
const outRoot = join(scratch, 'backups')
const script = (name) => new URL(`../../scripts/${name}`, import.meta.url).pathname

const sh = (file, args) => spawnSync(file, args, { encoding: 'utf8' })
const psql = (sql) =>
  execFileSync('docker', ['exec', SOURCE, 'psql', '-U', 'postgres', '-d', 'app', '-At', '-c', sql], { encoding: 'utf8' })

const sourceReady = (() => {
  execFileSync('docker', ['run', '--rm', '-d', '--name', SOURCE, '-e', 'POSTGRES_PASSWORD=scratch', 'postgres:17.10-bookworm'])
  for (let i = 0; i < 60; i++) {
    if (sh('docker', ['exec', SOURCE, 'pg_isready', '-U', 'postgres', '-h', '127.0.0.1']).status === 0) break
    execFileSync('sleep', ['1'])
  }
  execFileSync('sleep', ['1'])
  execFileSync('docker', ['exec', SOURCE, 'createdb', '-U', 'postgres', 'app'])
  psql("CREATE TABLE notes (id int PRIMARY KEY, body text); INSERT INTO notes VALUES (1,'a'),(2,'b'),(3,'c'); CREATE TABLE tags (name text); INSERT INTO tags VALUES ('x'),('y');")
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
  rmSync(scratch, { recursive: true, force: true })
})

test('the backup describes itself: it passes after the source changed and fails on a wrong count', () => {
  void sourceReady
  const backup = sh(script('conexus-backup.sh'), ['--container', SOURCE, '--database', 'app', '--git-root', gitRoot, '--out-root', outRoot])
  assert.equal(backup.status, 0, backup.stderr)
  const [folder] = readdirSync(outRoot)
  const dir = join(outRoot, folder)
  assert.deepEqual(readdirSync(dir).sort(), ['database.dump', 'git.tar.gz', 'manifest.txt'])
  const manifest = readFileSync(join(dir, 'manifest.txt'), 'utf8')
  assert.match(manifest, /^[0-9a-f]{64} {2}\d+ {2}database\.dump$/m)
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
  assert.equal(fail.stdout.trim(), 'FAIL\nrow counts differ (< manifest, > restored):\n1c1\n< public.notes 4\n---\n> public.notes 3')
})
