// Proves check-db.sh actually works: uploads it plus conexus/migrations/*.sql into a real sandbox
// from the built spike template and runs it as conexus-agent, printing its JSON verdict and exit
// code.
import { readFileSync, readdirSync } from 'node:fs'
import { E2B } from 'e2b'
import { SPIKE_AGENT_USER, SPIKE_PG_BIN, SPIKE_PG_SEED } from './template.mjs'

const apiKey = readFileSync(process.env.CONEXUS_BUILDER_E2B_API_KEY_FILE ?? `${process.env.HOME}/.config/conexus/secrets/e2b-api-key`, 'utf8').trim()
const templateRef = process.argv[2]
if (!templateRef) throw new Error('USAGE: node run-check-db.mjs <templateId:buildId>')

const client = new E2B({ apiKey })
const sandbox = await client.Sandbox.create(templateRef, { timeoutMs: 3 * 60_000 })

try {
  await sandbox.commands.run('mkdir -p /tmp/checkdb/conexus/migrations', { user: SPIKE_AGENT_USER })
  await sandbox.files.write('/tmp/checkdb/check-db.sh', readFileSync('./check-db.sh', 'utf8'), { user: SPIKE_AGENT_USER })
  for (const name of readdirSync('./conexus/migrations')) {
    await sandbox.files.write(`/tmp/checkdb/conexus/migrations/${name}`, readFileSync(`./conexus/migrations/${name}`, 'utf8'), { user: SPIKE_AGENT_USER })
  }
  await sandbox.commands.run('chmod +x /tmp/checkdb/check-db.sh', { user: SPIKE_AGENT_USER })

  const result = await sandbox.commands.run(
    `cd /tmp/checkdb && PGBIN=${SPIKE_PG_BIN} PGDATA_SEED=${SPIKE_PG_SEED} ./check-db.sh`,
    { user: SPIKE_AGENT_USER, timeoutMs: 60_000 },
  )
  process.stdout.write(`EXIT_CODE=${result.exitCode}\n`)
  process.stdout.write(`STDOUT:\n${result.stdout}\n`)
  if (result.stderr) process.stdout.write(`STDERR:\n${result.stderr}\n`)
} finally {
  await sandbox.kill()
}
