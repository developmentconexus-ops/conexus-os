// One-off: proves check-db.sh's failure path (a bad migration -> nonzero exit, ok:false, a
// truncated error string, migrationsApplied stops before the bad file). Not committed as part of
// the spike's steady-state scripts; run manually if the verdict shape needs re-checking.
import { readFileSync, readdirSync } from 'node:fs'
import { E2B } from 'e2b'
import { SPIKE_AGENT_USER, SPIKE_PG_BIN, SPIKE_PG_SEED } from './template.mjs'

const apiKey = readFileSync(process.env.CONEXUS_BUILDER_E2B_API_KEY_FILE ?? `${process.env.HOME}/.config/conexus/secrets/e2b-api-key`, 'utf8').trim()
const templateRef = process.argv[2]
if (!templateRef) throw new Error('USAGE: node run-check-db-failure.mjs <templateId:buildId>')

const client = new E2B({ apiKey })
const sandbox = await client.Sandbox.create(templateRef, { timeoutMs: 3 * 60_000 })

try {
  await sandbox.commands.run('mkdir -p /tmp/checkdb-fail/conexus/migrations', { user: SPIKE_AGENT_USER })
  await sandbox.files.write('/tmp/checkdb-fail/check-db.sh', readFileSync('./check-db.sh', 'utf8'), { user: SPIKE_AGENT_USER })
  for (const name of readdirSync('./conexus/migrations')) {
    await sandbox.files.write(`/tmp/checkdb-fail/conexus/migrations/${name}`, readFileSync(`./conexus/migrations/${name}`, 'utf8'), { user: SPIKE_AGENT_USER })
  }
  // A second migration that references a nonexistent column, so it fails after the first applies.
  await sandbox.files.write('/tmp/checkdb-fail/conexus/migrations/002_broken.sql', 'alter table follow_up_note add column bad_ref bigint references does_not_exist(id);\n', { user: SPIKE_AGENT_USER })
  await sandbox.commands.run('chmod +x /tmp/checkdb-fail/check-db.sh', { user: SPIKE_AGENT_USER })

  // A nonzero exit is the expected outcome here (the migration is deliberately broken), so treat
  // it as a normal result instead of letting the SDK throw.
  const result = await sandbox.commands.run(
    `cd /tmp/checkdb-fail && PGBIN=${SPIKE_PG_BIN} PGDATA_SEED=${SPIKE_PG_SEED} ./check-db.sh`,
    { user: SPIKE_AGENT_USER, timeoutMs: 60_000 },
  ).catch((e) => e.result)
  process.stdout.write(`EXIT_CODE=${result.exitCode}\n`)
  process.stdout.write(`STDOUT:\n${result.stdout}\n`)
} finally {
  await sandbox.kill()
}
