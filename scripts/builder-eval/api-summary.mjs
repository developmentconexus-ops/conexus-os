// Reduces an application API answer to what public evidence may hold: field paths with their JSON
// types, array lengths and a digest. No value leaves this function; a key that is not a plain
// identifier could itself be data, so it is reported as `*`.
import { createHash } from 'node:crypto'

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

const typeOf = (value) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
}

const sortedEntries = (map) => [...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

/** `{ fields: { '$.path': 'type|type' }, counts: { '$.arrayPath': total length }, digest: 'sha256:…' }` */
export function summarizeBody(body) {
  const types = new Map()
  const counts = new Map()
  const walk = (value, path) => {
    const type = typeOf(value)
    types.set(path, (types.get(path) ?? new Set()).add(type))
    if (type === 'array') {
      counts.set(path, (counts.get(path) ?? 0) + value.length)
      for (const item of value) walk(item, `${path}[]`)
    } else if (type === 'object') {
      for (const [key, child] of Object.entries(value)) walk(child, `${path}.${IDENTIFIER.test(key) ? key : '*'}`)
    }
  }
  walk(body, '$')
  return {
    fields: Object.fromEntries(sortedEntries(types).map(([path, set]) => [path, [...set].sort().join('|')])),
    counts: Object.fromEntries(sortedEntries(counts)),
    digest: `sha256:${createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex')}`,
  }
}

const APPLICATION_API_PREFIX = '/__conexus/api/'

/** Records every application API answer a Playwright browser context receives, reduced by
 * `summarizeBody`. Await `settled()` before the context closes. */
export function recordApplicationApi(context) {
  const entries = []
  const pending = []
  context.on('response', (response) => {
    const url = new URL(response.url())
    if (!url.pathname.startsWith(APPLICATION_API_PREFIX)) return
    const entry = { at: new Date().toISOString(), host: url.hostname, operation: url.pathname.slice(APPLICATION_API_PREFIX.length), status: response.status(), summary: null }
    entries.push(entry)
    pending.push(response.json().then((body) => { entry.summary = summarizeBody(body) }, () => {}))
  })
  return { entries, settled: () => Promise.allSettled(pending) }
}
