import { spawn } from 'node:child_process'
import { endAgentProcesses } from './agent.js'
import type { CheckContext } from './context.js'

export type ToolResult = Readonly<{ code: number; timedOut: boolean; stdout: string; stderr: string }>

const STEP_PATH = '/usr/local/bin:/usr/bin:/bin'
const MAX_CAPTURED_CHARS = 4_000_000

const stripAnsi = (text: string): string => text.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g'), '')
const killGroup = (pid: number | undefined): void => {
  if (pid === undefined) return
  try { process.kill(-pid, 'SIGKILL') } catch { /* already gone */ }
}

export const stepEnvironment = (ctx: Pick<CheckContext, 'home'>, extra: Readonly<Record<string, string>> = {}): Record<string, string> =>
  ({ PATH: STEP_PATH, HOME: ctx.home, LANG: 'C.UTF-8', ...extra })

/**
 * One child in its own process group with a fixed environment, the agent's identity and a wall
 * clock. Past the limit the whole group is killed, and what the agent's user left running goes with
 * it, so a step cannot leave anything behind.
 */
export const runTool = (ctx: Pick<CheckContext, 'drop'>, file: string, args: readonly string[], options: Readonly<{ cwd: string; env: Record<string, string>; limitMs: number }>): Promise<ToolResult> =>
  new Promise((settle) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let done = false
    const child = spawn(file, [...args], { cwd: options.cwd, env: options.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'], ...(ctx.drop ?? {}) })
    const keep = (text: string, chunk: unknown): string => (text.length > MAX_CAPTURED_CHARS ? text : text + String(chunk))
    child.stdout.on('data', (chunk) => { stdout = keep(stdout, chunk) })
    child.stderr.on('data', (chunk) => { stderr = keep(stderr, chunk) })
    const finish = (code: number): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      killGroup(child.pid)
      endAgentProcesses(ctx)
      settle({ code, timedOut, stdout: stripAnsi(stdout), stderr: stripAnsi(stderr) })
    }
    const timer = setTimeout(() => { timedOut = true; killGroup(child.pid) }, options.limitMs)
    child.once('error', (error) => { stderr += error.message; finish(-1) })
    child.once('close', (code) => finish(code ?? -1))
    child.once('exit', (code) => setTimeout(() => finish(code ?? -1), timedOut ? 0 : 200))
  })
