import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { Sandbox } from 'e2b'
import { liveFlow } from '../live/harness.mjs'

// Paid: a real Hub (PostgreSQL, Keycloak, the built web) opens real E2B sandboxes on the Builder's
// template; only the model is scripted. The gate runs the Hub's bundle in the VM, and the Preview
// serves the bytes the gate collected. Every sandbox the Hub recorded is killed at the end. Run with
//   CONEXUS_LIVE_E2B_TEMPLATE_ID=<current pin> CONEXUS_LIVE_E2B_API_KEY_FILE=<key file> \
//   node --test --test-isolation=none --test-global-setup=tests/live/harness.mjs tests/manual/builder-gate-e2b-live.test.mjs
const live = Boolean(process.env.CONEXUS_LIVE_E2B_TEMPLATE_ID && process.env.CONEXUS_LIVE_E2B_API_KEY_FILE)

const write = (path, content) => ({ parts: [{ call: { name: 'mastra_workspace_write_file', args: { path, content } } }] })
const say = (text) => ({ parts: [{ text }] })
const REQUEST = 'Crie um total simples'

if (live) {
  liveFlow({ id: 'builder.gate-e2b', nome: 'O gate roda o pacote do Hub numa VM real e a Prévia serve os bytes que ele coletou' }, async ({ page, model, hub }) => {
    const apiKey = readFileSync(process.env.CONEXUS_LIVE_E2B_API_KEY_FILE, 'utf8').trim()
    try {
      model.script(write('app/src/total.ts', 'export const total: number = 0\n'), say('Pronto, terminei.'))
      await page.goto(`/workspaces/${hub.workspaceId}/projects`)
      await page.getByLabel('Mensagem para o agente').fill(REQUEST)
      await page.getByRole('button', { name: 'Enviar', exact: true }).click()
      await page.getByRole('button', { name: 'Criar e começar' }).click()
      await page.waitForURL(/\/projects\/[^/]+\/c\/[^/]+$/)
      await expect.poll(async () => (await hub.db(`select state from builder.builder_run where request_text = '${REQUEST}'`))[0]?.state, { timeout: 600_000, intervals: [2_000] }).not.toMatch(/^(QUEUED|RUNNING)$/)
      const [run] = await hub.db(`select builder_run_id, state, result_kind, failure_code, result_source_revision from builder.builder_run where request_text = '${REQUEST}'`)
      assert.deepEqual([run.state, run.result_kind, run.failure_code], ['SUCCEEDED', 'SOURCE_CHANGED', null])

      const lines = readFileSync(join(hub.evidenceDir, 'hub.log'), 'utf8').split('\n').flatMap((line) => { try { return [JSON.parse(line)] } catch { return [] } })
      const checks = lines.filter((record) => record.msg === 'BUILDER_CHECK' && record.run === run.builder_run_id)
      assert.equal(checks.length, 1)
      assert.match(JSON.stringify(checks[0]), /generate=passed.*typecheck=passed.*build=passed.*server=passed.*boot=passed/)
      assert.equal(lines.some((record) => /IDENTITY_MISMATCH|CHECK_INSTALL_REFUSED|CHECK_REPORT_UNREADABLE|CHECK_UNREADABLE/.test(String(record.msg))), false, 'no check refusal in the Hub log')

      const [revision] = await hub.db('select artifact_revision_id, source_revision, payload from reg.artifact_revision order by created_at desc limit 1')
      assert.equal(revision.source_revision, run.result_source_revision, 'the retained artifact is the checked source revision')
      assert.match(revision.payload.templateRef, /^[a-z0-9]+:[0-9a-f-]{36}$/)
      assert.equal(revision.payload.templateRef, process.env.CONEXUS_LIVE_E2B_TEMPLATE_ID, 'retained under the current pin')
      for (const file of revision.payload.files) assert.equal(createHash('sha256').update(Buffer.from(file.base64, 'base64')).digest('hex'), file.sha256, `${file.path}: the stored bytes are the hashed bytes`)
      const index = revision.payload.files.find((file) => file.path === 'index.html')

      await expect(page.getByText('versão 1 · Build passou')).toBeVisible({ timeout: 60_000 })
      const frameHandle = await page.locator('iframe[title="Prévia do aplicativo"]').elementHandle()
      await expect.poll(async () => (await frameHandle.contentFrame())?.url(), { timeout: 60_000 }).toMatch(/^https:\/\/preview-/)
      const frame = await frameHandle.contentFrame()
      const served = await frame.evaluate(async () => {
        const response = await fetch('/')
        const bytes = new Uint8Array(await response.arrayBuffer())
        const digest = await crypto.subtle.digest('SHA-256', bytes)
        return { status: response.status, sha256: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('') }
      })
      console.log(`AC16 ${JSON.stringify({ run: run.builder_run_id, revision: revision.artifact_revision_id, templateRef: revision.payload.templateRef, files: revision.payload.files.length, served })}`)
      assert.deepEqual(served, { status: 200, sha256: index.sha256 }, 'the Preview serves the gate collected index.html')
    } finally {
      const sandboxes = (await hub.db('select provider_sandbox_id from builder.conversation_session')).map((row) => row.provider_sandbox_id)
      for (const id of sandboxes) console.log(`E2B_SANDBOX ${id} killed=${await Sandbox.kill(id, { apiKey }).catch(() => false)}`)
    }
  })
}
