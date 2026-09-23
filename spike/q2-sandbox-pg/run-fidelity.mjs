// Runs the step-3 fidelity check inside a real sandbox from the built spike template: uploads
// provision.sql, the migration, handler-smoke.sql and the two attack files, then runs fidelity.sh
// (start a warm cluster from the baked seed, provision the Q1 role/schema shape, apply the
// migration, run the legitimate handler's SQL, run both attack files) and prints its output.
import { readFileSync } from 'node:fs'
import { E2B } from 'e2b'
import { SPIKE_AGENT_USER, SPIKE_PG_BIN, SPIKE_PG_SEED } from './template.mjs'

const apiKey = readFileSync(process.env.CONEXUS_BUILDER_E2B_API_KEY_FILE ?? `${process.env.HOME}/.config/conexus/secrets/e2b-api-key`, 'utf8').trim()
const templateRef = process.argv[2]
if (!templateRef) throw new Error('USAGE: node run-fidelity.mjs <templateId:buildId>')

const client = new E2B({ apiKey })
const sandbox = await client.Sandbox.create(templateRef, { timeoutMs: 5 * 60_000 })

// Maps the sandbox-side filename to its local source path.
const FILES = {
  'fidelity.sh': './fidelity.sh',
  'provision.sql': './provision.sql',
  '001_follow_up_note.sql': './conexus/migrations/001_follow_up_note.sql',
  'handler-smoke.sql': './handler-smoke.sql',
  'attacks-migration.sql': './attacks-migration.sql',
  'attacks-cross-project.sql': './attacks-cross-project.sql',
}

try {
  await sandbox.commands.run('mkdir -p /tmp/fidelity', { user: SPIKE_AGENT_USER })
  await Promise.all(
    Object.entries(FILES).map(([name, src]) =>
      sandbox.files.write(`/tmp/fidelity/${name}`, readFileSync(src, 'utf8'), { user: SPIKE_AGENT_USER })),
  )
  await sandbox.commands.run('chmod +x /tmp/fidelity/fidelity.sh', { user: SPIKE_AGENT_USER })

  const result = await sandbox.commands.run(
    `cd /tmp/fidelity && PGBIN=${SPIKE_PG_BIN} PGDATA_SEED=${SPIKE_PG_SEED} ./fidelity.sh`,
    { user: SPIKE_AGENT_USER, timeoutMs: 2 * 60_000 },
  )
  process.stdout.write(`EXIT_CODE=${result.exitCode}\n`)
  process.stdout.write(`${result.stdout}\n`)
  if (result.stderr) process.stderr.write(`STDERR:\n${result.stderr}\n`)
  if (result.exitCode !== 0) process.exitCode = 1
} finally {
  await sandbox.kill()
}
