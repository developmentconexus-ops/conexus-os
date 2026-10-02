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
    for (const name of ['conexus-server', 'conexus-app', 'conexus-plan-new', 'conexus-plan-change', 'conexus-build', 'conexus-sankhya']) {
      mkdirSync(join(root, name))
      writeFileSync(join(root, name, 'SKILL.md'), `---\nname: ${name}\n---\nguide\n`)
    }
    assert.equal(assertBuilderSkillsAvailable(root), undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('refuses to start when the skills folder lacks a builder skill, and names it', () => {
  const root = mkdtempSync(resolve(cacheRoot, 'builder-skills-empty-'))
  try {
    mkdirSync(join(root, 'conexus-server'))
    writeFileSync(join(root, 'conexus-server', 'SKILL.md'), '---\nname: conexus-server\n---\nguide\n')
    assert.throws(() => assertBuilderSkillsAvailable(root), /^Error: BUILDER_SKILLS_MISSING: .* has no SKILL\.md for conexus-app, conexus-plan-new, conexus-plan-change, conexus-build, conexus-sankhya; /)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the repository ships the six builder skills where the Hub looks for them', () => {
  const folder = resolve(repositoryRoot, 'builder-skills')
  const shipped = readdirSync(folder).filter((name) => existsSync(join(folder, name, 'SKILL.md'))).sort()
  assert.deepEqual(shipped, ['conexus-app', 'conexus-build', 'conexus-plan-change', 'conexus-plan-new', 'conexus-sankhya', 'conexus-server'])
  assert.equal(assertBuilderSkillsAvailable(folder), undefined)
})

const skillText = (name) => readFileSync(resolve(repositoryRoot, 'builder-skills', name, 'SKILL.md'), 'utf8')

for (const name of ['conexus-server', 'conexus-app', 'conexus-plan-new', 'conexus-plan-change', 'conexus-build', 'conexus-sankhya']) {
  test(`builder-skills/${name} is a skill named after its folder whose cited references exist`, () => {
    const text = skillText(name)
    assert.equal(/^---\nname: (.+)\n/.exec(text)?.[1], name)
    const cited = [...text.matchAll(/`(references\/[\w.-]+)`/g)].map((match) => match[1])
    assert.deepEqual(cited.filter((path) => !existsSync(resolve(repositoryRoot, 'builder-skills', name, path))), [])
  })
}

test('the conexus-app skill cites every reference page it ships', () => {
  const text = skillText('conexus-app')
  const shipped = readdirSync(resolve(repositoryRoot, 'builder-skills/conexus-app/references'))
  assert.deepEqual(shipped.sort(), ['dashboard.tsx', 'form.tsx', 'list.tsx', 'record.tsx', 'shell.tsx', 'ticket-status.tsx'])
  for (const file of shipped) {
    assert.ok(text.includes(`references/${file}`), `SKILL.md does not cite ${file}`)
  }
})

test('the conexus-app skill names the source and licence of the passages it adapts', () => {
  const text = skillText('conexus-app')
  assert.match(text, /skills\/frontend-design\/SKILL\.md/)
  assert.match(text, /Apache License, Version 2\.0/)
})

test('the conexus-app skill sends the browser through the generated client and never through fetch', () => {
  const text = skillText('conexus-app')
  assert.match(text, /`api` from `@\/conexus\/api\.gen`, never with `fetch`/)
})

test('the conexus-server skill leaves browser calls to conexus-app and does not claim the check runs operations', () => {
  const text = skillText('conexus-server')
  assert.doesNotMatch(text, /import \{ api \} from/)
  assert.match(text, /`conexus-app`/)
  assert.doesNotMatch(text, /fetch\('\/__conexus/)
  assert.doesNotMatch(text, /check\.sh/)
  assert.doesNotMatch(text, /answers every operation/)
})
