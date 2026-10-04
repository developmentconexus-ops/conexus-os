import { chmodSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { endAgentProcesses } from '../agent.js'
import { type CacheProject, cacheDirectory, withGateCache, withToolCache } from '../cache.js'
import { typescriptProjects } from '../compiler.js'
import type { CheckContext } from '../context.js'
import { runTool, stepEnvironment } from '../exec.js'
import { failed, OK, type Outcome, timedOut } from '../outcome.js'
import { outputProblem } from '../problems.js'
import type { Problem } from '../report.js'

const hasTypeScript = (directory: string): boolean => {
  try { return readdirSync(directory, { recursive: true }).some((name) => /\.(?:ts|tsx|mts)$/.test(String(name))) } catch { return false }
}

const problemsFromTsc = (root: string, text: string): readonly Problem[] => {
  const problems: Problem[] = []
  for (const line of text.split('\n')) {
    const located = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line)
    const global = /^error (TS\d+): (.*)$/.exec(line)
    if (located) problems.push({ file: located[1] ?? '', line: Number(located[2]), column: Number(located[3]), code: located[4] ?? '', message: located[5] ?? '' })
    else if (global) problems.push({ code: global[1] ?? '', message: global[2] ?? '' })
    else if (/^\s+\S/.test(line)) {
      const previous = problems.pop()
      if (previous) problems.push({ ...previous, message: `${previous.message}\n${line.trim()}` })
    }
  }
  return problems.length > 0 ? problems : [outputProblem(root, 1, text)]
}

/** The gate runs as root and lends its cache (`withGateCache`); the tool is the agent already and keeps its own. */
const withCache = <T>(ctx: CheckContext, project: CacheProject, run: (info: string | null) => Promise<T>): Promise<T> =>
  ctx.caller === 'tool'
    ? withToolCache(cacheDirectory(ctx, project), run)
    : withGateCache({ store: cacheDirectory(ctx, project), agent: ctx.drop, sweep: () => endAgentProcesses(ctx) }, run)

/**
 * Two programs, because one cannot give node: to handlers and refuse it to screens: the app project
 * (screens) and the server project (handlers, only when `conexus/` holds TypeScript). Both share the
 * one typecheck budget. `tsc` runs as the agent's user, so an import of a file only root can read
 * is an error that never carries that file's content.
 */
export const typecheck = async (ctx: CheckContext): Promise<Outcome> => {
  const projects = await typescriptProjects(ctx.compiler, ctx.root)
  const directory = mkdtempSync(join(tmpdir(), 'conexus-typecheck-'))
  const deadline = performance.now() + ctx.limits.typecheck
  const problems: Problem[] = []
  try {
    chmodSync(directory, 0o755)
    for (const name of hasTypeScript(join(ctx.root, 'conexus')) ? (['app', 'server'] as const) : (['app'] as const)) {
      const config = join(directory, `tsconfig.${name}.json`)
      writeFileSync(config, JSON.stringify(projects[name]), { mode: 0o644 })
      const result = await withCache(ctx, name, (info) => runTool(ctx, process.execPath, [
        join(ctx.compiler, 'node_modules/typescript/bin/tsc'), '-p', config, '--pretty', 'false', ...(info ? ['--incremental', '--tsBuildInfoFile', info] : []),
      ], { cwd: ctx.root, env: stepEnvironment(ctx), limitMs: Math.max(1, deadline - performance.now()) }))
      if (result.timedOut) return timedOut('typecheck', ctx.limits.typecheck)
      if (result.code !== 0) problems.push(...problemsFromTsc(ctx.root, `${result.stdout}\n${result.stderr}`))
    }
    return problems.length > 0 ? failed('TYPECHECK_ERRORS', problems) : OK
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
