// Rewrites every `new Error('UPPER_CODE')` in apps/hub/src that error-code-map.json classifies. `biome ci`
// lists the sites (the no-error-code plugin); the map holds the judgment: a code is a row only when it
// reaches a person or the operator distinctly, a config refusal names its setting, and anything else is an
// internal invariant. A row named in the map must already be in failures.json. Rerunning changes nothing.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const source = join(root, 'apps/hub/src')
const failureModule = join(source, 'platform/failure.js')
const CONFIG_FILE = 'platform/config.ts'

const map = JSON.parse(readFileSync(join(here, 'error-code-map.json'), 'utf8'))
const table = JSON.parse(readFileSync(join(root, 'contracts/technical/failures.json'), 'utf8'))
const rows = new Set(table.failures.map((row) => row.code))

const failure = (code, details) => `new Failure('${code}'${details ? `, { details: { ${details} } }` : ''})`

const replacement = (code, entry, file) => {
  if (entry.invariant) return failure('INTERNAL_UNEXPECTED', `invariant: '${entry.invariant}'${entry.details ? `, ${entry.details}` : ''}`)
  if (!rows.has(entry.row.code)) throw new Error(`${code}: ${entry.row.code} is not a row of failures.json`)
  if (file.endsWith(CONFIG_FILE) && entry.row.code === 'CONFIG_INVALID') return `configInvalid('${entry.name}')`
  const details = [entry.name ? `name: '${entry.name}'` : '', entry.details ?? ''].filter(Boolean).join(', ')
  return failure(entry.row.code, details)
}

const convert = (text, file) => {
  let out = text
  for (const [code, entry] of Object.entries(map.codes)) {
    const target = replacement(code, entry, file)
    out = out.replaceAll(`new Error('${code}')`, target)
    if (entry.pattern) out = out.replace(new RegExp(entry.pattern, 'g'), () => target)
  }
  if (file.endsWith(CONFIG_FILE)) out = out.replace(new RegExp(map.dynamic.pattern, 'g'), 'configInvalid(name)')
  return out
}

const withImport = (text, file) => {
  if (file.endsWith(CONFIG_FILE)) return text
  if (/^import [^;\n]*\bFailure\b[^\n]*from /m.test(text) || /^import \{[^}]*\bFailure\b[^}]*\} from /m.test(text)) return text
  let specifier = relative(dirname(file), failureModule)
  if (!specifier.startsWith('.')) specifier = `./${specifier}`
  const lines = text.split('\n')
  const last = lines.findLastIndex((line) => /^import .* from '/.test(line) || /^\} from '/.test(line))
  lines.splice(last + 1, 0, `import { Failure } from '${specifier}'`)
  return lines.join('\n')
}

const walk = (directory) => readdirSync(directory).flatMap((name) => {
  const path = join(directory, name)
  return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : []
})

// Code a sandbox loads cannot import Failure (it pulls @mastra/core); it reports a plain code on its wire.
const SANDBOXED = ['server-manifest.ts', 'app-runner/data-plane.ts', 'app-runner/worker.ts']

const changed = []
for (const file of walk(source)) {
  if (SANDBOXED.some((part) => file.includes(part)) || file.includes('.generated.')) continue
  const before = readFileSync(file, 'utf8')
  const converted = convert(before, file)
  if (converted === before) continue
  writeFileSync(file, withImport(converted, file))
  changed.push(relative(root, file))
}
process.stdout.write(`${changed.length} files converted\n${changed.join('\n')}${changed.length ? '\n' : ''}`)
