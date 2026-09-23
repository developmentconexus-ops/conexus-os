/**
 * The Q1 application server contract, qualification-only. A Project declares a finite set of
 * operations in `conexus/manifest.json`; each binds one static operation id to one handler export and
 * to exact input and output shapes. The Conexus build turns it into `conexus-server/manifest.json` in
 * the artifact, beside the bundled handlers and the Project's migrations.
 */
export type ValueSchema =
  | Readonly<{ type: 'string'; minLength?: number; maxLength?: number }>
  | Readonly<{ type: 'integer' | 'number'; minimum?: number; maximum?: number }>
  | Readonly<{ type: 'boolean' }>
  | Readonly<{ type: 'object'; properties: Readonly<Record<string, ValueSchema>>; required?: readonly string[]; additionalProperties: false }>
  | Readonly<{ type: 'array'; items: ValueSchema; maxItems?: number }>

export type SourceOperation = Readonly<{ handler: string; export: string; input: ValueSchema; output: ValueSchema }>
export type SourceManifest = Readonly<{ operations: Readonly<Record<string, SourceOperation>> }>

export type ServerOperation = Readonly<{ module: string; export: string; input: ValueSchema; output: ValueSchema }>
export type ServerMigration = Readonly<{ name: string; sha256: string; sql: string }>
export type ServerManifest = Readonly<{
  version: 1
  operations: Readonly<Record<string, ServerOperation>>
  migrations: readonly ServerMigration[]
}>

export const SERVER_ROOT = 'conexus-server'
export const SERVER_MANIFEST_PATH = `${SERVER_ROOT}/manifest.json`

/**
 * Admits a manifest or refuses it with the first violation, as `MANIFEST_REFUSED: <where>: <why>`.
 * `source` is the Builder's `conexus/manifest.json`; `server` is the build's normalized one.
 *
 * It references nothing outside its own body: the Conexus build and the Project check run it inside
 * the build sandbox from `Function.prototype.toString`, so both refuse exactly what the runner refuses.
 */
