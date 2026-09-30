import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The Project's own `AGENTS.md` (spec 0002, AC-7 to AC-9): a short file at the repository root
 * the Builder keeps current with what it confirmed. The Hub reads it from `main`, never from the
 * sandbox, and refuses a candidate that breaks the rule.
 */
export const PROJECT_KNOWLEDGE_PATH = 'AGENTS.md'
const PROJECT_KNOWLEDGE_LIMIT_BYTES = 8 * 1024
// A file past this is not read at all; it is over the limit either way.
export const PROJECT_KNOWLEDGE_READ_LIMIT = 1024 * 1024
const PROJECT_KNOWLEDGE_TRUNCATED_NOTE = 'AGENTS.md truncated at 8 KB; shorten it.'

type Blob = Readonly<{ type: string; size: number; bytes: Uint8Array | null }> | null

const strictUtf8 = new TextDecoder('utf-8', { fatal: true })

const decode = (bytes: Uint8Array): string | null => {
  try {
    return strictUtf8.decode(bytes)
  } catch {
    return null
  }
}

// The largest prefix of at most `limit` bytes that ends between two UTF-8 characters.
const characterBoundary = (bytes: Uint8Array, limit: number): number => {
  let cut = Math.min(limit, bytes.length)
  while (cut > 0 && cut < bytes.length && ((bytes[cut] as number) & 0xc0) === 0x80) cut -= 1
  return cut
}

/**
 * The text a run's instructions carry under project knowledge: the whole file when it is within
 * 8 KB, else its first 8 KB cut at a character boundary and followed by the note. A file that is
 * missing, not a file, or not UTF-8 gives nothing.
 */
export const readProjectKnowledge = (blob: Blob): string => {
  if (blob?.type !== 'blob') return ''
  if (!blob.bytes) return PROJECT_KNOWLEDGE_TRUNCATED_NOTE
  if (decode(blob.bytes) === null) return ''
  if (blob.bytes.length <= PROJECT_KNOWLEDGE_LIMIT_BYTES) return strictUtf8.decode(blob.bytes).trim()
  const kept = strictUtf8.decode(blob.bytes.subarray(0, characterBoundary(blob.bytes, PROJECT_KNOWLEDGE_LIMIT_BYTES)))
  return `${kept.trimEnd()}\n\n${PROJECT_KNOWLEDGE_TRUNCATED_NOTE}`
}

/**
 * Why a candidate's `AGENTS.md` is refused, written for the next turn to act on, or null when it
 * keeps the rule: present at the repository root, a regular file, UTF-8, at most 8 KB.
 */
export const refuseCandidateKnowledge = (blob: Blob): string | null => {
  if (blob?.type !== 'blob') return 'AGENTS.md is missing at the repository root. Write it with what this run confirmed, under 8 KB.'
  if (!blob.bytes || blob.size > PROJECT_KNOWLEDGE_LIMIT_BYTES) return `AGENTS.md has ${blob.size} bytes; the limit is ${PROJECT_KNOWLEDGE_LIMIT_BYTES} bytes (8 KB). Shorten it, keeping only confirmed facts.`
  if (decode(blob.bytes) === null) return 'AGENTS.md is not valid UTF-8. Rewrite it as plain UTF-8 text.'
  return null
}

/** The starter every new Project's repository gets (AC-7), shipped with the Hub like its prompts. */
export const starterProjectKnowledge = (cwd: string = process.cwd()): Readonly<{ path: string; content: string }> => Object.freeze({
  path: PROJECT_KNOWLEDGE_PATH,
  content: readFileSync(resolve(cwd, 'apps/hub/src/builder/starter/AGENTS.md'), 'utf8'),
})
