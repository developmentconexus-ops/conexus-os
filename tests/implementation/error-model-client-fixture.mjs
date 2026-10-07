import ts from 'typescript'
import { APP_FAILURE_CLIENT_SOURCE } from '@conexus/contract'

function moduleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`
}
const failuresUrl = moduleUrl(APP_FAILURE_CLIENT_SOURCE.replaceAll("from 'zod'", `from '${import.meta.resolve('zod')}'`))
export const appFailures = await import(failuresUrl)
