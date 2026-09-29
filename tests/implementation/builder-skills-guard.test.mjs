import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

const skillText = (name) => readFileSync(resolve(repositoryRoot, 'builder-skills', name, 'SKILL.md'), 'utf8')

for (const name of ['conexus-server', 'conexus-app-ui', 'conexus-app-code']) {
  test(`builder-skills/${name} is a skill named after its folder whose cited references exist`, () => {
    const text = skillText(name)
    assert.equal(/^---\nname: (.+)\n/.exec(text)?.[1], name)
    const cited = [...text.matchAll(/`(references\/[\w.-]+)`/g)].map((match) => match[1])
    for (const path of cited) assert.ok(existsSync(resolve(repositoryRoot, 'builder-skills', name, path)), `${name} cites missing ${path}`)
  })
}

test('the conexus-app-code skill cites every reference file it ships', () => {
  const text = skillText('conexus-app-code')
  for (const file of ['router.tsx', 'orders-screen.tsx', 'orders-table.tsx', 'order-form.tsx', 'errors.ts', 'format.ts']) {
    assert.ok(text.includes(`references/${file}`), `SKILL.md does not cite ${file}`)
  }
})

test('the conexus-app-ui skill names the source and licence of the passages it adapts', () => {
  const text = skillText('conexus-app-ui')
  assert.match(text, /skills\/frontend-design\/SKILL\.md/)
  assert.match(text, /Apache License, Version 2\.0/)
})

test('the conexus-server skill sends the browser through the generated client and does not claim the check runs operations', () => {
  const text = skillText('conexus-server')
  assert.match(text, /@\/conexus\/api\.gen/)
  assert.doesNotMatch(text, /fetch\('\/__conexus/)
  assert.doesNotMatch(text, /check\.sh/)
  assert.doesNotMatch(text, /answers every operation/)
})
