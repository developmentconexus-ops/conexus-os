import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'
import { productFiles } from './file-budget.mjs'
const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter((name) =>
  (productFiles.includes(name) || /^(apps\/hub\/src\/(?:model-account\/|builder\/(?:model-account\/|model-accounts\.ts|model-routing\.ts|oauth-holds\.ts|anthropic\/|openai-codex\/|google-ai-pro\/))|apps\/web\/src\/features\/settings\/components\/(?:models-screen|api-key-account|claude-account|chatgpt-account|google-ai-pro-account|model-account-card|model-sign-in)|packages\/contract\/src\/model-account\.ts)/.test(name)) && /\.tsx?$/.test(name))
const structural = /^(apps\/hub\/src\/(?:model-account\/|builder\/(?:model-account\/|model-accounts\.ts|model-routing\.ts|oauth-holds\.ts|anthropic\/|openai-codex\/|google-ai-pro\/))|apps\/web\/src\/features\/settings\/components\/(?:models-screen|api-key-account|claude-account|chatgpt-account|google-ai-pro-account|model-account-card|model-sign-in)|packages\/contract\/src\/model-account\.ts)/
const totals = { topLevelArrows: 0, over80: 0, suppressions: 0, plainIds: 0, weakCredentialParsers: 0, legacyBuilderFiles: 0, legacyCustodyNames: 0, legacyCards: 0, legacyLoginStates: 0 }
const custodyFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter((name) => /^(apps\/hub\/src\/|tests\/implementation\/|tests\/fixtures\/|scripts\/|infra\/backup\/|docs\/reference\/(?:security-and-authority|backup)\.md|\.agents\/skills\/verify\/scripts\/)/.test(name) && !/generated|\/migration/.test(name) && !name.endsWith('check-model-account-census.mjs') && name !== 'tests/fixtures/secret-custody-retired.json' && !['tests/implementation/iam-owner-migration.postgres.test.mjs', 'tests/implementation/company-model-accounts-migration.postgres.test.mjs'].includes(name))
for (const name of custodyFiles) {
  const raw = readFileSync(name, 'utf8')
  let text = raw
  if (/\.[cm]?[jt]sx?$/.test(name)) {
    const source = ts.createSourceFile(name, raw, ts.ScriptTarget.Latest, true)
    const tokens = []
    function tokenText(node) {
      if (node.getChildCount(source) === 0) tokens.push(node.getText(source))
      else for (const child of node.getChildren(source)) tokenText(child)
    }
    tokenText(source)
    text = tokens.join(' ')
  }
  totals.legacyCustodyNames += (text.match(/FactorySecretEncryption|FactorySecretKey|DecryptedFactorySecret|createFactorySecretEncryption|factorySecretEncryption|factorySecretKey|CONEXUS_FACTORY_(?:PREVIOUS_)?SECRET_KEY_FILES?|mastra:factory-secret:v1:|factory-secret-encryption/g) ?? []).length
}
for (const name of files) {
  const text = readFileSync(name, 'utf8')
  if (/\/(?:api-key-account|claude-account|chatgpt-account|google-ai-pro-account)\.tsx$/.test(name)) totals.legacyCards++
  if (/\/(?:builder|model-account)\/(?:anthropic|openai-codex|google-ai-pro)(?:\/|\.ts)/.test(name)) totals.legacyLoginStates += (text.match(/type\s+(?:ClaudeLoginState|LoginState|Caller)\s*=/g) ?? []).length
  if (!structural.test(name)) continue
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true)
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
      if (declaration.initializer && ts.isArrowFunction(declaration.initializer)) totals.topLevelArrows++
    }
  }
  function visit(node) {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      const first = source.getLineAndCharacterOfPosition(node.getStart(source)).line
      const last = source.getLineAndCharacterOfPosition(node.end).line
      if (last - first + 1 > 80) totals.over80++
    }
    if ((ts.isParameter(node) || ts.isPropertySignature(node)) && node.name && /Id$/.test(node.name.getText(source)) && node.type?.kind === ts.SyntaxKind.StringKeyword) totals.plainIds++
    ts.forEachChild(node, visit)
  }
  visit(source)
  totals.suppressions += (text.match(/biome-ignore|@ts-ignore|@ts-nocheck/g) ?? []).length
  if (/credential\.ts$/.test(name) && !/\/model-account\/credential\.ts$/.test(name)) totals.weakCredentialParsers += (text.match(/JSON\.parse/g) ?? []).length
  if (/apps\/hub\/src\/builder\/(?:model-account\/|model-accounts\.ts|oauth-holds\.ts|anthropic\/|openai-codex\/|google-ai-pro\/)/.test(name)) totals.legacyBuilderFiles++
}
console.log(JSON.stringify({ inspectedProductFiles: files.length, structuralFiles: files.filter((name) => structural.test(name)).length, counts: totals }, null, 2))
if (process.argv.includes('--final') && Object.values(totals).some((count) => count !== 0)) process.exitCode = 1
