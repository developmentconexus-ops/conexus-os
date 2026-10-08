import { createHash } from 'node:crypto'
import { z } from 'zod'
import { admitManifest } from '../app-runner/server-manifest.js'
import type { ValueSchema } from '../app-runner/server-manifest.js'
import type { InvokeAnswer, InvokeRefusal } from '../app-runner/server-manifest.js'
import type { Caller } from '../platform/caller.js'
import { commandEvidence } from './application-starter.js'
import type { ProjectId } from '@conexus/contract'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** One file of the candidate's built `conexus-server/` tree, as the runner takes it. */
type ServerFile = Readonly<{ path: string; sha256: string; content: string }>

const fieldFillSchema = z.strictObject({
  values: z.number().int(),
  filled: z.number().int(),
  zeros: z.number().int().optional(),
})

/**
 * What `conexus_run_operation` tells the model: the shape of one answer, never a value. `lists`
 * counts the items at each list path; `fields` counts, per declared field, how many values came back,
 * how many are filled and how many are zero. `*` in a path stands for every item of a list.
 */
export const operationRunReportSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    operation: z.string(),
    lists: z.record(z.string(), z.number().int()),
    fields: z.record(z.string(), fieldFillSchema),
  }),
  z.strictObject({ ok: z.literal(false), operation: z.string(), code: z.string(), detail: z.string().optional() }),
])
type OperationRunReport = z.infer<typeof operationRunReportSchema>
type FieldFill = z.infer<typeof fieldFillSchema>
type OperationShape = Pick<Extract<OperationRunReport, { ok: true }>, 'lists' | 'fields'>

const isFilled = (value: unknown): boolean =>
  value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '')

// A zero read as a number or as the text a decimal arrives in ("0", "0.00", "0,0").
const isZero = (value: unknown): boolean =>
  value === 0 || (typeof value === 'string' && /^[-+]?(?:0+(?:[.,]0*)?|[.,]0+)$/.test(value.trim()))

/**
 * Counts the answer against the operation's output schema. Every declared field is listed, even one
 * the handler never returned, so a field that came back empty everywhere shows `filled: 0`.
 */
const operationShape = (schema: ValueSchema, value: unknown): OperationShape => {
  const lists: Record<string, number> = {}
  const fields: Record<string, { values: number; filled: number; zeros: number }> = {}
  const declare = (node: ValueSchema, path: string): void => {
    if (node.type === 'array') {
      lists[path || '/'] = 0
      declare(node.items, `${path}/*`)
    } else if (node.type === 'object') {
      for (const [key, property] of Object.entries(node.properties)) declare(property, `${path}/${key}`)
    } else fields[path || '/'] = { values: 0, filled: 0, zeros: 0 }
  }
  const count = (node: ValueSchema, current: unknown, path: string): void => {
    if (node.type === 'array') {
      const items = Array.isArray(current) ? current : []
      lists[path || '/'] = (lists[path || '/'] ?? 0) + items.length
      for (const item of items) count(node.items, item, `${path}/*`)
    } else if (node.type === 'object') {
      const record = isRecord(current) ? current : {}
      for (const [key, property] of Object.entries(node.properties)) count(property, record[key], `${path}/${key}`)
    } else {
      const fill = fields[path || '/']
      if (!fill) return
      fill.values += 1
      if (isFilled(current)) fill.filled += 1
      if (isZero(current)) fill.zeros += 1
    }
  }
  declare(schema, '')
  count(schema, value, '')
  return {
    lists,
    fields: Object.fromEntries(Object.entries(fields).map(([path, { zeros, ...fill }]): [string, FieldFill] => [path, zeros > 0 ? { ...fill, zeros } : fill])),
  }
}

const DETAIL_CHARS = 300

const refused = (operation: string, code: string, detail?: string): OperationRunReport =>
  detail ? { ok: false, operation, code, detail: detail.slice(0, DETAIL_CHARS) } : { ok: false, operation, code }

function refusalDetail(error: InvokeRefusal): string | undefined {
  switch (error.code) {
    case 'INPUT_REFUSED':
    case 'HANDLER_OUTPUT_REFUSED':
      return `${error.violation.pointer}: ${error.violation.rule}`
    case 'HANDLER_EXPORT_MISSING':
      return error.export
    case 'HANDLER_CRASHED': {
      const facts = [error.exitCode === null ? undefined : `exit code ${error.exitCode}`, error.signal === null ? undefined : `signal ${error.signal}`].filter(Boolean)
      return facts.length > 0 ? facts.join(', ') : undefined
    }
    case 'HANDLER_FAILED':
    case 'HANDLER_LOAD_FAILED':
    case 'DATABASE_UNAVAILABLE':
      return error.sqlstate === null ? undefined : `SQLSTATE ${error.sqlstate}`
    case 'MANIFEST_REFUSED':
    case 'SERVER_TREE_REFUSED':
    case 'HANDLER_OUTPUT_UNSERIALIZABLE':
    case 'WORKER_FAILED':
    case 'WORKER_JOB_REFUSED':
    case 'RESPONSE_TOO_LARGE':
    case 'OPERATION_NOT_FOUND':
    case 'INPUT_TOO_LARGE':
    case 'CONNECTOR_SOCKET_REFUSED':
    case 'APPLICATION_RUNNER_BUSY':
    case 'HANDLER_TIMEOUT':
    case 'APPLICATION_PROJECT_BUSY':
      return undefined
    default: {
      const exhaustive: never = error
      return exhaustive
    }
  }
}

