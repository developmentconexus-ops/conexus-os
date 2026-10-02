import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'
import { hubBuildDirectory } from './hub-build.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')

/** A stand-in Collector: records every OTLP/HTTP request body by path. */
export const startCollector = async () => {
  const requests = []
  const server = createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      const raw = Buffer.concat(chunks)
      requests.push({ path: request.url, body: request.headers['content-encoding'] === 'gzip' ? gunzipSync(raw) : raw })
      response.writeHead(200, { 'content-type': 'application/x-protobuf' }).end()
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const endpoint = `http://127.0.0.1:${server.address().port}`
  const bodies = (path) => requests.filter((entry) => entry.path === path).map((entry) => entry.body)
  return {
    endpoint,
    requests,
    bodies,
    everything: () => Buffer.concat(requests.map((entry) => entry.body)),
    close: () => new Promise((done) => { server.closeAllConnections(); server.close(done) }),
  }
}

/**
 * Runs `script` (ES module source, written to a file) in a child loaded with the Hub's telemetry/register.js, the way the
 * launch scripts load it. The script finds the compiled Hub in HUB_BUILD.
 */
export const runWithTelemetry = async (script, { endpoint, env = {}, nodeArguments = [], timeoutMs = 60_000 } = {}) => {
  const build = hubBuildDirectory()
  // The script goes in a file so its text never lands in the resource's process.command_args.
  const scratch = resolve(repositoryRoot, 'node_modules/.cache-telemetry-tests')
  mkdirSync(scratch, { recursive: true })
  const directory = mkdtempSync(resolve(scratch, 'run-'))
  const file = resolve(directory, 'script.mjs')
  writeFileSync(file, script)
  const child = spawn(process.execPath, [
    ...nodeArguments,
    '--import', pathToFileURL(resolve(build, 'telemetry/register.js')).href,
    file,
  ], {
    cwd: repositoryRoot,
    env: { ...process.env, HUB_BUILD: build, ...(endpoint ? { OTEL_EXPORTER_OTLP_ENDPOINT: endpoint } : {}), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
  const [code] = await once(child, 'close')
  clearTimeout(timer)
  rmSync(directory, { recursive: true, force: true })
  return { code, stdout, stderr, lines: stdout.split('\n').filter(Boolean) }
}

export const jsonLines = (stdout) => stdout.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line))
