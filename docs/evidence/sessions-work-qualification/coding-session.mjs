// Traces the interactive coding path, which the Work refusal never touched: a session
// running its own workspace tools over a source directory the host owns, with no forge,
// no cloud and no container.
//
// This is an integration proof. The model is the deterministic fixture in fixture-model.mjs,
// so the tool path runs without spending anything. It says nothing about how a real model
// would behave, and the tool approval below is granted unconditionally, where a product
// would have a person or a policy decide.
//
// Throwaway and isolated: a scratch git repository and a scratch LibSQL file, both created
// here. No network, no credentials, no paid call.
//
// Usage: node coding-session.mjs [--negative-control]
// Run it from the scratch directory factory-compat.sh printed, with fixture-model.mjs beside it.
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { AgentController } from '@mastra/core/agent-controller'
import { createCodingAgent } from '@mastra/core/coding-agent'
import { Workspace, LocalFilesystem, LocalSandbox } from '@mastra/core/workspace'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { createScriptedModel } from './fixture-model.mjs'

const negativeControl = process.argv.includes('--negative-control')
const root = mkdtempSync(resolve(tmpdir(), 'conexus-source-'))
const store = mkdtempSync(resolve(tmpdir(), 'conexus-coding-'))

const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
mkdirSync(resolve(root, 'app'), { recursive: true })
writeFileSync(resolve(root, 'app/counter.js'), 'export const counter = 0\n')
git('init', '-q')
git('config', 'user.email', 'probe@example.invalid')
git('config', 'user.name', 'Qualification probe')
git('add', '-A')
git('commit', '-q', '-m', 'initial source')
const baseRevision = git('rev-parse', 'HEAD')

const results = []
const claim = (property, statement, ok, detail = '') => results.push({ property, statement, ok, detail })

const storage = new LibSQLStore({ id: 'coding', url: `file:${resolve(store, 'coding.db')}` })
const memory = new Memory({ storage, options: { lastMessages: 20 } })
const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: root }),
  sandbox: new LocalSandbox({ workingDirectory: root }),
})

const WRITE_TOOL = 'mastra_workspace_write_file'
const model = createScriptedModel(
  [{ toolName: WRITE_TOOL, args: { path: 'app/counter.js', content: 'export const counter = 1\n' } }],
  'Contador alterado.',
)

const agent = createCodingAgent({
  id: 'probe-coding-agent', name: 'Probe', model, workspace, memory,
  instructions: 'You edit the project source when asked.', editor: false,
})
const controller = new AgentController({
  id: 'probe-controller', agent, storage, memory, workspace,
  // availableTools is an allowlist, so the workspace tool has to be named here.
  modes: [{ id: 'build', name: 'Build', availableTools: [WRITE_TOOL] }],
  defaultModeId: 'build', initialState: {},
})
await controller.init?.()

const projectResource = 'conexus-project:alpha'
const session = await controller.createSession({ resourceId: projectResource })
const first = await session.thread.create({ title: 'Conversa um' })
claim('conversation', 'a conversation is created for the Project resource the host chose',
  typeof first?.id === 'string', `${first?.id} on ${projectResource}`)

const seen = []
let approvals = 0
const unsubscribe = session.subscribe((event) => {
  seen.push(event.type)
  if (event.type === 'tool_approval_required') {
    approvals += 1
    session.approval.respond({ decision: 'approve', toolCallId: event.toolCallId })
  }
})

const before = readFileSync(resolve(root, 'app/counter.js'), 'utf8')
await session.sendMessage({ content: 'Mude o contador para 1.', untilIdle: true })
const after = readFileSync(resolve(root, 'app/counter.js'), 'utf8')
unsubscribe?.()

claim('authorization', 'the tool call stopped for approval before it touched the source',
  approvals === 1 && seen.includes('tool_approval_required'), `${approvals} approval(s) requested`)
claim('code tools', 'the session ran its own workspace tool and the file on disk changed',
  before !== after && after.includes('counter = 1'), `${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
claim('code tools', 'the run reached the tool and then ended',
  seen.includes('tool_start') && seen.includes('agent_end'), seen.filter((t, i, a) => a.indexOf(t) === i).join(','))

const dirty = git('status', '--porcelain')
claim('source identity', 'the change is visible to the Project\'s own git custody as an uncommitted change',
  dirty.includes('app/counter.js'), `base ${baseRevision.slice(0, 8)}, status ${JSON.stringify(dirty)}`)

const messages = await session.thread.listMessages({ threadId: first.id })
claim('conversation', 'the turn is recorded in the conversation that ran it',
  (messages ?? []).length > 0, `${(messages ?? []).length} messages`)

const second = await session.thread.create({ title: 'Conversa dois' })
const secondMessages = await session.thread.listMessages({ threadId: second.id })
claim('context separation', 'a second conversation in the same Project starts with none of the first one\'s messages',
  (secondMessages ?? []).length === 0, `${(secondMessages ?? []).length} messages`)

await session.thread.switch({ threadId: first.id })
const resumed = await session.thread.listMessages({ threadId: first.id })
claim('conversation', 'switching back to the first conversation finds its messages again',
  (resumed ?? []).length === (messages ?? []).length, `${(resumed ?? []).length} messages`)

if (negativeControl) {
  claim('negative control', 'the file on disk was left unchanged', before === after, 'this claim is false on purpose')
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  [${r.property}] ${r.statement}${r.detail ? `  (${r.detail})` : ''}`)
// The session and the local sandbox hold the loop open, so the exit is explicit rather
// than left to a natural drain that would never come.
process.exit(results.some((r) => !r.ok) ? 1 : 0)
