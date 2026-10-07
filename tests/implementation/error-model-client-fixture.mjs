import ts from 'typescript'
import { generateClient } from '../../apps/hub/compiler-template/generate-client.mjs'
import { hubModuleUrl } from './hub-build.mjs'
const { APP_FAILURES_SOURCE } = await import(hubModuleUrl('generated/app-failures.js'))

function moduleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`
}
const failuresUrl = moduleUrl(APP_FAILURES_SOURCE)
export const appFailures = await import(failuresUrl)
export const { api } = await import(moduleUrl(generateClient({ operations: { find: { handler: 'handlers/a.ts', export: 'find', input: { type: 'object', properties: {}, additionalProperties: false }, output: { type: 'boolean' } } } }).apiGen.replace("'./failures.gen'", JSON.stringify(failuresUrl)).replace("'zod'", JSON.stringify(import.meta.resolve('zod')))))
