import { z } from 'zod'
import type { FailureCode, Result } from '@conexus/contract'
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

export type ManifestRefusal = Readonly<{ code: 'MANIFEST_REFUSED'; where: string; diagnostic: string }>
export type TreeRefusal = Readonly<{ code: 'SERVER_TREE_REFUSED'; where: string; diagnostic: string }>
export type SchemaViolation = Readonly<{ pointer: string; rule: string }>

declare const sqlStateBrand: unique symbol
export type SqlState = string & Readonly<{ [sqlStateBrand]: true }>

type Code<C extends FailureCode> = Readonly<{ code: C }>

type WorkerCode = Extract<FailureCode,
  'HANDLER_FAILED' | 'HANDLER_LOAD_FAILED' | 'HANDLER_EXPORT_MISSING'
  | 'HANDLER_OUTPUT_UNSERIALIZABLE' | 'WORKER_FAILED' | 'WORKER_JOB_REFUSED'
  | 'RESPONSE_TOO_LARGE' | 'DATABASE_UNAVAILABLE' | 'APPLICATION_MIGRATION_FAILED'>
export type WorkerRefusal =
  | Code<Exclude<WorkerCode, 'HANDLER_FAILED' | 'HANDLER_LOAD_FAILED' | 'DATABASE_UNAVAILABLE' | 'APPLICATION_MIGRATION_FAILED'>>
  | Readonly<{ code: 'HANDLER_FAILED' | 'HANDLER_LOAD_FAILED' | 'DATABASE_UNAVAILABLE'; sqlstate: SqlState | null }>
  | Readonly<{ code: 'APPLICATION_MIGRATION_FAILED'; migration: string | null; sqlstate: SqlState | null }>
export type WorkerAnswer = Result<unknown, WorkerRefusal>

export type PrepareRefusal =
  | Code<'MANIFEST_REFUSED' | 'SERVER_TREE_REFUSED'>
  | Readonly<{ code: 'APPLICATION_MIGRATION_FAILED'; migration: string | null; sqlstate: SqlState | null }>
  | Readonly<{ code: 'APPLICATION_MIGRATION_HISTORY_DIVERGED'; migration: string }>
export type PrepareAnswer = Result<Readonly<{ reset: boolean; applied: readonly string[] }>, PrepareRefusal>

export type InvokeRefusal =
  | Code<'MANIFEST_REFUSED' | 'SERVER_TREE_REFUSED'>
  | Readonly<{ code: 'INPUT_REFUSED' | 'HANDLER_OUTPUT_REFUSED'; violation: SchemaViolation }>
  | Readonly<{ code: 'HANDLER_EXPORT_MISSING'; export: string }>
  | Readonly<{ code: 'HANDLER_CRASHED'; exitCode: number | null; signal: string | null }>
  | Extract<WorkerRefusal, { code: 'HANDLER_FAILED' | 'HANDLER_LOAD_FAILED' | 'DATABASE_UNAVAILABLE' }>
  | Code<Exclude<WorkerCode, 'HANDLER_FAILED' | 'HANDLER_LOAD_FAILED' | 'DATABASE_UNAVAILABLE' | 'HANDLER_EXPORT_MISSING' | 'APPLICATION_MIGRATION_FAILED'>
    | 'OPERATION_NOT_FOUND' | 'INPUT_TOO_LARGE' | 'CONNECTOR_SOCKET_REFUSED' | 'APPLICATION_RUNNER_BUSY' | 'HANDLER_TIMEOUT' | 'APPLICATION_PROJECT_BUSY'>
export type InvokeAnswer = Result<unknown, InvokeRefusal>

function refuseManifest({ where, diagnostic }: Readonly<{ where: string; diagnostic: string }>): ManifestRefusal {
  return Object.freeze({ code: 'MANIFEST_REFUSED', where, diagnostic })
}

function refuseTree({ where, diagnostic }: Readonly<{ where: string; diagnostic: string }>): TreeRefusal {
  return Object.freeze({ code: 'SERVER_TREE_REFUSED', where, diagnostic })
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)
}

