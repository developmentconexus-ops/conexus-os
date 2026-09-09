import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('ProjectMastra candidate pins one framework while keeping provider admission closed and evidence-only', () => {
  const candidate = read('docs/evidence/4e/4e-r1-f01-project-mastra-admission-candidate.md')

  for (const token of [
    'OPERATOR APPROVED / P13 ACCEPTED / PRODUCTION REPIN GATE DEFERRED',
    'ADOPT @mastra/core@1.63.2',
    'ADOPT zod@4.5.2 as required compatibility peer only',
    'ProjectModelAdmissionCatalog',
    '189` providers',
    'Mastra supply-chain incident',
    'GHSA-866g-f22w-33x8',
    'custom/self-hosted/OpenAI-compatible endpoints remain denied for this pin',
    'workers: false',
    'notifications: { dispatch: { enabled: false } }',
    'backgroundTasks: { enabled: false }',
    'scheduler: { enabled: false }',
    'R1C-13 PROJECT_COGNITION',
    'APPROVE PROJECTMASTRA ADMISSION + ISOLATED NON-PROVIDER PROBE',
    'Implementation/provider-call authority:** `0`',
  ]) assert.ok(candidate.includes(token), `ProjectMastra candidate missing ${token}`)

  assert.match(candidate, /maxSteps = 4[\s\S]*maxToolCalls = 3[\s\S]*maxRetries = 0/)
  assert.match(candidate, /maxSteps = 1[\s\S]*toolChoice = none[\s\S]*maxRetries = 0/)
  assert.match(candidate, /The dynamic Agent model resolver reads the opaque trusted admission ID/)
  assert.match(candidate, /no universal default/)
  assert.match(candidate, /no root\/Product dependency or implementation/)
  assert.doesNotMatch(candidate, /ADOPT (OpenAI|Anthropic|Google)/)

})
