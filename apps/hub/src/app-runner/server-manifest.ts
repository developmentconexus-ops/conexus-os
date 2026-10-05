import { z } from 'zod'
/**
 * The Q1 application server contract, qualification-only. A Project declares a finite set of
 * operations in `conexus/manifest.json`; each binds one static operation id to one handler export and
 * to exact input and output shapes. The Conexus build turns it into `conexus-server/manifest.json` in
 * the artifact, beside the bundled handlers and the Project's migrations.
 */
export type ValueSchema =
  | Readonly<{ type: 'string'; enum?: readonly string[]; minLength?: number; maxLength?: number }>
  | Readonly<{ type: 'integer' | 'number'; minimum?: number; maximum?: number }>
  | Readonly<{ type: 'boolean' }>
  | Readonly<{ type: 'object'; properties: Readonly<Record<string, ValueSchema>>; required?: readonly string[]; additionalProperties: false }>
  | Readonly<{ type: 'array'; items: ValueSchema; maxItems?: number }>

type SourceOperation = Readonly<{ handler: string; export: string; input: ValueSchema; output: ValueSchema }>
export type SourceManifest = Readonly<{ operations: Readonly<Record<string, SourceOperation>> }>

type ServerOperation = Readonly<{ module: string; export: string; input: ValueSchema; output: ValueSchema }>
type ServerMigration = Readonly<{ name: string; sha256: string; sql: string }>
export type ServerManifest = Readonly<{
  version: 1
  operations: Readonly<Record<string, ServerOperation>>
  migrations: readonly ServerMigration[]
}>

function refuseManifest(where: string, why: string): never {
  throw new Error(`MANIFEST_REFUSED: ${where}: ${why}`)
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)
}

function onlyKeys(record: Record<string, unknown>, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(record)) if (!allowed.includes(key)) refuseManifest(where, `unknown key "${key}"`)
}

function bound(record: Record<string, unknown>, key: string, where: string, integer: boolean): void {
  const limit = record[key]
  if (limit === undefined) return
  if (typeof limit !== 'number' || !Number.isFinite(limit) || (integer && (!Number.isSafeInteger(limit) || limit < 0))) refuseManifest(where, `"${key}" must be a ${integer ? 'non-negative integer' : 'finite number'}`)
}

const PROPERTY = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/

function assertSchema(candidate: unknown, where: string, depth: number): asserts candidate is ValueSchema {
  if (depth > 6) refuseManifest(where, 'nested deeper than 6 levels')
  if (!isRecord(candidate)) refuseManifest(where, 'must be an object with a "type"')
  switch (candidate.type) {
    case 'string':
      onlyKeys(candidate, ['type', 'enum', 'minLength', 'maxLength'], where)
      if (candidate.enum !== undefined) {
        const values = candidate.enum
        if (!Array.isArray(values) || values.length < 1 || values.length > 64 || new Set(values).size !== values.length || !values.every((value) => typeof value === 'string' && value.length <= 200)) {
          refuseManifest(where, '"enum" must list between 1 and 64 distinct strings of at most 200 characters')
        }
        if (candidate.minLength !== undefined || candidate.maxLength !== undefined) refuseManifest(where, '"enum" cannot be combined with "minLength" or "maxLength"')
      }
      bound(candidate, 'minLength', where, true)
      bound(candidate, 'maxLength', where, true)
      return
    case 'integer':
    case 'number':
      onlyKeys(candidate, ['type', 'minimum', 'maximum'], where)
      bound(candidate, 'minimum', where, false)
      bound(candidate, 'maximum', where, false)
      return
    case 'boolean':
      onlyKeys(candidate, ['type'], where)
      return
    case 'object': {
      onlyKeys(candidate, ['type', 'properties', 'required', 'additionalProperties'], where)
      if (candidate.additionalProperties !== false) refuseManifest(where, '"additionalProperties" must be false')
      const properties = candidate.properties
      if (!isRecord(properties)) refuseManifest(where, '"properties" must be an object')
      const names = Object.keys(properties)
      if (names.length > 64) refuseManifest(where, 'more than 64 properties')
      for (const name of names) {
        if (!PROPERTY.test(name)) refuseManifest(where, `property name "${name}" is not an identifier`)
        assertSchema(properties[name], `${where}.properties.${name}`, depth + 1)
      }
      if (candidate.required !== undefined) {
        if (!Array.isArray(candidate.required) || !candidate.required.every((name) => typeof name === 'string' && names.includes(name))) {
          refuseManifest(where, '"required" must list declared properties')
        }
      }
      return
    }
    case 'array':
      onlyKeys(candidate, ['type', 'items', 'maxItems'], where)
      bound(candidate, 'maxItems', where, true)
      assertSchema(candidate.items, `${where}.items`, depth + 1)
      return
    default:
      refuseManifest(where, '"type" must be one of string, integer, number, boolean, object, array')
  }
}

