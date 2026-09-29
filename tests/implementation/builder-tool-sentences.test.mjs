import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { TASK_TOOL_NAMES, groupSummary, toolRequest, toolSentence } from '../../apps/web/src/features/builder/construir/tool-sentences.ts'

// Regression for the mislabeled-row bug: Mastra Code's task_update/task_check/task_complete
// reached the heuristics (only task_write had a table entry) where /ask|approve|confirm|question/i
// ran before /task|plan|todo/i and matched the "ask" inside "task", so every task update rendered
// as "Perguntou a você" although the agent never asked anything.
test('task_update, task_check and task_complete never read as a question, running or done', () => {
  for (const toolName of ['task_update', 'task_check', 'task_complete']) {
    assert.notEqual(toolSentence(toolName, true), 'Perguntando a você')
    assert.notEqual(toolSentence(toolName, false), 'Perguntou a você')
  }
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

const { BUILDER_MODES } = await import(hubModuleUrl('builder/harness/modes.js'))

const REGISTERED_TOOL_SENTENCES = {
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
  submit_plan: 'Enviou o plano',
  conexus_check: 'Verificou o app',
}

test('every tool a Builder mode registers has its own pt-BR sentence, running and done', () => {
  const registered = [...new Set(Object.values(BUILDER_MODES).flatMap((mode) => [...mode.availableTools]))].sort()
  assert.deepEqual(registered, Object.keys(REGISTERED_TOOL_SENTENCES).sort())
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
