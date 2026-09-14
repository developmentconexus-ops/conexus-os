import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { BuilderRequestError, getBuilderSession, getBuildPreview, getProjectSourceFile, launchBuilderPreview, listProjectSourceTree, sendBuilderMessage, type SourceTree } from '../api'
import { observeBuilderRun, type ObservationPart } from '../observation'
import { BuilderMarkdown } from './builder-markdown'

const runStatus = (state: string | undefined, kind: string | null | undefined): string => {
  if (state === 'QUEUED' || state === 'RUNNING') return 'Trabalhando…'
  if (kind === 'RESPONSE_ONLY') return 'Resposta somente'
  if (kind === 'SOURCE_CHANGED_BUILD_FAILED') return 'Build falhou; o Preview anterior continua disponível'
  if (kind === 'SOURCE_CHANGED' || state === 'SUCCEEDED') return 'Build concluído'
  if (state === 'INTERRUPTED') return 'Execução interrompida'
  if (state === 'FAILED') return 'Execução falhou'
  return 'Pronto para construir'
}

type Inspection = 'CODE' | 'DIFF' | 'DETAILS'
type SourceDiffEntry = Readonly<{ path: string; status: 'ADDED' | 'REMOVED' | 'MODIFIED' }>
type SourceSnapshot = Readonly<{ sourceRevision: string; files: ReadonlyMap<string, string> }>

const readSourceSnapshot = async (projectId: string, sourceRevision: string): Promise<SourceSnapshot> => {
  const tree = await listProjectSourceTree(projectId, sourceRevision)
  const files = tree.entries.filter((entry) => entry.kind === 'FILE')
  const contents = await Promise.all(files.map(async (entry) => [entry.path, (await getProjectSourceFile(projectId, sourceRevision, entry.path)).content] as const))
  return { sourceRevision, files: new Map(contents) }
}

const diffSourceSnapshots = (current: SourceSnapshot, previous: SourceSnapshot): readonly SourceDiffEntry[] => {
  const paths = new Set([...current.files.keys(), ...previous.files.keys()])
  const entries: SourceDiffEntry[] = []
  for (const path of [...paths].sort()) {
    const currentContent = current.files.get(path)
    const previousContent = previous.files.get(path)
    if (currentContent === undefined) entries.push({ path, status: 'REMOVED' })
    else if (previousContent === undefined) entries.push({ path, status: 'ADDED' })
    else if (currentContent !== previousContent) entries.push({ path, status: 'MODIFIED' })
  }
  return entries
}

