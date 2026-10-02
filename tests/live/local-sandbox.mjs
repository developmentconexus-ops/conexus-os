import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'

// The conversation's VM as a directory on this machine, for the Hub's `ConversationSandboxes` port
// (apps/hub/src/builder/run-runtime.ts). Ported from the directory-backed fake in
// tests/implementation/builder-run-runtime.test.mjs, but its commands run for real, in a real Hub process.
const AGENT_USER = 'conexus-agent'
const CONVERSATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
// A path the runtime names inside the VM; the lookbehind keeps `app/workspace` out.
const VM_PATH = /(?<![\w./-])\/(workspace|var\/lib\/|opt\/conexus|tmp\/conexus)/g
// Any kill aimed at every process: the VM's turn-end sweep, which on a host would end the person's session.
const KILLS_EVERYTHING = /\bkill\b[^\n;&|]*\s-1(?:\s|$)/
const RM_RECURSIVE = /\brm\s+(?:-[a-zA-Z]+\s+)*-[a-zA-Z]*[rR][a-zA-Z]*\s+(?:--\s+)?('[^']*'|"[^"]*"|\S+)/g

const succeeded = () => ({ success: true, exitCode: 0, stdout: '', stderr: '', executionTimeMs: 0 })

const execute = (command, args, { cwd, env }) => new Promise((settle) => {
  const startedAt = Date.now()
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (piece) => { stdout += piece })
  child.stderr.on('data', (piece) => { stderr += piece })
  child.once('error', (error) => settle({ success: false, exitCode: 127, stdout, stderr: `${stderr}${error.message}`, executionTimeMs: Date.now() - startedAt }))
  child.once('close', (code) => settle({ success: code === 0, exitCode: code ?? 1, stdout, stderr, executionTimeMs: Date.now() - startedAt }))
})

/**
 * @param {string} root the host directory that holds one directory per conversation
 * @param {object} workspaceTools the `tools` option of the agent's workspace (BUILDER_WORKSPACE_TOOLS_CONFIG of the built Hub)
 */
export const localConversationSandboxes = (root, workspaceTools) => {
  const base = resolve(root)
  mkdirSync(base, { recursive: true })
  const directoryOf = (conversationId) => {
    if (!CONVERSATION_ID.test(conversationId)) throw new Error(`LIVE_SANDBOX_CONVERSATION_REFUSED:${conversationId}`)
    return join(base, conversationId)
  }

  const open = ({ conversationId }) => {
    const vm = directoryOf(conversationId)
    const local = (text) => text.replace(VM_PATH, (_, folder) => `${vm}/${folder}`)
    const inside = (path) => {
      const mapped = resolve(local(path))
      if (mapped !== vm && !mapped.startsWith(`${vm}${sep}`)) throw new Error(`LIVE_SANDBOX_PATH_OUTSIDE:${path}`)
      return mapped
    }
    const environment = { PATH: process.env.PATH, HOME: join(vm, 'home'), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', LANG: 'C.UTF-8' }
    const checkout = join(vm, 'workspace/repo')
    // Never runs on the host: a kill of every process, and a recursive remove that leaves the conversation's directory.
    const guard = (text) => {
      if (KILLS_EVERYTHING.test(text)) return succeeded()
      for (const [, target] of local(text).matchAll(RM_RECURSIVE)) inside(target.replace(/^(['"])(.*)\1$/, '$2'))
      return undefined
    }
    const shell = (script, cwd) => execute('sh', ['-c', local(script)], { cwd, env: environment })

    return Object.freeze({
      sandboxId: `local-${conversationId}`,
      workspace: new Workspace({
        id: `conexus-run-workspace-local-${conversationId}`,
        name: 'Conexus Builder run',
        filesystem: new LocalFilesystem({ basePath: checkout }),
        sandbox: new LocalSandbox({ workingDirectory: checkout, env: environment }),
        tools: workspaceTools,
      }),
      start: async () => {
        for (const folder of ['workspace', 'opt/conexus', 'var/lib', 'tmp', 'home']) mkdirSync(join(vm, folder), { recursive: true })
      },
      executeCommand: async (command, args = [], options = {}) => {
        const line = [command, ...args].join(' ')
        if (line === 'id -un') return { ...succeeded(), stdout: `${AGENT_USER}\n` }
        const refused = guard(line)
        if (refused) return refused
        return execute(command, args.map(local), { cwd: options.cwd && options.cwd !== '/' ? inside(options.cwd) : vm, env: environment })
      },
      writeFiles: async (files) => {
        for (const file of files) {
          const path = inside(file.path)
          mkdirSync(dirname(path), { recursive: true })
          writeFileSync(path, file.content)
        }
      },
      runAsRoot: async (script) => guard(script) ?? shell(script, vm),
      writeRootFile: async (path, bytes) => {
        const target = inside(path)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, bytes)
      },
      readAgentFile: async (path) => readFileSync(inside(path)),
      // A flow that needs the application check must say so loudly; a stand-in report would pass on nothing.
      runCheck: async () => { throw new Error('LIVE_SANDBOX_HAS_NO_APPLICATION_CHECK') },
      holdOpen: async () => () => {},
      pause: async () => {},
      kill: async () => { rmSync(vm, { recursive: true, force: true }) },
    })
  }

  const remove = (conversationId) => rmSync(directoryOf(conversationId), { recursive: true, force: true })
  return Object.freeze({
    open,
    destroy: async (conversationIds) => { for (const conversationId of conversationIds) remove(conversationId) },
    killRecorded: async (providerSandboxIds) => {
      for (const providerSandboxId of providerSandboxIds) if (providerSandboxId.startsWith('local-')) remove(providerSandboxId.slice('local-'.length))
    },
  })
}
