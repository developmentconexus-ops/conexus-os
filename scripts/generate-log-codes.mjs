import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')
const sourceRoot = 'apps/hub/src'
const targetPath = 'apps/hub/src/telemetry/log-codes.generated.ts'

// A code opens a quoted or template literal and is followed by its end, a colon, a space or `${`.
const CODE_LITERAL = /['"`]([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)(?=['"`:\s$])/g

const sources = (directory, root = repositoryRoot) => readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
  const path = `${directory}/${entry.name}`
  if (entry.isDirectory()) return sources(path, root)
  return path.endsWith('.ts') && path !== targetPath ? [path] : []
})

export const renderLogCodes = (root = repositoryRoot) => {
  const codes = new Set()
  for (const path of sources(sourceRoot, root)) {
    for (const match of readFileSync(resolve(root, path), 'utf8').matchAll(CODE_LITERAL)) codes.add(match[1])
  }
  return [
    `// GENERATED from the code literals under ${sourceRoot} by scripts/generate-log-codes.mjs. Do not edit.`,
    '',
    'export const LOG_CODES: ReadonlySet<string> = new Set([',
    ...[...codes].sort().map((code) => `  ${JSON.stringify(code)},`),
    '])',
    '',
  ].join('\n')
}

export const staleMessage = (root = repositoryRoot) =>
  readFileSync(resolve(root, targetPath), 'utf8') === renderLogCodes(root)
    ? null
    : 'LOG_CODES_STALE: run node scripts/generate-log-codes.mjs'

if (import.meta.url === `file://${process.argv[1]}`) writeFileSync(resolve(repositoryRoot, targetPath), renderLogCodes())
