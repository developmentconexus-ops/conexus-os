import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MastraServer } from '@mastra/fastify'
import Fastify from 'fastify'
import { createEvalMastra, evalStorage } from './scorers.mjs'

const DEFAULT_PORT = 4111
const STUDIO_ORIGINS = new Set(['http://localhost:3000', 'http://127.0.0.1:3000'])

const usage = [
  'Usage: node scripts/builder-eval/serve.mjs [--port 4111] [--help]',
  '',
  'Serves the eval Mastra API on http://127.0.0.1:<port>/api for Mastra Studio at http://localhost:3000.',
  'Reads CONEXUS_EVAL_DATABASE_URL: the Hub database as hub_factory (Mastra tables in schema factory).',
  '',
  'Options:',
  `  --port <n>   Loopback port; default: ${DEFAULT_PORT}`,
  '  --help       Show this help',
].join('\n')

const fail = (message) => {
  throw new Error(`builder-eval: ${message}`)
}

function parseArgs(argv) {
  const options = { port: DEFAULT_PORT, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--help') options.help = true
    else if (flag === '--port') {
      const value = argv[++index]
      if (!/^\d+$/.test(value ?? '') || Number(value) > 65_535) fail('--port must be an integer from 0 to 65535')
      options.port = Number(value)
    } else fail(`unknown option ${flag}`)
  }
  return options
}

// Studio fetches with credentials from its own origin; the Fastify adapter adds no CORS and
// @fastify/cors is not a dependency, so this answers Studio's origins and nobody else's.
async function allowStudioOrigin(request, reply) {
  const { origin } = request.headers
  if (!STUDIO_ORIGINS.has(origin)) return
  reply.header('access-control-allow-origin', origin).header('access-control-allow-credentials', 'true').header('vary', 'origin')
  if (request.method !== 'OPTIONS') return
  reply
    .header('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE')
    .header('access-control-allow-headers', request.headers['access-control-request-headers'] ?? 'content-type')
  return reply.code(204).send()
}

/**
 * MastraServer on Fastify, every Mastra route under /api, 127.0.0.1 only, no auth: a loopback tool
 * over the operator's own database.
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function startEvalServer({ mastra, port = DEFAULT_PORT }) {
  const app = Fastify()
  app.addHook('onRequest', allowStudioOrigin)
  // Studio treats the server as reachable only when its root answers 2xx; otherwise it shows its connection form.
  app.get('/', async () => 'Conexus Builder eval Mastra API')
  await new MastraServer({ app, mastra }).init()
  await app.listen({ host: '127.0.0.1', port })
  return { url: `http://127.0.0.1:${app.server.address().port}`, close: () => app.close() }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) {
    process.stdout.write(`${usage}\n`)
    return
  }
  const databaseUrl = process.env.CONEXUS_EVAL_DATABASE_URL
  if (!databaseUrl) fail('CONEXUS_EVAL_DATABASE_URL is not set; set it to the Hub database URL as hub_factory (docs/development/builder-eval.md shows how)')
  const mastra = createEvalMastra({ storage: evalStorage(databaseUrl) })
  // Connections open lazily, so a wrong URL would otherwise surface only as errors inside Studio.
  await mastra.datasets.list({ page: 0, perPage: 1 }).catch((error) => fail(`cannot read the Mastra tables at CONEXUS_EVAL_DATABASE_URL: ${error.message}`))
  const server = await startEvalServer({ mastra, port: options.port })
  process.stdout.write(`${server.url}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
