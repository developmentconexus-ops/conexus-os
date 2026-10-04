import type { Worker } from './command.js'
import type { CheckContext } from './context.js'
import { runTool, stepEnvironment, type ToolResult } from './exec.js'
import { type Outcome, outcomeSchema, timedOut } from './outcome.js'

/** The last line of a worker's stdout is its Outcome; anything printed before it is not. */
const outcomeOf = (stdout: string): Outcome | null => {
  try {
    const parsed = outcomeSchema.safeParse(JSON.parse(stdout.trim().split('\n').pop() ?? ''))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * A step that runs the agent's code runs in its own process, as the agent's user, under the step's
 * limit. `unreadable` says what a worker that printed no Outcome means for its step.
 */
export const runWorker = async (ctx: CheckContext, worker: Worker, limitMs: number, env: Readonly<Record<string, string>>, unreadable: (result: ToolResult) => Outcome): Promise<Outcome> => {
  const result = await runTool(ctx, process.execPath, [ctx.mainPath, 'worker', worker, '--root', ctx.root, '--out', ctx.out], {
    cwd: ctx.root, env: stepEnvironment(ctx, env), limitMs,
  })
  if (result.timedOut) return timedOut(worker, limitMs)
  return outcomeOf(result.stdout) ?? unreadable(result)
}
