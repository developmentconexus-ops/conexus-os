import { chownSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { artifactManifest } from './artifact.js'
import type { CheckContext } from './context.js'
import { failed } from './outcome.js'
import { shapeProblem } from './problems.js'
import { type CheckReport, MAX_PROBLEMS, STEP_BLOCKS, type StepResult } from './report.js'
import { STEPS } from './steps.js'

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** The agent owns the output folder, and its `app/node_modules` is the template's compiler view. */
const prepareTree = (ctx: CheckContext): void => {
  mkdirSync(ctx.out, { recursive: true })
  if (ctx.drop) chownSync(ctx.out, ctx.drop.uid, ctx.drop.gid)
  rmSync(join(ctx.appRoot, 'node_modules'), { recursive: true, force: true })
  symlinkSync(join(ctx.compiler, 'node_modules'), join(ctx.appRoot, 'node_modules'))
}

export type CheckRun = Readonly<{ report: CheckReport; thumbnail: Buffer | null }>

/**
 * Walks the step table in order and stops running steps at the first blocking failure; the rest are
 * reported skipped. Throws when the tree cannot be prepared: that is a failure of the check, not a
 * verdict on the source.
 */
export const runCheck = async (ctx: CheckContext): Promise<CheckRun> => {
  prepareTree(ctx)
  const steps: StepResult[] = []
  let blockedBy: string | null = null
  let thumbnail: Buffer | null = null
  for (const step of STEPS) {
    if (blockedBy !== null) { steps.push({ step: step.id, status: 'skipped', code: 'AFTER_BLOCKING_FAILURE', reason: `after failed ${blockedBy}` }); continue }
    const started = performance.now()
    const outcome = await step.run(ctx).catch((error: unknown) =>
      failed('STEP_CRASHED', [{ code: 'STEP_CRASHED', message: `${step.id} stopped unexpectedly: ${messageOf(error)}` }]))
    const durationMs = Math.round(performance.now() - started)
    if (outcome.kind === 'skipped') { steps.push({ step: step.id, status: 'skipped', code: outcome.code, reason: outcome.reason }); continue }
    if (outcome.thumbnailBase64) thumbnail = Buffer.from(outcome.thumbnailBase64, 'base64')
    if (outcome.kind === 'ok') { steps.push({ step: step.id, status: 'passed', durationMs }); continue }
    const shaped = outcome.problems.map((problem) => shapeProblem(ctx.root, problem))
    steps.push({ step: step.id, status: 'failed', code: outcome.code, durationMs, problems: shaped.slice(0, MAX_PROBLEMS), ...(shaped.length > MAX_PROBLEMS ? { dropped: shaped.length - MAX_PROBLEMS } : {}) })
    if (STEP_BLOCKS[step.id]) blockedBy = step.id
  }
  const ok = blockedBy === null
  return { report: { ok, checkSha256: ctx.checkSha256, steps, artifact: ok ? artifactManifest(ctx.out, ctx.templateRef) : null }, thumbnail }
}

/** The picture goes to a path the Hub chose outside the candidate's tree, replaced and never followed. */
export const writeThumbnail = (path: string, bytes: Buffer): void => {
  rmSync(path, { force: true })
  writeFileSync(path, bytes, { flag: 'wx', mode: 0o644 })
}
