import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { TASK_TOOL_NAMES, groupSummary, toolRequest, toolSentence } from '../../apps/web/src/features/builder/construir/tool-sentences.ts'

// Regression for the mislabeled-row bug: Mastra Code's task_update/task_check/task_complete
// reached the heuristics (only task_write had a table entry) where /ask|approve|confirm|question/i
// ran before /task|plan|todo/i and matched the "ask" inside "task", so every task update rendered
// as "Perguntou a você" although the agent never asked anything.
test('task_update, task_check and task_complete never read as a question, running or done', () => {
  assert.deepEqual(
    ['task_update', 'task_check', 'task_complete'].map((toolName) => [toolSentence(toolName, true), toolSentence(toolName, false)]),
    [['Atualizando as tarefas', 'Atualizou as tarefas'], ['Conferindo as tarefas', 'Conferiu as tarefas'], ['Concluindo uma tarefa', 'Concluiu uma tarefa']],
  )
})

test('task_update, task_check and task_complete have their own pt-BR sentence, not the generic fallback', () => {
  assert.equal(toolSentence('task_update', false), 'Atualizou as tarefas')
  assert.equal(toolSentence('task_check', false), 'Conferiu as tarefas')
  assert.equal(toolSentence('task_complete', false), 'Concluiu uma tarefa')
  assert.equal(toolSentence('task_write', false), 'Organizou as tarefas')
})

test('ask_user itself still reads as a question', () => {
  assert.equal(toolSentence('ask_user', true), 'Perguntando a você')
  assert.equal(toolSentence('ask_user', false), 'Perguntou a você')
  assert.equal(toolRequest('ask_user'), 'perguntar a você')
})

// An id this table has never seen falls to the heuristics: task-shaped ids must not fall through
// to the ask/approve/confirm/question guess merely for containing the substring "ask".
test('an unmapped task-shaped id falls to the task heuristic, not the ask heuristic', () => {
  assert.equal(toolSentence('task_summarize_progress', false), 'Organizou as tarefas')
  assert.notEqual(toolSentence('task_summarize_progress', false), 'Perguntou a você')
})

// The ask heuristic itself still exists for a genuinely unmapped approval-shaped id: it matches
// the compound "ask_user" (never the bare "ask" that collides with "task"), plus "approve".
test('an unmapped id still reads as a question when it names ask_user or approve', () => {
  assert.equal(toolSentence('legacy_ask_user_v2', false), 'Perguntou a você')
  assert.equal(toolSentence('vendor_approve_step', false), 'Perguntou a você')
})

test('TASK_TOOL_NAMES names exactly the Mastra Code task tools', () => {
  assert.deepEqual([...TASK_TOOL_NAMES].sort(), ['task_check', 'task_complete', 'task_update', 'task_write'])
})

test('conexus_check reads as checking the app, running and done', () => {
  assert.equal(toolSentence('conexus_check', true), 'Verificando o app')
  assert.equal(toolSentence('conexus_check', false), 'Verificou o app')
})

const { createBuilderController } = await import(hubModuleUrl('builder/harness/controller.js'))

const REGISTERED_TOOL_SENTENCES = {
  submit_plan: 'Enviou o plano',
  mastra_workspace_read_file: 'Leu um arquivo',
  mastra_workspace_list_files: 'Listou arquivos',
  mastra_workspace_grep: 'Buscou no código',
  mastra_workspace_file_stat: 'Consultou um arquivo',
  mastra_workspace_write_file: 'Escreveu um arquivo',
  mastra_workspace_edit_file: 'Editou um arquivo',
  mastra_workspace_mkdir: 'Criou uma pasta',
  mastra_workspace_delete: 'Apagou um arquivo',
  mastra_workspace_execute_command: 'Executou um comando',
  mastra_workspace_get_process_output: 'Leu a saída de um processo',
  mastra_workspace_kill_process: 'Parou um processo',
  task_write: 'Organizou as tarefas',
  task_update: 'Atualizou as tarefas',
  task_complete: 'Concluiu uma tarefa',
  task_check: 'Conferiu as tarefas',
  skill: 'Consultou a skill',
  skill_read: 'Leu a skill',
  skill_search: 'Procurou uma skill',
  ask_user: 'Perguntou a você',
  connector_fetch: 'Consultou um sistema da empresa',
  web_search: 'Pesquisou na internet',
  web_fetch: 'Abriu uma página da internet',
  context7_resolve_library_id: 'Procurou uma biblioteca na documentação',
  context7_query_docs: 'Leu a documentação de uma biblioteca',
  conexus_check: 'Verificou o app',
  conexus_run_operation: 'Testou uma operação com dados reais',
}

test('recall, added by observational memory retrieval, reads as rereading earlier conversations', () => {
  assert.equal(toolSentence('recall', false), 'Releu conversas anteriores')
})

