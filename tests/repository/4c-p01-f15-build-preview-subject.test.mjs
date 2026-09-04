import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root,p),'utf8')

test('F15 makes BLD-10 support current Project preview or exact Change candidate without adding Product authority', () => {
  const ledger=read('docs/product/operation-ledger.md')
  const wire=read('contracts/api/product/builder-paths.yaml')

  for(const token of [
    '4C-F15','BLD-10','GetBuildPreview','current Project source Preview','optional changeId','CURRENT_PROJECT','CHANGE_CANDIDATE','subjectDigest',
    'N_platform = 116','Builder remains 17','Builder — 20'
  ]) assert.ok(ledger.includes(token),`operation ledger missing F15 token: ${token}`)

  assert.ok(wire.includes('/api/control/projects/{projectId}/preview:'),'BLD-10 must be Project-level preview read')
  assert.ok(wire.includes('summary: GetBuildPreview'),'BLD-10 wire must use GetBuildPreview')
  assert.ok(wire.includes('x-conexus-4a-id: BLD-10'),'stable BLD-10 identity must remain')
  assert.ok(wire.includes('name: changeId'),'BLD-10 must admit optional exact Change context')
  assert.ok(wire.includes('required: false'),'changeId must be optional')
  assert.ok(wire.includes('CURRENT_PROJECT'),'wire must distinguish current Project preview subject')
  assert.ok(wire.includes('CHANGE_CANDIDATE'),'wire must distinguish exact Change candidate preview subject')
  assert.ok(wire.includes('subjectDigest'),'wire must carry exact preview subject digest')
  assert.doesNotMatch(wire,/\/api\/control\/projects\/\{projectId\}\/changes\/\{changeId\}\/preview:/,'superseded Change-only preview path must be removed')
})