export function ProjectBuild({ projectId }: { projectId: string }) {
  const inputId = useId()
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')
  const [mode, setMode] = useState<'BUILD' | 'PLAN'>('BUILD')
  const [message, setMessage] = useState('')
  const [activity, setActivity] = useState<readonly ObservationPart[]>([])
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [selectedSourcePath, setSelectedSourcePath] = useState<string | null>(null)
  const [launch, setLaunch] = useState<Readonly<{ previewUrl: string; entryUrl: string; entryGrant: string }>>()
  const frameName = `builder-preview-${inputId.replaceAll(':', '')}`
  const entryForm = useRef<HTMLFormElement>(null)
  const session = useQuery({
    queryKey: ['builder-session', projectId], queryFn: () => getBuilderSession(projectId),
    refetchInterval: (query) => query.state.data?.activeBuilderRun?.state === 'RUNNING' ? 1_000 : 2_000,
  })
  const preview = useQuery({
    queryKey: ['builder-preview', projectId], queryFn: () => getBuildPreview(projectId),
    refetchInterval: () => session.data?.activeBuilderRun ? 1_000 : false,
  })
  const send = useMutation({
    mutationFn: (value: Readonly<{ content: string; mode: 'BUILD' | 'PLAN'; key: string }>) =>
      sendBuilderMessage(projectId, value.content, value.mode, value.key),
    onSuccess: async () => {
      setContent('')
      setMessage('Mensagem enviada ao Builder.')
      await queryClient.invalidateQueries({ queryKey: ['builder-session', projectId] })
    },
    onError: (error) => {
      if (error instanceof BuilderRequestError && error.status === 409) setMessage('O Project está ocupado ou recebeu outra alteração. Aguarde e tente novamente.')
      else if (error instanceof BuilderRequestError && error.status === 403) setMessage('Sua autoridade atual não permite construir neste Project.')
      else setMessage('Não foi possível enviar a mensagem ao Builder.')
    },
  })
  const runId = session.data?.activeBuilderRun?.builderRunId
  useEffect(() => {
    if (!runId) return undefined
    const controller = new AbortController()
    void observeBuilderRun(projectId, runId, controller.signal, setActivity).catch(() => undefined)
    return () => controller.abort()
  }, [projectId, runId])
  const run = session.data?.activeBuilderRun
  const previewSummary = session.data?.preview
  const workingSourceRevision = previewSummary?.workingSourceRevision ?? null
  const lastGoodSourceRevision = previewSummary?.lastGoodSourceRevision ?? null
  const sourceTree = useQuery<SourceTree>({
    queryKey: ['builder-source-tree', projectId, workingSourceRevision],
    queryFn: () => listProjectSourceTree(projectId, workingSourceRevision as string),
    enabled: inspection === 'CODE' && Boolean(workingSourceRevision),
  })
  const sourceFiles = sourceTree.data?.entries.filter((entry) => entry.kind === 'FILE') ?? []
  useEffect(() => {
    if (!sourceFiles.length) {
      setSelectedSourcePath(null)
      return
    }
    const firstSourceFile = sourceFiles.at(0)
    if (firstSourceFile && (!selectedSourcePath || !sourceFiles.some((entry) => entry.path === selectedSourcePath))) setSelectedSourcePath(firstSourceFile.path)
  }, [selectedSourcePath, sourceFiles])
  const sourceFile = useQuery({
    queryKey: ['builder-source-file', projectId, workingSourceRevision, selectedSourcePath],
    queryFn: () => getProjectSourceFile(projectId, workingSourceRevision as string, selectedSourcePath as string),
    enabled: inspection === 'CODE' && Boolean(workingSourceRevision && selectedSourcePath),
  })
  const sourceDiff = useQuery({
    queryKey: ['builder-source-diff', projectId, workingSourceRevision, lastGoodSourceRevision],
    queryFn: async () => {
      if (!workingSourceRevision || !lastGoodSourceRevision) throw new Error('SOURCE_DIFF_NOT_READY')
      const [current, previous] = await Promise.all([
        readSourceSnapshot(projectId, workingSourceRevision), readSourceSnapshot(projectId, lastGoodSourceRevision),
      ])
      return diffSourceSnapshots(current, previous)
    },
    enabled: inspection === 'DIFF' && Boolean(workingSourceRevision && lastGoodSourceRevision && workingSourceRevision !== lastGoodSourceRevision),
  })
  const previewReady = Boolean(run && previewSummary?.lastGoodSourceRevision && previewSummary.lastGoodArtifactRevisionId && previewSummary.lastGoodArtifactDigest)
  const openPreview = useMutation({
    mutationFn: () => {
      if (!run || !previewSummary?.lastGoodSourceRevision || !previewSummary.lastGoodArtifactRevisionId || !previewSummary.lastGoodArtifactDigest) throw new Error('PREVIEW_NOT_READY')
      return launchBuilderPreview(projectId, { builderRunId: run.builderRunId, sourceRevision: previewSummary.lastGoodSourceRevision, artifactRevisionId: previewSummary.lastGoodArtifactRevisionId, artifactDigest: previewSummary.lastGoodArtifactDigest })
    },
    onSuccess: (result) => setLaunch(result),
    onError: () => setMessage('Não foi possível abrir o Preview atual.'),
  })
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = content.trim()
    if (!value || send.isPending) return
    send.mutate({ content: value, mode, key: crypto.randomUUID() })
  }
  useEffect(() => { if (launch) queueMicrotask(() => entryForm.current?.requestSubmit()) }, [launch])

  return <div className="project-build">
    <div className="build-workspace">
      <section className="build-preview-surface" aria-labelledby="build-preview-title">
        <div className="work-heading"><div><p className="eyebrow">Aplicação</p><h2 id="build-preview-title">Preview</h2></div></div>
        <nav className="build-lenses" aria-label="Inspeção técnica">
          <button type="button" aria-pressed={inspection === null} onClick={() => setInspection(null)}>Preview</button>
          <button type="button" aria-pressed={inspection === 'CODE'} onClick={() => setInspection('CODE')}>Código</button>
          <button type="button" aria-pressed={inspection === 'DIFF'} onClick={() => setInspection('DIFF')}>Diff</button>
          <button type="button" aria-pressed={inspection === 'DETAILS'} onClick={() => setInspection('DETAILS')}>Detalhes</button>
        </nav>
        {preview.isError && <p role="alert">Não foi possível consultar o estado do Preview.</p>}
        {previewReady
          ? <div><p><strong>Último Preview bom disponível.</strong></p><p>Fonte: <code>{previewSummary?.lastGoodSourceRevision}</code></p><p>Artefato: <code>{previewSummary?.lastGoodArtifactRevisionId}</code></p>{!launch && <button type="button" disabled={openPreview.isPending} onClick={() => openPreview.mutate()}>{openPreview.isPending ? 'Abrindo…' : 'Abrir Preview'}</button>}</div>
          : <p className="preview-empty">O Preview aparecerá depois do primeiro Build bem-sucedido.</p>}
        {run && <p role="status" aria-live="polite">{runStatus(run.state, run.resultKind)}</p>}
        {run?.resultKind === 'SOURCE_CHANGED_BUILD_FAILED' && <p role="alert">A nova fonte foi preservada para a próxima correção.</p>}
        {launch && <><iframe title="Preview do aplicativo" name={frameName} src="about:blank" /><form ref={entryForm} hidden method="post" action={launch.entryUrl} target={frameName}><input type="hidden" name="entryGrant" value={launch.entryGrant} /></form><p>Preview aberto da fonte <code>{previewSummary?.lastGoodSourceRevision}</code>.</p></>}
        {inspection === 'CODE' && <section className="build-inspection" aria-labelledby="build-code-title">
          <h3 id="build-code-title">Código da fonte em trabalho</h3>
          {!workingSourceRevision && <p>O Project ainda não tem uma fonte disponível para inspeção.</p>}
          {workingSourceRevision && sourceTree.isPending && <p>Carregando a árvore da fonte…</p>}
          {workingSourceRevision && sourceTree.isError && <p role="alert">Não foi possível ler a árvore da fonte.</p>}
          {sourceFiles.length > 0 && <div className="source-browser">
            <nav aria-label="Arquivos da fonte">
              {sourceFiles.map((entry) => <button key={entry.path} type="button" aria-pressed={entry.path === selectedSourcePath} onClick={() => setSelectedSourcePath(entry.path)}>{entry.path}</button>)}
            </nav>
            <div>
              <p className="panel-intro">Fonte <code>{workingSourceRevision}</code> · arquivo <code>{selectedSourcePath}</code></p>
              {sourceFile.isPending && <p>Carregando arquivo…</p>}
              {sourceFile.isError && <p role="alert">Não foi possível ler este arquivo.</p>}
              {sourceFile.data && <pre>{sourceFile.data.content}</pre>}
            </div>
          </div>}
        </section>}
        {inspection === 'DIFF' && <section className="build-inspection" aria-labelledby="build-diff-title">
          <h3 id="build-diff-title">Diff da fonte</h3>
          {!lastGoodSourceRevision && <p>O Diff aparecerá quando houver um Preview bom para comparar.</p>}
          {lastGoodSourceRevision && workingSourceRevision === lastGoodSourceRevision && <p>A fonte em trabalho coincide com a fonte do último Preview bom.</p>}
          {sourceDiff.isPending && <p>Comparando as fontes…</p>}
          {sourceDiff.isError && <p role="alert">Não foi possível comparar as fontes.</p>}
          {sourceDiff.data?.length === 0 && <p>Não há arquivos diferentes entre a fonte em trabalho e o último Preview bom.</p>}
          {sourceDiff.data && sourceDiff.data.length > 0 && <ul className="source-diff-list">{sourceDiff.data.map((entry) => <li key={entry.path}><strong>{entry.status}</strong> <code>{entry.path}</code></li>)}</ul>}
        </section>}
        {inspection === 'DETAILS' && <section className="build-inspection" aria-labelledby="build-details-title">
          <h3 id="build-details-title">Detalhes do Build</h3>
          <dl className="builder-details">
            <div><dt>Project</dt><dd><code>{projectId}</code></dd></div>
            <div><dt>Modo atual</dt><dd>{session.data?.mode ?? 'BUILD'}</dd></div>
            <div><dt>Fonte em trabalho</dt><dd><code>{workingSourceRevision ?? 'Ainda não disponível'}</code></dd></div>
            <div><dt>Último Preview bom</dt><dd><code>{lastGoodSourceRevision ?? 'Ainda não disponível'}</code></dd></div>
            <div><dt>Execução atual</dt><dd><code>{run?.builderRunId ?? 'Nenhuma'}</code> · {runStatus(run?.state, run?.resultKind)}</dd></div>
          </dl>
        </section>}
      </section>
      <aside className="conexus-panel" aria-labelledby="conexus-panel-title">
        <p className="eyebrow">Conexus</p><h2 id="conexus-panel-title">Converse com o Conexus</h2>
        <section className="builder-conversation" aria-label="Mensagens do Builder">
          {session.data?.messages.map((item) => <div key={item.id} className={`builder-message builder-message-${item.role}`}><strong>{item.role === 'user' ? 'Você' : 'Conexus'}</strong><BuilderMarkdown text={item.text} /></div>)}
          {activity.map((part) => part.kind === 'text' ? <div key={part.id} className="builder-message"><BuilderMarkdown text={part.text} /></div> : part.kind === 'phase' ? <p key={part.id} className="builder-phase">{part.phase}</p> : <p key={part.id} className="builder-activity">{part.label} — {part.state}</p>)}
          {!session.data?.messages.length && <p className="builder-conversation-empty">Descreva o aplicativo que você quer criar.</p>}
        </section>
        <form onSubmit={submit}>
          <label htmlFor={inputId}>O que o Project precisa fazer?</label>
          <textarea id={inputId} rows={5} required value={content} onChange={(event) => setContent(event.target.value)} />
          <fieldset className="builder-mode-toggle">
            <legend>Modo do Builder</legend>
            <button type="button" aria-pressed={mode === 'BUILD'} onClick={() => setMode('BUILD')}>Build</button>
            <button type="button" aria-pressed={mode === 'PLAN'} onClick={() => setMode('PLAN')}>Plan</button>
          </fieldset>
          <button className="primary" type="submit" disabled={send.isPending || run?.state === 'QUEUED' || run?.state === 'RUNNING'}>{send.isPending ? 'Enviando…' : 'Enviar mensagem'}</button>
          <p role="status" aria-live="polite">{message}</p>
        </form>
      </aside>
    </div>
  </div>
}
