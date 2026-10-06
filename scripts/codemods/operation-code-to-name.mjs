// Rewrites every numbered operation code to the operation's name. The code to name pairs come from the
// `Operation` column of the ledger's census (`--ledger <file>`, default docs/product/operation-ledger.md);
// only a code that a contract file declares as `id: '<code>'` is rewritten, so the YAML operations keep
// theirs. The name is the ledger's PascalCase with a lowercase first letter. Three spellings of one code
// are rewritten: `PRJ-04`, the constant `PRJ04` and `PRJ_SUMMARIES`. Rerunning changes nothing.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const flag = process.argv.indexOf('--ledger')
const ledgerPath = flag < 0 ? join(root, 'docs/product/operation-ledger.md') : resolve(process.argv[flag + 1])

const pairs = new Map()
for (const row of readFileSync(ledgerPath, 'utf8').matchAll(/^\| `([A-Z]+-[A-Z0-9]+)` \| `([A-Z][A-Za-z0-9]+)` \|/gm)) {
  pairs.set(row[1], row[2][0].toLowerCase() + row[2].slice(1))
}
if (pairs.size === 0) throw new Error(`no census rows in ${ledgerPath}`)

const tracked = (...paths) => execFileSync('git', ['ls-files', '-z', '--', ...paths], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
const declared = new Set()
for (const file of tracked('packages/contract/src')) {
  for (const match of readFileSync(join(root, file), 'utf8').matchAll(/\bid: '([A-Z]+-[A-Z0-9]+)'/g)) declared.add(match[1])
}
for (const code of declared) if (!pairs.has(code)) throw new Error(`${code} is declared in the contract and has no census row`)

const names = new Map()
for (const [code, name] of pairs) {
  if (!declared.has(code)) continue
  names.set(code, name)
  names.set(code.replace('-', ''), name)
  names.set(code.replace('-', '_'), name)
}
const pattern = new RegExp(`\\b(${[...names.keys()].sort((a, b) => b.length - a.length).join('|')})\\b`, 'g')

const skipped = /^(apps\/hub\/migrations\/|packages\/contract\/dist\/|contracts\/api\/product\/openapi\.json$|docs\/product\/operation-ledger\.md$|scripts\/codemods\/)/
const extensions = /\.(ts|tsx|mjs|js|json|md|yaml|yml|sh)$/

const convert = (text, markdown) => {
  if (!markdown) return text.replace(pattern, (code) => names.get(code))
  let fenced = false
  return text.split('\n').map((line) => {
    if (/^\s*```/.test(line)) fenced = !fenced
    if (fenced) return line.replace(pattern, (code) => names.get(code))
    return line.replace(pattern, (code, _group, offset) => {
      const name = names.get(code)
      return line[offset - 1] === '`' || line[offset + code.length] === '`' ? name : `\`${name}\``
    })
  }).join('\n')
}

let changed = 0
for (const file of tracked('packages', 'apps', 'scripts', 'tests', 'contracts', 'docs')) {
  if (skipped.test(file) || !extensions.test(file)) continue
  const before = readFileSync(join(root, file), 'utf8')
  const after = convert(before, file.endsWith('.md'))
  if (after === before) continue
  writeFileSync(join(root, file), after)
  changed += 1
  console.log(file)
}
console.log(`${changed} files rewritten, ${declared.size} operations`)
