import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const root = execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim()
const shape = dirname(fileURLToPath(import.meta.url))
const scratch = mkdtempSync(resolve(tmpdir(),'conexus-command-shape-'))
const require = createRequire(resolve(root,'package.json'))
const foundation = 'a5068fba54c676c2104b642ff08fd54ad9df8890'
const upstream = {
 admission:['0987494fb358b9c8491fae4476cbc16f05099393','docs/specs/0018-authorization-model/shape/types.ts'],
 failure:['b07a99e7d1d7fbd4c24f681befb51a00b92635b0','docs/specs/0019-error-model/shape/types.ts'],
}
function source(commit,path) {return execFileSync('git',['show',`${commit}:${path}`],{encoding:'utf8'}).replaceAll('../../../../',root+'/')}
for(const [name,[commit,path]] of Object.entries(upstream)) {
 let text=source(commit,path)
 if(name==='admission')text=text.replace('export type AdministratorScope =',"export type AdministratorScope =\n  | Readonly<{ kind: 'installation-administrator'; accountId: AccountId; action: 'model-account.manage' }>")
 if(name==='failure')text=text.replace(`'${root}/packages/contract/src/failures.generated.js'`,"'#generated-failure-codes'")
 writeFileSync(resolve(scratch,`${name}.ts`),text)
}
// Planned owner additions only: admission action and generated table codes. No runtime claim.
const newCodes=['SECRET_CUSTODY_LOST','MODEL_ACCOUNT_REQUIRED','MODEL_ACCOUNT_CHANGED','MODEL_ACCOUNT_PERSONAL_REFUSED','MODEL_ACCOUNT_INSTALLATION_REFUSED','MODEL_LOGIN_ANTHROPIC_REFUSED','MODEL_LOGIN_OPENAI_REFUSED','MODEL_LOGIN_GOOGLE_REFUSED','MODEL_NOT_AVAILABLE']
writeFileSync(resolve(scratch,'codes.ts'),`import type { FailureCode as Current } from '${root}/packages/contract/src/failures.generated.js'\nexport type FailureCode = Current | ${newCodes.map(c=>`'${c}'`).join(' | ')}\n`)
mkdirSync(resolve(scratch,'foundation'))
for(const file of ['credential','secrets','store','module','dependencies'])writeFileSync(resolve(scratch,'foundation',`${file}.ts`),source(foundation,`docs/specs/0017-company-model-accounts/shape/${file}.ts`))
const config=JSON.parse(readFileSync(resolve(shape,'tsconfig.json'),'utf8'))
config.extends=resolve(root,'tsconfig.base.json')
config.compilerOptions.paths={
 '@conexus/contract':[resolve(root,'packages/contract/src/index.ts')],
 '#admission-types':[resolve(scratch,'admission.ts')],
 '#failure-types':[resolve(scratch,'failure.ts')],
 '#generated-failure-codes':[resolve(scratch,'codes.ts')],
 'zod':[resolve(root,'node_modules/zod')],
 'fastify':[resolve(root,'node_modules/fastify')],
 '@mastra/core/llm':[require.resolve('@mastra/core/llm').replace(/\.[cm]?js$/,'.d.ts')],
}
for(const file of ['credential','secrets','store','module'])config.compilerOptions.paths[`#foundation-${file}`]=[resolve(scratch,'foundation',`${file}.ts`)]
config.compilerOptions.typeRoots=[resolve(root,'node_modules/@types')]
config.include=[resolve(shape,'*.ts')]
writeFileSync(resolve(scratch,'tsconfig.json'),JSON.stringify(config,null,2))
execFileSync(resolve(root,'node_modules/.bin/tsc'),['--noEmit','-p',resolve(scratch,'tsconfig.json')],{stdio:'inherit'})
console.log(`PASS: commands shape against actual foundation ${foundation}, pinned upstream draft sources; proposed admission action/failure rows simulated. No delivered runtime claim.`)
