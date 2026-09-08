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
    const fakeTemplate = new E2B({ apiKey: 'fixture' }).Template
    fakeTemplate.build = async (_template, name, options) => {
      calls.push({ kind: 'build', name, options })
      return { templateId: 'tpl_immutable_123', buildId: 'bld_immutable_456' }
    }
    fakeTemplate.assignTags = async (targetName, tags) => {
      calls.push({ kind: 'tags', targetName, tags })
      return { buildId: 'bld_immutable_456', tags: [tags] }
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
      {
        kind: 'tags',
        targetName: built.buildName,
        tags: 'build-bld_immutable_456',
      },
    ])
    assert.equal(built.templateId, 'tpl_immutable_123')
    assert.equal(built.buildId, 'bld_immutable_456')
    assert.equal(built.runtimeTemplateRef, 'tpl_immutable_123:build-bld_immutable_456')

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
