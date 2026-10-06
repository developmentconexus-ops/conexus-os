import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const committed = resolve(root, 'packages/contract/dist')

const filesOf = (directory) => readdirSync(directory, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name).slice(directory.length + 1))
  .sort()

const directory = mkdtempSync(join(tmpdir(), 'conexus-contract-dist-'))
try {
  execFileSync('node', ['node_modules/typescript/bin/tsc', '--project', 'packages/contract/tsconfig.json', '--pretty', 'false', '--outDir', directory], { cwd: root, stdio: 'inherit' })
  const built = filesOf(directory)
  const present = filesOf(committed)
  const stale = [
    ...built.filter((file) => !present.includes(file)).map((file) => `${file} is missing`),
    ...present.filter((file) => !built.includes(file)).map((file) => `${file} is not built from src`),
    ...built.filter((file) => present.includes(file) && readFileSync(join(directory, file), 'utf8') !== readFileSync(join(committed, file), 'utf8')).map((file) => `${file} differs`),
  ]
  if (stale.length > 0) throw new Error(`CONTRACT_DIST_STALE: run npm run contract:build\n${stale.join('\n')}`)
} finally {
  rmSync(directory, { recursive: true, force: true })
}
