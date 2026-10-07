import ts from 'typescript'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../', import.meta.url))
const recordPath = resolve(repo, 'contracts/technical/error-model-census.json')
const scope = ['apps/hub/src/', 'apps/web/src/', 'packages/contract/src/']
const targetNames = Object.freeze([
  'resultReplyAlias',
  'manifestThrowHelpers',
  'admissionMessageDecoders',
  'workerCodeFilter',
  'failureProblemCalls',
  'failureBodyHelpers',
  'hubFailureClass',
  'oldWebFailureImportFiles',
  'embeddedConexusError',
  'generatedFailureDecoder',
  'generatedHttpFallback',
  'generatedFailureFallback',
  'starterFailureWrappers',
])
const inventoryNames = Object.freeze(['admissionCallExpressions'])
const namedMechanisms = Object.freeze([
  { name: 'generatedFailureDecoder', path: 'apps/hub/compiler-template/generate-client.mjs', marker: 'const failure = (status: number, body: string): ConexusError => {' },
  { name: 'generatedHttpFallback', path: 'apps/hub/compiler-template/generate-client.mjs', marker: String.raw`return new ConexusError(\`HTTP_\${status}\`, body.slice(0, 500))` },
  { name: 'generatedFailureFallback', path: 'scripts/generate-failures.mjs', marker: 'const FALLBACK =' },
  { name: 'starterFailureWrappers', path: 'apps/hub/starter-template/files/app/src/lib/errors.ts', marker: 'export function ' },
])

function at(path, node) {
  return `${relative(repo, path)}:${node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1}`
}

function identifier(node, name) {
  return ts.isIdentifier(node) && node.text === name
}

export function censusSource(path, text) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found = Object.fromEntries([...targetNames, ...inventoryNames].map((name) => [name, []]))
  const importedFailureModule = []
  let embeddedConexusError = false

  const visit = (node) => {
    if (ts.isTypeAliasDeclaration(node) && identifier(node.name, 'Result') && ts.isTypeReferenceNode(node.type) && identifier(node.type.typeName, 'Reply')) {
      found.resultReplyAlias.push(at(path, node.name))
    }
    if (ts.isFunctionDeclaration(node) && ['refuseManifest', 'refuseTree'].some((name) => identifier(node.name, name))) {
      found.manifestThrowHelpers.push(at(path, node.name))
    }
    if (ts.isVariableDeclaration(node) && ['ADMISSION_ROW', 'admissionFailure'].some((name) => identifier(node.name, name))) {
      found.admissionMessageDecoders.push(at(path, node.name))
    }
    if (ts.isVariableDeclaration(node) && identifier(node.name, 'workerCodeOf')) found.workerCodeFilter.push(at(path, node.name))
    if (ts.isCallExpression(node) && identifier(node.expression, 'failureProblem')) found.failureProblemCalls.push(at(path, node.expression))
    if (ts.isCallExpression(node) && ['admitManifest', 'admitServerTree', 'admitTree'].some((name) => identifier(node.expression, name))) found.admissionCallExpressions.push(at(path, node.expression))
    if (ts.isClassDeclaration(node) && identifier(node.name, 'HubFailure')) found.hubFailureClass.push(at(path, node.name))
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && /\/failure(?:\.ts)?$/.test(node.moduleSpecifier.text)) {
      const bindings = node.importClause?.namedBindings
      if (bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0) importedFailureModule.push(at(path, node))
    }
    if (ts.isVariableDeclaration(node) && ['failureProblem', 'problemBody', 'sendFailure', 'sendInternal'].some((name) => identifier(node.name, name))) {
      found.failureBodyHelpers.push(at(path, node.name))
    }
    if (ts.isVariableDeclaration(node) && identifier(node.name, 'APP_FAILURES_SOURCE') && node.initializer && ts.isStringLiteral(node.initializer)) {
      embeddedConexusError = node.initializer.text.includes('export class ConexusError extends Error')
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
  if (importedFailureModule.length > 0) {
    found.oldWebFailureImportFiles.push(...new Map(importedFailureModule.map((location) => [location.slice(0, location.lastIndexOf(':')), location])).values())
  }
  if (embeddedConexusError) found.embeddedConexusError.push(`${relative(repo, path)}:${source.getLineAndCharacterOfPosition(source.statements[0]?.getStart(source) ?? 0).line + 1}`)
  return found
}

