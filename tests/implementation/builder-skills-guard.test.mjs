import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const cacheRoot = resolve(repositoryRoot, 'node_modules/.cache')
mkdirSync(cacheRoot, { recursive: true })

const { assertBuilderSkillsAvailable } = await import(hubModuleUrl('builder/skills-guard.js'))

test('starts when the skills folder carries the six builder skills', () => {
  const root = mkdtempSync(resolve(cacheRoot, 'builder-skills-present-'))
  try {
    for (const name of ['conexus-server', 'conexus-app-ui', 'conexus-app-code', 'conexus-plan', 'conexus-build', 'conexus-sankhya']) {
      mkdirSync(join(root, name))
      writeFileSync(join(root, name, 'SKILL.md'), `---\nname: ${name}\n---\nguide\n`)
    }
    assert.doesNotThrow(() => assertBuilderSkillsAvailable(root))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('refuses to start when the skills folder lacks a builder skill, and names it', () => {
  const root = mkdtempSync(resolve(cacheRoot, 'builder-skills-empty-'))
  try {
    mkdirSync(join(root, 'conexus-server'))
    writeFileSync(join(root, 'conexus-server', 'SKILL.md'), '---\nname: conexus-server\n---\nguide\n')
    assert.throws(() => assertBuilderSkillsAvailable(root), /^Error: BUILDER_SKILLS_MISSING: .* has no SKILL\.md for conexus-app-ui, conexus-app-code, conexus-plan, conexus-build, conexus-sankhya; /)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the repository ships the six builder skills where the Hub looks for them', () => {
  assert.doesNotThrow(() => assertBuilderSkillsAvailable(resolve(repositoryRoot, 'builder-skills')))
})

const skillText = (name) => readFileSync(resolve(repositoryRoot, 'builder-skills', name, 'SKILL.md'), 'utf8')

for (const name of ['conexus-server', 'conexus-app-ui', 'conexus-app-code', 'conexus-plan', 'conexus-build', 'conexus-sankhya']) {
  test(`builder-skills/${name} is a skill named after its folder whose cited references exist`, () => {
    const text = skillText(name)
    assert.equal(/^---\nname: (.+)\n/.exec(text)?.[1], name)
    const cited = [...text.matchAll(/`(references\/[\w.-]+)`/g)].map((match) => match[1])
    for (const path of cited) assert.ok(existsSync(resolve(repositoryRoot, 'builder-skills', name, path)), `${name} cites missing ${path}`)
  })
}

test('the conexus-app-code skill cites every reference file it ships', () => {
  const text = skillText('conexus-app-code')
  const shipped = readdirSync(resolve(repositoryRoot, 'builder-skills/conexus-app-code/references'))
  assert.deepEqual(shipped.sort(), ['router.tsx', 'ticket-form.tsx', 'visits-screen.tsx', 'visits-table.tsx'])
  for (const file of shipped) {
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
