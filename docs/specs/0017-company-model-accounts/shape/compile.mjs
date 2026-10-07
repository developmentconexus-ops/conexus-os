import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const shape = dirname(fileURLToPath(import.meta.url))
const scratch = mkdtempSync(resolve(tmpdir(), 'conexus-shape-'))
const pins = {
  admission: ['0987494fb358b9c8491fae4476cbc16f05099393', 'docs/specs/0018-authorization-model/shape/types.ts'],
  failure: ['b07a99e7d1d7fbd4c24f681befb51a00b92635b0', 'docs/specs/0019-error-model/shape/types.ts'],
}
for (const [name, [commit, path]] of Object.entries(pins)) {
  let source = execFileSync('git', ['show', `${commit}:${path}`], { encoding: 'utf8' })
  source = source.replaceAll('../../../../', root + '/')
  if (name === 'failure') source = source.replace(`'${root}/packages/contract/src/failures.generated.js'`, "'#generated-failure-codes'")
  writeFileSync(resolve(scratch, `${name}.ts`), source)
}
// Planned generated failure-table rows are the sole simulation. Upstream proof and Result
// are their real source, not a locally redeclared nominal lookalike. This is not runtime proof.
writeFileSync(resolve(scratch, 'codes.ts'), `import type { FailureCode as Current } from '${root}/packages/contract/src/failures.generated.js'\nexport type FailureCode = Current | 'SECRET_CUSTODY_LOST'\n`)
const config = JSON.parse(readFileSync(resolve(shape, 'tsconfig.json'), 'utf8'))
config.extends = resolve(root, 'tsconfig.base.json')
config.compilerOptions.paths = {
  '@conexus/contract': [resolve(root, 'packages/contract/src/index.ts')],
  '#admission-types': [resolve(scratch, 'admission.ts')],
  '#failure-types': [resolve(scratch, 'failure.ts')],
  '#generated-failure-codes': [resolve(scratch, 'codes.ts')],
}
config.compilerOptions.typeRoots = [resolve(root, 'node_modules/@types')]
config.include = [resolve(shape, '*.ts')]
writeFileSync(resolve(scratch, 'tsconfig.json'), JSON.stringify(config, null, 2))
execFileSync(resolve(root, 'node_modules/.bin/tsc'), ['--noEmit', '-p', resolve(scratch, 'tsconfig.json')], { stdio: 'inherit' })
console.log('PASS: shape against actual pinned 0018/0019 sources; planned SECRET_CUSTODY_LOST row simulated. No delivered-owner/runtime claim.')
