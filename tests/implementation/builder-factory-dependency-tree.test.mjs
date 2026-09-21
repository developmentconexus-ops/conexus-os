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

test('the installed tree holds exactly one physical @mastra/core, at 1.67.0', () => {
  assert.deepEqual(copiesOf('@mastra/core'), [{ version: '1.67.0', path: 'node_modules/@mastra/core' }])
})

test('the installed tree holds exactly one physical @mastra/code-sdk, at 1.7.2', () => {
  assert.deepEqual(copiesOf('@mastra/code-sdk'), [{ version: '1.7.2', path: 'node_modules/@mastra/code-sdk' }])
})

test('the Factory, its Postgres storage and GitHub App auth are exact direct dependencies with one copy each', () => {
  assert.equal(manifest.dependencies['@mastra/factory'], '0.15.0')
  assert.equal(manifest.dependencies['@mastra/pg'], '1.25.0')
  assert.equal(manifest.dependencies['@octokit/auth-app'], '8.3.1')
  assert.deepEqual(copiesOf('@mastra/factory'), [{ version: '0.15.0', path: 'node_modules/@mastra/factory' }])
  assert.deepEqual(copiesOf('@mastra/pg'), [{ version: '1.25.0', path: 'node_modules/@mastra/pg' }])
  assert.deepEqual(copiesOf('@octokit/auth-app'), [{ version: '8.3.1', path: 'node_modules/@octokit/auth-app' }])
})
