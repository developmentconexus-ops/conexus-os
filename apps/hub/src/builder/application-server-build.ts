import { admitManifest, admitServerTree, NETWORK_GLOBALS, SUPPORTED_NODE_IMPORTS } from '../app-runner/server-manifest.js'

/**
 * The server half of a Conexus build, run inside the build sandbox with the pinned compiler's vite.
 * It admits `conexus/manifest.json`, bundles only the handlers it names into
 * `<out>/conexus-server/handlers/*.mjs`, and writes the normalized manifest with every
 * `conexus/migrations/*.sql` inlined in name order. It refuses a Node built-in outside the supported
 * list, a handler that reaches for a network global, and an operation whose handler does not export
 * what it declares, then applies the runner's own manifest and tree admission to what it wrote. The
 * Project check runs the same script, so the Builder sees, in its own turn, the refusal the Conexus
 * build or the runner would give. A Project without a manifest has no server half and the script
 * does nothing.
 */
export const SERVER_BUILD_SCRIPT_PATH = '/opt/conexus/server-build.mjs'

export const serverBuildScriptSource = (): string => `
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'

const admitManifest = ${admitManifest.toString()}
const admitServerTree = ${admitServerTree.toString()}
const SUPPORTED_NODE_IMPORTS = ${JSON.stringify(SUPPORTED_NODE_IMPORTS)}
const NETWORK_GLOBALS = ${JSON.stringify(NETWORK_GLOBALS)}

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

// Handlers may import only their own source under conexus/ and the supported Node built-ins.
// Anything else, a package, another built-in or a file elsewhere in the repository, is refused
// rather than bundled.
const inside = (path) => path === conexus || path.startsWith(conexus + sep)
const confine = {
  name: 'conexus-handler-root',
  enforce: 'pre',
  async resolveId(id, importer, options) {
    if (id.startsWith('node:')) {
      // The bundler's own runtime may need a built-in; only handler source is held to the list.
      if (SUPPORTED_NODE_IMPORTS.includes(id) || !importer || !inside(importer)) return { id, external: true }
      throw new Error('conexus/' + relative(conexus, importer) + ' imports "' + id + '": among Node built-ins a handler may import only ' + SUPPORTED_NODE_IMPORTS.join(', ') + '; there is no file system, network or process access')
    }
    if (!importer) return null
    const resolved = await this.resolve(id, importer, { ...options, skipSelf: true })
    if (!resolved || resolved.external || !inside(resolved.id.split('?')[0]) || !['.ts', '.js', '.mjs', '.json'].includes(extname(resolved.id.split('?')[0]))) {
      throw new Error('conexus/' + relative(conexus, importer) + ' imports "' + id + '": a handler may import only .ts, .js or .json files inside conexus/ and the supported node: built-ins')
    }
    return resolved
  },
}
const vite = await import('/opt/conexus/compiler/node_modules/vite/dist/node/index.js')
const serverOut = join(outDir, 'conexus-server')
let built
try {
  built = await vite.build({
    configFile: false, root: conexus, logLevel: 'error', publicDir: false, envDir: false,
    plugins: [confine],
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
  fail('bundling handlers failed: ' + String(error?.message ?? error).split('\\n').slice(0, 6).join(' '))
}
const chunks = (Array.isArray(built) ? built : [built]).flatMap((result) => result.output).filter((item) => item.type === 'chunk')
const sourceOf = (chunk) => chunk.isEntry
  ? 'conexus/' + chunk.fileName.slice(0, -4) + '.ts'
  : 'conexus-server/' + chunk.fileName + ' (shared by ' + chunk.moduleIds.filter(inside).map((id) => 'conexus/' + relative(conexus, id).split(sep).join('/')).join(', ') + ')'

for (const [id, operation] of Object.entries(source.operations)) {
  const chunk = chunks.find((candidate) => candidate.isEntry && candidate.fileName === operation.handler.slice(0, -3) + '.mjs')
  if (!chunk?.exports.includes(operation.export)) {
    fail('operations.' + id + ': conexus/' + operation.handler + ' does not export "' + operation.export + '" (it exports: ' + (chunk?.exports.join(', ') || 'nothing') + ')')
  }
}

// A handler has no network. The sandbox enforces that; this names the global the Builder reached
// for while it can still change it. Bound names are collected module-wide, so a local named fetch
// or a property read obj.fetch is never refused.
const bindingNames = (pattern, names) => {
  if (!pattern) return
  if (pattern.type === 'Identifier') names.add(pattern.name)
  else if (pattern.type === 'ObjectPattern') for (const property of pattern.properties) bindingNames(property.type === 'RestElement' ? property.argument : property.value, names)
  else if (pattern.type === 'ArrayPattern') for (const element of pattern.elements) bindingNames(element, names)
  else if (pattern.type === 'AssignmentPattern') bindingNames(pattern.left, names)
  else if (pattern.type === 'RestElement') bindingNames(pattern.argument, names)
}
const GLOBAL_OBJECTS = ['globalThis', 'self', 'global', 'window']
const networkGlobal = (program) => {
  const declared = new Set()
  const references = []
  const visit = (node, parent, key) => {
    if (Array.isArray(node)) { for (const child of node) visit(child, parent, key); return }
    if (!node || typeof node.type !== 'string') return
    switch (node.type) {
      case 'VariableDeclarator': bindingNames(node.id, declared); break
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression':
        if (node.id) declared.add(node.id.name)
        for (const param of node.params) bindingNames(param, declared)
        break
      case 'ClassDeclaration': case 'ClassExpression': if (node.id) declared.add(node.id.name); break
      case 'CatchClause': bindingNames(node.param, declared); break
      case 'ImportSpecifier': case 'ImportDefaultSpecifier': case 'ImportNamespaceSpecifier': declared.add(node.local.name); break
      case 'Identifier': {
        const notReference = (key === 'property' && parent.type === 'MemberExpression' && !parent.computed) ||
          (key === 'key' && !parent.computed && ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(parent.type) && !(parent.shorthand && parent.value === node)) ||
          key === 'label' || parent?.type?.endsWith('Specifier')
        if (!notReference) references.push(node.name)
        break
      }
      case 'MemberExpression': {
        const property = node.computed ? (node.property.type === 'Literal' ? node.property.value : null) : node.property.name
        if (node.object.type === 'Identifier' && GLOBAL_OBJECTS.includes(node.object.name) && NETWORK_GLOBALS.includes(property)) references.push(node.object.name + '.' + property)
        break
      }
    }
    for (const [childKey, child] of Object.entries(node)) if (child && typeof child === 'object') visit(child, node, childKey)
  }
  visit(program, null, null)
  return references.find((name) => {
    const [first, second] = name.split('.')
    return second === undefined ? NETWORK_GLOBALS.includes(first) && !declared.has(first) : !declared.has(first)
  })
}
for (const chunk of chunks) {
  const reached = networkGlobal(vite.parseAst(chunk.code))
  if (reached) fail(sourceOf(chunk) + ' uses the global "' + reached + '": a handler has no network; call an external system only through connectors.call')
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
const tree = readdirSync(serverOut, { recursive: true }).map(String).filter((path) => statSync(join(serverOut, path)).isFile()).map((path) => {
  const bytes = readFileSync(join(serverOut, path))
  return { path: 'conexus-server/' + path.split(sep).join('/'), content: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex') }
})
try {
  admitServerTree(tree, (bytes) => createHash('sha256').update(bytes).digest('hex'))
} catch (error) {
  fail(error.message)
}
process.stdout.write('conexus server check: ' + Object.keys(operations).length + ' operations, ' + migrations.length + ' migrations\\n')
`
