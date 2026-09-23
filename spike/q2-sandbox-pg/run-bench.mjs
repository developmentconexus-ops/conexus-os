// Connects to a fresh sandbox from the built spike template, runs bench.sh as conexus-agent
// (fresh initdb vs warm baked-seed copy, 10x each), and reports median/p95 plus the disk
// footprint Postgres 17 added over the base image.
import { readFileSync } from 'node:fs'
import { E2B } from 'e2b'
import { SPIKE_AGENT_USER } from './template.mjs'

const apiKey = readFileSync(process.env.CONEXUS_BUILDER_E2B_API_KEY_FILE ?? `${process.env.HOME}/.config/conexus/secrets/e2b-api-key`, 'utf8').trim()
const templateRef = process.argv[2]
if (!templateRef) throw new Error('USAGE: node run-bench.mjs <templateId:buildId>')

const client = new E2B({ apiKey })
const sandbox = await client.Sandbox.create(templateRef, { timeoutMs: 10 * 60_000 })

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return { median: percentile(sorted, 50), p95: percentile(sorted, 95), min: sorted[0], max: sorted.at(-1), values: sorted }
}

try {
  const bench = readFileSync('./bench.sh', 'utf8')
  await sandbox.files.write('/tmp/bench.sh', bench, { user: SPIKE_AGENT_USER })
  await sandbox.commands.run('chmod +x /tmp/bench.sh', { user: SPIKE_AGENT_USER })
  const result = await sandbox.commands.run('/tmp/bench.sh', { user: SPIKE_AGENT_USER, timeoutMs: 5 * 60_000 })
  if (result.exitCode !== 0) throw new Error(`BENCH_FAILED exit=${result.exitCode} stderr=${result.stderr}`)

  const freshLine = result.stdout.split('\n').find((l) => l.startsWith('FRESH_MS'))
  const warmLine = result.stdout.split('\n').find((l) => l.startsWith('WARM_MS'))
  const fresh = freshLine.replace('FRESH_MS ', '').trim().split(/\s+/).map(Number)
  const warm = warmLine.replace('WARM_MS ', '').trim().split(/\s+/).map(Number)

  const du = await sandbox.commands.run('du -sh /usr/lib/postgresql /opt/conexus/pg-seed 2>/dev/null; du -sk /usr/lib/postgresql /opt/conexus/pg-seed 2>/dev/null', { user: SPIKE_AGENT_USER })

  process.stdout.write(`${JSON.stringify({
    fresh: stats(fresh),
    warm: stats(warm),
    diskFootprint: du.stdout.trim(),
  }, null, 2)}\n`)
} finally {
  await sandbox.kill()
}
