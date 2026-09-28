// The simulated Sankhya ERP for the Builder eval: loopback only, synthetic data, never a real ERP.
// It speaks the gateway's wire (/authenticate, the service.sbr envelope, positional f0..fN) and
// answers CRUDServiceProvider.loadRecords from the registered fixtures, 50 rows a page.
//
// Usage: node scripts/builder-eval/sankhya-sim.mjs [--port 4180] [--help]
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SALES_V1 } from './fixtures/sales-v1.mjs'
import { compileCriteria } from './sankhya-criteria.mjs'

/** @typedef {import('./fixtures/sales-v1.mjs').Fixture} Fixture */
/** @typedef {import('./fixtures/sales-v1.mjs').EntityTable} EntityTable */
/** @typedef {import('./fixtures/sales-v1.mjs').WireRow} WireRow */
/** @typedef {{ loadRecords: number, refusals: number, writes: number }} Counters  writes stays 0 in a correct eval */

export const SIM_DEFAULT_PORT = 4180

export const SIM_CREDENTIAL = Object.freeze({ clientId: 'eval-sim', clientSecret: 'eval-sim-secret', xToken: 'eval-sim-token' })

/** Prefix of every refusal the simulator gives for valid SQL it does not model; traceMetrics counts it. */
export const SIMULATOR_REFUSAL_MARKER = '[simulador]'

const PAGE_SIZE = 50
const LOAD_RECORDS = 'CRUDServiceProvider.loadRecords'
const LOAD_RECORD = 'CRUDServiceProvider.loadRecord'

/** @type {ReadonlyMap<string, Fixture>} */
const FIXTURES = new Map([SALES_V1].map((fixture) => [fixture.id, fixture]))

/** @returns {Fixture} throws on an unknown id */
export function fixtureById(id) {
  const fixture = FIXTURES.get(id)
  if (!fixture) throw new Error(`builder-eval: unknown fixture ${id}; the simulator serves ${[...FIXTURES.keys()].join(', ')}`)
  return fixture
}

/** Every fixture's entities by name; two fixtures naming one entity would make a request ambiguous. */
const ENTITIES = (() => {
  /** @type {Map<string, EntityTable>} */
  const tables = new Map()
  for (const fixture of FIXTURES.values()) {
    for (const [name, table] of Object.entries(fixture.entities)) {
      if (tables.has(name)) throw new Error(`builder-eval: entity ${name} is in two fixtures`)
      tables.set(name, table)
    }
  }
  return tables
})()

/**
 * What a service call comes to, before it is put in the gateway's envelope.
 * @typedef {Readonly<{ kind: 'rows', entities: object }>
 *   | Readonly<{ kind: 'error', message: string }>
 *   | Readonly<{ kind: 'refusal', message: string }>} Outcome
 *  error: the request is wrong and a real Sankhya refuses it too. refusal: valid, but not simulated.
 */
const error = (message) => ({ kind: 'error', message })
const refusal = (message) => ({ kind: 'refusal', message })

/** @typedef {Readonly<{ name: string, read: (row: WireRow) => string | undefined }>} Column */

/**
 * The answer's columns, in request order: the root entry's fields, then each reference entry's as
 * `${path}_${FIELD}` read through the reference. A list of '*' is every field of that entity.
 * @returns {{ columns: Column[] } | { message: string }}
 */
function resolveColumns(rootEntity, table, entity) {
  const entries = Array.isArray(entity) ? entity : entity === undefined || entity === null ? [] : [entity]
  const columns = []
  for (const entry of entries) {
    const list = entry?.fieldset?.list
    if (typeof list !== 'string' || list.trim() === '') return { message: 'entity.fieldset.list ausente: diga os campos separados por vírgula, ou *' }
    const path = entry.path ?? ''
    const reference = path === '' ? null : Object.hasOwn(table.references, path) ? table.references[path] : undefined
    if (reference === undefined) return { message: `referência inexistente em ${rootEntity}: ${path}` }
    const target = reference === null ? table : ENTITIES.get(reference.entity)
    const names = list.trim() === '*' ? Object.keys(target.fields) : list.split(',').map((name) => name.trim().toUpperCase())
    const unknown = names.find((name) => !Object.hasOwn(target.fields, name))
    if (unknown !== undefined) return { message: `campo inexistente: ${reference === null ? '' : `${path}.`}${unknown}` }
    if (reference === null) {
      columns.push(...names.map((name) => ({ name, read: (row) => row[name] })))
      continue
    }
    const byKey = new Map(target.rows.map((row) => [row[reference.to], row]))
    columns.push(...names.map((name) => ({ name: `${path}_${name}`, read: (row) => byKey.get(row[reference.from])?.[name] })))
  }
  if (columns.length === 0) return { message: 'entity.fieldset.list ausente: diga os campos separados por vírgula, ou *' }
  return { columns }
}

/** offsetPage '0', '1', …; absent is the first page. @returns {number | null} null when not a page number */
const pageOf = (offsetPage) => {
  if (offsetPage === undefined || offsetPage === null) return 0
  return /^\d+$/.test(String(offsetPage)) ? Number(offsetPage) : null
}

