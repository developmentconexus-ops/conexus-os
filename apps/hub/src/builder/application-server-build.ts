import { admitManifest } from '../app-runner/server-manifest.js'

/**
 * The server half of a Conexus build, run inside the build sandbox with the pinned compiler's vite.
 * It admits `conexus/manifest.json`, bundles only the handlers it names into
 * `<out>/conexus-server/handlers/*.mjs`, and writes the normalized manifest with every
 * `conexus/migrations/*.sql` inlined in name order. The Project check runs the same script, so the
 * Builder sees the refusal the Conexus build would give. A Project without a manifest has no server
 * half and the script does nothing.
 */
export const SERVER_BUILD_SCRIPT_PATH = '/opt/conexus/server-build.mjs'

export const serverBuildScriptSource = (): string => `
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'

const admitManifest = ${admitManifest.toString()}

const [root, outDir] = process.argv.slice(2)
const conexus = join(root, 'conexus')
const fail = (message) => {
  process.stderr.write('conexus server check: ' + message + '\\n')
  process.exit(1)
}
const manifestPath = join(conexus, 'manifest.json')
if (!existsSync(manifestPath)) {
  if (existsSync(join(conexus, 'handlers')) || existsSync(join(conexus, 'migrations'))) fail('conexus/handlers or conexus/migrations exists, but conexus/manifest.json is missing')
  process.exit(0)
}
let source
try {
  source = admitManifest(JSON.parse(readFileSync(manifestPath, 'utf8')), 'source')
} catch (error) {
  fail(error instanceof SyntaxError ? 'conexus/manifest.json is not valid JSON: ' + error.message : error.message)
}
const handlers = [...new Set(Object.values(source.operations).map((operation) => operation.handler))]
for (const handler of handlers) if (!existsSync(join(conexus, handler))) fail('conexus/' + handler + ' does not exist')

const migrationsDir = join(conexus, 'migrations')
const migrations = []
if (existsSync(migrationsDir)) {
  for (const name of readdirSync(migrationsDir).sort()) {
    if (!/^[0-9]{3,6}_[a-z0-9_]{1,60}\\.sql$/.test(name) || !statSync(join(migrationsDir, name)).isFile()) {
      fail('conexus/migrations/' + name + ' must be a file named like 001_create_notes.sql')
    }
    const sql = readFileSync(join(migrationsDir, name), 'utf8')
    migrations.push({ name, sha256: createHash('sha256').update(sql).digest('hex'), sql })
  }
}

// Handlers may import only their own source under conexus/ and Node built-ins. Anything else, a
// package or a file elsewhere in the repository, is refused rather than bundled.
const inside = (path) => path === conexus || path.startsWith(conexus + sep)
const confine = {
  name: 'conexus-handler-root',
  enforce: 'pre',
  async resolveId(id, importer, options) {
    if (id.startsWith('node:')) return { id, external: true }
    if (!importer) return null
    const resolved = await this.resolve(id, importer, { ...options, skipSelf: true })
    if (!resolved || resolved.external || !inside(resolved.id.split('?')[0]) || !['.ts', '.js', '.mjs', '.json'].includes(extname(resolved.id.split('?')[0]))) {
      throw new Error('conexus/' + relative(conexus, importer) + ' imports "' + id + '": a handler may import only .ts, .js or .json files inside conexus/ and node: built-ins')
    }
    return resolved
  },
}
const vite = await import('/opt/conexus/compiler/node_modules/vite/dist/node/index.js')
const serverOut = join(outDir, 'conexus-server')
try {
  await vite.build({
    configFile: false, root: conexus, logLevel: 'error', publicDir: false, envDir: false,
    plugins: [confine],
    css: { postcss: {} },
    ssr: { noExternal: true, target: 'node' },
    build: {
      ssr: true, outDir: serverOut, emptyOutDir: true, minify: false, sourcemap: false, target: 'node24', copyPublicDir: false, write: true,
      rolldownOptions: {
        input: Object.fromEntries(handlers.map((handler) => [handler.slice(0, -3), join(conexus, handler)])),
        output: { format: 'es', entryFileNames: '[name].mjs', chunkFileNames: 'chunks/[name]-[hash].mjs' },
      },
    },
  })
} catch (error) {
  fail('bundling handlers failed: ' + String(error?.message ?? error).split('\\n').slice(0, 6).join(' '))
}
for (const file of readdirSync(serverOut, { recursive: true })) {
  const path = String(file)
  if (statSync(join(serverOut, path)).isFile() && !path.endsWith('.mjs')) fail('bundling produced ' + path + '; handlers must not import assets')
}
const operations = Object.fromEntries(Object.entries(source.operations).map(([id, operation]) => [id, {
  module: operation.handler.slice(0, -3) + '.mjs', export: operation.export, input: operation.input, output: operation.output,
}]))
const normalized = { version: 1, operations, migrations }
try {
  admitManifest(normalized, 'server')
} catch (error) {
  fail(error.message)
}
writeFileSync(join(serverOut, 'manifest.json'), JSON.stringify(normalized))
process.stdout.write('conexus server check: ' + Object.keys(operations).length + ' operations, ' + migrations.length + ' migrations\\n')
`
