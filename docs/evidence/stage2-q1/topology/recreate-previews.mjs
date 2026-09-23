// Recreates every Preview allocation on the Applications cluster the runner now serves: for each
// Project's latest available application artifact that carries a server tree, the runner's own
// prepare converges the Preview schema on that artifact's migrations. Preview data is disposable and
// is not copied. Reads the registry read-only through the Hub cluster's local superuser.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const build = resolve(process.env.HOME, 'q1/runner-build')
const { createApplicationRunnerClient } = await import(pathToFileURL(resolve(build, 'app-runner/module.js')).href)
const client = createApplicationRunnerClient(resolve(process.env.HOME, '.local/state/conexus-runner.sock'))

const query = spawnSync('docker', ['exec', '-i', 'conexus-s7-postgres', 'psql', '-X', '-U', 'postgres', '-d', 'conexus_s7', '-At'],
  { input: readFileSync(resolve(process.env.HOME, 'q1c/recreate-previews.sql'), 'utf8'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
if (query.status !== 0) throw new Error(query.stderr)
for (const line of query.stdout.split('\n').filter(Boolean)) {
  const artifact = JSON.parse(line)
  const result = await client.prepare({ projectId: artifact.projectId, files: artifact.files })
  console.log(JSON.stringify({ projectId: artifact.projectId, revision: artifact.revision, files: artifact.files.map((file) => file.path), result }))
}
