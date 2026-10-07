import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'
const at = process.argv.find(a => a.startsWith('--at='))?.slice(5)
const names = execFileSync('git', at ? ['ls-tree', '-r', '--name-only', at] : ['ls-files', '--cached', '--others', '--exclude-standard'], {encoding:'utf8'}).trim().split('\n')
function read(name) { return at ? execFileSync('git', ['show', `${at}:${name}`], {encoding:'utf8'}) : readFileSync(name, 'utf8') }
const subject = /^(apps\/hub\/src\/(model-account\/|builder\/(model-account\/|model-accounts\.ts|model-routing\.ts|oauth-holds\.ts|anthropic\/|openai-codex\/|google-ai-pro\/))|packages\/contract\/src\/model-account\.ts)/
const counts = { topLevelArrows:0, over80:0, suppressions:0, plainIds:0, providerJsonParsers:0, misplacedCodecs:0, builderOwnedFiles:0, retiredApis:0, coreBuilderImports:0, coreBuilderTables:0, legacyCustodyNames:0 }
const hits = []
function hit(key, file, line, detail) { counts[key]++; hits.push({key,file,line,detail}) }
const retired = new Set(['createModelRouting','ModelRoutes','ModelRoute','takeFrom','routeOf','Taken','createModelAccounts','RunContext','ADMISSION_REFUSALS'])
for (const file of names.filter(n => subject.test(n) && /\.tsx?$/.test(n))) {
 const raw=read(file), source=ts.createSourceFile(file,raw,ts.ScriptTarget.Latest,true)
 const line=n=>source.getLineAndCharacterOfPosition(n.getStart(source)).line+1
 if (/builder\/(model-account\/|model-accounts\.ts|oauth-holds\.ts|anthropic\/|openai-codex\/|google-ai-pro\/)/.test(file)) hit('builderOwnedFiles',file,1,'owner')
 for(const statement of source.statements) if(ts.isVariableStatement(statement)) for(const d of statement.declarationList.declarations) if(d.initializer && ts.isArrowFunction(d.initializer))hit('topLevelArrows',file,line(d),d.name.getText(source))
 function visit(n) {
  if(ts.isFunctionDeclaration(n)||ts.isFunctionExpression(n)||ts.isArrowFunction(n)) if(source.getLineAndCharacterOfPosition(n.end).line-line(n)+2>80)hit('over80',file,line(n),'function')
  if((ts.isParameter(n)||ts.isPropertySignature(n))&&n.name&&/Id$/.test(n.name.getText(source))&&n.type?.kind===ts.SyntaxKind.StringKeyword)hit('plainIds',file,line(n),n.name.getText(source))
  if(ts.isCallExpression(n)&&n.expression.getText(source)==='JSON.parse' && file!=='apps/hub/src/model-account/credential.ts')hit('providerJsonParsers',file,line(n),'JSON.parse outside credential edge')
  if(file.startsWith('apps/hub/src/model-account/') && file!=='apps/hub/src/model-account/credential.ts' && ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text==='codec')hit('misplacedCodecs',file,line(n),'codec outside credential owner')
  if(ts.isIdentifier(n)&&retired.has(n.text))hit('retiredApis',file,line(n),n.text)
  if(file.startsWith('apps/hub/src/model-account/')) {
   if(ts.isImportDeclaration(n)&&/builder/.test(n.moduleSpecifier.text))hit('coreBuilderImports',file,line(n),n.moduleSpecifier.text)
   if((ts.isStringLiteral(n)||ts.isTemplateLiteralToken(n))&&/builder_run|builder_conversation/.test(n.text))hit('coreBuilderTables',file,line(n),'foreign table')
  }
  ts.forEachChild(n,visit)
 }
 visit(source)
 raw.split('\n').forEach((s,i)=>{if(/biome-ignore|@ts-ignore|@ts-nocheck/.test(s))hit('suppressions',file,i+1,s.trim())})
}
// Historical migration/spec prose and license comments are records. Live source, tests,
// scripts and configuration prose are scanned. The exact retired-input fixture is evidence.
const oldName=/FactorySecretEncryption|FactorySecretKey|DecryptedFactorySecret|createFactorySecretEncryption|factorySecretEncryption|factorySecretKey|CONEXUS_FACTORY_(?:PREVIOUS_)?SECRET_KEY_FILES?|mastra:factory-secret:v1:|factory-secret-encryption/g
const historyTests=new Set(['tests/implementation/iam-owner-migration.postgres.test.mjs','tests/implementation/company-model-accounts-migration.postgres.test.mjs'])
for(const file of names.filter(n=>/^(apps\/hub\/src\/|tests\/implementation\/|tests\/fixtures\/|scripts\/|infra\/backup\/|docs\/reference\/(security-and-authority|backup)\.md|docs\/specs\/0008-configuration-model\/|\.agents\/skills\/verify\/scripts\/)/.test(n)&&!/generated|\/migrations\//.test(n)&&n!=='scripts/check-model-account-census.mjs'&&n!=='tests/fixtures/secret-custody-retired.json'&&!historyTests.has(n))) {
 const raw=read(file)
 if(/\.[cm]?[jt]sx?$/.test(file)) {
  const sf=ts.createSourceFile(file,raw,ts.ScriptTarget.Latest,true)
  function scan(n) { if(n.getChildCount(sf)===0) {const matches=n.getText(sf).match(oldName)??[];for(const value of matches)hit('legacyCustodyNames',file,sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,value)} else for(const child of n.getChildren(sf))scan(child) }
  scan(sf)
 } else raw.split('\n').forEach((s,i)=>{for(const value of s.match(oldName)??[])hit('legacyCustodyNames',file,i+1,value)})
}
console.log(JSON.stringify({at:at??'working tree',counts,hits},null,2))
if(process.argv.includes('--final')&&Object.values(counts).some(n=>n!==0))process.exitCode=1
