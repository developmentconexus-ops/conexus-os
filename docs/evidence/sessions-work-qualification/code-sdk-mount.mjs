// The Factory does not invent its coding session. It mounts one from @mastra/code-sdk and
// hands that mount a workspace resolver of its own, which is where GitHub enters.
// This probe mounts the same composition directly and hands it a workspace over a source
// directory the host owns, to see whether the coding experience survives without a forge.
//
// Integration proof with the deterministic fixture model. No network, no credentials, no
// paid call, no container. Scratch directories only.
//
// Usage: node code-sdk-mount.mjs [--negative-control]
// Run it from the scratch directory factory-compat.sh printed, with fixture-model.mjs beside it.
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { Mastra } from '@mastra/core/mastra'
import { Workspace, LocalFilesystem, LocalSandbox } from '@mastra/core/workspace'
import { LibSQLStore } from '@mastra/libsql'
import { prepareAgentControllerMount } from '@mastra/code-sdk'
import { createScriptedModel } from './fixture-model.mjs'

const negativeControl = process.argv.includes('--negative-control')
const root = mkdtempSync(resolve(tmpdir(), 'conexus-source-'))
const store = mkdtempSync(resolve(tmpdir(), 'conexus-mount-'))

const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
mkdirSync(resolve(root, 'app'), { recursive: true })
writeFileSync(resolve(root, 'app/counter.js'), 'export const counter = 0\n')
git('init', '-q')
git('config', 'user.email', 'probe@example.invalid')
git('config', 'user.name', 'Qualification probe')
git('add', '-A')
git('commit', '-q', '-m', 'initial source')

const results = []
const claim = (property, statement, ok, detail = '') => results.push({ property, statement, ok, detail })
const report = () => {
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  [${r.property}] ${r.statement}${r.detail ? `  (${r.detail})` : ''}`)
  process.exit(results.some((r) => !r.ok) ? 1 : 0)
}

const WRITE_TOOL = 'mastra_workspace_write_file'
const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: root }),
  sandbox: new LocalSandbox({ workingDirectory: root }),
})
const model = createScriptedModel(
  [{ toolName: WRITE_TOOL, args: { path: 'app/counter.js', content: 'export const counter = 1\n' } }],
  'Contador alterado.',
)

let mounted
try {
  mounted = await prepareAgentControllerMount({
    controllerId: 'conexus-code',
    cwd: root,
    workspace,
    storage: new LibSQLStore({ id: 'mount', url: `file:${resolve(store, 'mount.db')}` }),
    storageBackend: 'libsql',
    modes: [{ id: 'build', name: 'Build', model, availableTools: [WRITE_TOOL] }],
    subagents: [],
    initialState: {},
  })
} catch (error) {
  claim('mount', 'the code-sdk controller mount accepts a host-supplied workspace and storage',
    false, `threw ${error?.message ?? error}`)
  report()
}

claim('mount', 'the code-sdk controller mount accepts a host-supplied workspace and storage',
  Boolean(mounted?.mastraArgs?.agentControllers), `controllers: ${Object.keys(mounted?.mastraArgs?.agentControllers ?? {}).join(', ')}`)

const mastra = new Mastra(mounted.mastraArgs)
await mounted.finalize()
const controller = mounted.base?.controller ?? mounted.mastraArgs.agentControllers[Object.keys(mounted.mastraArgs.agentControllers)[0]]

const projectResource = 'conexus-project:alpha'
const session = await controller.createSession({ resourceId: projectResource })
const first = await session.thread.create({ title: 'Conversa um' })
claim('conversation', 'a conversation is created on the mounted controller for the host\'s own Project resource',
  typeof first?.id === 'string', `${first?.id} on ${projectResource}`)

const resolved = await session.getWorkspace()
claim('workspace', 'the session resolves the workspace the host supplied, with no forge and no source-control row',
  Boolean(resolved), `${resolved?.constructor?.name ?? 'undefined'}`)

const seen = []
let approvals = 0
const unsubscribe = session.subscribe((event) => {
  seen.push(event.type)
  if (event.type === 'tool_approval_required') {
    approvals += 1
    session.approval.respond({ decision: 'approve', toolCallId: event.toolCallId })
  }
})

// Driving a turn is where this mount stops without a provider. code-sdk resolves the model
// from the session's selected model id through its own gateway, so a model object passed in
// config is never consulted. The probe records where it stops instead of hiding it.
const before = readFileSync(resolve(root, 'app/counter.js'), 'utf8')
let turn = 'completed'
try {
  await session.sendMessage({ content: 'Mude o contador para 1.', untilIdle: true })
} catch (error) {
  turn = `refused: ${error?.message ?? error}`
}
const after = readFileSync(resolve(root, 'app/counter.js'), 'utf8')
unsubscribe?.()

claim('limit of this probe', 'driving a turn through the mount needs a model its own resolver accepts',
  turn.startsWith('refused') || before !== after, turn)
if (before !== after) {
  claim('code tools', 'the mounted session ran its own workspace tool and the file on disk changed',
    after.includes('counter = 1'), `${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
  claim('authorization', 'the tool call stopped for approval before it touched the source',
    approvals === 1, `${approvals} approval(s) requested`)
}

if (negativeControl) {
  claim('negative control', 'the mount resolved no workspace at all', !resolved, 'this claim is false on purpose')
}

report()
