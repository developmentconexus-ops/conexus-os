import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const nodeModules = resolve(process.argv[2] ?? '')
const lockPath = resolve(process.argv[3] ?? '')
if (!process.argv[2] || !process.argv[3]) {
  throw new Error('usage: node license-census.mjs <node_modules> <package-lock.json>')
}

const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
const packages = []
const notInstalledOptional = []
for (const [lockEntry, entry] of Object.entries(lock.packages)) {
  if (!lockEntry || entry.link || !lockEntry.startsWith('node_modules/')) continue
  const packageRoot = resolve(nodeModules, lockEntry.slice('node_modules/'.length))
  const packagePath = resolve(packageRoot, 'package.json')
  if (!existsSync(packagePath)) {
    if (!entry.optional) throw new Error(`non-optional locked package is absent: ${lockEntry}`)
    notInstalledOptional.push({ lockEntry, version: entry.version })
    continue
  }
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
  const raw = pkg.license ?? pkg.licenses ?? null
  const license = typeof raw === 'string'
    ? raw
    : Array.isArray(raw)
      ? raw.map(value => typeof value === 'string' ? value : value?.type).filter(Boolean).join(' OR ')
      : raw?.type ?? null
  packages.push({
    name: pkg.name ?? entry.name ?? '<unnamed>',
    version: pkg.version ?? entry.version ?? '<unknown>',
    lockEntry,
    license,
  })
}

packages.sort((a, b) => `${a.name}@${a.version}:${a.lockEntry}`.localeCompare(`${b.name}@${b.version}:${b.lockEntry}`))
const missing = packages.filter(pkg => !pkg.license)
const byLicense = Object.fromEntries([...new Set(packages.map(pkg => pkg.license ?? '<missing>'))]
  .sort()
  .map(license => [license, packages.filter(pkg => (pkg.license ?? '<missing>') === license).length]))

process.stdout.write(`${JSON.stringify({
  kind: 'conexus.r1f.license-census/v1',
  packageCount: packages.length,
  byLicense,
  missing,
  notInstalledOptional,
  packages,
  verdict: missing.length === 0 ? 'PASS' : 'FAIL',
}, null, 2)}\n`)
