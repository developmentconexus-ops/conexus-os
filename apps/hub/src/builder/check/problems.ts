import { sep } from 'node:path'
import { MAX_FILE_CHARS, MAX_MESSAGE_CHARS, type Problem } from './report.js'

/** Output that can carry a Git header or a token from whatever produced it, and goes to a log or a prompt. */
export const redactEvidence = (text: string): string => text
  .replace(/(authorization:\s*)(?:(?:basic|bearer|token)\s+)?\S+/gi, '$1[redacted]')
  .replace(/x-access-token:[^@\s]+/gi, 'x-access-token:[redacted]')
  .replace(/\bgh[pousr]_[A-Za-z0-9_]+/g, '[redacted]')

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text)
const relativeTo = (root: string, text: string): string => text.split(root + sep).join('')

/** A problem as the report carries it: paths relative to the checkout, secrets redacted, text cut to its bounds. */
export const shapeProblem = (root: string, problem: Problem): Problem => ({
  ...(problem.file ? { file: clip(redactEvidence(relativeTo(root, problem.file)), MAX_FILE_CHARS) } : {}),
  ...(problem.line !== undefined ? { line: problem.line } : {}),
  ...(problem.column !== undefined ? { column: problem.column } : {}),
  ...(problem.code ? { code: problem.code } : {}),
  message: clip(redactEvidence(relativeTo(root, problem.message)), MAX_MESSAGE_CHARS),
})

const LOCATION = /(?:^|[\s"'(])((?:app|conexus)\/[\w@./-]+?\.(?:tsx?|jsx?|css|html|mjs|json))(?::(\d+))?(?::(\d+))?/

/** A tool's raw output as one problem, located when it names an `app/` or `conexus/` file. */
export const outputProblem = (root: string, exitCode: number, raw: string): Problem => {
  const text = relativeTo(root, raw).trim() || `the step exited with code ${exitCode} and printed nothing`
  const found = LOCATION.exec(text)
  return { ...(found?.[1] ? { file: found[1], ...(found[2] ? { line: Number(found[2]) } : {}), ...(found[3] ? { column: Number(found[3]) } : {}) } : {}), message: text }
}
