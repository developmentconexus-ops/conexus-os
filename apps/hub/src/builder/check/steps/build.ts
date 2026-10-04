import { join } from 'node:path'
import { loadVite } from '../compiler.js'
import type { CheckContext, Place } from '../context.js'
import { failed, OK, type Outcome } from '../outcome.js'
import { outputProblem } from '../problems.js'
import { runWorker } from '../worker.js'

/** The screens, built with the template's own Vite config. */
export const buildWorker = async ({ root, appRoot, out, compiler }: Place): Promise<Outcome> => {
  try {
    const vite = await loadVite(compiler)
    await vite.build({ root: appRoot, configFile: join(compiler, 'vite.config.mjs'), configLoader: 'native', logLevel: 'error', build: { outDir: out, emptyOutDir: true } })
  } catch (error) {
    return failed('BUILD_FAILED', [outputProblem(root, 1, error instanceof Error ? error.message : String(error))])
  }
  return OK
}

export const build = (ctx: CheckContext): Promise<Outcome> =>
  runWorker(ctx, 'build', ctx.limits.build, { CONEXUS_COMPILE_ROOT: ctx.appRoot }, (result) => failed('BUILD_FAILED', [outputProblem(ctx.root, result.code, result.stderr || result.stdout)]))
