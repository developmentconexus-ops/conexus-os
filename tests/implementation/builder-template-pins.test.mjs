import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { checkBuilderTemplate } from '../../scripts/builder-e2b-template.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { CURRENT_TEMPLATE_PIN, isReadableTemplatePin } = await import(hubModuleUrl('platform/application-template-pins.js'))
const { TEMPLATE_REF, RECIPE_SHA256 } = await import(hubModuleUrl('builder/application-artifact-runtime.js'))

const V2_CURRENT = { profile: 'REACT_VITE_V2', templateRef: '537fnzf4c16x9d7oz21k:449fd9f1-3b61-4c88-9a06-fd61bbfb4060', recipeSha256: '4ce6f3a6b1233edb4a3f8741751239c7d43bf70c0b8e75318106ac08543ab05d' }
const V2_FIRST = { profile: 'REACT_VITE_V2', templateRef: '537fnzf4c16x9d7oz21k:3505be5f-f9ab-4d49-837e-af56dea09755', recipeSha256: '41a3d125df1e6579dd7d1ccc1c2014eb68a5ad321f010d792333dc8053d3c434' }
const V1_CURRENT = { profile: 'REACT_VITE_V1', templateRef: '537fnzf4c16x9d7oz21k:0f44de30-d856-40d1-b6b3-54a8bbf2f440', recipeSha256: 'df2e896284661a4402158d6e694493332df57de4b56f4c565e5b6ed19bfabde4' }
const V1_OLDER = { profile: 'REACT_VITE_V1', templateRef: '537fnzf4c16x9d7oz21k:5591435e-3021-436b-926b-366ddc7e7189', recipeSha256: '74a04791ab9691c48e3f4fbff7aa84e8e3ef1b600d38a585e243fff21e5adebf' }

test('a new build uses the v2 template pin', () => {
  assert.deepEqual(CURRENT_TEMPLATE_PIN, {
    profile: 'REACT_VITE_V2',
    templateRef: V2_CURRENT.templateRef,
    recipeSha256: V2_CURRENT.recipeSha256,
  })
  assert.deepEqual([TEMPLATE_REF, RECIPE_SHA256], [CURRENT_TEMPLATE_PIN.templateRef, CURRENT_TEMPLATE_PIN.recipeSha256])
})

test('the recorded recipe hash is the hash of the recipe the compiler template files produce', async () => {
  assert.equal((await checkBuilderTemplate()).recipeSha256, CURRENT_TEMPLATE_PIN.recipeSha256)
})

test('artifacts built on the first v2 and the React-only templates stay readable, and only the pinned pairs are', () => {
  for (const pin of [CURRENT_TEMPLATE_PIN, V2_FIRST, V1_CURRENT, V1_OLDER]) assert.equal(isReadableTemplatePin(pin), true)
  assert.equal(isReadableTemplatePin({ ...V1_CURRENT, profile: 'REACT_VITE_V2' }), false)
  assert.equal(isReadableTemplatePin({ ...CURRENT_TEMPLATE_PIN, recipeSha256: V1_CURRENT.recipeSha256 }), false)
  assert.equal(isReadableTemplatePin({ ...V1_OLDER, templateRef: V1_CURRENT.templateRef }), false)
})

test('migration 0042 admits exactly the current pin', () => {
  const sql = readFileSync(resolve(import.meta.dirname, '../../apps/hub/migrations/0042_compiler_template_enum.sql'), 'utf8')
  const literal = (field) => new RegExp(`p_payload->>'${field}' IS DISTINCT FROM '([^']+)'`).exec(sql)?.[1]
  assert.deepEqual(
    { profile: literal('profile'), templateRef: literal('templateRef'), recipeSha256: literal('recipeSha256') },
    CURRENT_TEMPLATE_PIN,
  )
  assert.equal(sql.includes(V2_FIRST.templateRef) || sql.includes(V1_CURRENT.templateRef) || sql.includes(V1_OLDER.templateRef), false)
})
