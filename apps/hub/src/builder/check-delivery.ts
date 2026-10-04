import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Failure } from '../platform/failure.js'

/** The check the Hub sends to each VM: one file, identified by its sha256. */
export type CheckBundle = Readonly<{ sha256: string; bytes: Uint8Array }>

const BUNDLE_PATH = join(import.meta.dirname, '..', 'app-check', 'main.mjs')

/**
 * Reads the bundle `scripts/build-app-check.mjs` left beside the compiled Hub, once, when the Hub
 * starts. A Hub built without it cannot check anything, so it refuses to start.
 */
export const loadCheckBundle = (): CheckBundle => {
  let bytes: Buffer
  try {
    bytes = readFileSync(BUNDLE_PATH)
  } catch (cause) {
    throw new Failure('CONFIG_MISSING', { cause, details: { name: 'app-check/main.mjs' } })
  }
  return Object.freeze({ sha256: createHash('sha256').update(bytes).digest('hex'), bytes: new Uint8Array(bytes) })
}
