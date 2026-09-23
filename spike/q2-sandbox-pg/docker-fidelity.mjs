// Comparison path for step 3: applies the identical SQL files (provision, migration, handler
// smoke, both attack files) to a plain, disposable Postgres 17 container instead of the E2B
// sandbox, so the two RESULT-line outputs can be diffed for parity. Starts and tears down its own
// scratch container on a private port; never touches the pilot's `conexus-s7-postgres` container
// or its data.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const IMAGE = 'postgres:17.10-bookworm' // already pulled locally; this script never pulls.
const NAME = 'conexus-q2-sandbox-pg-scratch'
const PORT = 55556

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status}): ${r.stderr}`)
  return r.stdout
}

const psqlStdin = (user, db, sqlPath) => {
  const r = spawnSync('docker', ['exec', '-i', '-u', 'postgres', NAME, 'psql', '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1', '-q'], {
    input: readFileSync(sqlPath, 'utf8'),
    encoding: 'utf8',
  })
  return r
}

try { execFileSync('docker', ['rm', '-f', NAME], { stdio: 'ignore' }) } catch { /* fine if a stale run didn't exist */ }

run('docker', ['run', '-d', '--name', NAME, '-p', `${PORT}:5432`, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', IMAGE])
try {
  // The official image starts a temporary server for initdb scripts, stops it, then starts the
  // real one; pg_isready succeeds during the temporary server too, so wait for the log to show
  // "ready to accept connections" twice (once per start) instead of trusting the first probe.
  for (let i = 0; i < 60; i++) {
    const logs = spawnSync('docker', ['logs', NAME], { encoding: 'utf8' })
    const readyCount = ((logs.stdout ?? '') + (logs.stderr ?? '')).split('ready to accept connections').length - 1
    if (readyCount >= 2) break
    await new Promise((res) => setTimeout(res, 500))
  }

  const steps = [
    ['provision', () => psqlStdin('postgres', 'postgres', './provision.sql')],
    ['migration', () => psqlStdin('p_a_migrator', 'conexus_apps', './conexus/migrations/001_follow_up_note.sql')],
    ['handler smoke', () => psqlStdin('p_a_runtime', 'conexus_apps', './handler-smoke.sql')],
  ]
  for (const [label, fn] of steps) {
    const r = fn()
    console.log(`== ${label} ==`)
    if (r.stdout) console.log(r.stdout.trim())
    if (r.status !== 0) throw new Error(`${label} FAILED: ${r.stderr}`)
  }

  const parseResults = (r) => (r.stderr || '').split('\n').filter((l) => l.includes('RESULT ')).map((l) => l.replace(/^NOTICE:\s*/, '').trim())

  console.log('== migration attacks (p_a_migrator) ==')
  const migAttacks = psqlStdin('p_a_migrator', 'conexus_apps', './attacks-migration.sql')
  parseResults(migAttacks).forEach((l) => console.log(l))

  console.log('== cross-project attacks (p_a_runtime) ==')
  const crossAttacks = psqlStdin('p_a_runtime', 'conexus_apps', './attacks-cross-project.sql')
  parseResults(crossAttacks).forEach((l) => console.log(l))
} finally {
  try { execFileSync('docker', ['rm', '-f', NAME]) } catch { /* best effort */ }
}
