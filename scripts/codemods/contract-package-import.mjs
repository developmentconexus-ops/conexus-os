// Rewrites every relative specifier into the contract's build (the `dist/index.js` and
// `.../dist/failures.generated.js`) to the package name `@conexus/contract`, which re-exports both.
// Static imports, `export ... from` and dynamic `import()` all quote the specifier, so the
// quoted string is what is rewritten. The build itself and this directory are skipped. Rerunning changes nothing.
// A file left with two statements from the package is listed at the end; merge those by hand.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const specifier = /(['"`])(?:\.\.?\/)+packages\/contract\/dist\/(?:index|failures\.generated)\.js\1/g
const skipped = /^(packages\/contract\/dist\/|scripts\/codemods\/)/
const extensions = /\.(ts|tsx|mjs|js)$/

const files = execFileSync('git', ['ls-files', '-z', '--', 'apps', 'packages', 'scripts', 'tests'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter((file) => file && !skipped.test(file) && extensions.test(file))

let changed = 0
let rewritten = 0
const repeated = []
for (const file of files) {
  const before = readFileSync(join(root, file), 'utf8')
  const after = before.replace(specifier, (_match, quote) => {
    rewritten += 1
    return `${quote}@conexus/contract${quote}`
  })
  if (after === before) continue
  writeFileSync(join(root, file), after)
  changed += 1
  console.log(file)
  const statements = after.match(/^(?:import|export)\b[^;]*?from '@conexus\/contract'/gms)?.length ?? 0
  if (statements > 1) repeated.push(file)
}
console.log(`${rewritten} specifiers rewritten in ${changed} files`)
if (repeated.length > 0) console.log(`more than one statement from the package, merge by hand:\n${repeated.join('\n')}`)