/** Pure. One page of the root entity's rows that match the criteria, in the fixture's key order. @returns {Outcome} */
function loadRecords(dataSet) {
  const table = ENTITIES.get(dataSet?.rootEntity)
  if (!table) return error(`entidade inexistente: ${JSON.stringify(dataSet?.rootEntity ?? null)}`)
  if (dataSet.modifiedSince !== undefined) return refusal('modifiedSince não simulado')
  if (dataSet.useFileBasedPagination === 'S') return refusal('paginação por arquivo (useFileBasedPagination) não simulada')
  const page = pageOf(dataSet.offsetPage)
  if (page === null) return error(`offsetPage inválido: ${JSON.stringify(dataSet.offsetPage)}`)
  const resolved = resolveColumns(dataSet.rootEntity, table, dataSet.entity)
  if (!resolved.columns) return error(resolved.message)
  const criteria = compileCriteria(dataSet.criteria, table.fields)
  if (!criteria.ok) return criteria.error.kind === 'query' ? error(criteria.error.message) : refusal(criteria.error.message)
  const matched = table.rows.filter(criteria.matches)
  const slice = matched.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const encoded = slice.map((row) =>
    Object.fromEntries(
      resolved.columns.map((column, index) => {
        const value = column.read(row)
        return [`f${index}`, value === undefined ? {} : { $: value }]
      }),
    ),
  )
  return {
    kind: 'rows',
    entities: {
      total: String(slice.length),
      hasMoreResult: String((page + 1) * PAGE_SIZE < matched.length),
      offsetPage: String(page),
      offset: String(page * PAGE_SIZE),
      metadata: { fields: { field: resolved.columns.map((column) => ({ name: column.name })) } },
      ...(encoded.length === 0 ? {} : { entity: encoded.length === 1 ? encoded[0] : encoded }),
    },
  }
}

/**
 * The gateway's answer to one service call. loadRecords is simulated; loadRecord is a read the
 * simulator does not model; any other service is refused like a write on a read-only credential.
 */
function callService(serviceName, dataSet, counters) {
  const envelope = { serviceName, pendingPrinting: 'false' }
  if (serviceName !== LOAD_RECORDS && serviceName !== LOAD_RECORD) {
    counters.writes += 1
    return { ...envelope, status: '3', statusMessage: 'serviço não autorizado para esta credencial' }
  }
  if (serviceName === LOAD_RECORDS) counters.loadRecords += 1
  const outcome = serviceName === LOAD_RECORDS ? loadRecords(dataSet) : refusal(`serviço não simulado: ${LOAD_RECORD}`)
  if (outcome.kind === 'rows') return { ...envelope, status: '1', responseBody: { entities: outcome.entities } }
  if (outcome.kind === 'error') return { ...envelope, status: '0', statusMessage: outcome.message }
  counters.refusals += 1
  return { ...envelope, status: '0', statusMessage: `${SIMULATOR_REFUSAL_MARKER} ${outcome.message}` }
}

/**
 * Serves every registered fixture on 127.0.0.1 only. Credentials are compared, never logged or echoed.
 * @returns {Promise<{ origin: string, counters: () => Counters, close: () => Promise<void> }>}
 */
export async function startSimulator({ port = SIM_DEFAULT_PORT } = {}) {
  /** @type {Counters} */
  const counters = { loadRecords: 0, refusals: 0, writes: 0 }
  const tokens = new Set()
  const sockets = new Set()
  const handle = (request, url, text) => {
    if (request.method === 'GET' && url.pathname === '/__sim/health') return [200, { fixtures: [...FIXTURES.keys()], counters: { ...counters } }]
    if (request.method === 'POST' && url.pathname === '/authenticate') {
      const form = new URLSearchParams(text)
      const accepted =
        form.get('client_id') === SIM_CREDENTIAL.clientId && form.get('client_secret') === SIM_CREDENTIAL.clientSecret && request.headers['x-token'] === SIM_CREDENTIAL.xToken
      if (!accepted) return [401, { error: 'invalid_client', error_description: 'credencial recusada' }]
      const token = `sim-token-${tokens.size + 1}`
      tokens.add(token)
      return [200, { access_token: token, expires_in: 3600, token_type: 'Bearer' }]
    }
    if (request.method === 'POST' && url.pathname === '/gateway/v1/mge/service.sbr') {
      const bearer = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1]
      if (!bearer || !tokens.has(bearer)) return [401, { error: 'invalid_token' }]
      const serviceName = url.searchParams.get('serviceName')
      let body
      try {
        body = JSON.parse(text)
      } catch {
        return [400, { error: 'o corpo não é JSON' }]
      }
      if (body?.serviceName !== serviceName) {
        return [200, { serviceName, status: '0', statusMessage: 'o serviceName do corpo difere do da URL', pendingPrinting: 'false' }]
      }
      return [200, callService(serviceName, body.requestBody?.dataSet, counters)]
    }
    return [404, { error: 'rota não simulada' }]
  }
  const server = createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      const [status, body] = handle(request, new URL(request.url, 'http://127.0.0.1'), Buffer.concat(chunks).toString('utf8'))
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    })
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolveListen)
  })
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    counters: () => ({ ...counters }),
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise((resolveClose) => server.close(resolveClose))
    },
  }
}

const usage = [
  `Usage: node scripts/builder-eval/sankhya-sim.mjs [--port ${SIM_DEFAULT_PORT}] [--help]`,
  '',
  'Serves the simulated Sankhya on http://127.0.0.1:<port> with synthetic data only.',
  'The eval connects to it with SIM_CREDENTIAL from this file; stop it with Ctrl+C.',
  '',
  'Options:',
  `  --port <n>   Loopback port; default: ${SIM_DEFAULT_PORT}`,
  '  --help       Show this help',
].join('\n')

const fail = (message) => {
  throw new Error(`builder-eval: ${message}`)
}

function parseArgs(argv) {
  const options = { port: SIM_DEFAULT_PORT, help: false }
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

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) {
    process.stdout.write(`${usage}\n`)
    return
  }
  const simulator = await startSimulator({ port: options.port })
  process.stdout.write(`${simulator.origin} fixtures: ${[...FIXTURES.keys()].join(', ')}\n`)
  const stop = () => {
    simulator.close().catch((error) => {
      process.stderr.write(`${error.message}\n`)
      process.exitCode = 1
    })
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
