import { builtinModules } from 'node:module'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts'])
const TECHNICAL_HUB_LAYERS = new Set(['generated', 'http', 'platform'])
const NODE_BUILTINS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]))

function normalize(path) {
  return path.split(sep).join('/')
}

function walk(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return walk(path)
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : []
  })
}

function childSourceRoots(root, parent) {
  const absolute = resolve(root, parent)
  if (!existsSync(absolute)) return { roots: [], missing: [] }
  const directories = readdirSync(absolute, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  return {
    roots: directories
      .filter((entry) => existsSync(resolve(absolute, entry.name, 'src')))
      .map((entry) => `${parent}/${entry.name}/src`),
    missing: directories
      .filter((entry) => !existsSync(resolve(absolute, entry.name, 'src')))
      .map((entry) => `${parent}/${entry.name}`),
  }
}

function productionRoots(root) {
  const apps = childSourceRoots(root, 'apps')
  const packages = childSourceRoots(root, 'packages')
  return {
    roots: [...apps.roots, ...packages.roots, 'runtime/r1'],
    missingAppSources: apps.missing,
  }
}

function importsOf(path) {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const imports = []
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      imports.push({ computed: false, specifier: node.moduleSpecifier.text })
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression
      imports.push({
        computed: !expression || !ts.isStringLiteralLike(expression),
        specifier: expression && ts.isStringLiteralLike(expression) ? expression.text : '<computed>',
      })
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
      imports.push({ computed: false, specifier: node.argument.literal.text })
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0]
      imports.push({
        computed: !argument || !ts.isStringLiteralLike(argument),
        specifier: argument && ts.isStringLiteralLike(argument) ? argument.text : '<computed>',
      })
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      const argument = node.arguments[0]
      imports.push({
        computed: !argument || !ts.isStringLiteralLike(argument),
        specifier: argument && ts.isStringLiteralLike(argument) ? argument.text : '<computed>',
      })
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'createRequire') {
      imports.push({ computed: true, specifier: '<createRequire>' })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return imports
}

function resolveRelativeImport(root, source, specifier) {
  const raw = resolve(dirname(source), specifier)
  const candidates = [raw]
  if (/\.(?:mjs|cjs|js|jsx)$/.test(raw)) {
    candidates.push(raw.replace(/\.(?:mjs|cjs|js|jsx)$/, '.ts'))
    candidates.push(raw.replace(/\.(?:mjs|cjs|js|jsx)$/, '.tsx'))
    candidates.push(raw.replace(/\.(?:mjs|cjs|js|jsx)$/, '.mts'))
    candidates.push(raw.replace(/\.(?:mjs|cjs|js|jsx)$/, '.cts'))
  } else if (!extname(raw)) {
    for (const extension of SOURCE_EXTENSIONS) candidates.push(`${raw}${extension}`)
    for (const extension of SOURCE_EXTENSIONS) candidates.push(resolve(raw, `index${extension}`))
  }
  return candidates.find((candidate) => existsSync(candidate)) ??
    candidates.find((candidate) => caseInsensitiveMatch(root, candidate)) ?? raw
}

function hasExactCase(base, path) {
  const relativePath = relative(base, path)
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) return false
  let cursor = base
  const segments = relativePath.split(sep).filter(Boolean)
  for (const segment of segments) {
    if (!existsSync(cursor)) return false
    const exact = readdirSync(cursor).find((entry) => entry === segment)
    if (!exact) return false
    cursor = resolve(cursor, exact)
  }
  return true
}

function caseInsensitiveMatch(base, path) {
  const relativePath = relative(base, path)
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) return undefined
  let cursor = base
  const segments = relativePath.split(sep).filter(Boolean)
  for (const segment of segments) {
    if (!existsSync(cursor)) return undefined
    const match = readdirSync(cursor).find((entry) => entry.toLowerCase() === segment.toLowerCase())
    if (!match) return undefined
    cursor = resolve(cursor, match)
  }
  return cursor
}

