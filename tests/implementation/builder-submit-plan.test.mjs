import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { InMemoryStore } from '@mastra/core/storage'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import { hubModuleUrl } from './hub-build.mjs'

const { createBuilderController } = await import(hubModuleUrl('builder/harness/controller.js'))
const { createSubmitPlanTool } = await import(hubModuleUrl('builder/harness/tools.js'))
const { isPlanPath, splitPlanFile } = await import(hubModuleUrl('builder/harness/plan-file.js'))

const repositoryRoot = resolve(import.meta.dirname, '../..')
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
const streamOf = (parts) => new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close() } })
const submit = (id, path) => ({ type: 'tool-call', toolCallId: id, toolName: 'submit_plan', input: JSON.stringify({ path }) })
const PLAN = '# Notas de compras\n\n## Para a pessoa\n- Uma tela com busca\n\n## Para construir\n- Rota /notas\n'

test('the plan path is the one file .conexus/plan.md, however the model spells it', () => {
  const checkout = '/workspace/repo'
  const accepted = ['.conexus/plan.md', './.conexus/plan.md', '/workspace/repo/.conexus/plan.md', '/.conexus/plan.md', '.conexus/plans/../plan.md']
  const refused = ['.conexus/plans/plan.md', 'app/plan.md', '/workspace/repo/app/x.tsx', '../.conexus/plan.md', '/etc/plan.md', '.conexus/plan.md.bak', '']
  assert.deepEqual(accepted.filter((path) => !isPlanPath(path, checkout)), [])
  assert.deepEqual(refused.filter((path) => isPlanPath(path, checkout)), [])
})

test('submit_plan refuses another path without suspending, and suspends with the plan read for the one path', async () => {
  const tool = createSubmitPlanTool('/workspace/repo')
  const suspended = []
  const files = { '/workspace/repo/.conexus/plan.md': PLAN }
  const context = () => ({
    agent: { suspend: async (payload) => { suspended.push(payload) } },
    workspace: { filesystem: { readFile: async (path) => { if (path in files) return files[path]; throw new Error('ENOENT') } } },
  })
  assert.match(await tool.execute({ path: 'app/home.tsx' }, context()), /^Refused: the plan lives in \.conexus\/plan\.md/)
  assert.deepEqual(suspended, [])
  await tool.execute({ path: '/workspace/repo/.conexus/plan.md' }, context())
  assert.deepEqual(suspended, [{ toolId: 'submit_plan', path: '.conexus/plan.md', ...splitPlanFile(PLAN) }])
  assert.equal(suspended[0].title, 'Notas de compras')
  assert.match(suspended[0].plan, /^## Para a pessoa/)
})

test('submit_plan reaches the model in the one mode, suspends with the plan, takes feedback, and an approval ends the tool with no mode switch', async (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'builder-submit-plan-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(resolve(root, '.conexus'), { recursive: true })
  writeFileSync(resolve(root, '.conexus/plan.md'), PLAN)
  const workspace = new Workspace({ id: 'plan-ws', filesystem: new LocalFilesystem({ basePath: root }), sandbox: new LocalSandbox({ workingDirectory: root }) })
  const seen = []
  const model = {
    specificationVersion: 'v2', provider: 'anthropic', modelId: 'probe-1', supportedUrls: {},
    async doGenerate() { throw new Error('doGenerate not used') },
    async doStream(options) {
      const step = seen.length
      seen.push({ tools: (options.tools ?? []).map((tool) => tool.name), prompt: JSON.stringify(options.prompt) })
      const parts = [[submit('p0', 'app/home.tsx')], [submit('p1', '.conexus/plan.md')], [submit('p2', '.conexus/plan.md')]][step]
      return { stream: streamOf(parts
        ? [{ type: 'stream-start', warnings: [] }, ...parts, { type: 'finish', finishReason: 'tool-calls', usage }]
        : [{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'pronto' }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: 'stop', usage }]) }
    },
  }
  const controller = createBuilderController({ workspace, model, storage: new InMemoryStore(), skillsPath: resolve(repositoryRoot, 'builder-skills') })
  await controller.init()
  t.after(() => controller.destroy?.())
  const session = await controller.createSession({ resourceId: 'project:probe-submit-plan', scope: 'probe-submit-plan' })
  await session.state.set({ yolo: true })
  const payloads = []
  const answers = [{ action: 'rejected', feedback: 'Tire a busca' }, { action: 'approved' }]
  session.subscribe((event) => {
    if (event.type !== 'tool_suspended') return
    payloads.push({ toolName: event.toolName, payload: event.suspendPayload })
    const resumeData = answers.shift()
    setTimeout(() => { void session.respondToToolSuspension({ toolCallId: event.toolCallId, resumeData }) }, 10)
  })
  await session.sendMessage({ content: 'faça o plano' })
  for (let waited = 0; seen.length < 4 && waited < 8000; waited += 50) await new Promise((r) => setTimeout(r, 50))
  assert.equal(seen[0].tools.includes('submit_plan'), true, 'submit_plan reaches the model')
  assert.deepEqual(payloads, [
    { toolName: 'submit_plan', payload: { toolId: 'submit_plan', path: '.conexus/plan.md', ...splitPlanFile(PLAN) } },
    { toolName: 'submit_plan', payload: { toolId: 'submit_plan', path: '.conexus/plan.md', ...splitPlanFile(PLAN) } },
  ])
  assert.match(seen[1].prompt, /Refused: the plan lives in/)
  assert.match(seen[2].prompt, /Tire a busca/)
  assert.match(seen[3].prompt, /Plan approved\. Proceed with implementation/)
  assert.equal(session.mode.get(), 'build')
})