const OPERATION = /^[a-z][A-Za-z0-9]{0,63}$/
const EXPORT = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/
const SEGMENT = '[a-z0-9][a-z0-9_-]{0,63}'
const HANDLER = new RegExp(`^handlers/(?:${SEGMENT}/){0,3}${SEGMENT}\\.ts$`)
const MODULE = new RegExp(`^handlers/(?:${SEGMENT}/){0,3}${SEGMENT}\\.mjs$`)
const MIGRATION = /^[0-9]{3,6}_[a-z0-9_]{1,60}\.sql$/

function assertManifest(value: unknown, stage: 'source' | 'server'): asserts value is SourceManifest | ServerManifest {
  if (!isRecord(value)) refuseManifest('manifest', 'must be a JSON object')
  onlyKeys(value, stage === 'source' ? ['operations'] : ['version', 'operations', 'migrations'], 'manifest')
  if (stage === 'server' && value.version !== 1) refuseManifest('manifest', '"version" must be 1')
  const operations = value.operations
  if (!isRecord(operations)) refuseManifest('operations', 'must be an object')
  const ids = Object.keys(operations)
  if (ids.length === 0 || ids.length > 32) refuseManifest('operations', 'must declare between 1 and 32 operations')
  for (const id of ids) {
    const where = `operations.${id}`
    if (!OPERATION.test(id)) refuseManifest(where, 'an operation id is camelCase letters and digits, starting lowercase')
    const entry = operations[id]
    if (!isRecord(entry)) refuseManifest(where, 'must be an object')
    const pathKey = stage === 'source' ? 'handler' : 'module'
    onlyKeys(entry, [pathKey, 'export', 'input', 'output'], where)
    const path = entry[pathKey]
    if (typeof path !== 'string' || !(stage === 'source' ? HANDLER : MODULE).test(path)) {
      refuseManifest(where, stage === 'source' ? '"handler" must be a path like handlers/notes.ts inside conexus/' : '"module" must be a bundled handler path')
    }
    if (typeof entry.export !== 'string' || !EXPORT.test(entry.export)) refuseManifest(where, '"export" must name the handler function')
    const input = entry.input
    assertSchema(input, `${where}.input`, 0)
    if (input.type !== 'object') refuseManifest(`${where}.input`, 'an operation input must be an object schema')
    assertSchema(entry.output, `${where}.output`, 0)
  }
  if (stage === 'server') {
    const migrations = value.migrations
    if (!Array.isArray(migrations) || migrations.length > 64) refuseManifest('migrations', 'must be a list of at most 64 migrations')
    const names = new Set<string>()
    for (const [index, migration] of migrations.entries()) {
      const where = `migrations[${index}]`
      if (!isRecord(migration)) refuseManifest(where, 'must be an object')
      onlyKeys(migration, ['name', 'sha256', 'sql'], where)
      if (typeof migration.name !== 'string' || !MIGRATION.test(migration.name) || names.has(migration.name)) refuseManifest(where, 'a migration is named like 001_create_notes.sql, once')
      names.add(migration.name)
      if (typeof migration.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(migration.sha256)) refuseManifest(where, '"sha256" must be a hex digest')
      if (typeof migration.sql !== 'string' || migration.sql.length === 0 || migration.sql.length > 256 * 1024) refuseManifest(where, '"sql" must be 1 byte to 256 KiB')
    }
    let previous: string | undefined
    for (const name of names) {
      if (previous !== undefined && name <= previous) refuseManifest('migrations', 'must be in name order')
      previous = name
    }
  }
}

