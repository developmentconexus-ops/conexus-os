import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import ts from 'typescript'
const root=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim()
const workingRoot=process.argv.find(a=>a.startsWith('--fixture-root='))?.slice(15)??process.cwd()
const at=process.argv.find(a=>a.startsWith('--at='))?.slice(5)
const args=process.argv.slice(2).filter(a=>a!=='--final')
const foundation='a5068fba54c676c2104b642ff08fd54ad9df8890'
// Reuse the actual single foundation checker, adding only command-owned retirement predicates.
const scratch=mkdtempSync(resolve(tmpdir(),'conexus-command-census-'))
const checker=execFileSync('git',['show',`${foundation}:docs/specs/0017-company-model-accounts/shape/census.mjs`],{encoding:'utf8'}).replace("from 'typescript'",`from '${root}/node_modules/typescript/lib/typescript.js'`)
const checkerPath=resolve(scratch,'foundation.mjs')
writeFileSync(checkerPath,checker)
const base=JSON.parse(execFileSync(process.execPath,[checkerPath,...args],{encoding:'utf8',cwd:workingRoot}))
const names=execFileSync('git',at?['ls-tree','-r','--name-only',at]:['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8',cwd:workingRoot}).trim().split('\n')
const counts={oldCards:0,retiredLoginApis:0,privateExpiryTimers:0,retiredGoogleIdentity:0,extraCredentialCodecs:0,extraSelectors:0}
const hits=[]
function hit(key,file,line,detail){counts[key]++;hits.push({key,file,line,detail})}
const retired=new Set(['createClaudeLogin','createCodexLogin','createGoogleAiProLogin','startClaudeModelLogin','completeClaudeModelLogin','startCodexModelLogin','pollCodexModelLogin','getGoogleModelConnection','startGoogleModelLogin','completeGoogleModelLogin','getGoogleModelLoginStatus'])
const identity=new Set(['instanceIdOf','InstanceId','rowOfKey','createRefreshWriteBack'])
for(const file of names.filter(n=>/^(apps\/hub\/src\/model-account\/|apps\/hub\/src\/builder\/(anthropic|openai-codex|google-ai-pro)\/|packages\/contract\/src\/model-account\.ts|apps\/web\/src\/features\/settings\/)/.test(n)&&/\.tsx?$/.test(n))) {
 if(/\/(api-key-account|claude-account|chatgpt-account|google-ai-pro-account)\.tsx$/.test(file))hit('oldCards',file,1,'old card')
 const raw=at?execFileSync('git',['show',`${at}:${file}`],{encoding:'utf8'}):readFileSync(resolve(workingRoot,file),'utf8')
 const sf=ts.createSourceFile(file,raw,ts.ScriptTarget.Latest,true)
 function visit(n){
  const line=()=>sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1
  if(file.startsWith('apps/hub/src/model-account/') && ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text==='codec') {
   let owner=n.parent
   while(owner && !ts.isVariableDeclaration(owner))owner=owner.parent
   const name=owner?.name.getText(sf)
   if(file!=='apps/hub/src/model-account/credential.ts' || !['Json','ClaudeRecord','CodexRecord'].includes(name))hit('extraCredentialCodecs',file,line(),'codec outside exact registry edges')
  }
  if(file.startsWith('apps/hub/src/model-account/') && file!=='apps/hub/src/model-account/store.ts') {
   if((ts.isFunctionDeclaration(n)||ts.isVariableDeclaration(n)) && n.name && ['accountInUse','chooseAccount','selectedAccount','pickAccount'].includes(n.name.getText(sf)))hit('extraSelectors',file,line(),'named payer selection outside store')
   if((ts.isStringLiteral(n)||ts.isTemplateLiteralToken(n)) && /model\.model_account/.test(n.text))hit('extraSelectors',file,line(),'model-account SQL outside store')
  }
  if(ts.isIdentifier(n)&&retired.has(n.text))hit('retiredLoginApis',file,line(),n.text)
  if(file.includes('google-ai-pro/')&&ts.isIdentifier(n)&&identity.has(n.text))hit('retiredGoogleIdentity',file,line(),n.text)
  if(/google-ai-pro\/router\.ts$/.test(file)&&ts.isIdentifier(n)&&['GoogleAiProKey','parseKey','decodeKey','encodeKey'].includes(n.text))hit('retiredGoogleIdentity',file,line(),n.text)
  if(/(?:login|attempts)\.ts$/.test(file)&&ts.isCallExpression(n)&&['setTimeout','setInterval'].includes(n.expression.getText(sf)))hit('privateExpiryTimers',file,line(),'expiration scheduling belongs to job')
  ts.forEachChild(n,visit)
 }
 visit(sf)
}
console.log(JSON.stringify({foundation:base,commands:{counts,hits}},null,2))
if(process.argv.includes('--final')&&[...Object.values(base.counts),...Object.values(counts)].some(n=>n!==0))process.exitCode=1
