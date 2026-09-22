import { Button } from '@mastra/playground-ui/components/Button'
import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import { useQuery } from '@tanstack/react-query'
import { ChevronsUpDown, File } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { type BuilderRun, compareProjectSource, getProjectSourceFile, type SourceChange } from '../api'
import { buildFileRows, type DiffLine, type DiffRow, toSplitRows, withOpenGaps } from './diff-rows'
import './lens-surfaces.css'

const changeLabels: Readonly<Record<SourceChange['status'], string | null>> = {
  ADDED: 'Arquivo novo',
  REMOVED: 'Removido',
  MODIFIED: null,
  RENAMED: 'Renomeado',
}

export type ChangeBasis = Readonly<{ baseSourceRevision: string; resultSourceRevision: string }>

export const changeBasisOf = (run: BuilderRun | null | undefined): ChangeBasis | null =>
  run?.resultSourceRevision ? { baseSourceRevision: run.baseSourceRevision, resultSourceRevision: run.resultSourceRevision } : null

const readSide = async (projectId: string, revision: string, path: string | null): Promise<string> =>
  path === null ? '' : (await getProjectSourceFile(projectId, revision, path)).content

type FileSides = Readonly<{ before: string; after: string }>
type DiffMode = 'unified' | 'split'
type FileDiff = Readonly<{ entry: SourceChange; rows: readonly DiffRow[]; added: number; removed: number; hunks: number }>

const gapButton = (id: string, count: number, open: boolean, onToggle: (id: string) => void) =>
  <button type="button" className="cx-gap" aria-expanded={open} onClick={() => onToggle(id)}>
    <ChevronsUpDown size={13} aria-hidden="true" />
    {open ? 'Recolher' : `${count} ${count === 1 ? 'linha sem alteração' : 'linhas sem alteração'}`}
  </button>

const lineOrBlank = (text: string) => text || ' '

function UnifiedTable({ rows, open, onToggle }: Readonly<{ rows: readonly DiffRow[]; open: ReadonlySet<string>; onToggle: (id: string) => void }>) {
  return <table className="cx-dt">
    <colgroup><col className="cx-dt-num" /><col className="cx-dt-num" /><col className="cx-dt-marker" /><col /></colgroup>
    <tbody>
      {withOpenGaps(rows, open).map((row) => row.kind === 'gap'
        ? <tr className="cx-dt-gap" key={row.id}><td colSpan={4}>{gapButton(row.id, row.lines.length, open.has(row.id), onToggle)}</td></tr>
        : <tr key={`${row.oldLine ?? '-'}:${row.newLine ?? '-'}`} className={row.tag === '+' ? 'cx-dt-add' : row.tag === '-' ? 'cx-dt-del' : undefined}>
          <td className="cx-dt-n">{row.oldLine ?? ''}</td>
          <td className="cx-dt-n">{row.newLine ?? ''}</td>
          <td className="cx-dt-g">{row.tag === '+' ? '+' : row.tag === '-' ? '−' : ''}</td>
          <td className="cx-dt-t">{lineOrBlank(row.text)}</td>
        </tr>)}
    </tbody>
  </table>
}

const sideCell = (line: DiffLine | null, side: 'add' | 'del') => line
  ? <>
    <td className={`cx-dt-n cx-dt-${side}`}>{side === 'add' ? line.newLine : line.oldLine}</td>
    <td className={`cx-dt-g cx-dt-${side}`}>{side === 'add' ? '+' : '−'}</td>
    <td className={`cx-dt-t cx-dt-${side}`}>{lineOrBlank(line.text)}</td>
  </>
  : <td className="cx-dt-empty" colSpan={3} />