function onlyKeys(record: Record<string, unknown>, allowed: readonly string[], where: string): ManifestRefusal | null {
  for (const key of Object.keys(record)) if (!allowed.includes(key)) return refuseManifest({ where, diagnostic: `unknown key "${key}"` })
  return null
}

function bound(record: Record<string, unknown>, key: string, where: string, integer: boolean): ManifestRefusal | null {
  const limit = record[key]
  if (limit === undefined) return null
  if (typeof limit !== 'number' || !Number.isFinite(limit) || (integer && (!Number.isSafeInteger(limit) || limit < 0))) return refuseManifest({ where, diagnostic: `"${key}" must be a ${integer ? 'non-negative integer' : 'finite number'}` })
  return null
}

const PROPERTY = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/

function assertSchema(candidate: unknown, where: string, depth: number): ManifestRefusal | null {
  if (depth > 6) return refuseManifest({ where, diagnostic: 'nested deeper than 6 levels' })
  if (!isRecord(candidate)) return refuseManifest({ where, diagnostic: 'must be an object with a "type"' })
  switch (candidate.type) {
    case 'string': {
      const stringKeys = onlyKeys(candidate, ['type', 'enum', 'minLength', 'maxLength'], where)
      if (stringKeys) return stringKeys
      if (candidate.enum !== undefined) {
        const values = candidate.enum
        if (!Array.isArray(values) || values.length < 1 || values.length > 64 || new Set(values).size !== values.length || !values.every((value) => typeof value === 'string' && value.length <= 200)) {
          return refuseManifest({ where, diagnostic: '"enum" must list between 1 and 64 distinct strings of at most 200 characters' })
        }
        if (candidate.minLength !== undefined || candidate.maxLength !== undefined) return refuseManifest({ where, diagnostic: '"enum" cannot be combined with "minLength" or "maxLength"' })
      }
      return bound(candidate, 'minLength', where, true) ?? bound(candidate, 'maxLength', where, true)
    }
    case 'integer':
    case 'number': {
      const numericKeys = onlyKeys(candidate, ['type', 'minimum', 'maximum'], where)
      if (numericKeys) return numericKeys
      return bound(candidate, 'minimum', where, false) ?? bound(candidate, 'maximum', where, false)
    }
    case 'boolean':
      return onlyKeys(candidate, ['type'], where)
    case 'object': {
      const objectKeys = onlyKeys(candidate, ['type', 'properties', 'required', 'additionalProperties'], where)
      if (objectKeys) return objectKeys
      if (candidate.additionalProperties !== false) return refuseManifest({ where, diagnostic: '"additionalProperties" must be false' })
      const properties = candidate.properties
      if (!isRecord(properties)) return refuseManifest({ where, diagnostic: '"properties" must be an object' })
      const names = Object.keys(properties)
      if (names.length > 64) return refuseManifest({ where, diagnostic: 'more than 64 properties' })
      for (const name of names) {
        if (!PROPERTY.test(name)) return refuseManifest({ where, diagnostic: `property name "${name}" is not an identifier` })
        const refusal = assertSchema(properties[name], `${where}.properties.${name}`, depth + 1)
        if (refusal) return refusal
      }
      if (candidate.required !== undefined) {
        if (!Array.isArray(candidate.required) || !candidate.required.every((name) => typeof name === 'string' && names.includes(name))) {
          return refuseManifest({ where, diagnostic: '"required" must list declared properties' })
        }
      }
      return null
    }
    case 'array': {
      const arrayKeys = onlyKeys(candidate, ['type', 'items', 'maxItems'], where)
      if (arrayKeys) return arrayKeys
      const maxItems = bound(candidate, 'maxItems', where, true)
      if (maxItems) return maxItems
      return assertSchema(candidate.items, `${where}.items`, depth + 1)
    }
    default:
      return refuseManifest({ where, diagnostic: '"type" must be one of string, integer, number, boolean, object, array' })
  }
}

const OPERATION = /^[a-z][A-Za-z0-9]{0,63}$/
const EXPORT = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/
const SEGMENT = '[a-z0-9][a-z0-9_-]{0,63}'
const HANDLER = new RegExp(`^handlers/(?:${SEGMENT}/){0,3}${SEGMENT}\\.ts$`)
const MODULE = new RegExp(`^handlers/(?:${SEGMENT}/){0,3}${SEGMENT}\\.mjs$`)
const MIGRATION = /^[0-9]{3,6}_[a-z0-9_]{1,60}\.sql$/

