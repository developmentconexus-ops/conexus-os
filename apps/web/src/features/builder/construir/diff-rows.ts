import { diffLines } from 'diff'

/** One line of a file comparison. A context line carries both line numbers; an added line only
 * the new one; a removed line only the old one — the same convention git itself uses. */
export type DiffLine = Readonly<{ tag: ' ' | '+' | '-'; text: string; oldLine: number | null; newLine: number | null }>
export type DiffRow =
  | Readonly<{ kind: 'line' } & DiffLine>
  | Readonly<{ kind: 'gap'; id: string; lines: readonly DiffLine[] }>

const CONTEXT_MARGIN = 3
const MIN_HIDDEN = 6

const splitLines = (content: string): readonly string[] => {
  if (content === '') return []
  const lines = content.split('\n')
  return lines.at(-1) === '' ? lines.slice(0, -1) : lines
}

const flatten = (before: string, after: string): readonly DiffLine[] => {
  let oldLine = 1
  let newLine = 1
  const flat: DiffLine[] = []
  for (const part of diffLines(before, after)) {
    for (const text of splitLines(part.value)) {
      if (part.added) flat.push({ tag: '+', text, oldLine: null, newLine: newLine++ })
      else if (part.removed) flat.push({ tag: '-', text, oldLine: oldLine++, newLine: null })
      else flat.push({ tag: ' ', text, oldLine: oldLine++, newLine: newLine++ })
    }
  }
  return flat
}

/**
 * A file's full line-by-line comparison, with long unchanged runs collapsed into a gap the caller
 * can expand. A run collapses only once hiding it saves at least MIN_HIDDEN lines, keeping
 * CONTEXT_MARGIN lines of context next to whichever change (or file edge) it borders — the same
 * shape CodeMirror's collapseUnchanged gave this lens before this lens moved off CodeMirror.
 */
export function buildFileRows(fileKey: string, before: string, after: string): Readonly<{ rows: readonly DiffRow[]; added: number; removed: number; hunks: number }> {
  const flat = flatten(before, after)
  const rows: DiffRow[] = []
  let added = 0
  let removed = 0
  let hunks = 0
  let inChange = false
  let index = 0
  let gapSeq = 0
  const asLineRow = (line: DiffLine): DiffRow => ({ kind: 'line', tag: line.tag, text: line.text, oldLine: line.oldLine, newLine: line.newLine })
  while (index < flat.length) {
    const line = flat[index]
    if (!line) break
    if (line.tag !== ' ') {
      rows.push(asLineRow(line))
      if (line.tag === '+') added++; else removed++
      if (!inChange) { hunks++; inChange = true }
      index++
      continue
    }
    inChange = false
    let end = index
    while (end < flat.length && flat[end]?.tag === ' ') end++
    const runLength = end - index
    const atStart = index === 0
    const atEnd = end === flat.length
    const hidden = runLength - CONTEXT_MARGIN * (atStart || atEnd ? 1 : 2)
    if (hidden >= MIN_HIDDEN) {
      const leadIn = atStart ? 0 : CONTEXT_MARGIN
      const leadOut = atEnd ? 0 : CONTEXT_MARGIN
      for (let i = index; i < index + leadIn; i++) { const l = flat[i]; if (l) rows.push(asLineRow(l)) }
      rows.push({ kind: 'gap', id: `${fileKey}-${gapSeq++}`, lines: flat.slice(index + leadIn, end - leadOut) })
      for (let i = end - leadOut; i < end; i++) { const l = flat[i]; if (l) rows.push(asLineRow(l)) }
    } else {
      for (let i = index; i < end; i++) { const l = flat[i]; if (l) rows.push(asLineRow(l)) }
    }
    index = end
  }
  return { rows, added, removed, hunks }
}

/** Gap rows the caller has opened render as ordinary lines, right after the toggle that opened
 * them, in the same order the collapsed run held them. */
export const withOpenGaps = (rows: readonly DiffRow[], open: ReadonlySet<string>): readonly DiffRow[] =>
  rows.flatMap((row) => row.kind === 'gap' && open.has(row.id)
    ? [row, ...row.lines.map((line): DiffRow => ({ kind: 'line', ...line }))]
    : [row])

/** The split view's row shapes: a removed/added pair (either side may be absent), a lone context
 * line shown on both sides, or a gap spanning the full width. Every gap line the flattener produces
 * is unchanged context, so an expanded gap always reads as a run of context rows, never a pair. */
export type SplitRow =
  | Readonly<{ kind: 'pair'; del: DiffLine | null; add: DiffLine | null }>
  | Readonly<{ kind: 'context'; line: DiffLine }>
  | Readonly<{ kind: 'gap'; id: string; lines: readonly DiffLine[] }>

export function toSplitRows(rows: readonly DiffRow[]): readonly SplitRow[] {
  const out: SplitRow[] = []
  let dels: DiffLine[] = []
  let adds: DiffLine[] = []
  const flush = () => {
    const count = Math.max(dels.length, adds.length)
    for (let i = 0; i < count; i++) out.push({ kind: 'pair', del: dels[i] ?? null, add: adds[i] ?? null })
    dels = []
    adds = []
  }
  for (const row of rows) {
    if (row.kind === 'line' && row.tag === '-') { dels.push(row); continue }
    if (row.kind === 'line' && row.tag === '+') { adds.push(row); continue }
    flush()
    out.push(row.kind === 'gap' ? row : { kind: 'context', line: row })
  }
  flush()
  return out
}
