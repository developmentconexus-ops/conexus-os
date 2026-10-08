import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuilderTemplate } from '../../scripts/builder-e2b-template.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { CURRENT_TEMPLATE_PIN } = await import(hubModuleUrl('platform/application-template-pins.js'))
const { TEMPLATE_REF, RECIPE_SHA256 } = await import(hubModuleUrl('builder/application-artifact-runtime.js'))

const V2_CURRENT = { profile: 'REACT_VITE_V2', templateRef: '537fnzf4c16x9d7oz21k:419afad1-5af3-405c-9a52-3f6dc81dee5c', recipeSha256: 'aba3957596f114f821e290dd89416aba2fa1785fc34cb5162a899de759e84ffc' }

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