function censusFiles(files) {
  const found = Object.fromEntries([...targetNames, ...inventoryNames].map((name) => [name, []]))
  for (const { path, text } of files) {
    for (const [name, matches] of Object.entries(censusSource(path, text))) found[name].push(...matches)
  }
  return found
}

export function censusNamedSource(name, path, text) {
  const mechanism = namedMechanisms.find((item) => item.name === name)
  if (!mechanism) throw new Error(`unknown named mechanism: ${name}`)
  const found = []
  let offset = 0
  while (true) {
    const match = text.indexOf(mechanism.marker, offset)
    if (match === -1) break
    found.push(`${path}:${text.slice(0, match).split('\n').length}`)
    offset = match + mechanism.marker.length
  }
  return found
}

export function censusNamedMechanisms(rootDirectory = repo) {
  const found = Object.fromEntries(targetNames.filter((name) => namedMechanisms.some((item) => item.name === name)).map((name) => [name, []]))
  for (const { name, path } of namedMechanisms) {
    let text
    try {
      text = readFileSync(resolve(rootDirectory, path), 'utf8')
    } catch (error) {
      if (name === 'starterFailureWrappers' && error.code === 'ENOENT') continue
      throw error
    }
    found[name] = censusNamedSource(name, path, text)
  }
  return found
}

export function compareToRecord(found, record) {
  const failures = []
  for (const name of targetNames) {
    const matches = found[name] ?? []
    const count = matches.length
    const baseline = record.baseline[name]
    if (!Number.isInteger(baseline) || baseline < 0) failures.push(`${name}: missing non-negative baseline`)
    else if (count > baseline) failures.push(`${name}: ${count} exceeds baseline ${baseline} (${matches.join(', ')})`)
    if (record.activatedZeroTargets.includes(name) && count !== 0) failures.push(`${name}: activated zero target returned at ${matches.join(', ')}`)
  }
  for (const name of record.activatedZeroTargets) if (!targetNames.includes(name)) failures.push(`${name}: activated target is not a named census check`)
  return failures
}

function listFiles() {
  const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: repo, encoding: 'utf8' })
  if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr}`)
  return listed.stdout.split('\0').filter((path) => path.endsWith('.ts') || path.endsWith('.tsx'))
    .filter((path) => scope.some((prefix) => path.startsWith(prefix)))
    .map((path) => resolve(repo, path)).filter(existsSync)
}

function main(args) {
  if (args.length !== 1 || !['--list', '--check'].includes(args[0])) {
    console.error('usage: node scripts/census-error-model.mjs --list|--check')
    return 2
  }
  const record = JSON.parse(readFileSync(recordPath, 'utf8'))
  const files = listFiles().map((path) => ({ path, text: readFileSync(path, 'utf8') }))
  const found = Object.assign(censusFiles(files), censusNamedMechanisms())
  const failures = compareToRecord(found, record)
  for (const name of targetNames) {
    console.log(`error-model-census: ${name} ${found[name].length} (baseline ${record.baseline[name]}) ${found[name].length > record.baseline[name] || record.activatedZeroTargets.includes(name) && found[name].length > 0 ? 'FAIL' : 'ok'}`)
    if (args[0] === '--list') for (const match of found[name]) console.log(`    ${match}`)
  }
  for (const name of inventoryNames) {
    console.log(`error-model-census: ${name} ${found[name].length} (inventory baseline ${record.inventory[name]})`)
    if (args[0] === '--list') for (const match of found[name]) console.log(`    ${match}`)
  }
  const failureTable = resolve(repo, 'contracts/technical/failures.json')
  const failureTableText = readFileSync(failureTable, 'utf8')
  const sandboxRow = [...failureTableText.matchAll(/"code"\s*:\s*"BUILDER_SANDBOX_OPEN_FAILED"/g)]
  console.log(`error-model-census: sandboxStartRow ${sandboxRow.length} (inventory baseline ${record.inventory.sandboxStartRow})${sandboxRow.length ? ` ${sandboxRow.map((match) => `${relative(repo, failureTable)}:${failureTableText.slice(0, match.index).split('\n').length}`).join(', ')}` : ''}`)
  console.log(`error-model-census: scope ${scope.join(', ')}`)
  console.log(`error-model-census: named template paths ${[...new Set(namedMechanisms.map(({ path }) => path))].join(', ')}`)
  console.log('error-model-census: imported aliases and generated embedded source are not semantically resolved')
  for (const failure of failures) console.error(`error-model-census: ${failure}`)
  return failures.length === 0 ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2))