function SplitTable({ rows, open, onToggle }: Readonly<{ rows: readonly DiffRow[]; open: ReadonlySet<string>; onToggle: (id: string) => void }>) {
  const splitRows = toSplitRows(withOpenGaps(rows, open))
  return <table className="cx-dt cx-dt-split">
    <colgroup><col className="cx-dt-num" /><col className="cx-dt-marker" /><col /><col className="cx-dt-num" /><col className="cx-dt-marker" /><col /></colgroup>
    <tbody>
      {splitRows.map((row) => {
        if (row.kind === 'gap') return <tr className="cx-dt-gap" key={row.id}><td colSpan={6}>{gapButton(row.id, row.lines.length, open.has(row.id), onToggle)}</td></tr>
        if (row.kind === 'context') return <tr key={`ctx-${row.line.oldLine}`}>
          <td className="cx-dt-n">{row.line.oldLine}</td><td className="cx-dt-g" /><td className="cx-dt-t">{lineOrBlank(row.line.text)}</td>
          <td className="cx-dt-n">{row.line.newLine}</td><td className="cx-dt-g" /><td className="cx-dt-t">{lineOrBlank(row.line.text)}</td>
        </tr>
        return <tr key={`pair-${row.del?.oldLine ?? 'x'}-${row.add?.newLine ?? 'x'}`}>{sideCell(row.del, 'del')}{sideCell(row.add, 'add')}</tr>
      })}
    </tbody>
  </table>
}

function FileCard({ id, file, mode, open, onToggle }: Readonly<{ id: string; file: FileDiff; mode: DiffMode; open: ReadonlySet<string>; onToggle: (id: string) => void }>) {
  const chip = changeLabels[file.entry.status]
  return <section className="cx-dfile" id={id} aria-label={file.entry.path}>
    <header className="cx-dfile-head">
      <File size={14} aria-hidden="true" />
      <code className="cx-dfile-path">{file.entry.path}</code>
      {chip && <span className="cx-chip" data-tone="neutral" title={file.entry.previousPath ? `Renomeado de ${file.entry.previousPath}` : undefined}>{chip}</span>}
      {file.added > 0 && <span className="cx-diff-add">+{file.added}</span>}
      {file.removed > 0 && <span className="cx-diff-del">−{file.removed}</span>}
    </header>
    {mode === 'unified'
      ? <UnifiedTable rows={file.rows} open={open} onToggle={onToggle} />
      : <SplitTable rows={file.rows} open={open} onToggle={onToggle} />}
  </section>
}

