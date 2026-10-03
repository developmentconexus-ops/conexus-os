import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { chromium } from '@playwright/test'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import { ensureCompilerRoot } from '../implementation/compiler-root.mjs'

// The conversation's VM as a directory on this machine, for the Hub's `ConversationSandboxes` port
// (apps/hub/src/builder/run-runtime.ts). Ported from the directory-backed fake in
// tests/implementation/builder-run-runtime.test.mjs, but its commands run for real, in a real Hub process.
const AGENT_USER = 'conexus-agent'
const CONVERSATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
// A path the runtime names inside the VM; the lookbehind keeps `app/workspace` out. The egress
// recorder's folders (egress-log.ts) stay unmapped on purpose: writeRootFile refuses them, so its
// background processes never start on the host, and the run logs BUILDER_SANDBOX_EGRESS_START_FAILED and goes on.
const VM_PATH = /(?<![\w./-])\/(workspace|var\/lib\/|opt\/conexus|tmp\/conexus)/g
// Any kill aimed at every process: the VM's turn-end sweep, which on a host would end the person's session.
const KILLS_EVERYTHING = /\bkill\b[^\n;&|]*\s-1(?:\s|$)/
const RM_RECURSIVE = /\brm\s+(?:-[a-zA-Z]+\s+)*-[a-zA-Z]*[rR][a-zA-Z]*\s+(?:--\s+)?('[^']*'|"[^"]*"|\S+)/g

const succeeded = () => ({ success: true, exitCode: 0, stdout: '', stderr: '', executionTimeMs: 0 })

// The media types the Hub's collector admits (application-artifact-runtime.ts, mediaTypeForPath).
const MEDIA_TYPES = {
  '.avif': 'image/avif', '.cjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.otf': 'font/otf', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
}
const filesUnder = (directory) => readdirSync(directory, { recursive: true }).map(String).filter((path) => statSync(join(directory, path)).isFile()).sort()

// The E2B image's compiler root, laid out under the VM's /opt/conexus as the template has it.
const compilerRoot = await ensureCompilerRoot()
const placeCompiler = (vm) => {
  const compiler = join(vm, 'opt/conexus/compiler')
  if (existsSync(join(compiler, 'vite.config.mjs'))) return
  mkdirSync(compiler, { recursive: true })
  for (const name of ['node_modules', 'full']) symlinkSync(join(compilerRoot, name), join(compiler, name))
  for (const name of ['allowlist.mjs', 'generate-client.mjs', 'tsconfig.mjs', 'package.json']) copyFileSync(join(compilerRoot, name), join(compiler, name))
  writeFileSync(join(compiler, 'vite.config.mjs'), readFileSync(join(compilerRoot, 'vite.config.mjs'), 'utf8').replace("'/workspace/.vite'", JSON.stringify(join(vm, 'tmp/vite-cache'))))
}

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
export const localConversationSandboxes = (root, workspaceTools, parseCheckReport) => {
  const base = resolve(root)
  mkdirSync(base, { recursive: true })
  const directoryOf = (conversationId) => {
    if (!CONVERSATION_ID.test(conversationId)) throw new Error(`LIVE_SANDBOX_CONVERSATION_REFUSED:${conversationId}`)
    return join(base, conversationId)
  }

  // As in the E2B pool, a parked run's instance, and so the workspace its live session holds, is kept for the answer.
  const kept = new Map()
  const open = ({ conversationId }) => kept.get(conversationId) ?? build(conversationId)
  const build = (conversationId) => {
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

    const instance = Object.freeze({
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
      readAgentFileIfPresent: async (path) => (existsSync(inside(path)) ? readFileSync(inside(path)) : null),
      readAgentFileStream: async (path) => new Blob([readFileSync(inside(path))]).stream(),
      // The Hub's own check.mjs, as the run placed it in /opt/conexus, on the real compiler and the
      // Playwright Chromium. It runs as this machine's user: there is no root or agent identity here.
      runCheck: async ({ root: tree, out, collect, thumbnail }) => {
        placeCompiler(vm)
        const tools = join(vm, 'opt/conexus')
        const ran = await execute(process.execPath, [
          join(tools, 'check.mjs'), '--root', inside(tree), '--out', inside(out), '--tools', tools, '--home', join(vm, 'home'),
          '--chromium', chromium.executablePath(), ...(thumbnail ? ['--thumbnail', inside(thumbnail)] : []),
        ], { cwd: vm, env: environment })
        if (ran.exitCode !== 0) throw new Error('APPLICATION_CHECK_UNREADABLE', { cause: { stderr: ran.stderr.slice(-2_000) } })
        const report = parseCheckReport(ran.stdout)
        const dist = inside(out)
        const files = collect && report.ok ? filesUnder(dist).map((path) => {
          const bytes = new Uint8Array(readFileSync(join(dist, path)))
          return { path: relative(dist, join(dist, path)).split(sep).join('/'), mediaType: MEDIA_TYPES[extname(path).toLowerCase()], bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
        }) : null
        const picture = files && thumbnail && existsSync(inside(thumbnail)) ? new Uint8Array(readFileSync(inside(thumbnail))) : null
        return { report, files, thumbnail: picture && picture.byteLength > 0 ? { mediaType: 'image/png', bytes: picture } : null }
      },
      holdOpen: async () => () => {},
      pause: async (parked = false) => {
        if (parked) kept.set(conversationId, instance)
        else kept.delete(conversationId)
      },
      release: () => {
        if (kept.get(conversationId) === instance) kept.delete(conversationId)
      },
      kill: async () => {
        kept.delete(conversationId)
        rmSync(vm, { recursive: true, force: true })
      },
    })
    return instance
  }

  const remove = (conversationId) => rmSync(directoryOf(conversationId), { recursive: true, force: true })
  return Object.freeze({
    open,
    destroy: async (conversationIds) => { for (const conversationId of conversationIds) remove(conversationId) },
    // Answers the ids that are gone, as E2B's does: every id this stand-in made, and none it did not.
    killRecorded: async (providerSandboxIds) => providerSandboxIds.filter((providerSandboxId) => {
      if (!providerSandboxId.startsWith('local-')) return false
      remove(providerSandboxId.slice('local-'.length))
      return true
    }),
  })
}
