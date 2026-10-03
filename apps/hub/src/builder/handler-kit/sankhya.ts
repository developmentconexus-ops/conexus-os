// Conexus writes this file as conexus/sankhya.gen.ts on every check. Do not edit it.
//
// Reads a Sankhya Conexão to the end and decodes its rows. Pass the handler's own `connectors`:
//   const read = await loadAllRecords(connectors, 'erp', { rootEntity: 'CabecalhoNota', ... })
//   if (!read.ok) return { items: [], failure: read.code }
// Each page is one of the handler's calls. `complete` is false when the list has more rows than
// `maxPages` pages hold, so the screen can say the list was cut.

type SankhyaAnswer = { ok: true; body?: unknown } | { ok: false; code: string }

export type SankhyaConnectors = {
  fetch(request: { connection: string; method: string; path: string; query: Record<string, string>; body: unknown }): Promise<SankhyaAnswer>
}

/** One `loadRecords` row: each column by its name, as text, or null when Sankhya sent it empty. */
export type SankhyaRow = Record<string, string | null>

export type SankhyaRead<Row> = { ok: true; rows: Row[]; complete: boolean } | { ok: false; code: string }

const LOAD_RECORDS = 'CRUDServiceProvider.loadRecords'
const EXECUTE_QUERY = 'DbExplorerSP.executeQuery'
const UNREADABLE = { ok: false, code: 'RESPONSE_UNREADABLE' } as const

const read = (connectors: SankhyaConnectors, connection: string, serviceName: string, requestBody: unknown): Promise<SankhyaAnswer> =>
  connectors.fetch({
    connection, method: 'POST', path: '/gateway/v1/mge/service.sbr',
    query: { serviceName, outputType: 'json' }, body: { serviceName, requestBody },
  })

const record = (value: unknown): Record<string, unknown> | null =>
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null

// Sankhya sends a list with one element as the element itself.
const list = (value: unknown): unknown[] => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value])

type Page = { rows: SankhyaRow[]; more: boolean }

const decodePage = (body: unknown): Page | null => {
  const entities = record(record(record(body)?.responseBody)?.entities)
  if (!entities) return null
  const names = list(record(record(entities.metadata)?.fields)?.field).map((field) => record(field)?.name)
  if (!names.every((name): name is string => typeof name === 'string')) return null
  const rows = list(entities.entity).map((entity): SankhyaRow => {
    const cells = record(entity) ?? {}
    return Object.fromEntries(names.map((name, index) => {
      const value = record(cells[`f${index}`])?.$
      return [name, typeof value === 'string' ? value : value === undefined || value === null ? null : String(value)]
    }))
  })
  return { rows, more: entities.hasMoreResult === 'true' || entities.hasMoreResult === true }
}

/**
 * Reads every page of one `loadRecords` list, from page 0 until `hasMoreResult` is no longer
 * 'true' or `maxPages` pages were read. `dataSet` is the request's own `dataSet` without `offsetPage`.
 */
export async function loadAllRecords(
  connectors: SankhyaConnectors,
  connection: string,
  dataSet: Record<string, unknown>,
  { maxPages = 6 }: { maxPages?: number } = {},
): Promise<SankhyaRead<SankhyaRow>> {
  const rows: SankhyaRow[] = []
  for (let page = 0; page < maxPages; page += 1) {
    const answer = await read(connectors, connection, LOAD_RECORDS, { dataSet: { ...dataSet, offsetPage: String(page) } })
    if (!answer.ok) return { ok: false, code: answer.code }
    const decoded = decodePage(answer.body)
    if (!decoded) return UNREADABLE
    rows.push(...decoded.rows)
    if (!decoded.more) return { ok: true, rows, complete: true }
  }
  return { ok: true, rows, complete: false }
}

/**
 * Runs one read-only SQL query and returns each row keyed by its column name. Values keep the JSON
 * type Sankhya sent: format decimals and dates as text in the SQL itself.
 */
export async function queryRows(connectors: SankhyaConnectors, connection: string, sql: string): Promise<SankhyaRead<Record<string, unknown>>> {
  const answer = await read(connectors, connection, EXECUTE_QUERY, { sql })
  if (!answer.ok) return { ok: false, code: answer.code }
  const body = record(record(answer.body)?.responseBody)
  const names = list(body?.fieldsMetadata).map((field) => record(field)?.name)
  const rows = body?.rows
  if (!body || !Array.isArray(rows) || !names.every((name): name is string => typeof name === 'string')) return UNREADABLE
  return {
    ok: true,
    rows: rows.map((row) => Object.fromEntries(names.map((name, index) => [name, Array.isArray(row) ? row[index] ?? null : null]))),
    complete: body.burstLimit !== true,
  }
}
