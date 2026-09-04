import { readFileSync, readdirSync, lstatSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? '')
if (!process.argv[2]) throw new Error('usage: node script-census.mjs <node_modules>')

const packageJsonPaths = []
const visit = path => {
  const stat = lstatSync(path)
  if (stat.isSymbolicLink()) return
  if (!stat.isDirectory()) return
  for (const child of readdirSync(path).sort()) {
    const candidate = resolve(path, child)
    if (child === 'package.json') packageJsonPaths.push(candidate)
    else visit(candidate)
  }
}
visit(root)

const lifecycleNames = ['preinstall', 'install', 'postinstall']
const entries = []
for (const path of packageJsonPaths) {
  const pkg = JSON.parse(readFileSync(path, 'utf8'))
  const scripts = Object.fromEntries(
    lifecycleNames.filter(name => typeof pkg.scripts?.[name] === 'string').map(name => [name, pkg.scripts[name]]),
  )
  if (Object.keys(scripts).length) {
    entries.push({
      name: pkg.name ?? '<unnamed>',
      version: pkg.version ?? '<unknown>',
      path: relative(root, path).replaceAll('\\', '/'),
      scripts,
    })
  }
}

entries.sort((a, b) => `${a.name}@${a.version}:${a.path}`.localeCompare(`${b.name}@${b.version}:${b.path}`))
process.stdout.write(`${JSON.stringify({
  kind: 'conexus.r1f.install-script-census/v1',
  packageJsonCount: packageJsonPaths.length,
  lifecycleScriptPackageCount: entries.length,
  entries,
}, null, 2)}\n`)
