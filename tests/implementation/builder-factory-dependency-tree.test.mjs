import assert from 'node:assert/strict'
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)))

function installedCopies(directory, found = []) {
  const modules = join(directory, 'node_modules')
  if (!existsSync(modules)) return found
  for (const entry of readdirSync(modules)) {
    const scoped = entry.startsWith('@')
    const packageDirs = scoped ? readdirSync(join(modules, entry)).map(name => join(modules, entry, name)) : [join(modules, entry)]
    for (const packageDir of packageDirs) {
      if (entry === '.bin' || lstatSync(packageDir).isSymbolicLink()) continue
      const manifestPath = join(packageDir, 'package.json')
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        found.push({ name: manifest.name, version: manifest.version, path: relative(root, packageDir) })
      }
      installedCopies(packageDir, found)
    }
  }
  return found
}

const tree = installedCopies(root)
const copiesOf = name => tree.filter(copy => copy.name === name).map(({ version, path }) => ({ version, path }))
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

test('the installed tree holds exactly one physical @mastra/core, at 1.71.0', () => {
  assert.deepEqual(copiesOf('@mastra/core'), [{ version: '1.71.0', path: 'node_modules/@mastra/core' }])
})

test('the installed tree holds exactly one physical @mastra/code-sdk, at 1.8.3', () => {
  assert.deepEqual(copiesOf('@mastra/code-sdk'), [{ version: '1.8.3', path: 'node_modules/@mastra/code-sdk' }])
})

test('the Postgres storage is an exact direct dependency with one copy, and the Factory and the GitHub App auth are gone', () => {
  assert.equal(manifest.dependencies['@mastra/factory'], undefined)
  assert.equal(manifest.dependencies['@mastra/pg'], '1.27.1')
  assert.equal(manifest.dependencies['@octokit/auth-app'], undefined)
  assert.deepEqual(copiesOf('@mastra/factory'), [])
  assert.deepEqual(copiesOf('@mastra/pg'), [{ version: '1.27.1', path: 'node_modules/@mastra/pg' }])
})
