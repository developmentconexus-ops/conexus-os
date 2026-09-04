import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const sourceQualificationRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const qualificationRoot = process.argv[2] ? resolve(process.argv[2]) : sourceQualificationRoot
const repositoryRoot = resolve(sourceQualificationRoot, '../../..')
const manifest = JSON.parse(readFileSync(resolve(qualificationRoot, 'package.json'), 'utf8'))
const lock = JSON.parse(readFileSync(resolve(qualificationRoot, 'package-lock.json'), 'utf8'))
const pins = JSON.parse(readFileSync(resolve(repositoryRoot, 'docs/evidence/4d/4d-r1-foundation-pin-manifest.json'), 'utf8'))

const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const declared = manifest.devDependencies
assert.equal(Object.keys(declared).length, pins.npmPackages.length)
assert.equal(lock.lockfileVersion, 3)
assert.equal(lock.packages[''].name, manifest.name)

for (const pin of pins.npmPackages) {
  assert.equal(declared[pin.name], pin.version, `${pin.name} declaration must equal approved pin`)
  assert.match(declared[pin.name], exactVersion, `${pin.name} must not float`)
  const path = `node_modules/${pin.name}`
  const entry = lock.packages[path]
  assert.ok(entry, `${pin.name} missing from lock`)
  assert.equal(entry.version, pin.version, `${pin.name} lock version drift`)
  assert.equal(entry.integrity, pin.integrity, `${pin.name} lock integrity drift`)
}

for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path || entry.link) continue
  assert.match(entry.version, exactVersion, `${path} has non-exact resolved version`)
  if (entry.resolved) {
    const url = new URL(entry.resolved)
    assert.equal(url.protocol, 'https:', `${path} resolved over non-HTTPS transport`)
    assert.equal(url.hostname, 'registry.npmjs.org', `${path} resolved from alternate registry`)
  }
  if (entry.resolved?.includes('registry.npmjs.org')) {
    assert.match(entry.integrity ?? '', /^sha512-/, `${path} lacks sha512 registry integrity`)
  }
}

const canonical = JSON.stringify(lock)
const digest = createHash('sha256').update(canonical).digest('hex')
process.stdout.write(`${JSON.stringify({
  kind: 'conexus.r1f.pack-a-lock-admission/v1',
  manifest: basename(resolve(qualificationRoot, 'package.json')),
  directPackageCount: Object.keys(declared).length,
  lockedPackageCount: Object.keys(lock.packages).length - 1,
  lockfileVersion: lock.lockfileVersion,
  canonicalLockSha256: digest,
  registry: 'https://registry.npmjs.org/',
  verdict: 'PASS',
}, null, 2)}\n`)
