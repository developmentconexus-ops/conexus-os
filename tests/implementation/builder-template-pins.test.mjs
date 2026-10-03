import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { checkBuilderTemplate } from '../../scripts/builder-e2b-template.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { CURRENT_TEMPLATE_PIN } = await import(hubModuleUrl('platform/application-template-pins.js'))
const { TEMPLATE_REF, RECIPE_SHA256 } = await import(hubModuleUrl('builder/application-artifact-runtime.js'))

const V2_CURRENT = { profile: 'REACT_VITE_V2', templateRef: '537fnzf4c16x9d7oz21k:449fd9f1-3b61-4c88-9a06-fd61bbfb4060', recipeSha256: '4ce6f3a6b1233edb4a3f8741751239c7d43bf70c0b8e75318106ac08543ab05d' }

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

test('migration 0042 admits exactly the current pin', () => {
  const sql = readFileSync(resolve(import.meta.dirname, '../../apps/hub/migrations/0042_compiler_template_enum.sql'), 'utf8')
  const literal = (field) => new RegExp(`p_payload->>'${field}' IS DISTINCT FROM '([^']+)'`).exec(sql)?.[1]
  assert.deepEqual(
    { profile: literal('profile'), templateRef: literal('templateRef'), recipeSha256: literal('recipeSha256') },
    CURRENT_TEMPLATE_PIN,
  )
})
