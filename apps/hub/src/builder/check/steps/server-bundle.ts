import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'
import { admitManifest, admitServerTree, type SourceManifest, SUPPORTED_NODE_IMPORTS } from '../../../app-runner/public.js'
import { type Chunk, loadVite } from '../compiler.js'
import type { CheckContext, Place } from '../context.js'
import { failed, OK, type Outcome } from '../outcome.js'
import { outputProblem } from '../problems.js'
import { runWorker } from '../worker.js'
import { networkGlobal } from './network-globals.js'

class Refused extends Error {}
const refuse = (message: string): never => { throw new Refused(message) }

type Migration = Readonly<{ name: string; sha256: string; sql: string }>

const sha256Of = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex')
const admissionDiagnostic = (error: Readonly<{ code: string; where: string; diagnostic: string }>): string => `${error.code}: ${error.where}: ${error.diagnostic}`

const readMigrations = (conexus: string): readonly Migration[] => {
  const directory = join(conexus, 'migrations')
  if (!existsSync(directory)) return []
  return readdirSync(directory).sort().map((name) => {
    if (!/^[0-9]{3,6}_[a-z0-9_]{1,60}\.sql$/.test(name) || !statSync(join(directory, name)).isFile()) refuse(`conexus/migrations/${name} must be a file named like 001_create_notes.sql`)
    const sql = readFileSync(join(directory, name), 'utf8')
    return { name, sha256: sha256Of(sql), sql }
  })
}

type ResolveContext = { resolve(id: string, importer: string, options: object): Promise<{ id: string; external?: boolean } | null> }

/** Handlers may import only their own source under `conexus/` and the supported Node built-ins. */
const confineHandlers = (conexus: string) => {
  const inside = (path: string): boolean => path === conexus || path.startsWith(conexus + sep)
  return {
    name: 'conexus-handler-root',
    enforce: 'pre' as const,
    async resolveId(this: ResolveContext, id: string, importer: string | undefined, options: object) {
      if (id.startsWith('node:')) {
        if (SUPPORTED_NODE_IMPORTS.includes(id) || !importer || !inside(importer)) return { id, external: true }
        throw new Error(`conexus/${relative(conexus, importer)} imports "${id}": among Node built-ins a handler may import only ${SUPPORTED_NODE_IMPORTS.join(', ')}; there is no file system, network or process access`)
      }
      if (!importer) return null
      const resolved = await this.resolve(id, importer, { ...options, skipSelf: true })
      const resolvedPath = resolved?.id.split('?')[0] ?? ''
      if (!resolved || resolved.external || !inside(resolvedPath) || !['.ts', '.js', '.mjs', '.json'].includes(extname(resolvedPath))) {
        throw new Error(`conexus/${relative(conexus, importer)} imports "${id}": a handler may import only .ts, .js or .json files inside conexus/ and the supported node: built-ins`)
      }
      return resolved
    },
  }
}

const sourceOf = (conexus: string, chunk: Chunk): string => chunk.isEntry
  ? `conexus/${chunk.fileName.slice(0, -4)}.ts`
  : `conexus-server/${chunk.fileName} (shared by ${chunk.moduleIds.filter((id) => id.startsWith(conexus + sep)).map((id) => `conexus/${relative(conexus, id).split(sep).join('/')}`).join(', ')})`

/** Bundles only the handlers the manifest names, each exporting what it declares and none reaching the network. */
const bundleHandlers = async (compiler: string, conexus: string, serverOut: string, source: SourceManifest, handlers: readonly string[]): Promise<void> => {
  const vite = await loadVite(compiler)
  let chunks: readonly Chunk[]
  try {
    chunks = await vite.build({
      configFile: false, root: conexus, logLevel: 'error', publicDir: false, envDir: false,
      plugins: [confineHandlers(conexus)],
      css: { postcss: {} },
      ssr: { noExternal: true, target: 'node' },
      build: {
        ssr: true, outDir: serverOut, emptyOutDir: true, minify: false, sourcemap: false, target: 'node24', copyPublicDir: false, write: true,
        rolldownOptions: {
          input: Object.fromEntries(handlers.map((handler) => [handler.slice(0, -3), join(conexus, handler)])),
          // A shared chunk is named by its hash alone: a source name such as _shared or cálculos would
          // break the runner's path rule. The prefix keeps the name starting with a letter.
          output: { format: 'es', entryFileNames: '[name].mjs', chunkFileNames: 'chunks/c-[hash].mjs' },
        },
      },
    })
  } catch (error) {
    return refuse(`bundling handlers failed: ${String(error instanceof Error ? error.message : error).split('\n').slice(0, 6).join(' ')}`)
  }
  for (const [id, operation] of Object.entries(source.operations)) {
    const chunk = chunks.find((candidate) => candidate.isEntry && candidate.fileName === `${operation.handler.slice(0, -3)}.mjs`)
    if (!chunk?.exports.includes(operation.export)) refuse(`operations.${id}: conexus/${operation.handler} does not export "${operation.export}" (it exports: ${chunk?.exports.join(', ') || 'nothing'})`)
  }
  for (const chunk of chunks) {
    const reached = networkGlobal(vite.parseAst(chunk.code))
    if (reached) refuse(`${sourceOf(conexus, chunk)} uses the global "${reached}": a handler has no network; a company system is reached only through connectors.fetch`)
  }
}

