import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const cacheRoot = resolve(repositoryRoot, 'node_modules/.cache')
mkdirSync(cacheRoot, { recursive: true })

const { assertBuilderSkillsAvailable } = await import(hubModuleUrl('builder/skills-guard.js'))

test('starts when the skill folder carries the conexus-server guide', () => {
  const root = mkdtempSync(resolve(cacheRoot, 'builder-skills-present-'))
  try {
    writeFileSync(join(root, 'SKILL.md'), '---\nname: conexus-server\n---\nguide\n')
    assert.doesNotThrow(() => assertBuilderSkillsAvailable(root))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('refuses to start when the skill folder lacks the guide', () => {
  const root = mkdtempSync(resolve(cacheRoot, 'builder-skills-empty-'))
  try {
    assert.throws(() => assertBuilderSkillsAvailable(root), /^Error: BUILDER_SKILLS_MISSING: /)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the repository ships builder-skills/conexus-server/SKILL.md where the Hub looks for it', () => {
  assert.doesNotThrow(() => assertBuilderSkillsAvailable(resolve(repositoryRoot, 'builder-skills', 'conexus-server')))
})