function packageName(path) {
  return path.match(/^packages\/([^/]+)\/src\//)?.[1]
}

function isPublicPackageEntry(path) {
  return /^packages\/[^/]+\/src\/index\.(?:mjs|mts|js|ts)$/.test(path)
}

function isAllowedRelativeTarget(source, target) {
  const app = source.match(/^apps\/([^/]+)\/src\//)?.[1]
  if (app) return target.startsWith(`apps/${app}/src/`) || isPublicPackageEntry(target)
  const sourcePackage = packageName(source)
  if (sourcePackage) return target.startsWith(`packages/${sourcePackage}/src/`) || isPublicPackageEntry(target)
  if (source.startsWith('runtime/r1/')) return target.startsWith('runtime/r1/')
  return false
}

function hubLayer(path) {
  const match = path.match(/^apps\/hub\/src\/([^/]+)\//)
  return match?.[1]
}

function violation(id, source, specifier, detail) {
  return { id, source, specifier, detail }
}

export function checkImportLaw(rootDirectory) {
  const root = resolve(rootDirectory)
  const census = productionRoots(root)
  const files = census.roots.flatMap((path) => walk(resolve(root, path)))
  const relativeRoot = (path) => normalize(relative(root, path))
  const knownFiles = new Set(files.map((path) => resolve(path)))
  const edges = new Map(files.map((path) => [resolve(path), []]))
  const violations = census.missingAppSources.map((source) =>
    violation('IMPORT_CENSUS', source, '<missing src>', 'every application must expose a censused src production root'),
  )

  for (const sourcePath of files) {
    const source = relativeRoot(sourcePath)
    const sourceLayer = hubLayer(source)
    for (const imported of importsOf(sourcePath)) {
      const specifier = imported.specifier
      if (imported.computed) {
        violations.push(violation('IMPORT_COMPUTED_DYNAMIC', source, specifier, 'production dynamic imports must use a string literal'))
        continue
      }

      const absoluteSpecifier = isAbsolute(specifier) || specifier.startsWith('file:')
      if (absoluteSpecifier) {
        violations.push(violation('IMPORT_ABSOLUTE', source, specifier, 'absolute imports are forbidden in production'))
        continue
      }
      const isRelative = specifier.startsWith('.')
      const targetPath = isRelative ? resolveRelativeImport(root, sourcePath, specifier) : undefined
      const target = targetPath ? relativeRoot(targetPath) : specifier
      const targetLayer = hubLayer(target)

      if (isRelative && targetPath && !existsSync(targetPath) && caseInsensitiveMatch(root, targetPath)) {
        violations.push(violation('IMPORT_CASE_MISMATCH', source, specifier, 'relative import casing must exactly match the filesystem'))
      } else if (isRelative && (!targetPath || !existsSync(targetPath))) {
        violations.push(violation('IMPORT_UNRESOLVED_RELATIVE', source, specifier, 'relative import must resolve to a censused source file'))
      } else if (isRelative && !hasExactCase(root, targetPath)) {
        violations.push(violation('IMPORT_CASE_MISMATCH', source, specifier, 'relative import casing must exactly match the filesystem'))
      }
      if (isRelative && (target === '..' || target.startsWith('../') || isAbsolute(target) || !isAllowedRelativeTarget(source, target))) {
        violations.push(violation('IMPORT_RELATIVE_ESCAPE', source, specifier, 'relative import escapes its admitted application, package, or runtime root'))
      }
      if (/^(?:\.\.\/)*tests\//.test(specifier) || /^(?:\.\.\/)*scripts\//.test(specifier) || target.startsWith('tests/') || target.startsWith('scripts/')) {
        violations.push(violation('IMPORT_PRODUCTION_TO_TEST_TOOLING', source, specifier, 'production cannot import tests or scripts'))
      }
      if (source.startsWith('apps/') && target.startsWith('runtime/')) {
        violations.push(violation('IMPORT_APP_TO_RUNTIME', source, specifier, 'application production code cannot import runtime evidence or projections'))
      }
      if (source.startsWith('apps/web/src/') && (NODE_BUILTINS.has(specifier) || target.startsWith('apps/hub/'))) {
        violations.push(violation('IMPORT_BROWSER_TO_SERVER', source, specifier, 'browser code cannot import Node or Hub code'))
      }
      if (source.includes('/generated/') && isRelative && !target.includes('/generated/')) {
        violations.push(violation('IMPORT_GENERATED_TO_OWNER', source, specifier, 'generated code cannot import handwritten application internals'))
      }
      if (source.startsWith('runtime/') && target.startsWith('packages/profile-compiler/src/')) {
        violations.push(violation('IMPORT_RUNTIME_TO_COMPILER', source, specifier, 'runtime outputs cannot import the compiler'))
      }

      if (sourceLayer && targetLayer && sourceLayer !== targetLayer &&
          !TECHNICAL_HUB_LAYERS.has(sourceLayer) && !TECHNICAL_HUB_LAYERS.has(targetLayer)) {
        violations.push(violation('IMPORT_OWNER_TO_OWNER', source, specifier, 'semantic owners cannot deep-import one another'))
      }

      const packageMatch = target.match(/^packages\/([^/]+)\/src\/(.+)$/)
      if (packageMatch && packageName(source) !== packageMatch[1] &&
          !/^index\.(?:mjs|mts|js|ts)$/.test(packageMatch[2])) {
        violations.push(violation('IMPORT_PACKAGE_DEEP', source, specifier, 'cross-package imports must use the public entry'))
      }

      if (source === 'apps/hub/src/server.ts' && isRelative) {
        const allowed = new Set([
          'apps/hub/src/http/app.ts',
          'apps/hub/src/brain/module.ts',
          'apps/hub/src/builder/module.ts',
          'apps/hub/src/connections/module.ts',
          'apps/hub/src/gateway/module.ts',
          'apps/hub/src/identity-access/module.ts',
          'apps/hub/src/platform/config.ts',
          'apps/hub/src/platform/postgres.ts',
          'apps/hub/src/platform/secrets.ts',
          'apps/hub/src/platform/credential-backend.ts',
          'apps/hub/src/project/module.ts',
          'apps/hub/src/registry/module.ts',
          'apps/hub/src/workspace/module.ts',
        ])
        if (!allowed.has(target)) {
          violations.push(violation('IMPORT_LAYER_MATRIX', source, specifier, 'composition root may import only named module and platform constructors'))
        }
      }
      if (source.startsWith('apps/hub/src/http/') && isRelative &&
          !target.startsWith('apps/hub/src/http/')) {
        violations.push(violation('IMPORT_LAYER_MATRIX', source, specifier, 'HTTP mechanics cannot import semantic owners, generated contracts, or platform internals'))
      }
      if (source === 'apps/hub/src/identity-access/routes.ts' && isRelative) {
        const allowed = [
          'apps/hub/src/http/problem.',
          'apps/hub/src/generated/s1-routes.',
          'apps/hub/src/identity-access/',
        ]
        if (!allowed.some((prefix) => target.startsWith(prefix))) {
          violations.push(violation('IMPORT_LAYER_MATRIX', source, specifier, 'identity routes may use only their owner, HTTP problem, and owned generated routes'))
        }
      }
      if (source === 'apps/hub/src/identity-access/store.ts' && isRelative) {
        const allowed = [
          'packages/canonical-json/src/index.',
          'apps/hub/src/platform/postgres.',
          'apps/hub/src/identity-access/errors.',
          'apps/hub/src/identity-access/oidc.',
        ]
        if (!allowed.some((prefix) => target.startsWith(prefix))) {
          violations.push(violation('IMPORT_LAYER_MATRIX', source, specifier, 'identity store may use only owner errors/types, PostgreSQL types, and canonical JSON'))
        }
      }
      if (source === 'apps/hub/src/workspace/routes.ts' && isRelative) {
        const allowed = [
          'apps/hub/src/http/problem.',
          'apps/hub/src/generated/s2-routes.',
          'apps/hub/src/workspace/',
        ]
        if (!allowed.some((prefix) => target.startsWith(prefix))) {
          violations.push(violation('IMPORT_LAYER_MATRIX', source, specifier, 'workspace routes may use only their owner, HTTP problem, and owned generated routes'))
        }
      }
      if (source === 'apps/hub/src/workspace/store.ts' && isRelative) {
        const allowed = [
          'packages/canonical-json/src/index.',
          'apps/hub/src/platform/postgres.',
          'apps/hub/src/workspace/errors.',
        ]
        if (!allowed.some((prefix) => target.startsWith(prefix))) {
          violations.push(violation('IMPORT_LAYER_MATRIX', source, specifier, 'workspace store may use only owner errors/types, PostgreSQL types, and canonical JSON'))
        }
      }
      if (source.startsWith('apps/hub/src/platform/') && isRelative &&
          !target.startsWith('apps/hub/src/platform/')) {
        violations.push(violation('IMPORT_LAYER_MATRIX', source, specifier, 'platform adapters may share platform code but cannot import application layers'))
      }

      if (targetPath && existsSync(targetPath) && hasExactCase(root, targetPath) && knownFiles.has(resolve(targetPath))) {
        edges.get(resolve(sourcePath)).push(resolve(targetPath))
      }
    }
  }

  const state = new Map()
  const stack = []
  const reportedCycles = new Set()
  function visit(path) {
    state.set(path, 1)
    stack.push(path)
    for (const target of edges.get(path) ?? []) {
      if (state.get(target) === 1) {
        const cycle = [...stack.slice(stack.indexOf(target)), target].map(relativeRoot)
        const key = [...new Set(cycle)].sort().join('|')
        if (!reportedCycles.has(key)) {
          reportedCycles.add(key)
          violations.push(violation('IMPORT_CYCLE', relativeRoot(path), relativeRoot(target), cycle.join(' -> ')))
        }
      } else if (!state.has(target)) visit(target)
    }
    stack.pop()
    state.set(path, 2)
  }
  for (const path of files) if (!state.has(path)) visit(path)

  return violations.sort((left, right) =>
    `${left.id}:${left.source}:${left.specifier}`.localeCompare(`${right.id}:${right.source}:${right.specifier}`),
  )
}

function main() {
  const rootIndex = process.argv.indexOf('--root')
  const root = rootIndex === -1 ? process.cwd() : process.argv[rootIndex + 1]
  if (!root || root.startsWith('--')) throw new Error('--root requires a directory')
  const violations = checkImportLaw(root)
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify({ violations })}\n`)
  else if (violations.length === 0) process.stdout.write('IMPORT_LAW_PASS\n')
  else for (const item of violations) process.stderr.write(`${item.id} ${item.source} -> ${item.specifier}: ${item.detail}\n`)
  if (violations.length > 0) process.exitCode = 1
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) main()
