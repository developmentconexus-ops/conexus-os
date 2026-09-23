import assert from 'node:assert/strict'
import test from 'node:test'
import { TASK_TOOL_NAMES, toolRequest, toolSentence } from '../../apps/web/src/features/builder/construir/tool-sentences.ts'

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
