import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const script = resolve(repositoryRoot, 'scripts/builder-model-input.mjs')
const promptDir = resolve(repositoryRoot, 'apps/hub/src/builder/harness/prompt/v2')

// The same forbidden terms as the harness test (AC-1); 'gh' is a whole word.
const FORBIDDEN_PHRASES = ['Mastra Code', 'pull request', 'npm install']
const containsForbiddenText = (text) => FORBIDDEN_PHRASES.some((phrase) => text.includes(phrase)) || /\bgh\b/.test(text)

const promptText = (name) => readFileSync(join(promptDir, name), 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim()

const AGENTS_BLOCK = '# Fixture app\n\nThe invoices screen sorts by due date. Confirmed in run 4.'

const fixtureProject = () => {
  const dir = mkdtempSync(join(tmpdir(), 'builder-model-input-'))
  const git = (...args) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { stdio: 'ignore' })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(dir, 'AGENTS.md'), `${AGENTS_BLOCK}\n`)
  git('add', '.')
  git('commit', '-qm', 'fixture')
  return dir
}

const print = (project, mode, model, extra = []) =>
  execFileSync(process.execPath, [script, '--project', project, '--thread', 'thread-1', '--mode', mode, '--model', model, ...extra], { encoding: 'utf8', cwd: repositoryRoot, timeout: 300_000 })

const toolsOf = (output) => output.split('=== TOOLS (by name) ===\n')[1].split('\n\n')[0].split('\n')

const SHARED = ['ask_user', 'skill', 'skill_read', 'skill_search', 'task_check', 'task_complete', 'task_update', 'task_write', 'web_fetch', 'web_search']
const READ = ['mastra_workspace_file_stat', 'mastra_workspace_grep', 'mastra_workspace_list_files', 'mastra_workspace_read_file']
const WRITE = ['mastra_workspace_edit_file', 'mastra_workspace_mkdir', 'mastra_workspace_write_file']
const COMMAND = ['mastra_workspace_delete', 'mastra_workspace_execute_command', 'mastra_workspace_get_process_output', 'mastra_workspace_kill_process']

test('AC-1: the printed input holds the Conexus layer, the mode file and the AGENTS.md block, and the exact tools, per mode', () => {
  const project = fixtureProject()
  try {
    const plan = print(project, 'planejar', 'openai/gpt-5')
    const build = print(project, 'construir', 'openai/gpt-5')

    for (const [output, modeFile, other] of [[plan, 'plan.md', 'build.md'], [build, 'build.md', 'plan.md']]) {
      assert.ok(output.includes(promptText('conexus.md')), 'the Conexus layer is printed whole')
      assert.ok(output.includes(promptText(modeFile)), 'the mode file is printed whole')
      assert.equal(output.includes(promptText(other)), false, 'the other mode file is not printed')
      assert.ok(output.includes(`## Project knowledge\n\n${AGENTS_BLOCK}`), 'the AGENTS.md block sits under the project knowledge heading')
      assert.equal(containsForbiddenText(output), false, 'no banned term')
    }
    assert.match(plan, /^Mode: planejar \(plan\)$/m)
    assert.match(build, /^Mode: construir \(build\)$/m)

    assert.deepEqual(toolsOf(plan), [...READ, ...WRITE, ...SHARED, 'submit_plan'].sort())
    assert.deepEqual(toolsOf(build), [...READ, ...WRITE, ...COMMAND, ...SHARED, 'conexus_check'].sort())
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})

test('AC-1: a model without native search is shown no web_search, and the revision picks the AGENTS.md', () => {
  const project = fixtureProject()
  try {
    const first = execFileSync('git', ['-C', project, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    writeFileSync(join(project, 'AGENTS.md'), '# Fixture app\n\nSecond revision.\n')
    execFileSync('git', ['-C', project, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'second'], { stdio: 'ignore' })

    const output = print(project, 'planejar', 'deepseek/deepseek-chat', ['--revision', first])
    assert.equal(toolsOf(output).includes('web_search'), false)
    assert.ok(output.includes(`Revision: ${first}`))
    assert.ok(output.includes(AGENTS_BLOCK))
    assert.equal(output.includes('Second revision.'), false)
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})
