const WORD = /[A-Za-z0-9_]/
const DOLLAR_TAG = /^\$(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/

/**
 * The code of a statement text: comments become a space, a string literal (plain, E'', dollar quoted)
 * becomes '' and a quoted identifier loses its quotes. What is left is what PostgreSQL parses as
 * keywords and names, so a check on it neither misses a switch hidden behind a literal that looks
 * like a comment nor refuses a literal that holds a word or a semicolon. Returns null for an
 * unterminated literal, comment or quoted identifier.
 */
export const codeOfSql = (text: string): string | null => {
  let code = ''
  let index = 0
  while (index < text.length) {
    const char = text[index] ?? ''
    const next = text[index + 1] ?? ''
    if (char === '-' && next === '-') {
      const end = text.indexOf('\n', index)
      index = end === -1 ? text.length : end
      code += ' '
    } else if (char === '/' && next === '*') {
      let depth = 1
      index += 2
      while (depth > 0) {
        const open = text.indexOf('/*', index)
        const close = text.indexOf('*/', index)
        if (close === -1) return null
        if (open !== -1 && open < close) { depth += 1; index = open + 2 } else { depth -= 1; index = close + 2 }
      }
      code += ' '
    } else if (char === "'") {
      const escapes = (text[index - 1] === 'E' || text[index - 1] === 'e') && !WORD.test(text[index - 2] ?? ' ')
      index += 1
      for (;;) {
        if (index >= text.length) return null
        const current = text[index]
        if (escapes && current === '\\') index += 2
        else if (current === "'" && text[index + 1] === "'") index += 2
        else if (current === "'") break
        else index += 1
      }
      index += 1
      code += "''"
    } else if (char === '"') {
      let end = index + 1
      let name = ''
      for (;;) {
        if (end >= text.length) return null
        if (text[end] === '"' && text[end + 1] === '"') { name += '"'; end += 2 } else if (text[end] === '"') break
        else { name += text[end]; end += 1 }
      }
      index = end + 1
      code += name
    } else if (char === '$' && !WORD.test(text[index - 1] ?? ' ')) {
      const tag = DOLLAR_TAG.exec(text.slice(index))?.[0]
      if (tag === undefined) { code += char; index += 1; continue }
      const end = text.indexOf(tag, index + tag.length)
      if (end === -1) return null
      index = end + tag.length
      code += "''"
    } else {
      code += char
      index += 1
    }
  }
  return code
}