export const isMigrationName = (candidate: unknown): candidate is string => typeof candidate === 'string' && MIGRATION.test(candidate)

function assertManifest(value: unknown, stage: 'source' | 'server'): ManifestRefusal | null {
  if (!isRecord(value)) return refuseManifest({ where: 'manifest', diagnostic: 'must be a JSON object' })
  const manifestKeys = onlyKeys(value, stage === 'source' ? ['operations'] : ['version', 'operations', 'migrations'], 'manifest')
  if (manifestKeys) return manifestKeys
  if (stage === 'server' && value.version !== 1) return refuseManifest({ where: 'manifest', diagnostic: '"version" must be 1' })
  const operations = value.operations
  if (!isRecord(operations)) return refuseManifest({ where: 'operations', diagnostic: 'must be an object' })
  const ids = Object.keys(operations)
  if (ids.length === 0 || ids.length > 32) return refuseManifest({ where: 'operations', diagnostic: 'must declare between 1 and 32 operations' })
  for (const id of ids) {
    const where = `operations.${id}`
    if (!OPERATION.test(id)) return refuseManifest({ where, diagnostic: 'an operation id is camelCase letters and digits, starting lowercase' })
    const entry = operations[id]
    if (!isRecord(entry)) return refuseManifest({ where, diagnostic: 'must be an object' })
    const pathKey = stage === 'source' ? 'handler' : 'module'
    const entryKeys = onlyKeys(entry, [pathKey, 'export', 'input', 'output'], where)
    if (entryKeys) return entryKeys
    const path = entry[pathKey]
    if (typeof path !== 'string' || !(stage === 'source' ? HANDLER : MODULE).test(path)) {
      return refuseManifest({ where, diagnostic: stage === 'source' ? '"handler" must be a path like handlers/notes.ts inside conexus/' : '"module" must be a bundled handler path' })
    }
    if (typeof entry.export !== 'string' || !EXPORT.test(entry.export)) return refuseManifest({ where, diagnostic: '"export" must name the handler function' })
    const input = entry.input
    const inputRefusal = assertSchema(input, `${where}.input`, 0)
    if (inputRefusal) return inputRefusal
    if (!isRecord(input) || input.type !== 'object') return refuseManifest({ where: `${where}.input`, diagnostic: 'an operation input must be an object schema' })
    const outputRefusal = assertSchema(entry.output, `${where}.output`, 0)
    if (outputRefusal) return outputRefusal
  }
  if (stage === 'server') {
    const migrations = value.migrations
    if (!Array.isArray(migrations) || migrations.length > 64) return refuseManifest({ where: 'migrations', diagnostic: 'must be a list of at most 64 migrations' })
    const names = new Set<string>()
    for (const [index, migration] of migrations.entries()) {
      const where = `migrations[${index}]`
      if (!isRecord(migration)) return refuseManifest({ where, diagnostic: 'must be an object' })
      const migrationKeys = onlyKeys(migration, ['name', 'sha256', 'sql'], where)
      if (migrationKeys) return migrationKeys
      if (!isMigrationName(migration.name) || names.has(migration.name)) return refuseManifest({ where, diagnostic: 'a migration is named like 001_create_notes.sql, once' })
      names.add(migration.name)
      if (typeof migration.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(migration.sha256)) return refuseManifest({ where, diagnostic: '"sha256" must be a hex digest' })
      if (typeof migration.sql !== 'string' || migration.sql.length === 0 || migration.sql.length > 256 * 1024) return refuseManifest({ where, diagnostic: '"sql" must be 1 byte to 256 KiB' })
    }
    let previous: string | undefined
    for (const name of names) {
      if (previous !== undefined && name <= previous) return refuseManifest({ where: 'migrations', diagnostic: 'must be in name order' })
      previous = name
    }
  }
  return null
}

