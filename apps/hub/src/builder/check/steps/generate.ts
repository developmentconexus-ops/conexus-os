import { chownSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { admitManifest } from '../../../app-runner/server-manifest.js'
import { APP_FAILURES_SOURCE } from '../../../generated/app-failures.js'
import { generateClient } from '../compiler.js'
import type { CheckContext } from '../context.js'
import { failed, OK, type Outcome } from '../outcome.js'

// Replaced by the bundler with the text of `handler-kit/sankhya.ts`: the one file of the bundle that
// is not code the check runs, and the reader every Project's handlers import.
declare const SANKHYA_HELPER_SOURCE: string

const MANIFEST_PATH = 'conexus/manifest.json'
const MAX_MANIFEST_BYTES = 1_048_576
const manifestRefused = (message: string): Outcome =>
  failed('MANIFEST_REFUSED', [{ file: MANIFEST_PATH, code: 'MANIFEST_REFUSED', message: message.replace(/^MANIFEST_REFUSED: /, '') }])
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * The generated files are written by the check, which may run as root, into a tree the candidate
 * laid out. Each folder on the way must be a real folder and the target is replaced, never followed.
 */
const writeGenerated = (ctx: Pick<CheckContext, 'root' | 'drop'>, relativePath: string, content: string): void => {
  let current = ctx.root
  for (const part of relativePath.split('/').slice(0, -1)) {
    current = join(current, part)
    let entry = null
    try { entry = lstatSync(current) } catch { /* absent */ }
    if (entry === null) {
      mkdirSync(current)
      if (ctx.drop) chownSync(current, ctx.drop.uid, ctx.drop.gid)
    } else if (!entry.isDirectory()) throw new Error(`${part} in ${relativePath} is not a folder`)
  }
  const target = join(ctx.root, relativePath)
  rmSync(target, { force: true })
  writeFileSync(target, content, { flag: 'wx', mode: 0o644 })
  if (ctx.drop) chownSync(target, ctx.drop.uid, ctx.drop.gid)
}

const writeRefused = (error: unknown): Outcome => failed('GENERATE_WRITE_REFUSED', [{ code: 'GENERATE_WRITE_REFUSED', message: messageOf(error) }])

/**
 * Writes the failure table's app copy, which every app has. Then admits the manifest with the
 * runner's own function and writes the typed client the screens and handlers import, and the Sankhya
 * reader handlers may import. A source with no manifest has no server half and nothing to generate.
 */
export const generate = async (ctx: CheckContext): Promise<Outcome> => {
  try {
    writeGenerated(ctx, 'app/src/conexus/failures.gen.ts', APP_FAILURES_SOURCE)
  } catch (error) {
    return writeRefused(error)
  }
  const manifestPath = join(ctx.root, MANIFEST_PATH)
  let entry: ReturnType<typeof lstatSync>
  try { entry = lstatSync(manifestPath) } catch { return OK }
  let real: string
  try { real = realpathSync(manifestPath) } catch { return manifestRefused('cannot be read') }
  if (!entry.isFile() || !real.startsWith(realpathSync(ctx.root) + sep) || entry.size > MAX_MANIFEST_BYTES) return manifestRefused('must be a regular file inside the project, under 1 MiB')
  let client: Awaited<ReturnType<typeof generateClient>>
  try {
    client = await generateClient(ctx.compiler, admitManifest(JSON.parse(readFileSync(manifestPath, 'utf8')), 'source'))
  } catch (error) {
    return manifestRefused(error instanceof SyntaxError ? `is not valid JSON: ${error.message}` : messageOf(error))
  }
  try {
    writeGenerated(ctx, 'app/src/conexus/api.gen.ts', client.apiGen)
    writeGenerated(ctx, 'conexus/types.gen.ts', client.typesGen)
    writeGenerated(ctx, 'conexus/sankhya.gen.ts', SANKHYA_HELPER_SOURCE)
  } catch (error) {
    return writeRefused(error)
  }
  return OK
}