/**
 * Admits a manifest or refuses it with the first violation, as `MANIFEST_REFUSED: <where>: <why>`.
 * `source` is the Builder's `conexus/manifest.json`; `server` is the build's normalized one.
 *
 * The Hub's check bundle imports this same function, so the Project check, the Conexus build and
 * the runner refuse exactly the same manifests.
 */
export function admitManifest(value: unknown, stage: 'source'): SourceManifest
export function admitManifest(value: unknown, stage: 'server'): ServerManifest
export function admitManifest(value: unknown, stage: 'source' | 'server'): SourceManifest | ServerManifest {
  assertManifest(value, stage)
  return value
}

/**
 * The Node built-ins a handler may import: computation only. The runner's sandbox has no file
 * system, network or process access, so the check refuses every other built-in before it can fail
 * at run time.
 */
export const SUPPORTED_NODE_IMPORTS: readonly string[] = Object.freeze([
  'node:assert', 'node:assert/strict', 'node:buffer', 'node:crypto', 'node:events', 'node:path', 'node:perf_hooks',
  'node:querystring', 'node:stream', 'node:stream/promises', 'node:stream/web', 'node:string_decoder', 'node:timers',
  'node:timers/promises', 'node:url', 'node:util', 'node:util/types', 'node:zlib',
])

/** Globals that reach the network. A handler has none; it reads a company system through `connectors.fetch`. */
export const NETWORK_GLOBALS: readonly string[] = Object.freeze(['fetch', 'WebSocket', 'EventSource', 'XMLHttpRequest'])

/** One file of an artifact's `conexus-server/` tree: its path, its base64 content and that content's SHA-256. */
export type ServerFile = Readonly<{ path: string; sha256: string; content: string }>

/** An admitted server tree: its manifest and the bundled modules, keyed by path under `conexus-server/`. */
export type ServerTree = Readonly<{ manifest: ServerManifest; modules: ReadonlyMap<string, Buffer> }>

function refuseTree(where: string, why: string): never {
  throw new Error(`SERVER_TREE_REFUSED: ${where}: ${why}`)
}

/**
 * Admits a `conexus-server/` tree or refuses it with the first violation, as
 * `SERVER_TREE_REFUSED: <where>: <why>`. `sha256` hashes bytes to a hex digest.
 *
 * The Hub's check bundle imports this same function, so the Project check refuses exactly the tree
 * the runner would refuse.
 */
