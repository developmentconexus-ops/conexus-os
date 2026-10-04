import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { hubModuleUrl } from './hub-build.mjs'

const { APP_FAILURES_SOURCE } = await import(hubModuleUrl('generated/app-failures.js'))

/** The file every check writes into a Project's app before it typechecks: the failure table's app copy. */
export const writeGeneratedFailures = (root) => {
  mkdirSync(join(root, 'app/src/conexus'), { recursive: true })
  writeFileSync(join(root, 'app/src/conexus/failures.gen.ts'), APP_FAILURES_SOURCE)
}