/**
 * Admits a manifest or returns its first structured refusal.
 * `source` is the Builder's `conexus/manifest.json`; `server` is the build's normalized one.
 *
 * The Hub's check bundle imports this same function, so the Project check, the Conexus build and
 * the runner refuse exactly the same manifests.
 */
export function admitManifest(value: unknown, stage: 'source'): Result<SourceManifest, ManifestRefusal>
export function admitManifest(value: unknown, stage: 'server'): Result<ServerManifest, ManifestRefusal>
export function admitManifest(value: unknown, stage: 'source' | 'server'): Result<SourceManifest | ServerManifest, ManifestRefusal> {
  let refusal: ManifestRefusal | null = null
  const parsed = z.custom<SourceManifest | ServerManifest>((candidate): candidate is SourceManifest | ServerManifest => {
    refusal = assertManifest(candidate, stage)
    return refusal === null
  }).safeParse(value)
  if (!parsed.success) return Object.freeze({ ok: false, error: refusal ?? refuseManifest({ where: 'manifest', diagnostic: 'must be a JSON object' }) })
  return Object.freeze({ ok: true, result: parsed.data })
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

/**
 * Admits a `conexus-server/` tree or returns its first structured refusal. `sha256` hashes bytes to a hex digest.
 *
 * The Hub's check bundle imports this same function, so the Project check refuses exactly the tree
 * the runner would refuse.
 */
export function admitServerTree(files: readonly ServerFile[], sha256: (bytes: Buffer) => string): Result<ServerTree, TreeRefusal | ManifestRefusal> {
  const ROOT = 'conexus-server'
  const MAX_FILES = 128
  const MAX_FILE_BYTES = 4 * 1024 * 1024
  const DIRECTORY = /^[a-z0-9][A-Za-z0-9_.-]{0,127}$/
  const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/
  const entries: readonly ServerFile[] = files
  if (!Array.isArray(files) || entries.length === 0 || entries.length > MAX_FILES) return Object.freeze({ ok: false, error: refuseTree({ where: 'tree', diagnostic: `must hold between 1 and ${MAX_FILES} files` }) })
  const modules = new Map<string, Buffer>()
  let manifest: ServerManifest | null = null
  for (const file of entries) {
    if (typeof file?.path !== 'string' || typeof file.content !== 'string' || typeof file.sha256 !== 'string') return Object.freeze({ ok: false, error: refuseTree({ where: 'tree', diagnostic: 'every file needs a path, content and sha256' }) })
    const parts = file.path.split('/')
    const name = parts.at(-1)
    if (name === undefined || parts[0] !== ROOT || parts.length < 2 || parts.length > 8) return Object.freeze({ ok: false, error: refuseTree({ where: file.path, diagnostic: `must sit at most 7 levels under ${ROOT}/` }) })
    const directories = parts.slice(1, -1)
    if (directories.some((part) => part === '..' || part === '.' || !DIRECTORY.test(part))) {
      return Object.freeze({ ok: false, error: refuseTree({ where: file.path, diagnostic: 'a directory is ASCII letters, digits, "_", "." or "-" and starts with a lowercase letter or digit' }) })
    }
    if (!NAME.test(name)) return Object.freeze({ ok: false, error: refuseTree({ where: file.path, diagnostic: 'a file name is ASCII letters, digits, "_", "." or "-" and starts with a letter or digit' }) })
    const bytes = Buffer.from(file.content, 'base64')
    if (bytes.byteLength > MAX_FILE_BYTES) return Object.freeze({ ok: false, error: refuseTree({ where: file.path, diagnostic: 'larger than 4 MiB' }) })
    if (sha256(bytes) !== file.sha256) return Object.freeze({ ok: false, error: refuseTree({ where: file.path, diagnostic: 'content does not match its sha256' }) })
    const relative = file.path.slice(ROOT.length + 1)
    if (relative === 'manifest.json') {
      let parsed: unknown
      try {
        parsed = JSON.parse(bytes.toString('utf8'))
      } catch {
          return Object.freeze({ ok: false, error: refuseTree({ where: file.path, diagnostic: 'is not valid JSON' }) })
      }
      const admitted = admitManifest(parsed, 'server')
      if (!admitted.ok) return admitted
      manifest = admitted.result
    } else if (!relative.endsWith('.mjs')) return Object.freeze({ ok: false, error: refuseTree({ where: file.path, diagnostic: 'only .mjs modules and manifest.json may be in the tree' }) })
    else if (modules.has(relative)) return Object.freeze({ ok: false, error: refuseTree({ where: file.path, diagnostic: 'appears twice' }) })
    else modules.set(relative, bytes)
  }
  if (!manifest) return Object.freeze({ ok: false, error: refuseTree({ where: `${ROOT}/manifest.json`, diagnostic: 'is missing' }) })
  const admitted = manifest
  for (const [id, operation] of Object.entries(admitted.operations)) {
    if (!modules.has(operation.module)) return Object.freeze({ ok: false, error: refuseTree({ where: `operations.${id}`, diagnostic: `module ${ROOT}/${operation.module} is not in the tree` }) })
  }
  return Object.freeze({ ok: true, result: Object.freeze({ manifest: admitted, modules }) })
}

const UNDECLARED_KEY_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/

/**
 * The first place `value` breaks `schema`, as a JSON pointer and rule, or null when it conforms. The
 * text names only schema facts and array positions, so the runner may log it. An undeclared key is
 * named only when `echoUndeclared` is true: the caller's input may be told its own key, but an
 * output key is the handler's choice and never reaches the model.
 */
export const schemaViolation = (schema: ValueSchema, value: unknown, echoUndeclared: boolean): SchemaViolation | null => {
  const violation = (pointer: string, rule: string): SchemaViolation => Object.freeze({ pointer, rule })
  const child = (pointer: string, part: string): string => `${pointer}/${part.replaceAll('~', '~0').replaceAll('/', '~1')}`
  const at = (pointer: string): string => pointer || '/'
  const inspect = (shape: ValueSchema, input: unknown, pointer: string): SchemaViolation | null => {
    switch (shape.type) {
      case 'string':
        if (typeof input !== 'string') return violation(at(pointer), 'expected string')
        if (shape.enum !== undefined && !shape.enum.includes(input)) return violation(at(pointer), `not one of ${shape.enum.map((allowed) => JSON.stringify(allowed)).join(', ')}`)
        if (shape.minLength !== undefined && input.length < shape.minLength) return violation(at(pointer), `shorter than ${shape.minLength}`)
        if (shape.maxLength !== undefined && input.length > shape.maxLength) return violation(at(pointer), `longer than ${shape.maxLength}`)
        return null
      case 'integer':
      case 'number':
        if (typeof input !== 'number' || !Number.isFinite(input) || (shape.type === 'integer' && !Number.isSafeInteger(input))) return violation(at(pointer), `expected ${shape.type}`)
        if (shape.minimum !== undefined && input < shape.minimum) return violation(at(pointer), `below ${shape.minimum}`)
        if (shape.maximum !== undefined && input > shape.maximum) return violation(at(pointer), `above ${shape.maximum}`)
        return null
      case 'boolean':
        return typeof input === 'boolean' ? null : violation(at(pointer), 'expected boolean')
      case 'array':
        if (!Array.isArray(input)) return violation(at(pointer), 'expected array')
        if (shape.maxItems !== undefined && input.length > shape.maxItems) return violation(at(pointer), `more than ${shape.maxItems} items`)
        for (const [index, item] of input.entries()) {
          const result = inspect(shape.items, item, child(pointer, String(index)))
          if (result) return result
        }
        return null
      case 'object':
        if (!isRecord(input)) return violation(at(pointer), 'expected object')
        for (const key of Object.keys(input)) if (!Object.hasOwn(shape.properties, key)) {
          const named = echoUndeclared && UNDECLARED_KEY_NAME.test(key) ? key : '(key)'
          return violation(child(pointer, named), 'not declared')
        }
        for (const key of shape.required ?? []) if (!Object.hasOwn(input, key)) return violation(child(pointer, key), 'required')
        for (const [key, property] of Object.entries(shape.properties)) {
          if (!Object.hasOwn(input, key)) continue
          const result = inspect(property, input[key], child(pointer, key))
          if (result) return result
        }
        return null
    }
  }
  return inspect(schema, value, '')
}