// The names of the tools a run's first model call carries, by driving one turn on the real controller.
const toolsOfARun = async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { resolve } = await import('node:path')
  const { InMemoryStore } = await import('@mastra/core/storage')
  const { createTool } = await import('@mastra/core/tools')
  const { LocalFilesystem, LocalSandbox, Workspace } = await import('@mastra/core/workspace')
  const root = mkdtempSync(resolve(tmpdir(), 'builder-tool-sentences-'))
  try {
    let names = null
    const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    const model = {
      specificationVersion: 'v2', provider: 'anthropic', modelId: 'probe-1', supportedUrls: {},
      async doGenerate() { throw new Error('doGenerate not used') },
      async doStream(options) {
        names ??= (options.tools ?? []).map((tool) => tool.name).sort()
        return { stream: new ReadableStream({ start(controller) {
          for (const part of [{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'ok' }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: 'stop', usage }]) controller.enqueue(part)
          controller.close()
        } }) }
      },
    }
    const { createConversationSandbox, createRunWorkspace } = await import(hubModuleUrl('builder/sandbox.js'))
    const tools = createRunWorkspace(createConversationSandbox({ apiKey: 'e2b-key', templateId: 'conexus:tpl', conversationId: '00000000-0000-4000-8000-000000000001', providerSandboxId: null, idleMs: 300_000 })).getToolsConfig()
    const workspace = new Workspace({ id: 'sentences-ws', filesystem: new LocalFilesystem({ basePath: root }), sandbox: new LocalSandbox({ workingDirectory: root }), tools })
    const controller = createBuilderController({
      workspace, model, storage: new InMemoryStore(), skillsPath: resolve(import.meta.dirname, '../../builder-skills'),
      connectorFetch: () => ({ connector_fetch: createTool({ id: 'connector_fetch', description: 'probe', execute: async () => ({}) }) }),
      runTools: () => ({ check: async () => ({}), runOperation: async () => ({}) }),
      docsTools: { close: async () => {}, tools: async () => Object.fromEntries(['context7_resolve_library_id', 'context7_query_docs'].map((id) => [id, createTool({ id, description: 'probe', execute: async () => ({}) })])) },
    })
    await controller.init()
    const session = await controller.createSession({ resourceId: 'project:probe-sentences', scope: 'probe-sentences' })
    await session.sendMessage({ content: 'oi' })
    for (let waited = 0; names === null && waited < 5000; waited += 50) await new Promise((r) => setTimeout(r, 50))
    await controller.destroy?.()
    return names
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('every tool the Builder offers a run has its own pt-BR sentence, running and done', async () => {
  const registered = (await toolsOfARun()).filter((name) => name !== 'web_search')
  assert.deepEqual(registered, Object.keys(REGISTERED_TOOL_SENTENCES).filter((name) => name !== 'web_search').sort())
  for (const [toolName, done] of Object.entries(REGISTERED_TOOL_SENTENCES)) {
    assert.equal(toolSentence(toolName, false), done, toolName)
    assert.notEqual(toolSentence(toolName, true), 'Usando uma ferramenta', toolName)
    assert.notEqual(toolRequest(toolName), 'usar uma ferramenta', toolName)
  }
})

test('groupSummary says what a run of calls did, by kind, in the order the kinds first appear', () => {
  assert.equal(groupSummary(['edit_file', 'edit_file', 'edit_file', 'edit_file', 'execute_command'], 0), 'Editou 4 arquivos, executou 1 comando')
  assert.equal(groupSummary(['read_file', 'grep', 'grep', 'conexus_check'], 0), 'Leu 1 arquivo, buscou 2 vezes, verificou o app 1 vez')
  assert.equal(groupSummary(['mkdir', 'read_file'], 0), 'Fez 1 outra ação, leu 1 arquivo')
})

test('groupSummary names the failures when there are any', () => {
  assert.equal(groupSummary(['edit_file', 'edit_file', 'execute_command'], 1), 'Editou 2 arquivos, executou 1 comando · 1 falhou')
  assert.equal(groupSummary(['edit_file', 'edit_file', 'execute_command'], 2), 'Editou 2 arquivos, executou 1 comando · 2 falharam')
})

test('submit_plan has its own pt-BR sentence and stays a row of its own', () => {
  assert.equal(toolSentence('submit_plan', true), 'Enviando o plano')
  assert.equal(toolSentence('submit_plan', false), 'Enviou o plano')
  assert.equal(toolRequest('submit_plan'), 'enviar o plano')
})

test('every Mastra workspace tool the Builder reads, prefixed as it reaches the conversation, has its own sentence, and none falls to the generic one', async () => {
  const { WORKSPACE_TOOLS } = await import('@mastra/core/workspace')
  const reaching = [WORKSPACE_TOOLS.FILESYSTEM, WORKSPACE_TOOLS.SANDBOX, WORKSPACE_TOOLS.SEARCH, WORKSPACE_TOOLS.LSP].flatMap((group) => Object.values(group))
  assert.deepEqual(reaching.filter((name) => toolSentence(name, false) === 'Usou uma ferramenta'), [])
  assert.equal(toolSentence(WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND, false), 'Executou um comando')
  assert.equal(toolSentence(WORKSPACE_TOOLS.FILESYSTEM.MKDIR, true), 'Criando uma pasta')
  assert.equal(toolSentence(WORKSPACE_TOOLS.FILESYSTEM.FILE_STAT, true), 'Consultando um arquivo')
})
