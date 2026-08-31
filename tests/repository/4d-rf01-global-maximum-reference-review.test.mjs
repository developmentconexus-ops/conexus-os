import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('RF-01 reference review strengthens the candidate without manufacturing runtime proof', () => {
  const review = read('docs/evidence/4d/4d-05-rf01-global-maximum-reference-review.md')
  const selection = read('docs/evidence/4d/4d-05-rf01-profile-compiler-selection.md')
  const index = read('docs/index.md')

  for (const token of [
    'REFERENCE REVIEW COMPLETE / SELECTION APPROVED / RUNTIME PROOF OPEN',
    'Nx Devkit Generator/Tree',
    'Copier updating',
    'Terraform plan/apply',
    'Bazel hermeticity',
    'Kubernetes Server-Side Apply',
    'Git lockfile API',
    'RFC 8785 JCS',
    'exclusive generation writer was missing',
    'plan identity and stale-plan refusal needed to be explicit',
    'current-tree census must exceed Git dirty state',
    'canonical JSON must not be improvised',
    'candidate architecture         = CURRENT GLOBAL MAXIMUM',
    'runtime correctness proof      = OPEN / REQUIRES AUTHORIZED PROTOTYPE',
  ]) assert.ok(review.includes(token), `RF-01 reference review missing ${token}`)

  for (const token of [
    'planSchema        = conexus.project-generation-plan/v1',
    'RFC 8785 JSON Canonicalization Scheme port',
    'untracked, ignored,',
    'symlink and reparse-point',
    'acquire one exclusive Project generation-writer lock',
    'GenerationPlan with expected active receipt',
    'A stale lock is',
    '`RF01-P13`',
    '`RF01-P14`',
  ]) assert.ok(selection.includes(token), `RF-01 strengthened selection missing ${token}`)

  const proofIds = [...selection.matchAll(/`RF01-P(\d{2})`/g)].map(match => match[1])
  assert.deepEqual(proofIds, Array.from({ length: 14 }, (_value, index) => String(index + 1).padStart(2, '0')))
  assert.match(index, /RF-01 Global-Maximum reference review/)
})
