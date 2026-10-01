import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The two files the prompt carries from the Project's own repository: `AGENTS.md`, the instructions
 * the company's people write for the Builder, and `.conexus/memory/MEMORY.md`, the index of what the
 * Builder learned. The Hub reads both from `main`, never from the sandbox, so a turn cannot put its
 * own text into the next turn's prompt before a version is saved (spec 0004, AC-9).
 */
export const PROJECT_INSTRUCTIONS_PATH = 'AGENTS.md'
export const PROJECT_MEMORY_PATH = '.conexus/memory/MEMORY.md'

const INSTRUCTIONS_LIMIT_BYTES = 8 * 1024
const MEMORY_LIMIT_BYTES = 16 * 1024
const MEMORY_LIMIT_LINES = 200
// A file past this is not read at all.
export const PROJECT_FILE_READ_LIMIT = 1024 * 1024

/** What `readBlob` answers: null when the path is not there, bytes null when the file is past the read limit. */
type ProjectBlob = Readonly<{ type: string; size: number; bytes: Uint8Array | null }> | null
/** A blob, or undefined when reading it failed. */
export type ProjectFile = ProjectBlob | undefined

const strictUtf8 = new TextDecoder('utf-8', { fatal: true })
const encoder = new TextEncoder()

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

const cutToBytes = (text: string, limit: number): string => {
  const bytes = encoder.encode(text)
  return strictUtf8.decode(bytes.subarray(0, characterBoundary(bytes, limit)))
}

// Text for the prompt: the file's content, or an empty file with one line saying why.
const read = (file: ProjectFile, name: string, cut: (text: string) => string | null, limitNote: string): string => {
  if (file === undefined) return `[${name} could not be read; treat it as empty.]`
  if (file?.type !== 'blob') return `[${name} is missing; treat it as empty.]`
  if (!file.bytes) return `[${name} is too large to read; treat it as empty.]`
  const text = decode(file.bytes)
  if (text === null) return `[${name} is not UTF-8 text; treat it as empty.]`
  const kept = cut(text)
  return kept === null ? text.trim() : `${kept.trimEnd()}\n\n[${limitNote}]`
}

/** `AGENTS.md` for the prompt: whole within 8 KB, else its first 8 KB cut at a character boundary, followed by a note. */
export const readProjectInstructions = (file: ProjectFile): string =>
  read(file, PROJECT_INSTRUCTIONS_PATH, (text) => encoder.encode(text).length > INSTRUCTIONS_LIMIT_BYTES ? cutToBytes(text, INSTRUCTIONS_LIMIT_BYTES) : null,
    'AGENTS.md was cut at 8 KB; the rest is not shown.')

/** `MEMORY.md` for the prompt: whole within 200 lines and 16 KB, else cut at whichever limit comes first, followed by a note. */
export const readProjectMemory = (file: ProjectFile): string =>
  read(file, PROJECT_MEMORY_PATH, (text) => {
    const lines = text.split('\n')
    const byLines = lines.length > MEMORY_LIMIT_LINES ? lines.slice(0, MEMORY_LIMIT_LINES).join('\n') : text
    return byLines.length < text.length || encoder.encode(byLines).length > MEMORY_LIMIT_BYTES ? cutToBytes(byLines, MEMORY_LIMIT_BYTES) : null
  }, 'MEMORY.md was cut at 200 lines or 16 KB; the rest is not shown. Keep the index shorter.')

/** The files every new Project's repository starts with: the people's instructions and an empty memory index, shipped with the Hub like its prompt. */
export const starterProjectFiles = (cwd: string = process.cwd()): readonly Readonly<{ path: string; content: string }>[] => [
  { path: PROJECT_INSTRUCTIONS_PATH, content: readFileSync(resolve(cwd, 'apps/hub/src/builder/starter/AGENTS.md'), 'utf8') },
  { path: PROJECT_MEMORY_PATH, content: readFileSync(resolve(cwd, 'apps/hub/src/builder/starter/MEMORY.md'), 'utf8') },
]