export function admitManifest(value: unknown, stage: 'source' | 'server'): SourceManifest | ServerManifest {
  const refuse = (where: string, why: string): never => { throw new Error(`MANIFEST_REFUSED: ${where}: ${why}`) }
  const isRecord = (candidate: unknown): candidate is Record<string, unknown> =>
    typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)
  const onlyKeys = (record: Record<string, unknown>, allowed: readonly string[], where: string): void => {
    for (const key of Object.keys(record)) if (!allowed.includes(key)) refuse(where, `unknown key "${key}"`)
  }
  const bound = (record: Record<string, unknown>, key: string, where: string, integer: boolean): void => {
    const limit = record[key]
    if (limit === undefined) return
    if (typeof limit !== 'number' || !Number.isFinite(limit) || (integer && (!Number.isSafeInteger(limit) || limit < 0))) refuse(where, `"${key}" must be a ${integer ? 'non-negative integer' : 'finite number'}`)
  }
  const PROPERTY = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/
  const schema = (candidate: unknown, where: string, depth: number): unknown => {
    if (depth > 6) refuse(where, 'nested deeper than 6 levels')
    if (!isRecord(candidate)) refuse(where, 'must be an object with a "type"')
    const record = candidate as Record<string, unknown>
    switch (record.type) {
      case 'string':
        onlyKeys(record, ['type', 'minLength', 'maxLength'], where)
        bound(record, 'minLength', where, true)
        bound(record, 'maxLength', where, true)
        break
      case 'integer':
      case 'number':
        onlyKeys(record, ['type', 'minimum', 'maximum'], where)
        bound(record, 'minimum', where, false)
        bound(record, 'maximum', where, false)
        break
      case 'boolean':
        onlyKeys(record, ['type'], where)
        break
      case 'object': {
        onlyKeys(record, ['type', 'properties', 'required', 'additionalProperties'], where)
        if (record.additionalProperties !== false) refuse(where, '"additionalProperties" must be false')
        if (!isRecord(record.properties)) refuse(where, '"properties" must be an object')
        const properties = record.properties as Record<string, unknown>
        const names = Object.keys(properties)
        if (names.length > 64) refuse(where, 'more than 64 properties')
        for (const name of names) {
          if (!PROPERTY.test(name)) refuse(where, `property name "${name}" is not an identifier`)
          schema(properties[name], `${where}.properties.${name}`, depth + 1)
        }
        if (record.required !== undefined) {
          if (!Array.isArray(record.required) || !record.required.every((name) => typeof name === 'string' && names.includes(name))) {
            refuse(where, '"required" must list declared properties')
          }
        }
        break
      }
      case 'array':
        onlyKeys(record, ['type', 'items', 'maxItems'], where)
        bound(record, 'maxItems', where, true)
        schema(record.items, `${where}.items`, depth + 1)
        break
      default:
        refuse(where, '"type" must be one of string, integer, number, boolean, object, array')
    }
    return candidate
  }

  const OPERATION = /^[a-z][A-Za-z0-9]{0,63}$/
  const EXPORT = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/
  const SEGMENT = '[a-z0-9][a-z0-9_-]{0,63}'
  const HANDLER = new RegExp(`^handlers/(?:${SEGMENT}/){0,3}${SEGMENT}\\.ts$`)
  const MODULE = new RegExp(`^handlers/(?:${SEGMENT}/){0,3}${SEGMENT}\\.mjs$`)
  const MIGRATION = /^[0-9]{3,6}_[a-z0-9_]{1,60}\.sql$/

  if (!isRecord(value)) refuse('manifest', 'must be a JSON object')
  const manifest = value as Record<string, unknown>
  onlyKeys(manifest, stage === 'source' ? ['operations'] : ['version', 'operations', 'migrations'], 'manifest')
  if (stage === 'server' && manifest.version !== 1) refuse('manifest', '"version" must be 1')
  if (!isRecord(manifest.operations)) refuse('operations', 'must be an object')
  const operations = manifest.operations as Record<string, unknown>
  const ids = Object.keys(operations)
  if (ids.length === 0 || ids.length > 32) refuse('operations', 'must declare between 1 and 32 operations')
  for (const id of ids) {
    const where = `operations.${id}`
    if (!OPERATION.test(id)) refuse(where, 'an operation id is camelCase letters and digits, starting lowercase')
    const operation = operations[id]
    if (!isRecord(operation)) refuse(where, 'must be an object')
    const entry = operation as Record<string, unknown>
    const pathKey = stage === 'source' ? 'handler' : 'module'
    onlyKeys(entry, [pathKey, 'export', 'input', 'output'], where)
    const path = entry[pathKey]
    if (typeof path !== 'string' || !(stage === 'source' ? HANDLER : MODULE).test(path)) {
      refuse(where, stage === 'source' ? '"handler" must be a path like handlers/notes.ts inside conexus/' : '"module" must be a bundled handler path')
    }
    if (typeof entry.export !== 'string' || !EXPORT.test(entry.export)) refuse(where, '"export" must name the handler function')
    const input = schema(entry.input, `${where}.input`, 0) as Record<string, unknown>
    if (input.type !== 'object') refuse(`${where}.input`, 'an operation input must be an object schema')
    schema(entry.output, `${where}.output`, 0)
  }
  if (stage === 'server') {
    if (!Array.isArray(manifest.migrations) || manifest.migrations.length > 64) refuse('migrations', 'must be a list of at most 64 migrations')
    const names = new Set<string>()
    for (const [index, migration] of (manifest.migrations as unknown[]).entries()) {
      const where = `migrations[${index}]`
      if (!isRecord(migration)) refuse(where, 'must be an object')
      const entry = migration as Record<string, unknown>
      onlyKeys(entry, ['name', 'sha256', 'sql'], where)
      if (typeof entry.name !== 'string' || !MIGRATION.test(entry.name) || names.has(entry.name)) refuse(where, 'a migration is named like 001_create_notes.sql, once')
      names.add(entry.name as string)
      if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) refuse(where, '"sha256" must be a hex digest')
      if (typeof entry.sql !== 'string' || entry.sql.length === 0 || entry.sql.length > 256 * 1024) refuse(where, '"sql" must be 1 byte to 256 KiB')
    }
    const ordered = [...names]
    if (ordered.some((name, index) => index > 0 && name <= (ordered[index - 1] as string))) refuse('migrations', 'must be in name order')
  }
  return value as SourceManifest | ServerManifest
}

/** The first place `value` breaks `schema`, as `<json pointer>: <why>`, or null when it conforms. */
export const schemaViolation = (schema: ValueSchema, value: unknown, where = ''): string | null => {
  const at = where || '/'
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') return `${at}: expected string`
      if (schema.minLength !== undefined && value.length < schema.minLength) return `${at}: shorter than ${schema.minLength}`
      if (schema.maxLength !== undefined && value.length > schema.maxLength) return `${at}: longer than ${schema.maxLength}`
      return null
    case 'integer':
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isSafeInteger(value))) return `${at}: expected ${schema.type}`
      if (schema.minimum !== undefined && value < schema.minimum) return `${at}: below ${schema.minimum}`
      if (schema.maximum !== undefined && value > schema.maximum) return `${at}: above ${schema.maximum}`
      return null
    case 'boolean':
      return typeof value === 'boolean' ? null : `${at}: expected boolean`
    case 'array': {
      if (!Array.isArray(value)) return `${at}: expected array`
      if (schema.maxItems !== undefined && value.length > schema.maxItems) return `${at}: more than ${schema.maxItems} items`
      for (const [index, item] of value.entries()) {
        const violation = schemaViolation(schema.items, item, `${where}/${index}`)
        if (violation) return violation
      }
      return null
    }
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return `${at}: expected object`
      const record = value as Record<string, unknown>
      for (const key of Object.keys(record)) if (!Object.hasOwn(schema.properties, key)) return `${where}/${key}: not declared`
      for (const key of schema.required ?? []) if (!Object.hasOwn(record, key)) return `${where}/${key}: required`
      for (const [key, property] of Object.entries(schema.properties)) {
        if (!Object.hasOwn(record, key)) continue
        const violation = schemaViolation(property, record[key], `${where}/${key}`)
        if (violation) return violation
      }
      return null
    }
  }
}
