import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { E2B } from 'e2b'

import {
  BUILDER_TEMPLATE_BASE_IMAGE,
  BUILDER_TEMPLATE_CPU_COUNT,
  BUILDER_TEMPLATE_MEMORY_MB,
  BUILDER_TEMPLATE_NODE_VERSION,
  buildBuilderTemplate,
  checkBuilderTemplate,
} from '../../scripts/rb-builder-e2b-template.mjs'

test('RB Builder E2B template is a source-free exact Node recipe with required local mechanics', async () => {
  const checked = await checkBuilderTemplate()
  const parsed = JSON.parse(checked.recipe)
  assert.equal(parsed.fromImage, BUILDER_TEMPLATE_BASE_IMAGE)
  assert.match(parsed.fromImage, new RegExp(`^node:${BUILDER_TEMPLATE_NODE_VERSION}-bookworm-slim@sha256:[0-9a-f]{64}$`))
  assert.match(parsed.readyCmd, /git --version/)
  assert.match(parsed.readyCmd, /\/workspace/)
  assert.equal(parsed.steps.some((step) => step.type === 'USER' && step.args[0] === 'root'), true)
  assert.equal(parsed.steps.some((step) => step.type === 'COPY'), false)
  assert.equal(JSON.stringify(parsed).includes('E2B_API_KEY'), false)
  assert.match(checked.buildName, /^conexus-rb-builder-first:recipe-[0-9a-f]{16}$/)
})

test('RB Builder E2B template build uses an explicitly keyed client and returns immutable identity', async () => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'conexus-rb-e2b-template-'))
  try {
    const keyFile = resolve(temporary, 'e2b-api-key')
    writeFileSync(keyFile, 'fixture-e2b-key\n', { mode: 0o600 })
    const calls = []
    let buildIdentity = { templateId: 'tplimmutable123', buildId: '66666666-6666-4666-8666-666666666666' }
    const fakeTemplate = new E2B({ apiKey: 'fixture' }).Template
    fakeTemplate.build = async (_template, name, options) => {
      calls.push({ kind: 'build', name, options })
      return buildIdentity
    }
    class FakeE2BClient {
      constructor(options) {
        calls.push({ kind: 'client', options })
        this.Template = fakeTemplate
      }
    }
    const built = await buildBuilderTemplate({ CONEXUS_BUILDER_E2B_API_KEY_FILE: keyFile }, FakeE2BClient)
    assert.deepEqual(calls, [
      { kind: 'client', options: { apiKey: 'fixture-e2b-key' } },
      {
        kind: 'build',
        name: built.buildName,
        options: { cpuCount: BUILDER_TEMPLATE_CPU_COUNT, memoryMB: BUILDER_TEMPLATE_MEMORY_MB },
      },
    ])
    assert.equal(built.templateId, 'tplimmutable123')
    assert.equal(built.buildId, '66666666-6666-4666-8666-666666666666')
    assert.equal(built.runtimeTemplateRef, 'tplimmutable123:66666666-6666-4666-8666-666666666666')

    buildIdentity = { templateId: 'tplimmutable123', buildId: 'mutable-tag' }
    await assert.rejects(
      buildBuilderTemplate({ CONEXUS_BUILDER_E2B_API_KEY_FILE: keyFile }, FakeE2BClient),
      /BUILDER_E2B_TEMPLATE_BUILD_IDENTITY_REFUSED/,
    )

    chmodSync(keyFile, 0o644)
    await assert.rejects(buildBuilderTemplate({ CONEXUS_BUILDER_E2B_API_KEY_FILE: keyFile }), /BUILDER_E2B_API_KEY_FILE_REFUSED/)
    chmodSync(keyFile, 0o600)
    const link = resolve(temporary, 'linked-key')
    symlinkSync(keyFile, link)
    await assert.rejects(buildBuilderTemplate({ CONEXUS_BUILDER_E2B_API_KEY_FILE: link }), /BUILDER_E2B_API_KEY_FILE_REFUSED/)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})