export function admitServerTree(files: readonly ServerFile[], sha256: (bytes: Buffer) => string): ServerTree {
  const ROOT = 'conexus-server'
  const MAX_FILES = 128
  const MAX_FILE_BYTES = 4 * 1024 * 1024
  const DIRECTORY = /^[a-z0-9][A-Za-z0-9_.-]{0,127}$/
  const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/
  const entries: readonly ServerFile[] = files
  if (!Array.isArray(files) || entries.length === 0 || entries.length > MAX_FILES) refuseTree('tree', `must hold between 1 and ${MAX_FILES} files`)
  const modules = new Map<string, Buffer>()
  let manifest: ServerManifest | null = null
  for (const file of entries) {
    if (typeof file?.path !== 'string' || typeof file.content !== 'string' || typeof file.sha256 !== 'string') refuseTree('tree', 'every file needs a path, content and sha256')
    const parts = file.path.split('/')
    const name = parts.at(-1)
    if (name === undefined || parts[0] !== ROOT || parts.length < 2 || parts.length > 8) refuseTree(file.path, `must sit at most 7 levels under ${ROOT}/`)
    const directories = parts.slice(1, -1)
    if (directories.some((part) => part === '..' || part === '.' || !DIRECTORY.test(part))) {
      refuseTree(file.path, 'a directory is ASCII letters, digits, "_", "." or "-" and starts with a lowercase letter or digit')
    }
    if (!NAME.test(name)) refuseTree(file.path, 'a file name is ASCII letters, digits, "_", "." or "-" and starts with a letter or digit')
    const bytes = Buffer.from(file.content, 'base64')
    if (bytes.byteLength > MAX_FILE_BYTES) refuseTree(file.path, 'larger than 4 MiB')
    if (sha256(bytes) !== file.sha256) refuseTree(file.path, 'content does not match its sha256')
    const relative = file.path.slice(ROOT.length + 1)
    if (relative === 'manifest.json') {
      let parsed: unknown
      try {
        parsed = JSON.parse(bytes.toString('utf8'))
      } catch {
        refuseTree(file.path, 'is not valid JSON')
      }
      manifest = admitManifest(parsed, 'server')
    } else if (!relative.endsWith('.mjs')) refuseTree(file.path, 'only .mjs modules and manifest.json may be in the tree')
    else if (modules.has(relative)) refuseTree(file.path, 'appears twice')
    else modules.set(relative, bytes)
  }
  if (!manifest) refuseTree(`${ROOT}/manifest.json`, 'is missing')
  const admitted = manifest
  for (const [id, operation] of Object.entries(admitted.operations)) {
    if (!modules.has(operation.module)) refuseTree(`operations.${id}`, `module ${ROOT}/${operation.module} is not in the tree`)
  }
  return Object.freeze({ manifest: admitted, modules })
}

const UNDECLARED_KEY_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/

/**
 * The first place `value` breaks `schema`, as `<json pointer>: <why>`, or null when it conforms. The
 * text names only schema facts and array positions, so the runner may log it. An undeclared key is
 * named only when `echoUndeclared` is true: the caller's input may be told its own key, but an
 * output key is the handler's choice and never reaches the model.
 */
export const schemaViolation = (schema: ValueSchema, value: unknown, echoUndeclared: boolean, where = ''): string | null => {
  const at = where || '/'
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') return `${at}: expected string`
      if (schema.enum !== undefined && !schema.enum.includes(value)) return `${at}: not one of ${schema.enum.map((allowed) => JSON.stringify(allowed)).join(', ')}`
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
        const violation = schemaViolation(schema.items, item, echoUndeclared, `${where}/${index}`)
        if (violation) return violation
      }
      return null
    }
    case 'object': {
      if (!isRecord(value)) return `${at}: expected object`
      // The key comes from the value, so one that is not a property name is not repeated.
      for (const key of Object.keys(value)) if (!Object.hasOwn(schema.properties, key)) return `${where}/${echoUndeclared && UNDECLARED_KEY_NAME.test(key) ? key : '(key)'}: not declared`
      for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) return `${where}/${key}: required`
      for (const [key, property] of Object.entries(schema.properties)) {
        if (!Object.hasOwn(value, key)) continue
        const violation = schemaViolation(property, value[key], echoUndeclared, `${where}/${key}`)
        if (violation) return violation
      }
      return null
    }
  }
}

// What the runner answers a prepare with, read by the Hub's client and written by the supervisor.
export const prepareResult = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('READY'), reset: z.boolean(), applied: z.array(z.string()).readonly() }),
  z.strictObject({ state: z.literal('MIGRATION_FAILED'), detail: z.string() }),
  z.strictObject({ state: z.literal('MIGRATION_HISTORY_DIVERGED'), detail: z.string() }),
]).readonly()
export type PrepareResult = z.infer<typeof prepareResult>