export function LensDiff({ projectId, basis, requestText, requestTime, version }: Readonly<{
  projectId: string; basis: ChangeBasis | null; requestText: string | null; requestTime: string | null; version: number
}>) {
  const [mode, setMode] = useState<DiffMode>('unified')
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const toggleGap = (id: string) => setOpen((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const filesHost = useRef<HTMLDivElement>(null)
  const scrollToFile = (index: number) => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(`cx-dfile-${index}`)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }

  const comparison = useQuery({
    queryKey: ['builder-source-compare', projectId, basis?.baseSourceRevision, basis?.resultSourceRevision],
    queryFn: () => compareProjectSource(projectId, basis?.baseSourceRevision ?? '', basis?.resultSourceRevision ?? ''),
    enabled: Boolean(basis),
  })
  const files = comparison.data?.files ?? []

  // Every file's both sides, read once per comparison: the stacked cards render every file at
  // once, and the left list's own counts share this fetch instead of asking the Hub twice.
  const sides = useQuery({
    queryKey: ['builder-source-sides', projectId, basis?.baseSourceRevision, basis?.resultSourceRevision, files.map((entry) => entry.path)],
    queryFn: async (): Promise<ReadonlyMap<string, FileSides>> => {
      if (!basis) throw new Error('SOURCE_DIFF_NOT_READY')
      const entries = await Promise.all(files.map(async (entry) => {
        const [before, after] = await Promise.all([
          readSide(projectId, basis.baseSourceRevision, entry.status === 'ADDED' ? null : entry.previousPath ?? entry.path),
          readSide(projectId, basis.resultSourceRevision, entry.status === 'REMOVED' ? null : entry.path),
        ])
        return [entry.path, { before, after }] as const
      }))
      return new Map(entries)
    },
    enabled: Boolean(basis && files.length),
  })

  const fileDiffs = useMemo((): readonly FileDiff[] => {
    if (!sides.data) return []
    return files.flatMap((entry) => {
      const side = sides.data.get(entry.path)
      if (!side) return []
      return [{ entry, ...buildFileRows(entry.path, side.before, side.after) }]
    })
  }, [files, sides.data])
  const totals = fileDiffs.reduce((sum, file) => ({ added: sum.added + file.added, removed: sum.removed + file.removed, hunks: sum.hunks + file.hunks }),
    { added: 0, removed: 0, hunks: 0 })

  if (!basis) return <p className="cx-lens-empty">Nenhuma execução alterou o código ainda. As alterações aparecem aqui quando o agente mudar o app.</p>
  if (comparison.isPending) return <div className="cx-lens-split"><Skeleton className="cx-skeleton" /><Skeleton className="cx-skeleton" /></div>
  if (comparison.isError) return <div className="cx-note" role="alert"><p>Não foi possível comparar as versões.</p><Button size="sm" onClick={() => void comparison.refetch()}>Tentar novamente</Button></div>
  if (!files.length) return <p className="cx-lens-empty">Esta execução não mudou nenhum arquivo.</p>

  return <div className="cx-diff-lens">
    <header className="cx-diff-head">
      <div className="cx-diff-req">
        <h3>
          {requestTime && <span className="cx-diff-when">Pedido das {requestTime} · </span>}
          <span title={requestText ?? undefined}>{requestText ?? 'Alterações'}</span>
        </h3>
        <fieldset className="cx-seg">
          <legend className="cx-sr">Modo do diff</legend>
          <button type="button" aria-pressed={mode === 'unified'} onClick={() => setMode('unified')}>Unificado</button>
          <button type="button" aria-pressed={mode === 'split'} onClick={() => setMode('split')}>Lado a lado</button>
        </fieldset>
      </div>
      <p className="cx-diff-sum">
        <span>
          {version > 0 ? `Versão ${version} · ` : ''}
          {totals.hunks} {totals.hunks === 1 ? 'alteração' : 'alterações'} em {files.length} {files.length === 1 ? 'arquivo' : 'arquivos'}
        </span>
        <span className="cx-diff-add">+{totals.added}</span>
        <span className="cx-diff-del">−{totals.removed}</span>
      </p>
    </header>
    <div className="cx-diff-body">
      <nav className="cx-files" aria-label="Arquivos alterados">
        <ul className="cx-change-list">
          {files.map((entry, index) => {
            const file = fileDiffs.find((candidate) => candidate.entry.path === entry.path)
            const chip = changeLabels[entry.status]
            return <li key={entry.path}>
              <button type="button" className="cx-change" onClick={() => scrollToFile(index)}>
                <File size={13} aria-hidden="true" />
                <span className="cx-change-path">{entry.path}</span>
                <span className="cx-change-meta">
                  {chip ? <span className="cx-chip" data-tone="neutral">{chip}</span> : <span />}
                  <span className="cx-change-counts">
                    {file && file.added > 0 && <span className="cx-diff-add">+{file.added}</span>}
                    {file && file.removed > 0 && <span className="cx-diff-del">−{file.removed}</span>}
                  </span>
                </span>
              </button>
            </li>
          })}
        </ul>
      </nav>
      <div className="cx-diff-files" ref={filesHost}>
        {sides.isPending && <Skeleton className="cx-skeleton" />}
        {sides.isError && <div className="cx-note" role="alert"><p>Não foi possível ler os arquivos alterados.</p><Button size="sm" onClick={() => void sides.refetch()}>Tentar novamente</Button></div>}
        {fileDiffs.map((file, index) => <FileCard key={file.entry.path} id={`cx-dfile-${index}`} file={file} mode={mode} open={open} onToggle={toggleGap} />)}
      </div>
    </div>
  </div>
}