/** Writes the normalized manifest beside the handlers and admits the whole tree the way the runner will. */
const admitBuiltTree = (serverOut: string, operations: Record<string, unknown>, migrations: readonly Migration[]): void => {
  try {
    const normalized = { version: 1, operations, migrations }
    const admitted = admitManifest(normalized, 'server')
    if (!admitted.ok) refuse(admissionDiagnostic(admitted.error))
    writeFileSync(join(serverOut, 'manifest.json'), JSON.stringify(normalized))
    const tree = readdirSync(serverOut, { recursive: true }).map(String).filter((path) => statSync(join(serverOut, path)).isFile()).map((path) => {
      const bytes = readFileSync(join(serverOut, path))
      return { path: `conexus-server/${path.split(sep).join('/')}`, content: bytes.toString('base64'), sha256: sha256Of(bytes) }
    })
    const admittedTree = admitServerTree(tree, sha256Of)
    if (!admittedTree.ok) refuse(admissionDiagnostic(admittedTree.error))
  } catch (error) {
    refuse(error instanceof Error ? error.message : String(error))
  }
}

const build = async ({ root, out, compiler }: Place): Promise<void> => {
  const conexus = join(root, 'conexus')
  const manifestPath = join(conexus, 'manifest.json')
  if (!existsSync(manifestPath)) {
    if (existsSync(join(conexus, 'handlers')) || existsSync(join(conexus, 'migrations'))) refuse('conexus/handlers or conexus/migrations exists, but conexus/manifest.json is missing')
    return
  }
  let source: SourceManifest
  try {
    const admitted = admitManifest(JSON.parse(readFileSync(manifestPath, 'utf8')), 'source')
    if (!admitted.ok) return refuse(admissionDiagnostic(admitted.error))
    source = admitted.result
  } catch (error) {
    return refuse(error instanceof SyntaxError ? `conexus/manifest.json is not valid JSON: ${error.message}` : String(error instanceof Error ? error.message : error))
  }
  const handlers = [...new Set(Object.values(source.operations).map((operation) => operation.handler))]
  for (const handler of handlers) if (!existsSync(join(conexus, handler))) refuse(`conexus/${handler} does not exist`)
  const migrations = readMigrations(conexus)
  const serverOut = join(out, 'conexus-server')
  await bundleHandlers(compiler, conexus, serverOut, source, handlers)
  for (const file of readdirSync(serverOut, { recursive: true })) {
    const path = String(file)
    if (statSync(join(serverOut, path)).isFile() && !path.endsWith('.mjs')) refuse(`bundling produced ${path}; handlers must not import assets`)
  }
  const operations = Object.fromEntries(Object.entries(source.operations).map(([id, operation]) => [id, {
    module: `${operation.handler.slice(0, -3)}.mjs`, export: operation.export, input: operation.input, output: operation.output,
  }]))
  admitBuiltTree(serverOut, operations, migrations)
}

/** The server half of a build, run as the agent's user. A project without a manifest has no server half. */
export const serverBundle = async (place: Place): Promise<Outcome> => {
  try {
    await build(place)
    return OK
  } catch (error) {
    if (!(error instanceof Refused)) throw error
    return failed('SERVER_BUNDLE_REFUSED', [outputProblem(place.root, 1, error.message)])
  }
}

export const server = (ctx: CheckContext): Promise<Outcome> =>
  runWorker(ctx, 'server', ctx.limits.server, {}, (result) => failed('SERVER_BUNDLE_REFUSED', [outputProblem(ctx.root, result.code, result.stderr || result.stdout)]))
