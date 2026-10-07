import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP_FAILURE_CLIENT_SOURCE } from '@conexus/contract'

/** The file every check writes into a Project's app before it typechecks: the contract-owned reader. */
export const writeGeneratedFailures = (root) => {
  mkdirSync(join(root, 'app/src/conexus'), { recursive: true })
  writeFileSync(join(root, 'app/src/conexus/failures.gen.ts'), APP_FAILURE_CLIENT_SOURCE)
}
