import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const repositoryRoot = resolve(import.meta.dirname, '..')
const SUBJECT = /^(apps\/hub\/src\/(model-account\/|builder\/(model-account\/|model-accounts\.ts|model-routing\.ts|oauth-holds\.ts|anthropic\/|openai-codex\/|google-ai-pro\/))|packages\/contract\/src\/model-account\.ts)/
const LIVE = /^(apps\/hub\/src\/|packages\/contract\/src\/|tests\/implementation\/|tests\/fixtures\/|scripts\/|infra\/backup\/|docs\/reference\/(security-and-authority|backup)\.md|docs\/specs\/0008-configuration-model\/|\.agents\/skills\/verify\/scripts\/)/
const RETIRED = new Set(['createModelRouting', 'ModelRoutes', 'ModelRoute', 'takeFrom', 'routeOf', 'Taken', 'createModelAccounts', 'RunContext', 'ADMISSION_REFUSALS'])
const OLD_NAME = /FactorySecretEncryption|FactorySecretKey|DecryptedFactorySecret|createFactorySecretEncryption|factorySecretEncryption|factorySecretKey|CONEXUS_FACTORY_(?:PREVIOUS_)?SECRET_KEY_FILES?|mastra:factory-secret:v1:|factory-secret-encryption/g
const CREDENTIAL = 'apps/hub/src/model-account/credential.ts'
const POLICY = 'scripts/check-model-account-census.mjs'

function location(source, node) { return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 }
function enclosingTest(node) {
  for (let owner = node.parent; owner; owner = owner.parent) {
    if (ts.isCallExpression(owner) && owner.expression.getText() === 'test' && ts.isStringLiteral(owner.arguments[0])) return owner.arguments[0].text
  }
  return null
}
function declaredLiteral(node, name, value) {
  return ts.isStringLiteral(node) && node.text === value && ts.isVariableDeclaration(node.parent)
    && node.parent.name.getText() === name && node.parent.initializer === node
}

// Classify exact rejected/pre-cutover inputs without exempting their files from the live-name scan.
function retiredInput(file, node) {
  if (file === 'tests/implementation/builder-composition.postgres.test.mjs') {
    return ts.isIdentifier(node) && node.text === 'CONEXUS_FACTORY_SECRET_KEY_FILE'
      && ts.isPropertyAssignment(node.parent) && node.parent.name === node
      && enclosingTest(node) === 'retired key variable alone cannot boot a Hub'
      && node.parent.parent.parent.expression?.getText() === 'readHubConfig'
      && node.parent.parent.parent.parent.parent.expression?.getText() === 'assert.throws'
      && node.parent.parent.parent.parent.parent.arguments[1]?.getText() === "missing('CONEXUS_SECRET_KEY_FILE')"
  }
  if (file === 'tests/implementation/secret-custody.test.mjs') {
    return ts.isStringLiteral(node) && node.text === 'mastra:factory-secret:v1:historical'
      && ts.isArrayLiteralExpression(node.parent) && ts.isForOfStatement(node.parent.parent)
      && node.parent.parent.statement.getText().includes("assert.rejects(envelope.open(value, context), { id: 'SECRET_CUSTODY_LOST' })")
      && enclosingTest(node) === 'unsealed, retired Factory envelopes and malformed or tampered known-key bytes refuse custody'
  }
  if (file === 'tests/implementation/secret-custody-migration.postgres.test.mjs') return declaredLiteral(node, 'historical', 'mastra:factory-secret:v1:synthetic')
  if (file === 'tests/implementation/company-model-accounts-migration.postgres.test.mjs') return declaredLiteral(node, 'SEALED', 'mastra:factory-secret:v1:t')
  if (file === 'tests/implementation/iam-owner-migration.postgres.test.mjs') {
    return declaredLiteral(node, 'SEALED', 'mastra:factory-secret:v1:t') || declaredLiteral(node, 'HISTORICAL_HANDOFF', 'mastra:factory-secret:v1:h')
  }
  return false
}

