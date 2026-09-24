import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const cacheRoot = resolve(repositoryRoot, 'node_modules/.cache')
mkdirSync(cacheRoot, { recursive: true })

const { assertFactoryGlobalSkillsAvailable } = await import(hubModuleUrl('builder/factory-skills-guard.js'))

test('starts when the resolved local factory-skills path carries the conexus-server guide', () => {
  const root = mkdtempSync(resolve(cacheRoot, 'factory-skills-present-'))
  try {
    mkdirSync(join(root, 'conexus-server'), { recursive: true })
    writeFileSync(join(root, 'conexus-server/SKILL.md'), '---\nname: conexus-server\n---\nguide\n')
    assert.doesNotThrow(() => assertFactoryGlobalSkillsAvailable('/irrelevant/cwd', () => root))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('refuses to start when no local factory-skills path resolves for the cwd', () => {
  assert.throws(
    () => assertFactoryGlobalSkillsAvailable('/irrelevant/cwd', () => undefined),
    /FACTORY_GLOBAL_SKILLS_MISSING/,
  )
})

test('refuses to start when the resolved path exists but lacks the conexus-server guide', () => {
  const root = mkdtempSync(resolve(cacheRoot, 'factory-skills-empty-'))
  try {
    assert.throws(
      () => assertFactoryGlobalSkillsAvailable('/irrelevant/cwd', () => root),
      /FACTORY_GLOBAL_SKILLS_MISSING/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the real resolver finds the repository-root factory-skills/conexus-server/SKILL.md this repository ships', () => {
  assert.doesNotThrow(() => assertFactoryGlobalSkillsAvailable(repositoryRoot))
})
