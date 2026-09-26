// Reduces an application API answer to what public evidence may hold: field paths with their JSON
// types, array lengths and a digest. No value leaves this function. Any key can itself be data (a
// supplier name used as a key looks like any field name), so only a key the case names as trusted
// is kept, and every other key is reported as `*`.
import { createHash } from 'node:crypto'

const typeOf = (value) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
}

const sortedEntries = (map) => [...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

/** `{ fields: { '$.path': 'type|type' }, counts: { '$.arrayPath': total length }, digest: 'sha256:…' }` */
export function summarizeBody(body, trustedKeys = new Set()) {
  const types = new Map()
  const counts = new Map()
  const walk = (value, path) => {
    const type = typeOf(value)
    types.set(path, (types.get(path) ?? new Set()).add(type))
    if (type === 'array') {
      counts.set(path, (counts.get(path) ?? 0) + value.length)
      for (const item of value) walk(item, `${path}[]`)
    } else if (type === 'object') {
      for (const [key, child] of Object.entries(value)) walk(child, `${path}.${trustedKeys.has(key) ? key : '*'}`)
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
 * `summarizeBody`. Await `settled()` before the context closes. A body still unread after
 * `bodyReadMs` keeps `summary: null`, because a body read can stay pending for good: three 429
 * answers around a Preview reload held a finished run open for 17 minutes. */
export function recordApplicationApi(context, { bodyReadMs = 5_000, trustedKeys = new Set() } = {}) {
  const entries = []
  const pending = []
  context.on('response', (response) => {
    const url = new URL(response.url())
    if (!url.pathname.startsWith(APPLICATION_API_PREFIX)) return
    const entry = { at: new Date().toISOString(), host: url.hostname, operation: url.pathname.slice(APPLICATION_API_PREFIX.length), status: response.status(), summary: null }
    entries.push(entry)
    const read = response.json().then((body) => { entry.summary = summarizeBody(body, trustedKeys) }, () => {})
    pending.push(Promise.race([read, new Promise((resolve) => { setTimeout(resolve, bodyReadMs).unref() })]))
  })
  return { entries, settled: () => Promise.allSettled(pending) }
}