function ownerHits(file, source) {
  const hits = []
  const hit = (key, node, detail) => hits.push({ key, file, line: location(source, node), detail })
  if (/builder\/(model-account\/|model-accounts\.ts|oauth-holds\.ts|anthropic\/|openai-codex\/|google-ai-pro\/)/.test(file)) hits.push({ key: 'builderOwnedFiles', file, line: 1, detail: 'owner' })
  for (const statement of source.statements) if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) if (declaration.initializer && ts.isArrowFunction(declaration.initializer)) hit('topLevelArrows', declaration, declaration.name.getText(source))
  }
  function visit(node) {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      if (source.getLineAndCharacterOfPosition(node.end).line - location(source, node) + 2 > 80) hit('over80', node, 'function')
    }
    if ((ts.isParameter(node) || ts.isPropertySignature(node)) && node.name && /Id$/.test(node.name.getText(source)) && node.type?.kind === ts.SyntaxKind.StringKeyword) hit('plainIds', node, node.name.getText(source))
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'JSON.parse' && file !== CREDENTIAL) hit('providerJsonParsers', node, 'JSON.parse outside credential edge')
    if (file.startsWith('apps/hub/src/model-account/') && file !== CREDENTIAL && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'codec') hit('misplacedCodecs', node, 'codec outside credential edge')
    if (ts.isIdentifier(node) && RETIRED.has(node.text)) hit('retiredApis', node, node.text)
    if (file.startsWith('apps/hub/src/model-account/')) {
      if (ts.isImportDeclaration(node) && /builder/.test(node.moduleSpecifier.text)) hit('coreBuilderImports', node, node.moduleSpecifier.text)
      if ((ts.isStringLiteral(node) || ts.isTemplateLiteralToken(node)) && /builder_run|builder_conversation/.test(node.text)) hit('coreBuilderTables', node, 'foreign table')
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  source.text.split('\n').forEach((line, index) => {
    if (/biome-ignore|@ts-ignore|@ts-nocheck/.test(line)) hits.push({ key: 'suppressions', file, line: index + 1, detail: line.trim() })
  })
  return hits
}

function legacyHits(file, source) {
  const hits = []
  const retiredInputs = []
  function visit(node) {
    if (node.getChildCount(source) === 0) {
      for (const detail of node.getText(source).match(OLD_NAME) ?? []) {
        const found = { key: 'legacyCustodyNames', file, line: location(source, node), detail }
        if (retiredInput(file, node)) retiredInputs.push(found)
        else hits.push(found)
      }
    } else for (const child of node.getChildren(source)) visit(child)
  }
  visit(source)
  return { hits, retiredInputs }
}

function trackedFiles(root) {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
}

export function modelAccountCensus({ root = repositoryRoot, files = trackedFiles(root) } = {}) {
  const counts = { topLevelArrows: 0, over80: 0, suppressions: 0, plainIds: 0, providerJsonParsers: 0, misplacedCodecs: 0, builderOwnedFiles: 0, retiredApis: 0, coreBuilderImports: 0, coreBuilderTables: 0, legacyCustodyNames: 0 }
  const hits = []
  const retiredInputs = []
  for (const file of new Set(files)) {
    if (!existsSync(resolve(root, file))) continue
    if (!SUBJECT.test(file) && (!LIVE.test(file) || file === POLICY || /\/migrations\/|\/generated\//.test(file))) continue
    const raw = readFileSync(resolve(root, file), 'utf8')
    const source = ts.createSourceFile(file, raw, ts.ScriptTarget.Latest, true)
    if (SUBJECT.test(file) && /\.[cm]?tsx?$/.test(file)) hits.push(...ownerHits(file, source))
    if (!LIVE.test(file) || file === POLICY || /\/migrations\/|\/generated\//.test(file)) continue
    if (/\.[cm]?[jt]sx?$/.test(file)) {
      const legacy = legacyHits(file, source)
      hits.push(...legacy.hits)
      retiredInputs.push(...legacy.retiredInputs)
    } else raw.split('\n').forEach((line, index) => {
      for (const detail of line.match(OLD_NAME) ?? []) hits.push({ key: 'legacyCustodyNames', file, line: index + 1, detail })
    })
  }
  for (const { key } of hits) counts[key]++
  return { counts, hits, retiredInputs }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = modelAccountCensus()
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (result.hits.length > 0) process.exitCode = 1
}
