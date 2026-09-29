/*
 * Defence in depth, not the guard. What keeps a consult read only is Sankhya's integration user, which
 * holds no insert, update or delete permission. This tripwire refuses, at the Hub and before any
 * request is built, a consult that is plainly not one read. Quoting follows Oracle and SQL Server, the
 * databases Sankhya runs on. SQL Server runs a second statement with no `;` before it, so its
 * statement words are refused anywhere too.
 */
const REFUSED_WORDS = new RegExp(`\\b(?:${[
  'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'CALL', 'INTO', 'BEGIN', 'COMMIT',
  'DENY', 'WRITETEXT', 'UPDATETEXT', 'BACKUP', 'RESTORE', 'DBCC', 'SHUTDOWN', 'KILL', 'RECONFIGURE', 'OPENROWSET', 'OPENDATASOURCE', 'OPENQUERY',
].join('|')})\\b`, 'i')

const LINE_END = /[\n\r\v\f\u0085\u2028\u2029]/
const CLOSING_QUOTE: Readonly<Record<string, string>> = Object.freeze({ "'": "'", '"': '"', '[': ']' })

/** The index just past the quoted text opened at `start`, where a doubled closing quote is an escape, or -1 if it never closes. */
const pastQuote = (sql: string, start: number, close: string): number => {
  for (let at = start + 1; ; at += 2) {
    at = sql.indexOf(close, at)
    if (at === -1) return -1
    if (sql[at + 1] !== close) return at + 1
  }
}

/** The SQL with each comment and quoted text replaced by a space, or null when one never closes or Oracle's `q'` quoting appears. */
const codeOf = (sql: string): string | null => {
  let code = ''
  let at = 0
  while (at < sql.length) {
    const pair = sql.slice(at, at + 2)
    const close = CLOSING_QUOTE[sql[at] ?? '']
    let next: number
    if (pair === '--') {
      const end = sql.slice(at).search(LINE_END)
      next = end === -1 ? sql.length : at + end
    } else if (pair === '/*') {
      const end = sql.indexOf('*/', at + 2)
      next = end === -1 ? -1 : end + 2
    } else if (close) {
      if (sql[at] === "'" && /q/i.test(sql[at - 1] ?? '')) return null
      next = pastQuote(sql, at, close)
    } else {
      code += sql[at]
      at += 1
      continue
    }
    if (next === -1) return null
    code += ' '
    at = next
  }
  return code
}

/** One SELECT or WITH statement, with no refused word outside comments and quoted text. */
export const isOneReadStatement = (sql: string): boolean => {
  const code = codeOf(sql)?.trim().replace(/;$/, '')
  if (code === undefined || code.includes(';')) return false
  return /^(?:SELECT|WITH)\b/i.test(code) && !REFUSED_WORDS.test(code)
}
