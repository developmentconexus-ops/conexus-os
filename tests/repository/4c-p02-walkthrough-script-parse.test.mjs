import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { Script } from 'node:vm'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const htmlPath = resolve(root, 'docs/evidence/4c/p02-project-resources-functional-wireframe.html')

test('P-02 P8 inline JavaScript parses before operator walkthrough', () => {
  const html = readFileSync(htmlPath, 'utf8')
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map(match => match[1])

  assert.equal(scripts.length, 1, 'P-02 P8 must contain exactly one self-contained inline script')
  assert.doesNotThrow(
    () => new Script(scripts[0], { filename: htmlPath }),
    'P-02 P8 inline JavaScript must parse before operator walkthrough',
  )
})