export type CandidateOperationPorts = Readonly<{
  projectId: ProjectId
  caller: Caller
  /** Builds the candidate's server half from the checkout as it stands; `detail` is the build's own refusal. */
  buildServer(): Promise<Readonly<{ ok: true; files: readonly ServerFile[] }> | Readonly<{ ok: false; detail: string }>>
  /** One invocation's connector port on the run's own scope, or null when the Hub serves none. */
  openConnectorPort(): Promise<Readonly<{ socketPath: string; close(): Promise<void> }> | null>
  invoke(input: Readonly<{
    projectId: ProjectId; operation: string; input: unknown; files: readonly ServerFile[]; caller: Caller; connectorSocket?: string
  }>): Promise<InvokeAnswer>
}>

// The runner's own bounds on a server tree (app-runner/supervisor.ts), restated: the import law keeps
// the Builder from importing the runner's supervisor.
const SERVER_TREE_FILES = 128
const SERVER_TREE_BYTES = 8 * 1024 * 1024

/** Where the server half is built: the node binary, the Hub's check bundle by its hash path, the checkout and the output folder. */
export type ServerBuildPlace = Readonly<{ node: string; entry: string; checkout: string; out: string }>

/**
 * Builds the checkout's server half with the Hub's own bundle (`main.mjs server`) into a folder emptied first, so a
 * Project without a manifest never serves an earlier build, and reads the tree back. `run` runs a
 * shell script with positional arguments as the agent's user; `read` reads a file as that user.
 */
export const buildCandidateServer = async (
  place: ServerBuildPlace,
  run: (script: string, args: readonly string[]) => Promise<Readonly<{ exitCode: number; stdout: string; stderr: string }>>,
  read: (path: string) => Promise<Uint8Array>,
): ReturnType<CandidateOperationPorts['buildServer']> => {
  const built = await run([
    'set -e',
    'rm -rf "$4"',
    'mkdir -p "$4"',
    '"$1" "$2" server --root "$3" --out "$4" >/dev/null',
    'if [ -d "$4/conexus-server" ]; then cd "$4/conexus-server" && find . -type f | cut -c3-; fi',
  ].join('\n'), [place.node, place.entry, place.checkout, place.out])
  if (built.exitCode !== 0) return { ok: false, detail: commandEvidence(built.stderr.trim().replace(/^conexus server check: /, '')) }
  const paths = built.stdout.split('\n').filter(Boolean).sort()
  if (paths.length > SERVER_TREE_FILES) return { ok: false, detail: `the server half has more than ${SERVER_TREE_FILES} files` }
  const files: ServerFile[] = []
  let bytes = 0
  for (const path of paths) {
    const content = await read(`${place.out}/conexus-server/${path}`)
    bytes += content.byteLength
    if (bytes > SERVER_TREE_BYTES) return { ok: false, detail: `the server half is larger than ${SERVER_TREE_BYTES} bytes` }
    files.push({ path: `conexus-server/${path}`, sha256: createHash('sha256').update(content).digest('hex'), content: Buffer.from(content).toString('base64') })
  }
  return { ok: true, files }
}

export type RunOperation = (request: Readonly<{ operation: string; input: Record<string, unknown> }>) => Promise<OperationRunReport>

const MANIFEST_PATH = 'conexus-server/manifest.json'

/**
 * Runs one operation of the candidate the way the Prévia would, before admission: the server half
 * built from the checkout, the Prévia's runner, a connector port on the run's scope. It answers with
 * the shape of the result only. Calls run one at a time, since every build writes the same folder.
 */
export const createOperationRunner = (ports: CandidateOperationPorts): RunOperation => {
  let previous: Promise<unknown> = Promise.resolve()
  return (request) => {
    const current = previous.then(() => runOnce(ports, request))
    previous = current.catch(() => undefined)
    return current
  }
}

const runOnce = async (ports: CandidateOperationPorts, { operation, input }: Parameters<RunOperation>[0]): Promise<OperationRunReport> => {
  const built = await ports.buildServer()
  if (!built.ok) return refused(operation, 'SERVER_BUILD_FAILED', built.detail)
  const manifestFile = built.files.find((file) => file.path === MANIFEST_PATH)
  if (!manifestFile) return refused(operation, 'SERVER_HALF_MISSING', 'the checkout has no conexus/manifest.json')
  const admission = admitManifest(JSON.parse(Buffer.from(manifestFile.content, 'base64').toString('utf8')), 'server')
  if (!admission.ok) return refused(operation, admission.error.code, `${admission.error.where}: ${admission.error.diagnostic}`)
  const manifest = admission.result
  const declared = Object.hasOwn(manifest.operations, operation) ? manifest.operations[operation] : undefined
  if (!declared) return refused(operation, 'OPERATION_NOT_FOUND', `declared: ${Object.keys(manifest.operations).join(', ')}`)
  let answer: InvokeAnswer
  const port = await ports.openConnectorPort()
  try {
    answer = await ports.invoke({
      projectId: ports.projectId, operation, input, files: built.files, caller: ports.caller,
      ...(port ? { connectorSocket: port.socketPath } : {}),
    })
  } finally {
    await port?.close()
  }
  if (!answer.ok) return refused(operation, answer.error.code, refusalDetail(answer.error))
  return { ok: true, operation, ...operationShape(declared.output, answer.result) }
}
