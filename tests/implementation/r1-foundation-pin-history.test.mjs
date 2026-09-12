import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const readJson = (path) => JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'))
const sha256File = (path) => createHash('sha256').update(readFileSync(resolve(repositoryRoot, path))).digest('hex')
const canonicalValue = (value) => {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(canonicalValue)
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
}
const canonicalBytes = (value) => Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`, 'utf8')

test('historical A0 foundation pin retains its complete dependency, lock, and protocol assertion', () => {
  const manifest = readJson('docs/evidence/4d/4d-r1-a0-foundation-pin-manifest.json')
  const packageJson = readJson('package.json')
  const lock = readJson('package-lock.json')
  const installed = readJson('node_modules/@types/pg/package.json')
  const target = manifest.admittedDependency
  const locked = lock.packages['node_modules/@types/pg']

  assert.equal(manifest.kind, 'conexus.r1-a0-foundation-pin-manifest/v1')
  assert.deepEqual(manifest.decidingRuntime, { node: '24.20.0', npm: '12.0.2', typescript: '6.0.2' })
  assert.equal(manifest.lockfileSha256, sha256File('package-lock.json'))
  assert.equal(packageJson.devDependencies[target.name], target.version)
  assert.equal(installed.version, target.version)
  assert.equal(installed.license, target.license)
  assert.equal(locked.version, target.version)
  assert.equal(locked.resolved, target.resolved)
  assert.equal(locked.integrity, target.integrity)
  assert.equal(locked.dev, true)
  assert.equal(target.class, 'DEV_TYPE_ONLY')
  assert.equal(target.installScripts, false)
  assert.deepEqual(manifest.proofProtocols.map(({ id }) => id).sort(), [
    'A0:FOUNDATION-PIN',
    'A0:HUB-TYPECHECK',
    'A0:MIGRATION-CUSTODY',
    'A0:OPENID-DECLARATION',
    'A0:OPENID-RED',
    'A0:WEB-TYPECHECK',
    'G0:VERIFY',
    'S1:HTTP',
  ])
  for (const entry of manifest.proofProtocols) {
    assert.equal(createHash('sha256').update(canonicalBytes(entry.protocol)).digest('hex'), entry.protocolDigest)
    assert.equal(entry.protocol.id, entry.id)
  }
})

test('historical R1C-01 root dependency and runtime pin assertion remains callable explicitly', () => {
  const packageJson = readJson('package.json')
  const packageLock = readJson('package-lock.json')
  const pinManifest = readJson('docs/evidence/4d/4d-r1-foundation-pin-manifest.json')
  const a0PinManifest = readJson('docs/evidence/4d/4d-r1-a0-foundation-pin-manifest.json')
  assert.deepEqual(packageJson.engines, { node: '24.20.0', npm: '12.0.2' })
  assert.equal(readFileSync(resolve(repositoryRoot, '.nvmrc'), 'utf8').trim(), '24.20.0')
  assert.deepEqual(packageJson.dependencies, {
    '@fastify/cookie': '11.1.2',
    '@fastify/helmet': '13.1.1',
    '@fastify/static': '10.1.3',
    '@tanstack/react-query': '5.102.8',
    '@tanstack/react-router': '1.170.32',
    ajv: '8.20.0',
    'ajv-formats': '3.0.1',
    canonicalize: '4.0.0',
    fastify: '5.12.1',
    'jsonc-parser': '3.3.1',
    'openid-client': '6.8.7',
    pg: '8.23.0',
    react: '19.2.8',
    'react-dom': '19.2.8',
  })
  assert.deepEqual(packageJson.devDependencies, {
    '@biomejs/biome': '2.5.11',
    '@playwright/test': '1.62.1',
    '@redocly/cli': '2.47.0',
    '@tanstack/router-plugin': '1.168.35',
    '@types/node': '24.13.3',
    '@types/pg': '8.23.1',
    '@types/react': '19.2.18',
    '@types/react-dom': '19.2.5',
    '@vitejs/plugin-react': '6.1.1',
    typescript: '6.0.2',
    vite: '8.2.2',
  })
  assert.equal(packageLock.lockfileVersion, pinManifest.decidingPlatform.lockfileVersion)
  for (const [name, version] of Object.entries({ ...packageJson.dependencies, ...packageJson.devDependencies })) {
    const admitted = name === a0PinManifest.admittedDependency.name
      ? a0PinManifest.admittedDependency
      : pinManifest.npmPackages.find((candidate) => candidate.name === name)
    assert.ok(admitted, `${name} must be admitted by the Foundation pin manifest`)
    assert.equal(admitted.version, version)
    const locked = packageLock.packages[`node_modules/${name}`]
    assert.equal(locked.version, version)
    assert.equal(locked.integrity, admitted.integrity)
  }
})
